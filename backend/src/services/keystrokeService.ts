/**
 * Keystroke dynamics  per-key-transition dwell-times.
 *
 * Profile format: { "a-b": { mean, std, count } } where the key is the pair of
 * keys with their charCodes joined by "-" (e.g. "97-98" for "ab"). We compare
 * against this profile and fold new samples back in after a successful login.
 */

export interface TransitionStats {
  mean: number;
  std: number;
  count: number;
}

export type KeystrokeProfile = Record<string, TransitionStats>;

export interface KeystrokeSample {
  /** [charCodeOfPreviousKey, charCodeOfCurrentKey] pairs in order. */
  transitions: [number, number][];
  /** millisecond dwell time between key-up and next key-down. */
  timings: number[];
}

const MIN_SAMPLES = 3;

export function emptyProfile(): KeystrokeProfile {
  return {};
}

export function profileHasData(profile: KeystrokeProfile): boolean {
  return Object.keys(profile).length >= MIN_SAMPLES;
}

function key(prev: number, curr: number): string {
  return `${prev}-${curr}`;
}

/** Fold a keystroke sample into the profile (incremental mean/std). */
export function mergeSample(profile: KeystrokeProfile, sample: KeystrokeSample): KeystrokeProfile {
  if (sample.transitions.length !== sample.timings.length) return profile;

  for (let i = 0; i < sample.transitions.length; i++) {
    const k = key(sample.transitions[i][0], sample.transitions[i][1]);
    const t = sample.timings[i];
    if (!Number.isFinite(t) || t <= 0) continue;

    const cur = profile[k];
    if (!cur) {
      profile[k] = { mean: t, std: 0, count: 1 };
    } else {
      const count = cur.count + 1;
      const delta = t - cur.mean;
      const mean = cur.mean + delta / count;
      const std = count > 1 ? Math.sqrt(((cur.std ** 2) * (cur.count - 1) + delta * (t - mean)) / (count - 1)) : 0;
      profile[k] = { mean, std, count };
    }
  }
  return profile;
}

/** Anomaly score 0..1. 0 = perfectly typical, 1 = wildly atypical. */
export function anomalyScore(profile: KeystrokeProfile, sample: KeystrokeSample): number {
  if (sample.transitions.length === 0 || sample.transitions.length !== sample.timings.length) return 0;
  if (!profileHasData(profile)) return 0; // not enough baseline  don't punish

  let anomalous = 0;
  let scored = 0;

  for (let i = 0; i < sample.transitions.length; i++) {
    const k = key(sample.transitions[i][0], sample.transitions[i][1]);
    const t = sample.timings[i];
    if (!Number.isFinite(t) || t <= 0) continue;

    const cur = profile[k];
    if (!cur || cur.count < MIN_SAMPLES) {
      // Transition never/rarely seen before is mildly suspicious.
      scored += 1;
      if (Math.abs(t - (cur?.mean ?? 180)) > 120) anomalous += 1;
      continue;
    }
    scored += 1;
    const z = cur.std > 1 ? Math.abs(t - cur.mean) / Math.max(cur.std, 1) : 0;
    if (z > 2.5) anomalous += 1;
  }

  return scored === 0 ? 0 : anomalous / scored;
}

export function keystrokeProfileSummary(profile: KeystrokeProfile) {
  const entries = Object.entries(profile).filter(([, s]) => s.count >= MIN_SAMPLES);
  return { transitions: entries.length, sampleCount: entries.reduce((acc, [, s]) => acc + s.count, 0) };
}
