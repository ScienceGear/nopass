export type RiskAction = "allow" | "step_up" | "image_challenge" | "block";

export interface RiskSignal {
  name: string;
  weight: number;
  reason: string;
}

export interface RiskAssessment {
  score: number;
  action: RiskAction;
  signals: RiskSignal[];
}

export interface RiskInput {
  /** Sign-in from a device never seen on this account. */
  isNewDevice: boolean;
  /** Sign-in from an IP not seen in the last 90 days. */
  isNewIp: boolean;
  /** Country differs from the account's history. */
  countryChanged: boolean;
  /** Behavioural score 0..1 from keystroke dynamics. */
  keystrokeAnomaly: number;
  /** True while the profile is still populating (first N logins). */
  keystrokeColdStart?: boolean;
  /** Count of logins within the velocity window. */
  recentLogins: number;
  /** More logins in the window than a human plausibly makes. */
  loginCountIsAnomalous: boolean;
  /** Login outside the account's usual hours. */
  unusualHour: boolean;
  /** Distance from the previous login exceeds travel speed (haversine). */
  impossibleTravel?: boolean;
  /** Password was pasted rather than typed (paste bypasses keystroke capture). */
  wasPasted?: boolean;
  /** Transaction-specific: weight contributed by the amount tier. */
  amountRisk?: number;
}

// Signal weights — tuned so a single strong signal triggers step-up but only
// combinations of independent signals escalate to image challenge / block.
// Bands: ≤30 allow · 31–60 step-up · 61–80 image challenge · >80 block.
const SIGNALS: { name: RiskSignal["name"]; weight: number; enabled: (i: RiskInput) => boolean; reason: (i: RiskInput) => string }[] = [
  { name: "new_device", weight: 30, enabled: (i) => i.isNewDevice, reason: () => "Sign-in from a new device" },
  { name: "new_ip", weight: 20, enabled: (i) => i.isNewIp, reason: () => "New IP address" },
  { name: "country_change", weight: 20, enabled: (i) => i.countryChanged, reason: () => "Country differs from usual" },
  { name: "impossible_travel", weight: 40, enabled: (i) => i.impossibleTravel === true, reason: () => "Previous login is too far away for the time between" },
  { name: "keystroke_anomaly", weight: 20, enabled: (i) => i.keystrokeAnomaly > 0.55 && !i.keystrokeColdStart, reason: (i) => `Typing pattern anomaly ${(i.keystrokeAnomaly * 100).toFixed(0)}%` },
  { name: "login_velocity", weight: 15, enabled: (i) => i.loginCountIsAnomalous, reason: (i) => `Unusual login velocity (${i.recentLogins} in window)` },
  { name: "unusual_hour", weight: 10, enabled: (i) => i.unusualHour, reason: () => "Login outside usual hours" },
  { name: "was_pasted", weight: 15, enabled: (i) => i.wasPasted === true, reason: () => "Password was pasted, not typed" },
  { name: "amount", weight: 0, enabled: (i) => (i.amountRisk ?? 0) > 0, reason: () => "Large transfer amount" },
];

/**
 * The single risk decision function. Both the login routes and the transaction
 * routes build a `RiskInput` and call this — one set of thresholds, one
 * decision, reused everywhere.
 */
export function evaluateRisk(input: RiskInput): RiskAssessment {
  const signals: RiskSignal[] = [];
  let score = 0;

  for (const s of SIGNALS) {
    if (s.enabled(input)) {
      const weight = s.name === "amount" ? (input.amountRisk ?? 0) : s.weight;
      score += weight;
      signals.push({ name: s.name, weight, reason: s.reason(input) });
    }
  }

  let action: RiskAction;
  if (score > 80) action = "block";
  else if (score > 60) action = "image_challenge";
  else if (score > 30) action = "step_up";
  else action = "allow";

  return { score, action, signals };
}

/** True between 06:00 and 23:00 local time. */
export const isUsualHour = (now: Date = new Date()): boolean => {
  const hour = now.getHours();
  return hour >= 6 && hour < 23;
};

/** Amount tier → risk contribution. Higher tiers force stronger verification. */
export function amountRisk(amount: number): number {
  if (amount > 500_000) return 61; // image challenge tier
  if (amount > 50_000) return 31; // step-up tier
  return 0;
}
