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
import type { AuthenticatorTransportFuture, RegistrationResponseJSON } from "@simplewebauthn/types";
import { evaluateRisk, isUsualHour } from "../services/riskEngine.js";
import { anomalyScore, mergeSample, profileHasData, emptyProfile, type KeystrokeProfile } from "../services/keystrokeService.js";
import { sendOtp, verifyOtp, sendAlertEmail } from "../services/emailService.js";
import { checkEmailBreach } from "../services/hibpService.js";
import { findTrustedDevice, markDeviceTrusted } from "../services/deviceService.js";
import { geoFromIp, formatLocation } from "../utils/geo.js";
import {
  generateRecoveryCodes,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  verifyPassword as verifyRecoveryCode,
} from "../utils/crypto.js";
import { env, isProduction } from "../config/env.js";
import {
  loginOptionsSchema,
  loginVerifySchema,
  qrApproveSchema,
  qrCreateSchema,
  refreshSchema,
  registerOptionsSchema,
  registerVerifySchema,
  stepUpVerifySchema,
} from "../utils/validators.js";
import { logger } from "../utils/logger.js";

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

interface LoginContext {
  email: string;
  deviceFingerprint: string;
  deviceInfo: string;
  keystrokes?: { prev: number; curr: number; delta: number }[];
}

async function assessLogin(user: { id: string; email: string }, ctx: LoginContext, ip: string) {
  const trusted = await findTrustedDevice(user.id, ctx.deviceFingerprint);

  const geo = await geoFromIp(ip);
  const location = formatLocation(geo);
  const countryCode = geo?.countryCode ?? null;

  // Country history from the last 90 days.
  const history = await prisma.loginHistory.findMany({
    where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } },
    select: { ipAddress: true, location: true },
    take: 50,
  });
  const knownCountries = new Set<string>();
  for (const h of history) {
    const code = h.location?.split(", ").pop();
    if (code) knownCountries.add(code);
  }
  const countryChanged = countryCode !== null && history.length > 0 && !knownCountries.has(countryCode) && countryCode !== "LOCAL";

  // Keystroke anomaly.
  const profileRow = await prisma.keystrokeProfile.findUnique({ where: { userId: user.id } });
  const profile: KeystrokeProfile = profileRow?.transitions ? (JSON.parse(profileRow.transitions) as KeystrokeProfile) : emptyProfile();
  const sample = ctx.keystrokes && ctx.keystrokes.length > 0
    ? { transitions: ctx.keystrokes.map((k) => [k.prev, k.curr] as [number, number]), timings: ctx.keystrokes.map((k) => k.delta) }
    : null;
  const keystrokeAnomaly = sample && profileHasData(profile) ? anomalyScore(profile, sample) : 0;

  // Login velocity (last 10 minutes).
  const velocityKey = `auth:velocity:${user.id}`;
  const redis = getRedis();
  const recentLogins = await redis.incr(velocityKey);
  if (recentLogins === 1) await redis.expire(velocityKey, 600);

  return {
    isNewDevice: !trusted,
    isNewIp: history.length > 0 && !history.some((h) => h.ipAddress === ip),
    countryChanged,
    keystrokeAnomaly,
    recentLogins,
    loginCountIsAnomalous: recentLogins > 3,
    unusualHour: !isUsualHour(),
    location,
  };
}

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
      details: JSON.stringify({ sessionId: session.id, keystrokes: ctx.keystrokes?.length ?? 0 }),
    },
  });

  return { accessToken, refreshToken, user: { id: user.id, email: user.email, name: user.name } };
}

// ---------------------------------------------------------------------------
// REGISTRATION
// ---------------------------------------------------------------------------

export const registerOptions: RequestHandler = asyncHandler(async (req, res) => {
  const { email, name } = registerOptionsSchema.parse(req.body);
  const options = await buildRegistrationOptions(email.trim().toLowerCase(), name.trim());
  res.json({ options, email: email.trim().toLowerCase() });
});

export const registerVerify: RequestHandler = asyncHandler(async (req, res) => {
  const { email, credential } = registerVerifySchema.parse(req.body);
  const { name, credential: cred, deviceType, backedUp } = await verifyRegistrationResponseCredential(
    email,
    credential as unknown as RegistrationResponseJSON,
  );

  const breachCount = await checkEmailBreach(email);
  if (breachCount !== null && breachCount > 0) {
    // We still allow registration, but this surfaces during the profile review.
    logger.warn(`New signup email has been in ${breachCount} breach(es)`, email);
  }

  const user = await prisma.user.create({
    data: {
      email,
      name,
      credentials: {
        create: {
          credentialId: cred.id,
          publicKey: Buffer.from(cred.publicKey),
          counter: cred.counter,
          deviceType,
          backedUp,
          transports: cred.transports as string[],
          nickname: "Primary Passkey",
        },
      },
      keystrokeProfile: { create: { transitions: "{}", sampleCount: 0 } },
    },
    select: { id: true, email: true, name: true },
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
      deviceInfo: "Registration",
      ipAddress: req.ip ?? "unknown",
      riskScore: 0,
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    },
  });

  await prisma.loginHistory.create({
    data: {
      userId: user.id,
      eventType: "login",
      deviceInfo: "Registration",
      ipAddress: req.ip ?? "unknown",
      riskScore: 0,
      riskAction: "allow",
      details: JSON.stringify({ kind: "registration" }),
    },
  });

  logger.info(`New account registered: ${email}`);
  res.status(201).json({
    user,
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

  const credentials = buildUserCredentialsFromDb(user.credentials);
  if (credentials.length === 0) throw new AppError(403, "No passkeys registered for this account.");

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

  const ip = req.ip ?? "unknown";
  const ctx: LoginContext = {
    email,
    deviceFingerprint: body.deviceFingerprint,
    deviceInfo: body.deviceInfo,
    keystrokes: body.keystrokes,
  };

  const input = await assessLogin(user, ctx, ip);
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
      details: JSON.stringify({ signals: assessment.signals }),
    },
  });

  if (assessment.action === "block") {
    await sendAlertEmail(email, "NovaBank blocked a sign-in attempt", `We blocked a sign-in from ${body.deviceInfo} (${ip}). If this was you, contact support.`);
    throw new AppError(403, "Sign-in blocked by risk engine.", { risk: assessment });
  }

  if (assessment.action === "step_up_email") {
    const otp = await sendOtp(email, "login_step_up");
    await prisma.loginHistory.create({
      data: { userId: user.id, eventType: "alert", deviceInfo: body.deviceInfo, ipAddress: ip, location: input.location, riskScore: assessment.score, riskAction: "step_up_email" },
    });
    return res.json({
      stepUpRequired: true,
      method: "otp_email",
      risk: assessment,
      ...(isProduction ? {} : { devOtp: otp }),
    });
  }

  if (assessment.action === "step_up_passkey") {
    const userCreds = buildUserCredentialsFromDb(user.credentials);
    const options = await buildAuthenticationOptions({ id: user.id, email: user.email, credentials: userCreds });
    return res.json({
      stepUpRequired: true,
      method: "passkey",
      risk: assessment,
      options,
    });
  }

  const { accessToken, refreshToken, user: outUser } = await completeLogin(user, ctx, assessment.score, "allow", ip);
  res.json({ stepUpRequired: false, risk: assessment, accessToken, refreshToken, user: outUser });
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
  res.json({ user: { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt } });
});
