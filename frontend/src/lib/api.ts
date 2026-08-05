/**
 * NovaBank API layer.
 *
 * Every function here is the ONLY place network access should live. Today each
 * one short-circuits to fixtures in ./mockData with a realistic latency, and
 * carries the exact intended request/response shape in a TODO so wiring a real
 * backend is a find-and-replace job — component code never changes.
 */

import {
  mockAccount,
  mockActivity,
  mockNotificationPrefs,
  mockPasskeys,
  mockRecoveryCodes,
  mockTransactions,
  mockUser,
  STEP_UP_THRESHOLD_MINOR,
  type AccountSummary,
  type ActivityEvent,
  type Passkey,
  type RiskAction,
  type RiskLevel,
  type Transaction,
  type UserProfile,
} from "./mockData";

export const BASE_URL = import.meta.env["VITE_API_BASE_URL"] ?? "/api";

const latency = (min = 320, max = 780) =>
  new Promise<void>((r) => setTimeout(r, min + Math.random() * (max - min)));

export interface Session {
  token: string;
  userId: string;
  issuedAt: string;
  expiresAt: string;
}

export interface LoginResult {
  session: Session | null;
  riskScore: number;
  riskLevel: RiskLevel;
  riskAction: RiskAction;
  reason: string;
}

const session = (): Session => ({
  token: "mock_sess_" + Math.random().toString(36).slice(2, 10),
  userId: mockUser.id,
  issuedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 36e5).toISOString(),
});

/* ── Auth ───────────────────────────────────────────────────────────────── */

// TODO: replace mock with real fetch to `${BASE_URL}/auth/register/options`
// POST { name, email } → { challenge, rp, user, pubKeyCredParams, timeout }
export async function postRegisterOptions(input: { name: string; email: string }) {
  await latency();
  return {
    challenge: btoa("nova-reg-challenge"),
    rp: { name: "NovaBank", id: "novabank.app" },
    user: { id: "usr_pending", name: input.email, displayName: input.name },
    pubKeyCredParams: [{ type: "public-key", alg: -7 }],
    timeout: 60000,
  };
}

// TODO: replace mock with real fetch to `${BASE_URL}/auth/register/verify`
// POST { credential: PublicKeyCredential } → { session, user }
export async function postRegisterVerify(_input: { credentialId: string }) {
  await latency(700, 1200);
  return { session: session(), user: mockUser };
}

// TODO: replace mock with real fetch to `${BASE_URL}/auth/login/options`
// POST { email? } → { challenge, allowCredentials[], userVerification }
export async function postLoginOptions(_input?: { email?: string }) {
  await latency();
  return {
    challenge: btoa("nova-auth-challenge"),
    allowCredentials: mockPasskeys.map((p) => ({ id: p.id, type: "public-key" })),
    userVerification: "required" as const,
  };
}

// TODO: replace mock with real fetch to `${BASE_URL}/auth/login/verify`
// POST { assertion } → { session, riskScore, riskLevel, riskAction, reason }
export async function postLoginVerify(input?: { simulateRisk?: RiskLevel }): Promise<LoginResult> {
  await latency(650, 1100);
  const level = input?.simulateRisk ?? "low";
  if (level === "medium")
    return {
      session: null,
      riskScore: 54,
      riskLevel: "medium",
      riskAction: "step_up",
      reason: "New device on a network we've seen before.",
    };
  if (level === "high")
    return {
      session: null,
      riskScore: 92,
      riskLevel: "high",
      riskAction: "block",
      reason:
        "Sign-in came from Lagos, Nigeria 40 minutes after activity in Pune, on a device fingerprint that looks emulated.",
    };
  return {
    session: session(),
    riskScore: 8,
    riskLevel: "low",
    riskAction: "allow",
    reason: "Known device, usual location, typical hour.",
  };
}

// TODO: replace mock with real fetch to `${BASE_URL}/auth/login/otp/verify`
// POST { code, pollToken } → { session }
export async function postOtpVerify(input: { code: string }) {
  await latency(500, 900);
  if (input.code.replace(/\D/g, "").length < 6)
    throw new Error("Enter the 6-digit code we emailed you.");
  return { session: session() };
}

// TODO: replace mock with real fetch to `${BASE_URL}/auth/login/qr/create`
// POST {} → { pollToken, payloadUrl, expiresAt }
export async function postQrCreate() {
  await latency(250, 500);
  const token = "qr_" + Math.random().toString(36).slice(2, 12);
  return {
    pollToken: token,
    payloadUrl: `https://novabank.app/login/approve?t=${token}`,
    expiresAt: new Date(Date.now() + 12e4).toISOString(),
  };
}

// TODO: replace mock with real fetch to `${BASE_URL}/auth/login/qr/status/${token}`
// GET → { status: 'pending' | 'approved' | 'denied' | 'expired', session? }
export async function getQrStatus(token: string, attempt: number) {
  await latency(200, 400);
  if (attempt >= 6) return { status: "approved" as const, token, session: session() };
  return { status: "pending" as const, token, session: null };
}

// TODO: replace mock with real fetch to `${BASE_URL}/auth/login/qr/approve`
// POST { pollToken, assertion } → { status: 'approved' }
export async function postQrApprove(_input: { pollToken: string }) {
  await latency(700, 1100);
  return { status: "approved" as const };
}

// TODO: replace mock with real fetch to `${BASE_URL}/auth/step-up/verify`
// POST { intentId, assertion } → { verified: true }
export async function postStepUpVerify(_input: { intentId: string }) {
  await latency(800, 1300);
  return { verified: true as const };
}

/* ── Account ────────────────────────────────────────────────────────────── */

// TODO: replace mock with real fetch to `${BASE_URL}/account/summary`
// GET → AccountSummary
export async function getAccountSummary(): Promise<AccountSummary> {
  await latency();
  return mockAccount;
}

// TODO: replace mock with real fetch to `${BASE_URL}/account/transactions?cursor=&limit=`
// GET → { items: Transaction[], nextCursor: string | null }
export async function getTransactions(): Promise<{
  items: Transaction[];
  nextCursor: string | null;
}> {
  await latency(420, 900);
  return { items: mockTransactions, nextCursor: null };
}

// TODO: replace mock with real fetch to `${BASE_URL}/account/transfer`
// POST { recipient, amountMinor, note } → { status, requiresStepUp, intentId, reference }
export async function postTransfer(input: {
  recipient: string;
  amountMinor: number;
  note?: string;
}) {
  await latency(450, 850);
  const requiresStepUp = input.amountMinor >= STEP_UP_THRESHOLD_MINOR;
  return {
    status: requiresStepUp ? ("pending_step_up" as const) : ("completed" as const),
    requiresStepUp,
    intentId: "int_" + Math.random().toString(36).slice(2, 10),
    reference: "NB" + Math.floor(Math.random() * 9e7 + 1e7),
    completedAt: new Date().toISOString(),
  };
}

/* ── Security ───────────────────────────────────────────────────────────── */

// TODO: replace mock with real fetch to `${BASE_URL}/security/activity`
// GET → ActivityEvent[]
export async function getActivity(): Promise<ActivityEvent[]> {
  await latency(420, 900);
  return mockActivity;
}

// TODO: replace mock with real fetch to `${BASE_URL}/security/activity/${id}/revoke`
// POST → { revoked: true }
export async function postRevokeSession(id: string) {
  await latency(400, 700);
  return { revoked: true as const, id };
}

// TODO: replace mock with real fetch to `${BASE_URL}/security/sessions/revoke-all`
// POST → { revoked: number }
export async function postRevokeAllSessions() {
  await latency(600, 1000);
  return { revoked: mockActivity.filter((e) => e.sessionActive).length };
}

// TODO: replace mock with real fetch to `${BASE_URL}/security/passkeys`
// GET → Passkey[]
export async function getPasskeys(): Promise<Passkey[]> {
  await latency();
  return mockPasskeys;
}

// TODO: replace mock with real fetch to `${BASE_URL}/security/passkeys`
// POST { credential } → Passkey
export async function postPasskey(input: { deviceName: string }): Promise<Passkey> {
  await latency(800, 1200);
  return {
    id: "pk_" + Math.random().toString(36).slice(2, 8),
    deviceName: input.deviceName,
    platform: "This device",
    addedAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
    synced: true,
  };
}

// TODO: replace mock with real fetch to `${BASE_URL}/security/passkeys/${id}` (PATCH)
// PATCH { deviceName } → Passkey
export async function patchPasskey(input: { id: string; deviceName: string }) {
  await latency(300, 600);
  return input;
}

// TODO: replace mock with real fetch to `${BASE_URL}/security/passkeys/${id}` (DELETE)
// DELETE → { revoked: true }
export async function deletePasskey(id: string) {
  await latency(400, 700);
  return { revoked: true as const, id };
}

// TODO: replace mock with real fetch to `${BASE_URL}/security/recovery-codes`
// GET → { remaining, total, lastGeneratedAt, codes? }
export async function getRecoveryCodes() {
  await latency();
  return mockRecoveryCodes;
}

// TODO: replace mock with real fetch to `${BASE_URL}/security/recovery-codes/regenerate`
// POST → { remaining, codes }
export async function postRegenerateRecoveryCodes() {
  await latency(700, 1100);
  return {
    ...mockRecoveryCodes,
    lastGeneratedAt: new Date().toISOString(),
    codes: mockRecoveryCodes.codes.map(
      () =>
        Math.random().toString(36).slice(2, 6).toUpperCase() +
        "-" +
        Math.random().toString(36).slice(2, 6).toUpperCase(),
    ),
  };
}

// TODO: replace mock with real fetch to `${BASE_URL}/security/notifications`
// GET → NotificationPref[]
export async function getNotificationPrefs() {
  await latency(250, 500);
  return mockNotificationPrefs;
}

/* ── User ───────────────────────────────────────────────────────────────── */

// TODO: replace mock with real fetch to `${BASE_URL}/user/profile`
// GET → UserProfile
export async function getProfile(): Promise<UserProfile> {
  await latency();
  return mockUser;
}

// TODO: replace mock with real fetch to `${BASE_URL}/user/profile`
// PATCH { name, email, phone } → UserProfile
export async function patchProfile(input: Partial<UserProfile>): Promise<UserProfile> {
  await latency(450, 800);
  return { ...mockUser, ...input };
}

export type { AccountSummary, ActivityEvent, Passkey, Transaction, UserProfile };
