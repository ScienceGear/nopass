export type RiskAction = "allow" | "step_up_email" | "step_up_passkey" | "block";

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
  isNewDevice: boolean;
  isNewIp: boolean;
  countryChanged: boolean;
  keystrokeAnomaly: number; // 0..1
  recentLogins: number; // count within window
  loginCountIsAnomalous: boolean;
  unusualHour: boolean;
}

// Signal weights — tuned so a single strong signal triggers step-up but
// only combinations of independent signals can block.
const SIGNALS: { name: RiskSignal["name"]; weight: number; enabled: (i: RiskInput) => boolean; reason: (i: RiskInput) => string }[] = [
  { name: "new_device", weight: 30, enabled: (i) => i.isNewDevice, reason: () => "Sign-in from a new device" },
  { name: "new_ip", weight: 20, enabled: (i) => i.isNewIp, reason: () => "New IP address" },
  { name: "country_change", weight: 20, enabled: (i) => i.countryChanged, reason: () => "Country differs from usual" },
  { name: "keystroke_anomaly", weight: 20, enabled: (i) => i.keystrokeAnomaly > 0.55, reason: (i) => `Typing pattern anomaly ${(i.keystrokeAnomaly * 100).toFixed(0)}%` },
  { name: "login_velocity", weight: 15, enabled: (i) => i.loginCountIsAnomalous, reason: (i) => `Unusual login velocity (${i.recentLogins} in window)` },
  { name: "unusual_hour", weight: 10, enabled: (i) => i.unusualHour, reason: () => "Login outside usual hours" },
];

export function evaluateRisk(input: RiskInput): RiskAssessment {
  const signals: RiskSignal[] = [];
  let score = 0;

  for (const s of SIGNALS) {
    if (s.enabled(input)) {
      score += s.weight;
      signals.push({ name: s.name, weight: s.weight, reason: s.reason(input) });
    }
  }

  let action: RiskAction;
  if (score > 100) action = "block";
  else if (score > 60) action = "step_up_passkey";
  else if (score > 30) action = "step_up_email";
  else action = "allow";

  return { score, action, signals };
}

export const isUsualHour = (now: Date = new Date()): boolean => {
  const hour = now.getHours();
  return hour >= 6 && hour < 23;
};
