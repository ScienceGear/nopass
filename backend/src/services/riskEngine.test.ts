import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { amountRisk, evaluateRisk, isUsualHour, type RiskInput } from "./riskEngine.js";

function base(): RiskInput {
  return {
    isNewDevice: false,
    isNewIp: false,
    countryChanged: false,
    keystrokeAnomaly: 0,
    recentLogins: 1,
    loginCountIsAnomalous: false,
    unusualHour: false,
  };
}

describe("evaluateRisk — bands", () => {
  it("allows a clean, known-device login (score ≤ 30)", () => {
    const r = evaluateRisk(base());
    assert.equal(r.action, "allow");
    assert.equal(r.score, 0);
    assert.deepEqual(r.signals, []);
  });

  it("escalates to step_up between 31 and 60", () => {
    const r = evaluateRisk({ ...base(), isNewDevice: true, unusualHour: true });
    assert.equal(r.score, 40);
    assert.equal(r.action, "step_up");
    assert.deepEqual(r.signals.map((s) => s.name), ["new_device", "unusual_hour"]);
  });

  it("escalates to image_challenge between 61 and 80", () => {
    const r = evaluateRisk({
      ...base(),
      isNewDevice: true,
      isNewIp: true,
      countryChanged: true,
    });
    assert.equal(r.score, 70);
    assert.equal(r.action, "image_challenge");
  });

  it("blocks above 80", () => {
    const r = evaluateRisk({
      ...base(),
      isNewDevice: true,
      isNewIp: true,
      countryChanged: true,
      impossibleTravel: true,
    });
    assert.equal(r.score, 110);
    assert.equal(r.action, "block");
  });
});

describe("evaluateRisk — signal semantics", () => {
  it("applies impossible_travel weight of 40", () => {
    const r = evaluateRisk({ ...base(), impossibleTravel: true });
    assert.equal(r.score, 40);
    assert.equal(r.action, "step_up");
  });

  it("adds was_pasted weight of 15", () => {
    const r = evaluateRisk({ ...base(), wasPasted: true });
    assert.equal(r.score, 15);
    assert.equal(r.action, "allow"); // weak on its own — combination is what matters
  });

  it("suppresses keystroke anomaly during cold start", () => {
    const r = evaluateRisk({ ...base(), keystrokeAnomaly: 0.95, keystrokeColdStart: true });
    assert.equal(r.score, 0);
    assert.equal(r.action, "allow");
  });

  it("flags a keystroke anomaly once the profile is populated", () => {
    const r = evaluateRisk({ ...base(), keystrokeAnomaly: 0.8 });
    assert.equal(r.score, 20);
    assert.equal(r.action, "allow");
  });

  it("treats an anomalous login velocity as a signal", () => {
    const r = evaluateRisk({ ...base(), loginCountIsAnomalous: true, recentLogins: 7 });
    assert.equal(r.score, 15);
  });

  it("uses the amount tier's risk value, not the static signal weight", () => {
    const r = evaluateRisk({ ...base(), amountRisk: amountRisk(600_000) });
    assert.equal(r.score, 61);
    assert.equal(r.action, "image_challenge");
    const signal = r.signals.find((s) => s.name === "amount");
    assert.equal(signal?.weight, 61);
  });
});

describe("amountRisk — transfer tiers", () => {
  it("returns 0 for everyday amounts", () => {
    assert.equal(amountRisk(100), 0);
    assert.equal(amountRisk(50_000), 0);
  });

  it("forces step-up tier above ₹50,000", () => {
    assert.equal(amountRisk(50_001), 31);
  });

  it("forces image-challenge tier above ₹500,000", () => {
    assert.equal(amountRisk(500_001), 61);
  });
});

describe("isUsualHour", () => {
  it("treats 09:00 as a usual hour", () => {
    assert.equal(isUsualHour(new Date("2026-08-05T09:00:00")), true);
  });
  it("treats 03:00 as an unusual hour", () => {
    assert.equal(isUsualHour(new Date("2026-08-05T03:00:00")), false);
  });
});
