import type { RequestHandler } from "express";
import { createHash } from "node:crypto";
import { prisma } from "../config/db.js";
import { getRedis } from "../config/redis.js";
import { AppError, asyncHandler } from "../middleware/errorHandler.js";
import {
  buildRegistrationOptions,
  verifyRegistrationResponseCredential,
  buildAuthenticationOptions,
  verifyAuthenticationResponseCredential,
  buildUserCredentialsFromDb,
  type UserCredentialRecord,
} from "../services/webauthnService.js";
import {
  approveQrSession,
  attachQrDeviceInfo,
  createQrSession,
  findQrSessionById,
  getQrStatus,
  verifyQrRequestSecret,
  verifyQrGrant,
} from "../services/qrService.js";
import {
  createImageChallenge,
  getImageSetupPool,
  isValidImageSetupSequence,
  verifyImageChallenge,
} from "../services/imageChallengeService.js";
import type { AuthenticatorTransportFuture, RegistrationResponseJSON } from "@simplewebauthn/types";
import { evaluateRisk } from "../services/riskEngine.js";
import { assessContext, type RiskContextInput } from "../services/riskContextService.js";
import { mergeSample, emptyProfile, type KeystrokeProfile } from "../services/keystrokeService.js";
import { sendOtp, verifyOtp, sendAlertEmail, sendVerificationEmail } from "../services/emailService.js";
import {
  sendPhoneOtp,
  verifyPhoneOtp,
  smsRemaining,
  type PhoneOtpPurpose,
} from "../services/smsService.js";
import { checkEmailBreach } from "../services/hibpService.js";
import { markDeviceTrusted } from "../services/deviceService.js";
import { geoFromIp, formatLocation } from "../utils/geo.js";
import { getClientIp } from "../utils/clientIp.js";
import { deviceInfoFromRequest } from "../utils/requestMeta.js";
import {
  generateRecoveryCodes,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  randomToken,
  verifyPassword as verifyRecoveryCode,
} from "../utils/crypto.js";
import { env, isProduction } from "../config/env.js";
import {
  loginOptionsSchema,
  loginVerifySchema,
  qrApproveSchema,
  registerInitiateSchema,
  registerOptionsSchema,
  registerStatusSchema,
  registerVerifySchema,
  refreshSchema,
  stepUpVerifySchema,
  verifyEmailSchema,
  imageChallengeSetupSchema,
  onboardingImageSequenceSchema,
  emailLoginRequestSchema,
  emailLoginVerifySchema,
  recoveryLoginSchema,
  phoneOtpRequestSchema,
  phoneOtpVerifySchema,
  phoneLoginRequestSchema,
  phoneLoginVerifySchema,
} from "../utils/validators.js";
import { logger } from "../utils/logger.js";

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const VERIFY_TTL_MS = 15 * 60 * 1000;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

type LoginContext = RiskContextInput;
type OnboardingStep = "email_pending" | "passkey_set" | "complete";

const onboardingOrder: OnboardingStep[] = ["email_pending", "passkey_set", "complete"];

async function requireOnboardingStep(userId: string | undefined, expected: OnboardingStep) {
  if (!userId) throw new AppError(401, "Not authenticated.");
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { credentials: true } });
  if (!user) throw new AppError(404, "User not found.");
  if (!user.emailVerified) throw new AppError(403, "Verify your email before continuing.", { code: "EMAIL_UNVERIFIED" });
  if (user.onboardingStep !== expected) {
    const current = user.onboardingStep as OnboardingStep;
    const currentIndex = onboardingOrder.indexOf(current);
    const expectedIndex = onboardingOrder.indexOf(expected);
    if (currentIndex > expectedIndex) {
      throw new AppError(409, "This onboarding step is already complete.", { code: "ONBOARDING_STEP_COMPLETE", currentStep: current });
    }
    throw new AppError(409, "Complete the previous onboarding step first.", { code: "ONBOARDING_INCOMPLETE", currentStep: current });
  }
  return user;
}

export async function completeLogin(
  user: { id: string; email: string; name: string; onboardingStep: string; phoneVerified?: boolean },
  ctx: LoginContext,
  riskScore: number,
  riskAction: string,
  ip: string,
) {
  const geo = await geoFromIp(ip);
  const location = formatLocation(geo);

  await markDeviceTrusted({
    userId: user.id,
    rawFingerprint: ctx.deviceFingerprint,
    deviceInfo: ctx.deviceInfo,
    ipAddress: ip,
    location,
  });

  // Fold keystroke sample into the profile.
  if (ctx.keystrokes && ctx.keystrokes.length > 3) {
    const profileRow = await prisma.keystrokeProfile.findUnique({ where: { userId: user.id } });
    const profile: KeystrokeProfile = profileRow?.transitions ? (JSON.parse(profileRow.transitions) as KeystrokeProfile) : emptyProfile();
    const merged = mergeSample(profile, {
      transitions: ctx.keystrokes.map((k) => [k.prev, k.curr] as [number, number]),
      timings: ctx.keystrokes.map((k) => k.delta),
    });
    const sampleCount = Object.values(merged).reduce((acc, s) => acc + s.count, 0);
    await prisma.keystrokeProfile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, transitions: JSON.stringify(merged), sampleCount },
      update: { transitions: JSON.stringify(merged), sampleCount },
    });
  }

  const refreshToken = signRefreshToken({ sub: user.id, email: user.email });
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      refreshToken: sha256(refreshToken),
      deviceInfo: ctx.deviceInfo,
      ipAddress: ip,
      location,
      riskScore,
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    },
  });

  const accessToken = signAccessToken({ sub: user.id, email: user.email, sessionId: session.id });

  await prisma.loginHistory.create({
    data: {
      userId: user.id,
      eventType: "login",
      deviceInfo: ctx.deviceInfo,
      ipAddress: ip,
      location,
      riskScore,
      riskAction,
      details: JSON.stringify({
        sessionId: session.id,
        keystrokes: ctx.keystrokes?.length ?? 0,
        lat: geo?.lat ?? null,
        lon: geo?.lon ?? null,
      }),
    },
  });

  // Reset PCCP click-point lockout on any successful login (best-effort).
  prisma.pccpLockout
    .updateMany({
      where: { userId: user.id, failedAttempts: { gt: 0 } },
      data: { failedAttempts: 0, lockedUntil: null },
    })
    .catch(() => {
      /* best-effort */
    });

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      onboardingStep: user.onboardingStep,
      onboardingIncomplete: user.onboardingStep !== "complete",
      phoneVerified: user.phoneVerified ?? false,
    },
  };
}

// ---------------------------------------------------------------------------
// REGISTRATION (email-first, verification-gated)
// ---------------------------------------------------------------------------

export const registerInitiate: RequestHandler = asyncHandler(async (req, res) => {
  const { email, name, phone } = registerInitiateSchema.parse(req.body);
  const normalizedEmail = email.trim().toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    if (existing.emailVerified) {
      throw new AppError(409, "This email is already verified  sign in to finish setting up your account.", {
        code: "ONBOARDING_INCOMPLETE",
        currentStep: existing.onboardingStep,
      });
    }
    logger.info(`Resending verification email for pending signup ${normalizedEmail}`);
  } else {
    await prisma.user.create({
      data: {
        email: normalizedEmail,
        name: name.trim(),
        phone,
        keystrokeProfile: { create: { transitions: "{}", sampleCount: 0 } },
      },
    });
  }

  const token = randomToken("ve", 18);
  await prisma.emailVerificationToken.deleteMany({ where: { userId: existing?.id ?? "" } });
  const pending = await prisma.user.update({ where: { email: normalizedEmail }, data: { name: name.trim(), phone } });
  await prisma.emailVerificationToken.upsert({
    where: { userId: pending.id },
    create: { userId: pending.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + VERIFY_TTL_MS) },
    update: { tokenHash: sha256(token), expiresAt: new Date(Date.now() + VERIFY_TTL_MS) },
  });

  const verifyLink = `${env.WEBAUTHN_ORIGIN}/verify-email?token=${encodeURIComponent(token)}`;
  await sendVerificationEmail(normalizedEmail, name.trim(), verifyLink);

  res.status(existing ? 200 : 201).json({
    ok: true,
    email: normalizedEmail,
    ...(isProduction ? {} : { devVerifyUrl: verifyLink }),
  });
});

export const verifyEmail: RequestHandler = asyncHandler(async (req, res) => {
  const { token } = verifyEmailSchema.parse(req.body);
  const record = await prisma.emailVerificationToken.findFirst({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  });

  if (!record || record.expiresAt < new Date()) {
    throw new AppError(410, "This verification link has expired or is invalid. Start signup again for a fresh one.");
  }

  if (!record.user.emailVerified) {
    await prisma.user.update({ where: { id: record.userId }, data: { emailVerified: true } });
    const deviceInfo = deviceInfoFromRequest(req);
    await prisma.loginHistory.create({
      data: {
        userId: record.userId,
        eventType: "alert",
        deviceInfo,
        ipAddress: getClientIp(req),
        riskScore: 0,
        riskAction: "allow",
        details: JSON.stringify({ kind: "email_verified" }),
      },
    });
    logger.info(`Email verified: ${record.user.email}`);
  }

  await prisma.emailVerificationToken.deleteMany({ where: { userId: record.userId } });
  const refreshToken = signRefreshToken({ sub: record.user.id, email: record.user.email });
  const sessionDeviceInfo = deviceInfoFromRequest(req);
  const session = await prisma.session.create({
    data: {
      userId: record.user.id,
      refreshToken: sha256(refreshToken),
      deviceInfo: sessionDeviceInfo,
      ipAddress: getClientIp(req),
      riskScore: 0,
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    },
  });
  const accessToken = signAccessToken({ sub: record.user.id, email: record.user.email, sessionId: session.id });
  const user = await prisma.user.findUniqueOrThrow({ where: { id: record.userId } });
  res.json({
    ok: true,
    email: user.email,
    user: { id: user.id, email: user.email, name: user.name },
    accessToken,
    refreshToken,
    onboardingStep: user.onboardingStep,
  });
});

// ---------------------------------------------------------------------------
// ONBOARDING STATE MACHINE
// ---------------------------------------------------------------------------

export const onboardingStatus: RequestHandler = asyncHandler(async (req, res) => {
  if (!req.userId) throw new AppError(401, "Not authenticated.");
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) throw new AppError(404, "User not found.");
  res.json({
    email: user.email,
    name: user.name,
    phone: user.phone,
    phoneVerified: user.phoneVerified,
    emailVerified: user.emailVerified,
    onboardingStep: user.onboardingStep,
  });
});

export const onboardingPasskeyOptions: RequestHandler = asyncHandler(async (req, res) => {
  const user = await requireOnboardingStep(req.userId, "email_pending");
  const options = await buildRegistrationOptions(user.email, user.name);
  res.json({ options });
});

export const onboardingPasskeyVerify: RequestHandler = asyncHandler(async (req, res) => {
  const user = await requireOnboardingStep(req.userId, "email_pending");
  const { credential, deviceFingerprint, deviceInfo } = registerVerifySchema
    .pick({ credential: true, deviceFingerprint: true, deviceInfo: true })
    .parse(req.body);
  const result = await verifyRegistrationResponseCredential(user.email, credential as unknown as RegistrationResponseJSON);
  await prisma.credential.create({
    data: {
      userId: user.id,
      credentialId: result.credential.id,
      publicKey: Buffer.from(result.credential.publicKey),
      counter: result.credential.counter,
      deviceType: result.deviceType,
      backedUp: result.backedUp,
      transports: result.credential.transports as string[],
      nickname: "Primary Passkey",
    },
  });
  const geo = await geoFromIp(getClientIp(req));
  await markDeviceTrusted({
    userId: user.id,
    rawFingerprint: deviceFingerprint,
    deviceInfo,
    ipAddress: getClientIp(req),
    location: formatLocation(geo),
  });
  const { codes, hashes } = await generateRecoveryCodes(10);
  await prisma.$transaction([
    prisma.recoveryCode.createMany({ data: hashes.map((codeHash) => ({ userId: user.id, codeHash })) }),
    prisma.user.update({ where: { id: user.id }, data: { onboardingStep: "passkey_set" } }),
  ]);
  res.json({ ok: true, recoveryCodes: codes, onboardingStep: "passkey_set" });
});

export const onboardingImagePool: RequestHandler = asyncHandler(async (req, res) => {
  await requireOnboardingStep(req.userId, "passkey_set");
  res.json({ pool: getImageSetupPool() });
});

export const onboardingImageSetup: RequestHandler = asyncHandler(async (req, res) => {
  const user = await requireOnboardingStep(req.userId, "passkey_set");
  const { sequence } = onboardingImageSequenceSchema.parse(req.body);
  if (!isValidImageSetupSequence(sequence)) {
    throw new AppError(400, "Choose two to four different objects on the same image.");
  }
  await prisma.$transaction([
    prisma.imageChallengeSetup.create({
      data: {
        userId: user.id,
        sequence: JSON.stringify(sequence),
        verified: true,
        expiresAt: new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000),
      },
    }),
    prisma.user.update({ where: { id: user.id }, data: { onboardingStep: "complete" } }),
  ]);
  res.json({ ok: true, onboardingStep: "complete" });
});

export const registerStatus: RequestHandler = asyncHandler(async (req, res) => {
  const { email } = registerStatusSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  res.json({ email: email.trim().toLowerCase(), verified: user?.emailVerified ?? false, name: user?.name ?? "" });
});

export const registerOptions: RequestHandler = asyncHandler(async (req, res) => {
  const { email, name } = registerOptionsSchema.parse(req.body);
  const normalizedEmail = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail }, include: { credentials: true } });
  if (!user || !user.emailVerified) {
    throw new AppError(403, "Verify your email first  we emailed you a link. Check your inbox.", { code: "EMAIL_UNVERIFIED" });
  }
  if (user.onboardingStep !== "email_pending" || req.userId !== user.id) {
    throw new AppError(409, "Continue registration through the secure onboarding flow.", {
      code: "ONBOARDING_INCOMPLETE",
      currentStep: user.onboardingStep,
    });
  }
  if (user.credentials.length > 0) throw new AppError(409, "Account already registered  try logging in.");

  const options = await buildRegistrationOptions(normalizedEmail, name.trim());
  res.json({ options, email: normalizedEmail });
});

export const registerVerify: RequestHandler = asyncHandler(async (req, res) => {
  const { email, name, credential, deviceFingerprint, deviceInfo } = registerVerifySchema.parse(req.body);
  const normalizedEmail = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    include: { credentials: true },
  });
  if (!user) throw new AppError(404, "Start signup first  we need to verify your email.");
  if (!user.emailVerified) throw new AppError(403, "Your email isn't verified yet.", { code: "EMAIL_UNVERIFIED" });
  if (user.onboardingStep !== "email_pending" || req.userId !== user.id) {
    throw new AppError(409, "Continue registration through the secure onboarding flow.", {
      code: "ONBOARDING_INCOMPLETE",
      currentStep: user.onboardingStep,
    });
  }
  if (user.credentials.length > 0) throw new AppError(409, "This account already has a passkey  log in instead.");

  const { name: verifiedName, credential: cred, deviceType, backedUp } = await verifyRegistrationResponseCredential(
    normalizedEmail,
    credential as unknown as RegistrationResponseJSON,
  );

  const breachCount = await checkEmailBreach(normalizedEmail);
  if (breachCount !== null && breachCount > 0) {
    logger.warn(`New signup email has been in ${breachCount} breach(es)`, normalizedEmail);
  }

  await prisma.credential.create({
    data: {
      userId: user.id,
      credentialId: cred.id,
      publicKey: Buffer.from(cred.publicKey),
      counter: cred.counter,
      deviceType,
      backedUp,
      transports: cred.transports as string[],
      nickname: "Primary Passkey",
    },
  });

  const geo = await geoFromIp(getClientIp(req));
  const location = formatLocation(geo);
  await markDeviceTrusted({
    userId: user.id,
    rawFingerprint: deviceFingerprint,
    deviceInfo,
    ipAddress: getClientIp(req),
    location,
  });

  const { codes, hashes } = await generateRecoveryCodes(10);
  await prisma.recoveryCode.createMany({
    data: hashes.map((codeHash) => ({ userId: user.id, codeHash })),
  });

  const refreshToken = signRefreshToken({ sub: user.id, email: user.email });
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      refreshToken: sha256(refreshToken),
      deviceInfo,
      ipAddress: getClientIp(req),
      riskScore: 0,
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    },
  });
  const accessToken = signAccessToken({ sub: user.id, email: user.email, sessionId: session.id });

  await prisma.loginHistory.create({
    data: {
      userId: user.id,
      eventType: "login",
      deviceInfo,
      ipAddress: getClientIp(req),
      location,
      riskScore: 0,
      riskAction: "allow",
      details: JSON.stringify({ kind: "registration", lat: geo?.lat ?? null, lon: geo?.lon ?? null }),
    },
  });

  await prisma.user.update({ where: { id: user.id }, data: { onboardingStep: "passkey_set" } });
  logger.info(`Passkey added during legacy onboarding: ${normalizedEmail}`);
  res.status(201).json({
    user: { id: user.id, email: user.email, name: verifiedName },
    accessToken,
    refreshToken,
    recoveryCodes: codes,
    breachCount,
  });
});

// ---------------------------------------------------------------------------
// AUTHENTICATION
// ---------------------------------------------------------------------------

export const loginOptions: RequestHandler = asyncHandler(async (req, res) => {
  const { email } = loginOptionsSchema.parse(req.body);
  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    include: { credentials: true },
  });
  if (!user) throw new AppError(404, "No account found with this email. Sign up first.");
  if (!user.emailVerified) throw new AppError(403, "Verify your email before signing in  we emailed you a link.", { code: "EMAIL_UNVERIFIED" });

  const credentials = buildUserCredentialsFromDb(user.credentials);
  if (credentials.length === 0) {
    throw new AppError(403, "No passkeys registered for this account yet. Use the email code option below to finish setting up.", {
      code: "NO_PASSKEY",
      currentStep: user.onboardingStep,
    });
  }

  const options = await buildAuthenticationOptions({
    id: user.id,
    email: user.email,
    credentials,
  });

  res.json({ options, email: user.email });
});

export const loginVerify: RequestHandler = asyncHandler(async (req, res) => {
  const body = loginVerifySchema.parse(req.body);
  const email = body.email.trim().toLowerCase();

  const user = await prisma.user.findUnique({ where: { email }, include: { credentials: true } });
  if (!user) throw new AppError(401, "Invalid credentials.");

  const credentialRecord = user.credentials.find((c) => c.credentialId === body.credential.id);
  if (!credentialRecord) throw new AppError(404, "Passkey not found for this account.");

  const webAuthnCred: UserCredentialRecord = {
    id: credentialRecord.credentialId,
    publicKey: credentialRecord.publicKey,
    counter: credentialRecord.counter,
    transports: credentialRecord.transports as AuthenticatorTransportFuture[],
  };

  const { newCounter } = await verifyAuthenticationResponseCredential(email, body.credential as never, webAuthnCred);

  await prisma.credential.update({
    where: { id: credentialRecord.id },
    data: { counter: newCounter, lastUsedAt: new Date() },
  });

  const ip = getClientIp(req);
  const ctx: LoginContext = {
    email,
    deviceFingerprint: body.deviceFingerprint,
    deviceInfo: body.deviceInfo,
    keystrokes: body.keystrokes,
    pasted: body.pasted,
  };

  const input = await assessContext(user, ctx, ip);
  const assessment = evaluateRisk(input);

  // Passkey-authenticated logins are already strong proof of identity
  // (phishing-resistant, bound to origin). Downgrade routine step-up signals
  // (new device/IP) so only security-critical signals (impossible travel,
  // country change) force an extra gesture.
  if (assessment.action === "step_up") {
    const hasSecurityCritical = assessment.signals.some(
      (s) => s.name === "impossible_travel" || s.name === "country_change",
    );
    if (!hasSecurityCritical) {
      assessment.action = "allow";
    }
  }

  // Record non-granted attempts here. Successful logins are recorded by
  // completeLogin with the real session id attached.
  if (assessment.action !== "allow") {
    await prisma.loginHistory.create({
      data: {
        userId: user.id,
        eventType: "login",
        deviceInfo: body.deviceInfo,
        ipAddress: ip,
        location: input.location,
        riskScore: assessment.score,
        riskAction: assessment.action,
        details: JSON.stringify({ signals: assessment.signals, lat: null, lon: null }),
      },
    });
  }

  if (assessment.action === "block") {
    await sendAlertEmail(email, "NovaBank blocked a sign-in attempt", `We blocked a sign-in from ${body.deviceInfo} (${ip}). If this was you, contact support.`);
    throw new AppError(403, "Sign-in blocked by risk engine.", { risk: assessment });
  }

  if (assessment.action === "step_up") {
    const userCreds = buildUserCredentialsFromDb(user.credentials);
    if (userCreds.length > 0) {
      const options = await buildAuthenticationOptions({ id: user.id, email: user.email, credentials: userCreds });
      return res.json({ stepUpRequired: true, method: "passkey", risk: assessment, options });
    }
    if (user.phoneVerified && user.phone) {
      const phoneCode = await sendPhoneOtp(user.phone, "login_step_up", `user:${user.id}`);
      if (phoneCode) {
        return res.json({
          stepUpRequired: true,
          method: "otp_sms",
          risk: assessment,
          phoneMasked: `${user.phone.slice(0, 3)}•••••${user.phone.slice(-2)}`,
          ...(isProduction ? {} : { devOtp: phoneCode }),
        });
      }
    }
    const otp = await sendOtp(email, "login_step_up");
    return res.json({
      stepUpRequired: true,
      method: "otp_email",
      risk: assessment,
      ...(isProduction ? {} : { devOtp: otp }),
    });
  }

  if (assessment.action === "image_challenge") {
    await sendAlertEmail(email, "NovaBank needs an extra check", `We noticed unusual activity from ${body.deviceInfo} (${ip}) and asked for an image verification. If this wasn't you, contact support.`);
    const challenge = await createImageChallenge(user.id);
    return res.json({ stepUpRequired: true, method: "image_challenge", risk: assessment, challenge });
  }

  const { accessToken, refreshToken, user: outUser } = await completeLogin(user, ctx, assessment.score, "allow", ip);
  res.json({ stepUpRequired: false, risk: assessment, accessToken, refreshToken, user: outUser });
});

// ---------------------------------------------------------------------------
// EMAIL (MAGIC LINK) + RECOVERY-CODE LOGIN
// ---------------------------------------------------------------------------

/** Send a one-time sign-in code to the account email. */
export const requestEmailLogin: RequestHandler = asyncHandler(async (req, res) => {
  const body = emailLoginRequestSchema.parse(req.body);
  const email = body.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new AppError(404, "No account found with this email. Sign up first.");

  // Record the context risk without blocking the send, so the audit trail is
  // complete even if the code is never used.
  const ctx: LoginContext = {
    email,
    deviceFingerprint: body.deviceFingerprint,
    deviceInfo: body.deviceInfo,
    keystrokes: body.keystrokes,
  };
  const input = await assessContext(user, ctx, getClientIp(req));
  const assessment = evaluateRisk(input);
  if (assessment.action === "block") {
    await sendAlertEmail(
      email,
      "NovaBank blocked a sign-in attempt",
      `We blocked a sign-in request from ${body.deviceInfo} (${getClientIp(req)}). If this was you, contact support.`,
    );
    await prisma.loginHistory.create({
      data: {
        userId: user.id,
        eventType: "login",
        deviceInfo: body.deviceInfo,
        ipAddress: getClientIp(req),
        location: input.location,
        riskScore: assessment.score,
        riskAction: "block",
        details: JSON.stringify({ signals: assessment.signals, method: "email_code" }),
      },
    });
    throw new AppError(403, "Sign-in blocked by risk engine.", { risk: assessment });
  }

  const otp = await sendOtp(email, "login_email");
  res.json({
    ok: true,
    email,
    risk: assessment,
    ...(isProduction ? {} : { devOtp: otp }),
  });
});

/** Exchange the emailed code for a signed-in session. */
export const verifyEmailLogin: RequestHandler = asyncHandler(async (req, res) => {
  const body = emailLoginVerifySchema.parse(req.body);
  const email = body.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new AppError(404, "Account not found.");

  const ok = await verifyOtp(email, body.otp, "login_email");
  if (!ok) throw new AppError(401, "That code was incorrect or expired.");

  const ctx: LoginContext = {
    email,
    deviceFingerprint: body.deviceFingerprint,
    deviceInfo: body.deviceInfo,
    keystrokes: body.keystrokes,
  };
  const input = await assessContext(user, ctx, getClientIp(req));
  const assessment = evaluateRisk(input);
  if (assessment.action === "block") {
    await sendAlertEmail(
      email,
      "NovaBank blocked a sign-in attempt",
      `We blocked a sign-in from ${body.deviceInfo} (${getClientIp(req)}). If this was you, contact support.`,
    );
    throw new AppError(403, "Sign-in blocked by risk engine.", { risk: assessment });
  }

  const { accessToken, refreshToken, user: outUser } = await completeLogin(
    user,
    ctx,
    assessment.score,
    "allow",
    getClientIp(req),
  );
  res.json({ verified: true, accessToken, refreshToken, user: outUser });
});

/** Redeem a single-use recovery code  the last-resort passwordless path. */
export const recoverLogin: RequestHandler = asyncHandler(async (req, res) => {
  const body = recoveryLoginSchema.parse(req.body);
  const email = body.email.trim().toLowerCase();
  const code = body.code.trim();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new AppError(404, "Account not found.");

  let redeemed = false;
  const rows = await prisma.recoveryCode.findMany({ where: { userId: user.id, used: false } });
  for (const row of rows) {
    if (await verifyRecoveryCode(row.codeHash, code)) {
      await prisma.recoveryCode.update({ where: { id: row.id }, data: { used: true, usedAt: new Date() } });
      redeemed = true;
      break;
    }
  }
  if (!redeemed) throw new AppError(401, "That recovery code was invalid or already used.");

  await sendAlertEmail(
    email,
    "A recovery code was used to sign in",
    `A recovery code signed in from ${body.deviceInfo} (${getClientIp(req)}). If this wasn't you, contact support immediately.`,
  );

  const ctx: LoginContext = {
    email,
    deviceFingerprint: body.deviceFingerprint,
    deviceInfo: body.deviceInfo,
    keystrokes: body.keystrokes,
  };
  const { accessToken, refreshToken, user: outUser } = await completeLogin(
    user,
    ctx,
    0,
    "allow",
    getClientIp(req),
  );
  res.json({ verified: true, accessToken, refreshToken, user: outUser });
});

// ---------------------------------------------------------------------------
// PHONE (SMS) OTP  verification, number change, signup, step-up
// ---------------------------------------------------------------------------

function maskPhone(phone: string): string {
  if (phone.length <= 4) return phone;
  return `${phone.slice(0, 3)}•••••${phone.slice(-2)}`;
}

/**
 * Send a phone OTP. Purpose determines who is allowed and what the quota key
 * is: per-user for signed-in flows, per-phone for anonymous ones.
 */
export const requestPhoneOtp: RequestHandler = asyncHandler(async (req, res) => {
  const { phone, purpose, email } = phoneOtpRequestSchema.parse(req.body);

  let quotaKey = phone;
  let targetPhone = phone;

  if (purpose === "phone_change" || purpose === "login_step_up" || purpose === "verify") {
    if (!req.userId) throw new AppError(401, "Sign in to verify a phone number.");
    quotaKey = `user:${req.userId}`;
    if (purpose === "login_step_up" || purpose === "verify") {
      const user = await prisma.user.findUnique({ where: { id: req.userId } });
      if (!user) throw new AppError(404, "User not found.");
      if (!user.phone) throw new AppError(400, "No phone number on file to verify.");
      targetPhone = user.phone;
    }
  } else if (purpose === "recover") {
    const user = await prisma.user.findFirst({ where: { phone } });
    if (!user) throw new AppError(404, "No account found with this phone number.");
  } else if (purpose === "signup" && email) {
    const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    quotaKey = user ? `user:${user.id}` : phone;
  }

  const code = await sendPhoneOtp(targetPhone, purpose, quotaKey);
  if (code === null) {
    throw new AppError(429, "Daily SMS limit reached. Try again tomorrow.", {
      code: "SMS_LIMIT",
      remaining: 0,
    });
  }

  res.json({
    ok: true,
    phoneMasked: maskPhone(targetPhone),
    remaining: await smsRemaining(quotaKey),
    ...(isProduction ? {} : { devOtp: code }),
  });
});

export const verifyPhoneOtpRoute: RequestHandler = asyncHandler(async (req, res) => {
  const { phone, code, purpose, email } = phoneOtpVerifySchema.parse(req.body);
  const valid = await verifyPhoneOtp(phone, code, purpose);
  if (!valid) throw new AppError(401, "That code was incorrect or expired.");

  if (purpose === "signup") {
    const user = email
      ? await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } })
      : await prisma.user.findFirst({ where: { phone } });
    if (!user) throw new AppError(404, "Account not found. Start signup again.");
    await prisma.user.update({
      where: { id: user.id },
      data: { phone, phoneVerified: true, phoneVerifiedAt: new Date() },
    });
  } else {
    if (!req.userId) throw new AppError(401, "Sign in to verify a phone number.");
    await prisma.user.update({
      where: { id: req.userId },
      data: { phone, phoneVerified: true, phoneVerifiedAt: new Date() },
    });
  }

  res.json({ ok: true, phoneVerified: true });
});

/** Send an SMS sign-in code to the phone number on file. */
export const requestPhoneLogin: RequestHandler = asyncHandler(async (req, res) => {
  const { phone, deviceFingerprint, deviceInfo, keystrokes } = phoneLoginRequestSchema.parse(req.body);
  const user = await prisma.user.findFirst({ where: { phone } });
  if (!user) throw new AppError(404, "No account found with this phone number.");

  const ctx: LoginContext = { email: user.email, deviceFingerprint, deviceInfo, keystrokes };
  const input = await assessContext(user, ctx, req.ip ?? "unknown");
  const assessment = evaluateRisk(input);
  if (assessment.action === "block") {
    await sendAlertEmail(
      user.email,
      "NovaBank blocked a sign-in attempt",
      `We blocked an SMS sign-in request from ${deviceInfo} (${req.ip}). If this was you, contact support.`,
    );
    await prisma.loginHistory.create({
      data: {
        userId: user.id,
        eventType: "login",
        deviceInfo,
        ipAddress: req.ip ?? "unknown",
        location: input.location,
        riskScore: assessment.score,
        riskAction: "block",
        details: JSON.stringify({ signals: assessment.signals, method: "phone_otp" }),
      },
    });
    throw new AppError(403, "Sign-in blocked by risk engine.", { risk: assessment });
  }

  const code = await sendPhoneOtp(phone, "recover", phone);
  if (code === null) {
    throw new AppError(429, "Daily SMS limit reached. Try again tomorrow.", { code: "SMS_LIMIT" });
  }
  res.json({ ok: true, phoneMasked: maskPhone(phone), ...(isProduction ? {} : { devOtp: code }) });
});

/** Exchange the SMS code for a signed-in session. */
export const verifyPhoneLogin: RequestHandler = asyncHandler(async (req, res) => {
  const { phone, otp, deviceFingerprint, deviceInfo, keystrokes } = phoneLoginVerifySchema.parse(req.body);
  const ok = await verifyPhoneOtp(phone, otp, "recover");
  if (!ok) throw new AppError(401, "That code was incorrect or expired.");

  const user = await prisma.user.findFirst({ where: { phone } });
  if (!user) throw new AppError(404, "Account not found.");

  const ctx: LoginContext = { email: user.email, deviceFingerprint, deviceInfo, keystrokes };
  const { accessToken, refreshToken, user: outUser } = await completeLogin(
    user,
    ctx,
    0,
    "allow",
    req.ip ?? "unknown",
  );
  res.json({ verified: true, accessToken, refreshToken, user: outUser });
});

// ---------------------------------------------------------------------------
// IMAGE-SEQUENCE STEP-UP (Phase 8)
// ---------------------------------------------------------------------------

/** Create a fresh image-sequence challenge (also used for retries after expiry). */
export const setupImageChallenge: RequestHandler = asyncHandler(async (req, res) => {
  const body = imageChallengeSetupSchema.parse(req.body ?? {});
  let userId: string | null = req.userId ?? null;
  if (!userId && body.email) {
    const user = await prisma.user.findUnique({ where: { email: body.email.trim().toLowerCase() } });
    userId = user?.id ?? null;
  }
  const challenge = await createImageChallenge(userId);
  res.json(challenge);
});

export const verifyImageChallengeRoute: RequestHandler = asyncHandler(async (req, res) => {
  const { challengeToken, clicks } = stepUpVerifySchema
    .pick({ challengeToken: true, clicks: true })
    .parse(req.body);
  if (!challengeToken) throw new AppError(400, "Challenge token required.");
  const result = await verifyImageChallenge(challengeToken, clicks ?? []);
  res.json(result);
});

// ---------------------------------------------------------------------------
// STEP-UP
// ---------------------------------------------------------------------------

export const stepUpVerify: RequestHandler = asyncHandler(async (req, res) => {
  const body = stepUpVerifySchema.parse(req.body);
  const email = body.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new AppError(404, "Account not found.");

  const ctx: LoginContext = {
    email,
    deviceFingerprint: body.deviceFingerprint,
    deviceInfo: body.deviceInfo,
    keystrokes: body.keystrokes,
  };

  let ok = false;
  if (body.method === "otp_email") {
    ok = await verifyOtp(email, body.otp ?? "", "login_step_up");
  } else if (body.method === "otp_sms") {
    if (!user.phone) throw new AppError(400, "No phone number on file to verify.");
    ok = await verifyPhoneOtp(user.phone, body.otp ?? "", "login_step_up");
  } else if (body.method === "recovery_code") {
    const code = (body.code ?? "").trim();
    const rows = await prisma.recoveryCode.findMany({ where: { userId: user.id, used: false } });
    for (const row of rows) {
      if (await verifyRecoveryCode(row.codeHash, code)) {
        await prisma.recoveryCode.update({ where: { id: row.id }, data: { used: true, usedAt: new Date() } });
        ok = true;
        break;
      }
    }
  } else if (body.method === "passkey") {
    const credentialRecord = await prisma.credential.findUnique({
      where: { credentialId: body.credential?.id ?? "" },
    });
    if (credentialRecord && credentialRecord.userId === user.id) {
      await verifyAuthenticationResponseCredential(email, body.credential as never, {
        id: credentialRecord.credentialId,
        publicKey: credentialRecord.publicKey,
        counter: credentialRecord.counter,
        transports: credentialRecord.transports as AuthenticatorTransportFuture[],
      });
      ok = true;
    }
  } else if (body.method === "image_challenge") {
    if (!body.challengeToken || !body.clicks || body.clicks.length === 0) {
      throw new AppError(400, "Challenge token and click sequence required.");
    }
    const { ok: matched, attemptsLeft } = await verifyImageChallenge(body.challengeToken, body.clicks);
    if (!matched) {
      throw new AppError(
        attemptsLeft > 0
          ? 401
          : 403,
        attemptsLeft > 0
          ? `That wasn't right. ${attemptsLeft} attempt${attemptsLeft === 1 ? "" : "s"} left.`
          : "Too many failed attempts. Start again with a fresh challenge.",
      );
    }
    ok = true;
  }

  if (!ok) throw new AppError(401, "Step-up verification failed.");

  const { accessToken, refreshToken, user: outUser } = await completeLogin(user, ctx, 45, "allow", getClientIp(req));
  res.json({ verified: true, accessToken, refreshToken, user: outUser });
});

// ---------------------------------------------------------------------------
// QR CROSS-DEVICE LOGIN
// ---------------------------------------------------------------------------

export const qrCreate: RequestHandler = asyncHandler(async (_req, res) => {
  const session = await createQrSession();
  res.json(session);
});

export const qrStatus: RequestHandler = asyncHandler(async (req, res) => {
  const token = req.params.token as string;
  if (!token) throw new AppError(400, "Missing QR token.");
  const requestSecret = req.get("X-QR-Request-Secret");
  if (!requestSecret) throw new AppError(400, "Missing QR request secret.");
  const status = await getQrStatus(token, requestSecret);
  res.json(status);
});

export const qrApproveOptions: RequestHandler = asyncHandler(async (req, res) => {
  if (!req.userId) throw new AppError(401, "You must be signed in to approve a login.");
  const user = await prisma.user.findUnique({ where: { id: req.userId }, include: { credentials: true } });
  if (!user) throw new AppError(404, "User not found.");

  const credentials = buildUserCredentialsFromDb(user.credentials);
  if (credentials.length === 0) throw new AppError(403, "No passkeys are available to approve this sign-in.");
  const options = await buildAuthenticationOptions({ id: user.id, email: user.email, credentials });
  res.json({ options });
});

export const qrApprove: RequestHandler = asyncHandler(async (req, res) => {
  const { token, decision, credential } = qrApproveSchema.parse(req.body);
  if (!req.userId) throw new AppError(401, "You must be signed in to approve a login.");
  if (decision === "approve") {
    if (!credential) throw new AppError(400, "Confirm with your passkey before approving this sign-in.");
    const user = await prisma.user.findUnique({ where: { id: req.userId }, include: { credentials: true } });
    if (!user) throw new AppError(404, "User not found.");
    const credentialRecord = user.credentials.find((item) => item.credentialId === credential.id);
    if (!credentialRecord) throw new AppError(403, "This passkey does not belong to the signed-in account.");
    const verified = await verifyAuthenticationResponseCredential(user.email, credential as never, {
      id: credentialRecord.credentialId,
      publicKey: credentialRecord.publicKey,
      counter: credentialRecord.counter,
      transports: credentialRecord.transports as AuthenticatorTransportFuture[],
    });
    await prisma.credential.update({
      where: { id: credentialRecord.id },
      data: { counter: verified.newCounter, lastUsedAt: new Date() },
    });
  }
  await attachQrDeviceInfo(token, req.body.deviceInfo ?? "Unknown device", req.body.location ?? null);
  const result = await approveQrSession(token, req.userId, decision);
  res.json(result);
});

export const qrExchange: RequestHandler = asyncHandler(async (req, res) => {
  const { grantToken, requestSecret, deviceFingerprint, deviceInfo, keystrokes } = req.body as {
    grantToken: string;
    requestSecret: string;
    deviceFingerprint: string;
    deviceInfo: string;
    keystrokes?: { prev: number; curr: number; delta: number }[];
  };
  if (!grantToken) throw new AppError(400, "Missing grant token.");
  if (!requestSecret) throw new AppError(400, "Missing QR request secret.");
  if (!deviceFingerprint || !deviceInfo) throw new AppError(400, "Device details required.");

  const payload = verifyQrGrant(grantToken);
  const session = await findQrSessionById(payload.sub);
  if (!session || session.status !== "approved") throw new AppError(401, "Grant expired or not approved.");
  if (!requestSecret || !verifyQrRequestSecret(session.requestSecretHash, requestSecret)) {
    throw new AppError(403, "This browser cannot exchange the QR approval.");
  }

  const claimed = await prisma.qrSession.updateMany({
    where: { id: session.id, status: "approved" },
    data: { status: "exchanged" },
  });
  if (claimed.count !== 1) throw new AppError(401, "This QR approval has already been used.");
  await getRedis().del(`qr:grant:${session.token}`);

  const user = await prisma.user.findUnique({ where: { id: session.userId ?? "" } });
  if (!user) throw new AppError(404, "User not found.");

  const ctx: LoginContext = { email: user.email, deviceFingerprint, deviceInfo, keystrokes };
  const { accessToken, refreshToken, user: outUser } = await completeLogin(user, ctx, 15, "allow", getClientIp(req));
  res.json({ accessToken, refreshToken, user: outUser });
});

// ---------------------------------------------------------------------------
// SESSION MANAGEMENT
// ---------------------------------------------------------------------------

export const refresh: RequestHandler = asyncHandler(async (req, res) => {
  const { refreshToken } = refreshSchema.parse(req.body);
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError(401, "Invalid refresh token.");
  }

  const session = await prisma.session.findFirst({
    where: { userId: payload.sub, refreshToken: sha256(refreshToken), revoked: false, expiresAt: { gt: new Date() } },
  });
  if (!session) throw new AppError(401, "Session revoked or expired.");

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) throw new AppError(404, "User not found.");

  const newAccess = signAccessToken({ sub: user.id, email: user.email, sessionId: session.id });
  const newRefresh = signRefreshToken({ sub: user.id, email: user.email });

  await prisma.session.update({
    where: { id: session.id },
    data: { refreshToken: sha256(newRefresh), expiresAt: new Date(Date.now() + REFRESH_TTL_MS) },
  });

  res.json({ accessToken: newAccess, refreshToken: newRefresh });
});

export const logout: RequestHandler = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body as { refreshToken?: string };
  if (refreshToken) {
    await prisma.session.updateMany({
      where: { refreshToken: sha256(refreshToken) },
      data: { revoked: true },
    });
  }
  res.json({ ok: true });
});

export const me: RequestHandler = asyncHandler(async (req, res) => {
  if (!req.userId) throw new AppError(401, "Not authenticated.");
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) throw new AppError(404, "User not found.");
  res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
      onboardingStep: user.onboardingStep,
    },
  });
});
