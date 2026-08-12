import argon2 from "argon2";
import { randomBytes } from "node:crypto";
import { prisma } from "../config/db.js";
import { getRedis } from "../config/redis.js";
import { AppError } from "../middleware/errorHandler.js";
import { randomToken } from "../utils/crypto.js";
import { logger } from "../utils/logger.js";

/**
 * PCCP (Persuasive Cued Click-Points) knowledge factor.
 *
 * The user memorises one click-point on each of 3 images. Click coordinates
 * are never stored raw: they are normalised 0..1 by the client, quantised to a
 * 21x21 grid server-side, and persisted only as an argon2id hash (with a per
 * click-point salt). Login reproduces the sequence within a Chebyshev
 * tolerance of 1 grid cell (the hard gate) while per-device-class timing
 * baselines feed the risk engine as a soft signal (never a hard gate).
 *
 * Lockout is PCCP-method-only: a dedicated PccpLockout row is separate from
 * the account, so passkey/email/SMS logins are never affected.
 */

// ---------------------------------------------------------------------------
// Constants & image catalog
// ---------------------------------------------------------------------------

export const PCCP_IMAGE_IDS = ["pccp-1", "pccp-2", "pccp-3", "pccp-4", "pccp-5"] as const;
export const IMAGES_PER_SET = 3; // user sees 3 of 5
export const GRID_SIZE = 21; // 21x21 quantization grid
export const TOLERANCE = 1; // Chebyshev distance <=1 (3x3 neighborhood)
export const MAX_LOCKOUT_FAILURES = 3;
export const LOCKOUT_DURATION_MS = 60 * 60 * 1000; // 1 hour
export const REGISTER_REPETITIONS = 3;
export const TIMING_ROLLING_WINDOW = 20;
export const REDIS_TTL_SECONDS = 600; // 10 min per attempt
export const STEPUP_Z_MAX = 3; // timing z > 3 -> anomaly rejection
export const STEPUP_Z_MIN = 1.5; // timing z > 1.5 -> require passkey step-up

export type PccpDeviceClass = "desktop" | "mobile";

export interface PccpClickWithTiming {
  x: number; // normalized 0..1
  y: number;
  timeToClick: number; // ms since this image's reveal finished
  interClick: number; // ms since the previous click (0 for the first)
  pointerType?: "mouse" | "touch" | "stylus";
}

export interface TimingSample {
  position: number; // 0, 1, or 2
  timeToClick: number;
  interClick: number;
}

// ---------------------------------------------------------------------------
// Seeded permutation (display order per attempt)
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic shuffle of the user's 3-image set for a given attempt index.
 * Backend and frontend agree on the order when given the same seed + index;
 * a different index yields a different order, so each attempt re-randomises
 * the presentation without storing per-attempt arrays in the DB.
 */
export function computeDisplayOrder(imageIds: string[], seed: number, attemptIndex: number): string[] {
  const arr = [...imageIds];
  const rng = mulberry32((seed ^ Math.imul(attemptIndex + 1, 2654435761)) >>> 0);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------------------------------------------------------------------------
// Image set selection & click-point hashing
// ---------------------------------------------------------------------------

export interface ImageSetResult {
  imageIds: string[];
  orderSeed: number;
  isFirstTime: boolean;
}

/** Pick the user's fixed 3-image set, reusing an existing enrollment. */
export async function selectImageSet(userId: string): Promise<ImageSetResult> {
  const existing = await prisma.pccpConfig.findUnique({ where: { userId } });
  if (existing) {
    return { imageIds: existing.imageIds, orderSeed: existing.orderSeed, isFirstTime: false };
  }
  // Fisher-Yates partial shuffle: pick 3 of 5 distinct images.
  const pool = [...PCCP_IMAGE_IDS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const imageIds = pool.slice(0, IMAGES_PER_SET);
  const orderSeed = Math.floor(Math.random() * 0x7fffffff);
  await prisma.pccpConfig.create({
    data: { userId, imageIds, orderSeed, enrolled: false },
  });
  return { imageIds, orderSeed, isFirstTime: true };
}

/** Argon2id hash of a click-point. Raw coordinates are never stored. */
export async function hashClickpoint(
  salt: string,
  gridCellX: number,
  gridCellY: number,
  imageId: string,
  sequencePosition: number,
): Promise<string> {
  const input = `${salt}:${gridCellX}:${gridCellY}:${imageId}:${sequencePosition}`;
  return argon2.hash(input, { type: argon2.argon2id });
}

export function quantizeGrid(v: number): number {
  return Math.max(0, Math.min(GRID_SIZE - 1, Math.floor(v * GRID_SIZE)));
}

function chebyshev(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

/**
 * Hard gate: verify all 3 clicks against the stored click-points at once.
 * Every position must land within TOLERANCE grid cells of the memorised cell.
 */
export async function verifyClickpoints(
  userId: string,
  displayOrder: string[],
  clicks: Array<{ gridCellX: number; gridCellY: number }>,
): Promise<{ pass: boolean; failedPosition?: number }> {
  const stored = await prisma.pccpClickpoint.findMany({
    where: { userId, imageId: { in: displayOrder } },
  });
  const byImage = new Map(stored.map((row) => [row.imageId, row]));

  for (let i = 0; i < displayOrder.length; i++) {
    const row = byImage.get(displayOrder[i]);
    if (!row) return { pass: false, failedPosition: i };
    const click = clicks[i];
    if (chebyshev(click.gridCellX, click.gridCellY, row.gridCellX, row.gridCellY) > TOLERANCE) {
      return { pass: false, failedPosition: i };
    }
  }
  return { pass: true };
}

// ---------------------------------------------------------------------------
// Timing soft signal
// ---------------------------------------------------------------------------

function zscore(value: number, mean: number, stddev: number): number {
  if (!Number.isFinite(stddev) || stddev <= 1e-9) return 0;
  return (value - mean) / stddev;
}

/**
 * Max absolute z-score of this attempt's timings against the per-device-class
 * baseline. A soft signal only: it can trigger step-up or anomaly logging but
 * never itself rejects a correct click sequence.
 */
export function computeTimingZScore(
  baselines: Array<{ sequencePosition: number; meanTimeToClick: number; stddevTimeToClick: number; meanInterClick: number; stddevInterClick: number }>,
  samples: TimingSample[],
): { maxZ: number; zScores: Array<{ position: number; z: number }> } {
  const byPosition = new Map(baselines.map((b) => [b.sequencePosition, b]));
  const zScores: Array<{ position: number; z: number }> = [];
  let maxZ = 0;

  for (const sample of samples) {
    const baseline = byPosition.get(sample.position);
    if (!baseline) continue;
    const zTtc = Math.abs(zscore(sample.timeToClick, baseline.meanTimeToClick, baseline.stddevTimeToClick));
    const zIci = Math.abs(zscore(sample.interClick, baseline.meanInterClick, baseline.stddevInterClick));
    const z = Math.max(zTtc, zIci);
    zScores.push({ position: sample.position, z });
    if (z > maxZ) maxZ = z;
  }
  return { maxZ, zScores };
}

// ---------------------------------------------------------------------------
// Lockout (PCCP method only)
// ---------------------------------------------------------------------------

export async function checkLockout(userId: string): Promise<{ locked: boolean; lockedUntil?: Date }> {
  const row = await prisma.pccpLockout.findUnique({ where: { userId } });
  if (!row || row.lockedUntil === null || row.lockedUntil <= new Date()) {
    return { locked: false };
  }
  return { locked: true, lockedUntil: row.lockedUntil };
}

/** Increment the failure counter; returns locked:true once the cap is hit. */
export async function recordLockoutFailure(userId: string): Promise<{ locked: boolean; lockedUntil: Date; failedAttempts: number }> {
  const now = new Date();
  const lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);

  // Read-modify-write so failures accumulate across attempts on one account.
  // A previous lock that has already expired doesn't carry its counter forward.
  const prev = await prisma.pccpLockout.findUnique({ where: { userId } });
  let failedAttempts = 0;
  if (prev && prev.lockedUntil && prev.lockedUntil > now) {
    failedAttempts = prev.failedAttempts;
  }
  const next = failedAttempts + 1;

  const locked = next >= MAX_LOCKOUT_FAILURES;
  const row = await prisma.pccpLockout.upsert({
    where: { userId },
    create: { userId, failedAttempts: next, lockedUntil: locked ? lockedUntil : null },
    update: { failedAttempts: next, lockedUntil: locked ? lockedUntil : null },
  });
  if (locked) {
    logger.warn(`PCCP locked for user ${userId} (${next} failed attempts)`);
  }
  return { locked, lockedUntil: row.lockedUntil ?? lockedUntil, failedAttempts: next };
}

/** Clear the PCCP lockout on any successful login. */
export async function clearLockout(userId: string): Promise<void> {
  await prisma.pccpLockout
    .updateMany({
      where: { userId, failedAttempts: { gt: 0 } },
      data: { failedAttempts: 0, lockedUntil: null },
    })
    .catch(() => {
      /* best-effort */
    });
}

// ---------------------------------------------------------------------------
// Timing baseline (rolling window, per device class per position)
// ---------------------------------------------------------------------------

/** Append one attempt's timings to the rolling baseline and recompute stats. */
export async function appendTimingSample(
  userId: string,
  deviceClass: PccpDeviceClass,
  samples: TimingSample[],
): Promise<void> {
  for (const sample of samples) {
    const row = await prisma.pccpBehaviorBaseline.upsert({
      where: { userId_deviceClass_sequencePosition: { userId, deviceClass, sequencePosition: sample.position } },
      create: {
        userId,
        deviceClass,
        sequencePosition: sample.position,
        meanTimeToClick: sample.timeToClick,
        stddevTimeToClick: 0,
        meanInterClick: sample.interClick,
        stddevInterClick: 0,
        sampleCount: 1,
        recentTimeToClick: [sample.timeToClick],
        recentInterClick: [sample.interClick],
      },
      update: {},
    });

    const timeToClick = [...row.recentTimeToClick, sample.timeToClick].slice(-TIMING_ROLLING_WINDOW);
    const interClick = [...row.recentInterClick, sample.interClick].slice(-TIMING_ROLLING_WINDOW);
    const sampleCount = row.sampleCount + 1;

    const mean = (xs: number[]) => xs.reduce((acc, v) => acc + v, 0) / xs.length;
    const stddev = (xs: number[], m: number) => {
      if (xs.length < 2) return 0;
      return Math.sqrt(xs.reduce((acc, v) => acc + (v - m) * (v - m), 0) / xs.length);
    };

    const meanTtc = mean(timeToClick);
    const meanIci = mean(interClick);
    await prisma.pccpBehaviorBaseline.update({
      where: { id: row.id },
      data: {
        meanTimeToClick: meanTtc,
        stddevTimeToClick: stddev(timeToClick, meanTtc),
        meanInterClick: meanIci,
        stddevInterClick: stddev(interClick, meanIci),
        sampleCount,
        recentTimeToClick: timeToClick,
        recentInterClick: interClick,
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Redis transient state (registration, login, step-up)
// ---------------------------------------------------------------------------

export interface PccpRegState {
  userId: string;
  imageIds: string[];
  orderSeed: number;
  repetition: number; // 1..3
  deviceClass: PccpDeviceClass;
  timingSamples: TimingSample[];
}

export interface PccpLoginState {
  userId: string;
  email: string;
  imageIds: string[];
  orderSeed: number;
  displayOrder: string[];
  attempts: number;
}

export interface PccpStepupState {
  userId: string;
  email: string;
  deviceClass: PccpDeviceClass;
  timingSamples: TimingSample[];
}

const regKey = (token: string) => `pccp:reg:${token}`;
const loginKey = (token: string) => `pccp:login:${token}`;
const stepupKey = (token: string) => `pccp:stepup:${token}`;

export async function createRegState(state: PccpRegState): Promise<string> {
  const token = randomToken("pccpreg", 18);
  await getRedis().set(regKey(token), JSON.stringify(state), "EX", REDIS_TTL_SECONDS);
  return token;
}

export async function getRegState(token: string): Promise<PccpRegState | null> {
  const raw = await getRedis().get(regKey(token));
  return raw ? (JSON.parse(raw) as PccpRegState) : null;
}

export async function updateRegState(token: string, updates: Partial<PccpRegState>): Promise<void> {
  const state = await getRegState(token);
  if (!state) throw new AppError(410, "Setup session expired. Start again.");
  await getRedis().set(regKey(token), JSON.stringify({ ...state, ...updates }), "EX", REDIS_TTL_SECONDS);
}

export async function deleteRegState(token: string): Promise<void> {
  await getRedis().del(regKey(token));
}

export async function createLoginState(state: PccpLoginState): Promise<string> {
  const token = randomToken("pccplogin", 18);
  await getRedis().set(loginKey(token), JSON.stringify(state), "EX", REDIS_TTL_SECONDS);
  return token;
}

export async function getLoginState(token: string): Promise<PccpLoginState | null> {
  const raw = await getRedis().get(loginKey(token));
  return raw ? (JSON.parse(raw) as PccpLoginState) : null;
}

export async function updateLoginState(token: string, updates: Partial<PccpLoginState>): Promise<void> {
  const state = await getLoginState(token);
  if (!state) throw new AppError(410, "Sign-in session expired. Start again.");
  await getRedis().set(loginKey(token), JSON.stringify({ ...state, ...updates }), "EX", REDIS_TTL_SECONDS);
}

export async function deleteLoginState(token: string): Promise<void> {
  await getRedis().del(loginKey(token));
}

export async function createStepupState(state: PccpStepupState): Promise<string> {
  const token = randomToken("pccpstepup", 18);
  await getRedis().set(stepupKey(token), JSON.stringify(state), "EX", REDIS_TTL_SECONDS);
  return token;
}

export async function getStepupState(token: string): Promise<PccpStepupState | null> {
  const raw = await getRedis().get(stepupKey(token));
  return raw ? (JSON.parse(raw) as PccpStepupState) : null;
}

export async function deleteStepupState(token: string): Promise<void> {
  await getRedis().del(stepupKey(token));
}

// ---------------------------------------------------------------------------
// Misc helpers
// ---------------------------------------------------------------------------

export function randomSalt(bytes = 16): string {
  return randomBytes(bytes).toString("hex");
}

export function pccpImageUrl(imageId: string): string {
  return `/pccp/${imageId}.png`;
}
