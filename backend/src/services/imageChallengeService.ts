import { randomBytes } from "node:crypto";
import { getRedis } from "../config/redis.js";
import { prisma } from "../config/db.js";
import { isProduction } from "../config/env.js";
import { AppError } from "../middleware/errorHandler.js";
import { logger } from "../utils/logger.js";

/**
 * Image-sequence step-up (Phase 8). A "click-in-region" challenge:
 * the user must click three objects on a scene in the prompted order.
 * The sequence is stored server-side (Redis, single-use, 5-min TTL) and
 * verified against the pool's bounding boxes with a tolerance  replaying
 * an old response fails because the token is deleted on first use.
 */

export type RegionBox = [number, number, number, number]; // [x, y, w, h] normalized 0..1
export interface ChallengeClick {
  x: number; // normalized 0..1 relative to the rendered image
  y: number;
}

interface ImageRegion {
  id: string;
  label: string;
  box: RegionBox;
}

interface ChallengeImage {
  key: string;
  name: string;
  svg: string;
  regions: ImageRegion[];
}

export interface ImageChallengePayload {
  challengeToken: string;
  prompt: string[];
  image: { key: string; name: string; svg: string };
  expiresAt: number;
  /** Dev-only: the exact target boxes so tooling/tests can click precisely. */
  devRegions?: { regionId: string; box: RegionBox }[];
}

export interface ImageSetupScene {
  key: string;
  name: string;
  svg: string;
  regions: { id: string; box: RegionBox }[];
}

interface StoredChallenge {
  userId: string | null;
  sequence: { imageKey: string; regionId: string }[];
  attempts: number;
}

const TTL_SECONDS = 300;
const MAX_ATTEMPTS = 3;
const TOLERANCE = 0.06;

// ---------------------------------------------------------------------------
// Scene pool  procedurally drawn, fixed bounding boxes. Every object the
// prompt can reference must be a distinct, recognisable shape.
// ---------------------------------------------------------------------------

const VB = { w: 320, h: 200 };

const scenes: ChallengeImage[] = [
  {
    key: "living-room",
    name: "Living room",
    svg: `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VB.w} ${VB.h}">
  <rect width="${VB.w}" height="${VB.h}" fill="#151a26"/>
  <rect width="${VB.w}" height="158" fill="#1d2434"/>
  <rect y="158" width="${VB.w}" height="42" fill="#10141f"/>
  <g id="window"><rect x="166" y="12" width="109" height="52" rx="4" fill="#2c3a55"/><rect x="174" y="20" width="93" height="36" fill="#3f6fa3"/><line x1="220" y1="20" x2="220" y2="56" stroke="#2c3a55" stroke-width="3"/><line x1="174" y1="38" x2="267" y2="38" stroke="#2c3a55" stroke-width="3"/></g>
  <g id="door"><rect x="128" y="80" width="51" height="120" rx="3" fill="#6b4a2f"/><rect x="135" y="88" width="37" height="50" rx="2" fill="#5b3d26"/><circle cx="171" cy="142" r="3.5" fill="#f0c060"/></g>
  <g id="sofa"><rect x="26" y="156" width="116" height="40" rx="14" fill="#7a4f96"/><rect x="38" y="136" width="92" height="26" rx="10" fill="#8a5fa6"/></g>
  <g id="cat"><path d="M46 188 q-2 -18 16 -22 q18 -4 28 8 q6 -10 8 -4 q3 -8 6 2 q-4 6 -8 16 q-18 20 -50 -0 z" fill="#d9a441"/><circle cx="52" cy="168" r="9" fill="#d9a441"/><path d="M45 162 l-5 -9 l10 4 z" fill="#d9a441"/><path d="M59 162 l5 -9 l-10 4 z" fill="#d9a441"/></g>
  <g id="lamp"><line x1="268" y1="156" x2="268" y2="74" stroke="#e8c27a" stroke-width="4"/><path d="M244 74 h48 l-10 -34 h-28 z" fill="#f0c060"/><circle cx="268" cy="72" r="6" fill="#ffe9a8" opacity="0.8"/><rect x="258" y="156" width="20" height="6" rx="3" fill="#3a445c"/></g>
  <g id="tv"><rect x="198" y="84" width="78" height="44" rx="5" fill="#0b0d14"/><rect x="206" y="90" width="62" height="32" fill="#22344f"/><line x1="237" y1="128" x2="237" y2="134" stroke="#3a445c" stroke-width="3"/></g>
</svg>`,
    regions: [
      { id: "window", label: "window", box: [0.52, 0.06, 0.34, 0.26] },
      { id: "door", label: "door", box: [0.4, 0.4, 0.16, 0.6] },
      { id: "cat", label: "cat", box: [0.14, 0.68, 0.18, 0.2] },
      { id: "sofa", label: "sofa", box: [0.08, 0.68, 0.36, 0.28] },
      { id: "lamp", label: "lamp", box: [0.76, 0.37, 0.16, 0.42] },
      { id: "tv", label: "tv", box: [0.62, 0.42, 0.24, 0.22] },
    ],
  },
  {
    key: "kitchen",
    name: "Kitchen",
    svg: `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VB.w} ${VB.h}">
  <rect width="${VB.w}" height="${VB.h}" fill="#151a26"/>
  <rect width="${VB.w}" height="140" fill="#20263a"/>
  <rect y="140" width="${VB.w}" height="60" fill="#141a26"/>
  <rect x="0" y="128" width="${VB.w}" height="8" fill="#2a3147"/>
  <g id="fridge"><rect x="250" y="20" width="58" height="104" rx="6" fill="#dde3ec"/><line x1="250" y1="70" x2="308" y2="70" stroke="#c2cad8" stroke-width="3"/><rect x="258" y="80" width="42" height="34" rx="4" fill="#eef2f7"/><circle cx="270" cy="30" r="4" fill="#9aa1b5"/></g>
  <g id="clock"><rect x="256" y="136" width="52" height="44" rx="6" fill="#e8edf4"/><circle cx="282" cy="158" r="15" fill="#151a26"/><line x1="282" y1="158" x2="282" y2="148" stroke="#f4f5fa" stroke-width="2.5"/><line x1="282" y1="158" x2="289" y2="162" stroke="#f4f5fa" stroke-width="2.5"/></g>
  <g id="kettle"><path d="M32 124 q-8 -56 40 -60 q52 -4 56 60 z" fill="#c9cfdd"/><path d="M48 84 q-26 -4 -26 -24" stroke="#c9cfdd" stroke-width="8" fill="none" stroke-linecap="round"/><circle cx="22" cy="60" r="7" fill="#c9cfdd"/><rect x="60" y="70" width="14" height="14" rx="4" fill="#e8c27a"/></g>
  <g id="sink"><rect x="128" y="104" width="64" height="44" rx="8" fill="#8b94a8"/><rect x="134" y="110" width="52" height="28" rx="6" fill="#1f2637"/><rect x="150" y="108" width="20" height="6" rx="3" fill="#c2cad8"/></g>
  <g id="mug"><rect x="109" y="116" width="39" height="40" rx="5" fill="#e76f51"/><path d="M148 124 q18 2 18 22 q0 20 -18 20" stroke="#e76f51" stroke-width="8" fill="none"/></g>
  <g id="plant"><rect x="186" y="132" width="46" height="8" rx="4" fill="#8b5a2b"/><path d="M209 132 q0 -30 -18 -34 q-8 8 -4 22 q-16 2 -12 16 q6 6 16 2 q2 14 18 6 q0 -10 -4 -12 z" fill="#4f9e5a"/><rect x="204" y="128" width="10" height="6" fill="#8b5a2b"/></g>
</svg>`,
    regions: [
      { id: "fridge", label: "fridge", box: [0.78, 0.1, 0.18, 0.52] },
      { id: "clock", label: "clock", box: [0.8, 0.68, 0.16, 0.22] },
      { id: "kettle", label: "kettle", box: [0.1, 0.3, 0.22, 0.32] },
      { id: "sink", label: "sink", box: [0.4, 0.52, 0.2, 0.22] },
      { id: "mug", label: "mug", box: [0.34, 0.58, 0.12, 0.2] },
      { id: "plant", label: "plant", box: [0.54, 0.5, 0.18, 0.34] },
    ],
  },
  {
    key: "garden",
    name: "Garden",
    svg: `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VB.w} ${VB.h}">
  <rect width="${VB.w}" height="150" fill="#8ec7e0"/>
  <rect y="150" width="${VB.w}" height="50" fill="#3e7a3e"/>
  <g id="tree"><rect x="66" y="66" width="12" height="40" fill="#6b4a2f"/><circle cx="72" cy="46" r="30" fill="#2f7d3f"/><circle cx="58" cy="60" r="18" fill="#3a8f4a"/><circle cx="86" cy="58" r="16" fill="#35863f"/></g>
  <g id="bird"><path d="M166 40 q14 -16 28 0 q-14 -4 -28 0 z" fill="#f4f5fa"/><circle cx="182" cy="40" r="2" fill="#1a2130"/><path d="M150 48 q16 10 32 0" stroke="#e8c27a" stroke-width="3" fill="none"/></g>
  <g id="gate"><rect x="192" y="84" width="12" height="70" fill="#6b4a2f"/><rect x="260" y="84" width="12" height="70" fill="#6b4a2f"/><rect x="198" y="88" width="68" height="38" fill="#8b5a2b"/><rect x="198" y="130" width="68" height="24" fill="#8b5a2b"/><rect x="202" y="92" width="14" height="30" fill="#a9713a"/><rect x="248" y="92" width="14" height="30" fill="#a9713a"/></g>
  <g id="dog"><rect x="102" y="150" width="72" height="30" rx="14" fill="#c9a06a"/><rect x="88" y="156" width="28" height="24" rx="10" fill="#b98c54"/><circle cx="94" cy="152" r="8" fill="#c9a06a"/><path d="M88 148 l-6 -10 l10 4 z" fill="#c9a06a"/><path d="M100 148 l6 -10 l-10 4 z" fill="#c9a06a"/><circle cx="90" cy="150" r="1.6" fill="#1a2130"/></g>
  <g id="bench"><rect x="26" y="152" width="110" height="10" rx="4" fill="#8b5a2b"/><rect x="36" y="162" width="8" height="22" fill="#6b4a2f"/><rect x="112" y="162" width="8" height="22" fill="#6b4a2f"/><rect x="26" y="144" width="110" height="10" rx="4" fill="#a9713a"/></g>
  <g id="flower"><line x1="283" y1="160" x2="283" y2="140" stroke="#2f7d3f" stroke-width="3"/><circle cx="283" cy="136" r="8" fill="#e76f51"/><circle cx="283" cy="136" r="3.5" fill="#f0c060"/><ellipse cx="270" cy="172" rx="7" ry="4" fill="#3e7a3e"/></g>
</svg>`,
    regions: [
      { id: "tree", label: "tree", box: [0.18, 0.18, 0.22, 0.26] },
      { id: "bird", label: "bird", box: [0.46, 0.18, 0.16, 0.14] },
      { id: "gate", label: "gate", box: [0.6, 0.42, 0.28, 0.42] },
      { id: "dog", label: "dog", box: [0.32, 0.66, 0.22, 0.24] },
      { id: "bench", label: "bench", box: [0.08, 0.72, 0.34, 0.22] },
      { id: "flower", label: "flower", box: [0.84, 0.68, 0.12, 0.24] },
    ],
  },
];

const sceneByKey = new Map(scenes.map((s) => [s.key, s]));
const regionLookup = new Map<string, ImageRegion>();
for (const scene of scenes) {
  for (const region of scene.regions) {
    regionLookup.set(`${scene.key}:${region.id}`, region);
  }
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Safe scene data for onboarding. Labels stay server-side so they cannot reveal answers. */
export function getImageSetupPool(): ImageSetupScene[] {
  return scenes.map((scene) => ({
    key: scene.key,
    name: scene.name,
    svg: scene.svg,
    regions: scene.regions.map(({ id, box }) => ({ id, box })),
  }));
}

export function isValidImageSetupSequence(sequence: { imageKey: string; regionId: string }[]): boolean {
  return (
    sequence.length >= 2 &&
    sequence.length <= 4 &&
    new Set(sequence.map((item) => `${item.imageKey}:${item.regionId}`)).size === sequence.length &&
    sequence.every((item) => regionLookup.has(`${item.imageKey}:${item.regionId}`)) &&
    new Set(sequence.map((item) => item.imageKey)).size === 1
  );
}

// ---------------------------------------------------------------------------
// Challenge lifecycle
// ---------------------------------------------------------------------------

export async function createImageChallenge(userId: string | null): Promise<ImageChallengePayload> {
  let scene = pick(scenes);
  let targets = shuffle(scene.regions).slice(0, 3);

  // Once an account owner has chosen an image sequence during onboarding, use
  // that personal sequence for later image-factor challenges.
  if (userId) {
    const setup = await prisma.imageChallengeSetup.findFirst({
      where: { userId, verified: true, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    if (setup) {
      try {
        const saved = JSON.parse(setup.sequence) as { imageKey: string; regionId: string }[];
        if (isValidImageSetupSequence(saved)) {
          const savedScene = sceneByKey.get(saved[0].imageKey);
          if (savedScene) {
            scene = savedScene;
            targets = saved
              .map((item) => regionLookup.get(`${item.imageKey}:${item.regionId}`))
              .filter((region): region is ImageRegion => region != null);
          }
        }
      } catch {
        // A malformed historic audit row must never prevent a user from signing in.
      }
    }
  }

  const token = `img_${randomBytes(16).toString("base64url")}`;
  const payload: StoredChallenge = {
    userId,
    sequence: targets.map((t) => ({ imageKey: scene.key, regionId: t.id })),
    attempts: 0,
  };

  await getRedis().set(`image-challenge:${token}`, JSON.stringify(payload), "EX", TTL_SECONDS);

  try {
    await prisma.imageChallengeSetup.create({
      data: {
        userId,
        sequence: JSON.stringify(payload.sequence),
        expiresAt: new Date(Date.now() + TTL_SECONDS * 1000),
      },
    });
  } catch (err) {
    logger.warn("image-challenge audit row failed", err instanceof Error ? err.message : String(err));
  }

  const expiresAt = Date.now() + TTL_SECONDS * 1000;
  const result: ImageChallengePayload = {
    challengeToken: token,
    prompt: targets.map((t) => t.label),
    image: { key: scene.key, name: scene.name, svg: scene.svg },
    expiresAt,
  };

  if (!isProduction) {
    result.devRegions = targets.map((t) => ({ regionId: t.id, box: t.box }));
  }

  return result;
}

function clickInBox(click: ChallengeClick, box: RegionBox): boolean {
  const [x, y, w, h] = box;
  const pad = TOLERANCE;
  return click.x >= x - pad && click.x <= x + w + pad && click.y >= y - pad && click.y <= y + h + pad;
}

/**
 * Verify a click sequence against the stored challenge. Single-use: a correct
 * answer consumes the token; three failed attempts also burn it.
 */
export async function verifyImageChallenge(
  challengeToken: string,
  clicks: ChallengeClick[],
): Promise<{ ok: boolean; attemptsLeft: number }> {
  const redis = getRedis();
  const key = `image-challenge:${challengeToken}`;
  const raw = await redis.get(key);
  if (!raw) throw new AppError(410, "Challenge expired or already used. Request a new one.");

  const stored = JSON.parse(raw) as StoredChallenge;

  const expected = stored.sequence.map((s) => {
    const region = regionLookup.get(`${s.imageKey}:${s.regionId}`);
    return region ? region.box : null;
  });

  const ok =
    expected.every((box) => box !== null) &&
    clicks.length === expected.length &&
    expected.every((box, i) => box !== null && clickInBox(clicks[i], box));

  await prisma.imageChallengeSetup.updateMany({
    where: { sequence: JSON.stringify(stored.sequence), userId: stored.userId, verified: false },
    data: { attempts: { increment: 1 }, verified: ok },
  });

  if (ok) {
    await redis.del(key);
    logger.info("image-challenge passed", challengeToken);
    return { ok: true, attemptsLeft: MAX_ATTEMPTS };
  }

  const attempts = stored.attempts + 1;
  if (attempts >= MAX_ATTEMPTS) {
    await redis.del(key);
    logger.warn("image-challenge exhausted (3 failed attempts)", challengeToken);
    return { ok: false, attemptsLeft: 0 };
  }

  await redis.set(key, JSON.stringify({ ...stored, attempts }), "EX", TTL_SECONDS);
  return { ok: false, attemptsLeft: MAX_ATTEMPTS - attempts };
}

export const imageChallengeConstants = { TTL_SECONDS, MAX_ATTEMPTS, sceneCount: scenes.length };
