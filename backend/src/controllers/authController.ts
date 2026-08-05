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
  verifyQrGrant,
} from "../services/qrService.js";
import { createImageChallenge, verifyImageChallenge } from "../services/imageChallengeService.js";
import type { AuthenticatorTransportFuture, RegistrationResponseJSON } from "@simplewebauthn/types";
import { evaluateRisk } from "../services/riskEngine.js";
import { assessContext, type RiskContextInput } from "../services/riskContextService.js";
import { mergeSample, emptyProfile, type KeystrokeProfile } from "../services/keystrokeService.js";
import { sendOtp, verifyOtp, sendAlertEmail, sendVerificationEmail } from "../services/emailService.js";
import { checkEmailBreach, checkPasswordBreach } from "../services/hibpService.js";
import { markDeviceTrusted } from "../services/deviceService.js";
import { geoFromIp, formatLocation } from "../utils/geo.js";
import {
  generateRecoveryCodes,
  hashPassword,
  signAccessToken,
  signRefreshToken,
  verifyPassword,
  verifyRefreshToken,
  randomToken,
  verifyPassword as verifyRecoveryCode,
} from "../utils/crypto.js";
import { env, isProduction } from "../config/env.js";
import {
  loginOptionsSchema,
  loginVerifySchema,
  passwordLoginSchema,
  passwordRemoveSchema,
  passwordSetSchema,
  qrApproveSchema,
  registerInitiateSchema,
  registerOptionsSchema,
  registerStatusSchema,
  registerVerifySchema,
  refreshSchema,
  stepUpVerifySchema,
  verifyEmailSchema,
  imageChallengeSetupSchema,
} from "../utils/validators.js";
import { logger } from "../utils/logger.js";

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const VERIFY_TTL_MS = 15 * 60 * 1000;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

type LoginContext = RiskContextInput;

async function completeLogin(
  user: { id: string; email: string; name: string },
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

  const accessToken = signAccessToken({ sub: user.id, email: user.email });
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

  return { accessToken, refreshToken, user: { id: user.id, email: user.email, name: user.name } };
}

// ---------------------------------------------------------------------------
// REGISTRATION (email-first, verification-gated)
// ---------------------------------------------------------------------------

export const registerInitiate: RequestHandler = asyncHandler(async (req, res) => {
  const { email, name } = registerInitiateSchema.parse(req.body);
  const normalizedEmail = email.trim().toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    if (existing.emailVerified) throw new AppError(409, "An account already exists with this email — log in instead.");
    logger.info(`Resending verification email for pending signup ${normalizedEmail}`);
  } else {
    await prisma.user.create({
      data: {
        email: normalizedEmail,
        name: name.trim(),
        keystrokeProfile: { create: { transitions: "{}", sampleCount: 0 } },
      },
    });
  }

  const token = randomToken("ve", 18);
  await prisma.emailVerificationToken.deleteMany({ where: { userId: existing?.id ?? "" } });
  const pending = await prisma.user.findUniqueOrThrow({ where: { email: normalizedEmail } });
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
    await prisma.loginHistory.create({
      data: {
        userId: record.userId,
        eventType: "alert",
        deviceInfo: "NovaBank Web",
        ipAddress: req.ip ?? "unknown",
        riskScore: 0,
        riskAction: "allow",
        details: JSON.stringify({ kind: "email_verified" }),
      },
    });
    logger.info(`Email verified: ${record.user.email}`);
  }

  await prisma.emailVerificationToken.deleteMany({ where: { userId: record.userId } });
  res.json({ ok: true, email: record.user.email });
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
    throw new AppError(403, "Verify your email first — we emailed you a link. Check your inbox.", { code: "EMAIL_UNVERIFIED" });
  }
  if (user.credentials.length > 0) throw new AppError(409, "Account already registered — try logging in.");

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
  if (!user) throw new AppError(404, "Start signup first — we need to verify your email.");
  if (!user.emailVerified) throw new AppError(403, "Your email isn't verified yet.", { code: "EMAIL_UNVERIFIED" });
  if (user.credentials.length > 0) throw new AppError(409, "This account already has a passkey — log in instead.");

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

  const geo = await geoFromIp(req.ip ?? "unknown");
  const location = formatLocation(geo);
  await markDeviceTrusted({
    userId: user.id,
    rawFingerprint: deviceFingerprint,
    deviceInfo,
    ipAddress: req.ip ?? "unknown",
    location,
  });

  const { codes, hashes } = await generateRecoveryCodes(10);
  await prisma.recoveryCode.createMany({
    data: hashes.map((codeHash) => ({ userId: user.id, codeHash })),
  });

  const accessToken = signAccessToken({ sub: user.id, email: user.email });
  const refreshToken = signRefreshToken({ sub: user.id, email: user.email });

  await prisma.session.create({
    data: {
      userId: user.id,
      refreshToken: sha256(refreshToken),
      deviceInfo,
      ipAddress: req.ip ?? "unknown",
      riskScore: 0,
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    },
  });

  await prisma.loginHistory.create({
    data: {
      userId: user.id,
      eventType: "login",
      deviceInfo,
      ipAddress: req.ip ?? "unknown",
      location,
      riskScore: 0,
      riskAction: "allow",
      details: JSON.stringify({ kind: "registration", lat: geo?.lat ?? null, lon: geo?.lon ?? null }),
    },
  });

  logger.info(`New account registered: ${normalizedEmail}`);
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
  if (!user.emailVerified) throw new AppError(403, "Verify your email before signing in — we emailed you a link.", { code: "EMAIL_UNVERIFIED" });

  const credentials = buildUserCredentialsFromDb(user.credentials);
  if (credentials.length === 0) throw new AppError(403, "No passkeys registered for this account.");

  const options = await buildAuthenticationOptions({
    id: user.id,
    email: user.email,
    credentials,
  });

  res.json({ options, email: user.email, hasPassword: user.passwordHash != null });
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

  const ip = req.ip ?? "unknown";
  const ctx: LoginContext = {
    email,
    deviceFingerprint: body.deviceFingerprint,
    deviceInfo: body.deviceInfo,
    keystrokes: body.keystrokes,
    pasted: body.pasted,
  };

  const input = await assessContext(user, ctx, ip);
  const assessment = evaluateRisk(input);

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
// PASSWORD FALLBACK
// ---------------------------------------------------------------------------

/**
 * Password login — a secondary path for users who set a password. The same
 * risk engine runs here as for passkeys, so a known device signs straight in
 * and an unusual device is asked to step up.
 */
export const passwordLogin: RequestHandler = asyncHandler(async (req, res) => {
  const body = passwordLoginSchema.parse(req.body);
  const email = body.email.trim().toLowerCase();

  const user = await prisma.user.findUnique({ where: { email }, include: { credentials: true } });
  if (!user || !user.passwordHash) {
    // Same generic message for "no account" and "no password set" to avoid
    // account enumeration; the UI surfaces the fallback via /auth/login/options.
    throw new AppError(401, "Invalid credentials.");
  }

  const ok = await verifyPassword(user.passwordHash, body.password);
  if (!ok) throw new AppError(401, "Invalid credentials.");

  const ip = req.ip ?? "unknown";
  const ctx: LoginContext = {
    email,
    deviceFingerprint: body.deviceFingerprint,
    deviceInfo: body.deviceInfo,
    keystrokes: body.keystrokes,
    pasted: body.pasted,
  };

  const input = await assessContext(user, ctx, ip);
  const assessment = evaluateRisk(input);

  await prisma.loginHistory.create({
    data: {
      userId: user.id,
      eventType: "login",
      deviceInfo: body.deviceInfo,
      ipAddress: ip,
      location: input.location,
      riskScore: assessment.score,
      riskAction: assessment.action,
      details: JSON.stringify({ signals: assessment.signals, method: "password", lat: null, lon: null }),
    },
  });

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

/** Set or change the password fallback for a signed-in user. */
export const setPassword: RequestHandler = asyncHandler(async (req, res) => {
  if (!req.userId) throw new AppError(401, "Not authenticated.");
  const { password, currentPassword } = passwordSetSchema.parse(req.body);

  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) throw new AppError(404, "User not found.");

  if (user.passwordHash) {
    if (!currentPassword) throw new AppError(400, "Enter your current password to change it.");
    const ok = await verifyPassword(user.passwordHash, currentPassword);
    if (!ok) throw new AppError(401, "Current password is incorrect.");
  }

  // HIBP k-anonymity check. A breached password is *allowed* (users pick what
  // they pick) but flagged so the UI can warn them to change it.
  let breachWarning = false;
  if (env.HIBP_API_KEY) {
    const count = await checkPasswordBreach(password);
    if (count !== null && count > 0) breachWarning = true;
  }

  const passwordHash = await hashPassword(password);
  await prisma.user.update({ where: { id: req.userId }, data: { passwordHash } });

  await prisma.loginHistory.create({
    data: {
      userId: user.id,
      eventType: "alert",
      deviceInfo: "NovaBank Web",
      ipAddress: req.ip ?? "unknown",
      location: null,
      riskScore: 0,
      riskAction: "allow",
      details: JSON.stringify({ kind: "password_set", breached: breachWarning }),
    },
  });

  res.json({ ok: true, hasPassword: true, breachWarning });
});

/** Remove the password fallback (must confirm the current password first). */
export const removePassword: RequestHandler = asyncHandler(async (req, res) => {
  if (!req.userId) throw new AppError(401, "Not authenticated.");
  const { password } = passwordRemoveSchema.parse(req.body);

  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user || !user.passwordHash) throw new AppError(404, "This account has no password set.");

  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok) throw new AppError(401, "Password is incorrect.");

  await prisma.user.update({ where: { id: req.userId }, data: { passwordHash: null } });

  await prisma.loginHistory.create({
    data: {
      userId: user.id,
      eventType: "alert",
      deviceInfo: "NovaBank Web",
      ipAddress: req.ip ?? "unknown",
      location: null,
      riskScore: 0,
      riskAction: "allow",
      details: JSON.stringify({ kind: "password_removed" }),
    },
  });

  res.json({ ok: true, hasPassword: false });
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
  } else if (body.method === "password") {
    if (user.passwordHash) {
      ok = await verifyPassword(user.passwordHash, body.password ?? "");
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

  const { accessToken, refreshToken, user: outUser } = await completeLogin(user, ctx, 45, "allow", req.ip ?? "unknown");
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
  const status = await getQrStatus(token);
  res.json(status);
});

export const qrApprove: RequestHandler = asyncHandler(async (req, res) => {
  const { token, decision } = qrApproveSchema.parse(req.body);
  if (!req.userId) throw new AppError(401, "You must be signed in to approve a login.");
  await attachQrDeviceInfo(token, req.body.deviceInfo ?? "Unknown device", req.body.location ?? null);
  const result = await approveQrSession(token, req.userId, decision);
  res.json(result);
});

export const qrExchange: RequestHandler = asyncHandler(async (req, res) => {
  const { grantToken, deviceFingerprint, deviceInfo, keystrokes } = req.body as {
    grantToken: string;
    deviceFingerprint: string;
    deviceInfo: string;
    keystrokes?: { prev: number; curr: number; delta: number }[];
  };
  if (!grantToken) throw new AppError(400, "Missing grant token.");
  if (!deviceFingerprint || !deviceInfo) throw new AppError(400, "Device details required.");

  const payload = verifyQrGrant(grantToken);
  const session = await findQrSessionById(payload.sub);
  if (!session || session.status !== "approved") throw new AppError(401, "Grant expired or not approved.");

  const user = await prisma.user.findUnique({ where: { id: session.userId ?? "" } });
  if (!user) throw new AppError(404, "User not found.");

  const ctx: LoginContext = { email: user.email, deviceFingerprint, deviceInfo, keystrokes };
  const { accessToken, refreshToken, user: outUser } = await completeLogin(user, ctx, 15, "allow", req.ip ?? "unknown");
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

  const newAccess = signAccessToken({ sub: user.id, email: user.email });
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
      hasPassword: user.passwordHash != null,
      emailVerified: user.emailVerified,
    },
  });
});
