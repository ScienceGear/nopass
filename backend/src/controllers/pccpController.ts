import type { RequestHandler } from "express";
import { prisma } from "../config/db.js";
import { AppError, asyncHandler } from "../middleware/errorHandler.js";
import { logger } from "../utils/logger.js";
import { completeLogin } from "./authController.js";
import { evaluateRisk } from "../services/riskEngine.js";
import { assessContext, type RiskContextInput } from "../services/riskContextService.js";
import {
  buildAuthenticationOptions,
  buildUserCredentialsFromDb,
  verifyAuthenticationResponseCredential,
} from "../services/webauthnService.js";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/types";
import {
  selectImageSet,
  computeDisplayOrder,
  hashClickpoint,
  quantizeGrid,
  verifyClickpoints,
  computeTimingZScore,
  checkLockout,
  recordLockoutFailure,
  clearLockout,
  appendTimingSample,
  createRegState,
  getRegState,
  updateRegState,
  deleteRegState,
  createLoginState,
  getLoginState,
  updateLoginState,
  deleteLoginState,
  createStepupState,
  getStepupState,
  deleteStepupState,
  randomSalt,
  pccpImageUrl,
  REGISTER_REPETITIONS,
  MAX_LOCKOUT_FAILURES,
  STEPUP_Z_MAX,
  STEPUP_Z_MIN,
  type PccpDeviceClass,
  type TimingSample,
} from "../services/pccpService.js";
import {
  pccpRegisterConfirmSchema,
  pccpLoginInitSchema,
  pccpLoginVerifySchema,
  pccpStepupConfirmSchema,
} from "../utils/validators.js";

// ---------------------------------------------------------------------------
// PCCP (Persuasive Cued Click-Points) — a knowledge-factor fallback and a
// risk-engine step-up option.
//
// Registration stores a 21x21-grid quantisation of each click-point as an
// argon2id hash (raw coordinates are never persisted). Login reproduces the
// sequence within a 1-cell Chebyshev tolerance (the hard gate) while per
// device-class timing z-scores feed the risk engine as a soft signal only.
// ---------------------------------------------------------------------------

const ctxFromBody = (body: {
  email: string;
  deviceFingerprint: string;
  deviceInfo: string;
  keystrokes?: { prev: number; curr: number; delta: number }[];
}): RiskContextInput => ({
  email: body.email,
  deviceFingerprint: body.deviceFingerprint,
  deviceInfo: body.deviceInfo,
  keystrokes: body.keystrokes,
});

// ---------------------------------------------------------------------------
// REGISTRATION (authed + completed onboarding)
// ---------------------------------------------------------------------------

export const pccpRegisterInit: RequestHandler = asyncHandler(async (req, res) => {
  const userId = req.userId!;

  const { imageIds, orderSeed } = await selectImageSet(userId);
  const displayOrder = computeDisplayOrder(imageIds, orderSeed, 0);

  const token = await createRegState({
    userId,
    imageIds,
    orderSeed,
    repetition: 1,
    deviceClass: "desktop", // overridden by the first confirm call
    timingSamples: [],
  });

  res.json({
    token,
    images: imageIds.map((id) => ({ id, url: pccpImageUrl(id) })),
    order: displayOrder,
    repetition: 1,
    repetitionsRequired: REGISTER_REPETITIONS,
  });
});

export const pccpRegisterConfirm: RequestHandler = asyncHandler(async (req, res) => {
  const body = pccpRegisterConfirmSchema.parse(req.body);
  const userId = req.userId!;

  const state = await getRegState(body.token);
  if (!state) throw new AppError(410, "Setup session expired. Start again.");
  if (state.userId !== userId) {
    throw new AppError(403, "This setup session belongs to a different account.");
  }

  // Quantize once — raw pixel coordinates never touch the database or logs.
  const grid = body.clicks.map((c) => ({ gridCellX: quantizeGrid(c.x), gridCellY: quantizeGrid(c.y) }));
  const displayOrder = computeDisplayOrder(state.imageIds, state.orderSeed, state.repetition - 1);
  const samples: TimingSample[] = body.clicks.map((c, i) => ({
    position: i,
    timeToClick: c.timeToClick,
    interClick: c.interClick,
  }));

  if (state.repetition === 1) {
    // First enrollment: persist the 3 hashed click-points (one per image).
    for (let i = 0; i < displayOrder.length; i++) {
      const salt = randomSalt();
      const hash = await hashClickpoint(salt, grid[i].gridCellX, grid[i].gridCellY, displayOrder[i], i);
      await prisma.pccpClickpoint.upsert({
        where: { userId_imageId: { userId, imageId: displayOrder[i] } },
        create: {
          userId,
          imageId: displayOrder[i],
          sequencePosition: i,
          gridCellX: grid[i].gridCellX,
          gridCellY: grid[i].gridCellY,
          salt,
          hash,
        },
        update: {
          sequencePosition: i,
          gridCellX: grid[i].gridCellX,
          gridCellY: grid[i].gridCellY,
          salt,
          hash,
        },
      });
    }
  } else {
    // Confirmation repetitions: the hard gate against the stored set.
    const { pass, failedPosition } = await verifyClickpoints(userId, displayOrder, grid);
    if (!pass) {
      return res.json({
        ok: false,
        error: `Click ${(failedPosition ?? 0) + 1} didn't match. Try again.`,
      });
    }
  }

  const nextRepetition = state.repetition + 1;
  await updateRegState(body.token, {
    deviceClass: body.deviceClass,
    repetition: nextRepetition,
    timingSamples: [...state.timingSamples, ...samples],
  });

  if (nextRepetition <= REGISTER_REPETITIONS) {
    return res.json({
      ok: true,
      complete: false,
      repetition: nextRepetition,
      order: computeDisplayOrder(state.imageIds, state.orderSeed, nextRepetition - 1),
    });
  }

  // All repetitions done: seed the per-device-class timing baseline and flip
  // the enrollment & onboarding step to complete.
  const deviceClass: PccpDeviceClass = body.deviceClass;
  await appendTimingSample(userId, deviceClass, [...state.timingSamples, ...samples]);
  await prisma.$transaction([
    prisma.pccpConfig.update({ where: { userId }, data: { enrolled: true } }),
    prisma.user.update({ where: { id: userId }, data: { onboardingStep: "complete" } }),
  ]);
  await deleteRegState(body.token);

  res.json({ ok: true, complete: true });
});

// ---------------------------------------------------------------------------
// LOGIN
// ---------------------------------------------------------------------------

export const pccpLoginInit: RequestHandler = asyncHandler(async (req, res) => {
  const body = pccpLoginInitSchema.parse(req.body);
  const email = body.email.trim().toLowerCase();

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new AppError(404, "Account not found.");
  if (!user.emailVerified) {
    throw new AppError(403, "Your email isn't verified yet — finish signing up first.");
  }

  const config = await prisma.pccpConfig.findUnique({ where: { userId: user.id } });
  if (!config || !config.enrolled) {
    throw new AppError(404, "No click-point login set up for this account yet.", { code: "NO_PCCP" });
  }

  const { locked, lockedUntil } = await checkLockout(user.id);
  if (locked) {
    return res.json({ status: "locked", lockoutUntil: lockedUntil?.toISOString() });
  }

  // Rotate the display order per attempt so the same memorised set is shown
  // in a different arrangement each time.
  const displayOrder = computeDisplayOrder(config.imageIds, config.orderSeed, config.attemptIndex);
  await prisma.pccpConfig.update({
    where: { userId: user.id },
    data: { attemptIndex: config.attemptIndex + 1 },
  });

  const token = await createLoginState({
    userId: user.id,
    email,
    imageIds: config.imageIds,
    orderSeed: config.orderSeed,
    displayOrder,
    attempts: 0,
  });

  res.json({
    token,
    images: config.imageIds.map((id) => ({ id, url: pccpImageUrl(id) })),
    order: displayOrder,
    status: "ok",
  });
});

export const pccpLoginVerify: RequestHandler = asyncHandler(async (req, res) => {
  const body = pccpLoginVerifySchema.parse(req.body);
  const ip = req.ip ?? "unknown";

  const state = await getLoginState(body.token);
  if (!state) throw new AppError(410, "Sign-in session expired. Start again.");

  // Per-attempt cap on this sign-in session (the persistent PccpLockout is
  // enforced separately below).
  const attempts = state.attempts + 1;
  if (attempts > MAX_LOCKOUT_FAILURES) {
    await deleteLoginState(body.token);
    return res.json({ status: "locked" });
  }

  const user = await prisma.user.findUnique({
    where: { id: state.userId },
    include: { credentials: true },
  });
  if (!user) throw new AppError(404, "Account not found.");

  const grid = body.clicks.map((c) => ({ gridCellX: quantizeGrid(c.x), gridCellY: quantizeGrid(c.y) }));
  const samples: TimingSample[] = body.clicks.map((c, i) => ({
    position: i,
    timeToClick: c.timeToClick,
    interClick: c.interClick,
  }));

  // HARD GATE: all 3 click-points must land within tolerance of the memorised
  // cells. Only this can reject; timing below is a soft signal.
  const { pass, failedPosition } = await verifyClickpoints(user.id, state.displayOrder, grid);
  if (!pass) {
    await updateLoginState(body.token, { attempts });
    const { locked, lockedUntil, failedAttempts } = await recordLockoutFailure(user.id);
    if (locked) {
      await deleteLoginState(body.token);
      return res.json({ status: "locked", lockoutUntil: lockedUntil.toISOString() });
    }
    return res.json({
      status: "rejected",
      attemptsLeft: Math.max(0, MAX_LOCKOUT_FAILURES - failedAttempts),
    });
  }

  // SOFT SIGNAL & BEHAVIORAL RISK DETECTION:
  // Evaluate timing z-score against baseline AND risk engine score (new device, new IP, etc.).
  const baselines = await prisma.pccpBehaviorBaseline.findMany({
    where: { userId: user.id, deviceClass: body.deviceClass },
  });

  let maxZ = 0;
  if (baselines.length > 0) {
    const timingRes = computeTimingZScore(baselines, samples);
    maxZ = timingRes.maxZ;
  }

  const ctx: RiskContextInput = ctxFromBody({
    email: state.email,
    deviceFingerprint: body.deviceFingerprint,
    deviceInfo: body.deviceInfo,
    keystrokes: body.keystrokes,
  });
  const input = await assessContext(user, ctx, ip);
  const assessment = evaluateRisk(input);

  if (assessment.action === "block") {
    throw new AppError(403, "Sign-in blocked by risk engine.", { risk: assessment });
  }

  const isSuspiciousBehavior = maxZ > STEPUP_Z_MIN || assessment.score > 30 || assessment.action !== "allow";
  if (isSuspiciousBehavior) {
    const userCreds = buildUserCredentialsFromDb(user.credentials);
    if (userCreds.length > 0) {
      if (maxZ > STEPUP_Z_MAX || assessment.score > 60) {
        await prisma.loginHistory.create({
          data: {
            userId: user.id,
            eventType: "alert",
            deviceInfo: body.deviceInfo,
            ipAddress: ip,
            location: null,
            riskScore: assessment.score,
            riskAction: "pccp_anomaly",
            details: JSON.stringify({ maxZ, riskScore: assessment.score, signals: assessment.signals }),
          },
        });
      }
      const stepupToken = await createStepupState({
        userId: user.id,
        email: state.email,
        deviceClass: body.deviceClass,
        timingSamples: samples,
      });
      const options = await buildAuthenticationOptions({
        id: user.id,
        email: state.email,
        credentials: userCreds,
      });
      await deleteLoginState(body.token);
      return res.json({ status: "stepup_required", stepupToken, options });
    }
    // If no passkey on file, log the anomaly and continue with login
    logger.warn(
      `PCCP suspicious behavior (z=${maxZ.toFixed(2)}, risk=${assessment.score}) on ${user.email} (no passkey for step-up); continuing`,
    );
  }

  const { accessToken, refreshToken, user: outUser } = await completeLogin(
    user,
    ctx,
    assessment.score,
    "allow",
    ip,
  );

  clearLockout(user.id).catch(() => {});
  appendTimingSample(user.id, body.deviceClass, samples).catch(() => {});
  await deleteLoginState(body.token);

  res.json({ status: "success", accessToken, refreshToken, user: outUser });
});

// ---------------------------------------------------------------------------
// STEP-UP (elevated timing anomaly → confirm with a passkey gesture)
// ---------------------------------------------------------------------------

export const pccpStepupConfirm: RequestHandler = asyncHandler(async (req, res) => {
  const body = pccpStepupConfirmSchema.parse(req.body);
  const ip = req.ip ?? "unknown";

  const state = await getStepupState(body.token);
  if (!state) throw new AppError(410, "Step-up session expired. Start again.");

  const user = await prisma.user.findUnique({ where: { id: state.userId } });
  if (!user) throw new AppError(404, "Account not found.");

  const credentialRecord = await prisma.credential.findUnique({
    where: { credentialId: body.credential?.id ?? "" },
  });
  if (!credentialRecord || credentialRecord.userId !== user.id) {
    throw new AppError(401, "Step-up verification failed.");
  }

  try {
    const { newCounter } = await verifyAuthenticationResponseCredential(user.email, body.credential as never, {
      id: credentialRecord.credentialId,
      publicKey: credentialRecord.publicKey,
      counter: credentialRecord.counter,
      transports: credentialRecord.transports as AuthenticatorTransportFuture[],
    });
    await prisma.credential.update({
      where: { id: credentialRecord.id },
      data: { counter: newCounter, lastUsedAt: new Date() },
    });
  } catch {
    throw new AppError(401, "Step-up verification failed.");
  }

  const ctx: RiskContextInput = ctxFromBody({
    email: state.email,
    deviceFingerprint: body.deviceFingerprint,
    deviceInfo: body.deviceInfo,
    keystrokes: body.keystrokes,
  });
  const input = await assessContext(user, ctx, ip);
  const assessment = evaluateRisk(input);
  if (assessment.action === "block") {
    throw new AppError(403, "Sign-in blocked by risk engine.", { risk: assessment });
  }

  const { accessToken, refreshToken, user: outUser } = await completeLogin(
    user,
    ctx,
    45, // elevated, matching the existing passkey step-up precedent
    "allow",
    ip,
  );

  clearLockout(user.id).catch(() => {});
  if (state.timingSamples.length > 0) {
    appendTimingSample(user.id, state.deviceClass, state.timingSamples).catch(() => {});
  }
  await deleteStepupState(body.token);

  res.json({ accessToken, refreshToken, user: outUser });
});
