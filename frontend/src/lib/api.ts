/**
 * NovaBank API layer — the ONLY place network access lives.
 * Talks to the Express backend on VITE_API_BASE_URL (default "/api"),
 * attaches the access token, auto-refreshes once on 401, and maps backend
 * responses into the UI's domain shapes.
 */

import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/types";

import { getStoredSession, saveSession, clearSession } from "./session";

export const BASE_URL = import.meta.env["VITE_API_BASE_URL"] ?? "/api";

/* ── Shared domain types (kept source-compatible with the previous layer) ─ */

export type RiskLevel = "low" | "medium" | "high";
export type RiskAction = "allow" | "step_up" | "block";

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  phoneMasked: string;
  avatarUrl: string | null;
  memberSince: string;
  hasPassword: boolean;
}

export interface AccountSummary {
  accountId: string;
  nickname: string;
  maskedNumber: string;
  balanceMinor: number;
  currency: "INR";
  availableMinor: number;
  monthChangeMinor: number;
}

export interface Transaction {
  id: string;
  merchant: string;
  category:
    | "salary"
    | "transfer"
    | "food"
    | "transport"
    | "shopping"
    | "utilities"
    | "subscription"
    | "refund";
  date: string;
  amountMinor: number;
  status: "settled" | "pending" | "declined";
  method: string;
}

export interface ActivityEvent {
  id: string;
  type: "login" | "transfer" | "alert" | "passkey";
  timestamp: string;
  device: string;
  city: string;
  country: string;
  ipMasked: string;
  risk: RiskLevel;
  signal: string;
  sessionActive: boolean;
  /** Present on login events whose session can still be revoked. */
  sessionId?: string;
}

export interface Passkey {
  id: string;
  deviceName: string;
  platform: string;
  addedAt: string;
  lastUsedAt: string;
  synced: boolean;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  name: string;
  email: string;
}

export interface LoginResult {
  stepUpRequired: boolean;
  method?: "otp_email" | "passkey" | "password";
  riskScore: number;
  riskLevel: RiskLevel;
  riskAction: RiskAction;
  reason: string;
  session?: Session;
  devOtp?: string;
  options?: PublicKeyCredentialRequestOptionsJSON;
}

export interface TransferResult {
  status: "completed" | "pending_step_up";
  requiresStepUp: boolean;
  intentId: string;
  reference: string;
  hasPassword?: boolean;
  devOtp?: string;
}

export const STEP_UP_THRESHOLD_MINOR = 5_000_000; // ₹50,000 → step-up OTP

export function formatINR(minor: number, opts?: { signed?: boolean }) {
  const value = Math.abs(minor) / 100;
  const formatted = value.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  });
  if (!opts?.signed) return formatted;
  return `${minor < 0 ? "−" : "+"}${formatted}`;
}

const notificationPrefs = [
  {
    id: "new_device",
    label: "Email me when a new device signs in",
    hint: "Sent within seconds of the session starting",
    enabled: true,
  },
  {
    id: "large_transfer",
    label: "Email me for transfers above ₹50,000",
    hint: "Receipt plus the device that approved it",
    enabled: true,
  },
  {
    id: "blocked",
    label: "Email me when we block a sign-in",
    hint: "Includes the signal that triggered the block",
    enabled: true,
  },
  {
    id: "product",
    label: "Product updates from NovaBank",
    hint: "Roughly once a month. No marketing blasts.",
    enabled: false,
  },
];

/* ── Request plumbing with token refresh ───────────────────────────────── */

async function rawFetch(path: string, init: RequestInit = {}) {
  const session = getStoredSession();
  const headers = new Headers(init.headers);
  if (init.body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (session?.accessToken) headers.set("Authorization", `Bearer ${session.accessToken}`);
  return fetch(`${BASE_URL}${path}`, { ...init, headers });
}

async function apiFetch<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  let res = await rawFetch(path, init);

  if (res.status === 401 && retry) {
    const session = getStoredSession();
    if (session?.refreshToken) {
      try {
        const data = (await fetch(`${BASE_URL}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: session.refreshToken }),
        }).then((r) => r.json())) as { accessToken?: string; refreshToken?: string };
        if (data.accessToken) {
          saveSession({
            ...session,
            accessToken: data.accessToken,
            refreshToken: data.refreshToken ?? session.refreshToken,
          });
          res = await rawFetch(path, init);
        }
      } catch {
        /* refresh failed — fall through to the 401 handling below */
      }
      if (res.status === 401) clearSession();
    } else {
      clearSession();
    }
  }

  if (res.status === 204) return undefined as T;

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    const message =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : `Request failed (${res.status})`;
    throw new Error(message);
  }
  return body as T;
}

function authHeaders(): Record<string, string> {
  const session = getStoredSession();
  return session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {};
}

/* ── Auth ──────────────────────────────────────────────────────────────── */

export async function postRegisterOptions(input: {
  name: string;
  email: string;
}): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const res = await apiFetch<{ options: PublicKeyCredentialCreationOptionsJSON }>(
    "/auth/register/options",
    {
      method: "POST",
      body: JSON.stringify({ name: input.name, email: input.email }),
    },
  );
  return res.options;
}

export async function postRegisterVerify(input: {
  name: string;
  email: string;
  credential: RegistrationResponseJSON;
}) {
  const res = await apiFetch<{
    user: { id: string; email: string; name: string };
    accessToken: string;
    refreshToken: string;
    recoveryCodes: string[];
  }>("/auth/register/verify", {
    method: "POST",
    body: JSON.stringify({ name: input.name, email: input.email, credential: input.credential }),
  });
  saveSession({
    accessToken: res.accessToken,
    refreshToken: res.refreshToken,
    name: res.user.name,
    email: res.user.email,
  });
  return { user: res.user, recoveryCodes: res.recoveryCodes };
}

export async function postLoginOptions(input: { email: string }) {
  const res = await apiFetch<{
    options: PublicKeyCredentialRequestOptionsJSON;
    email: string;
    hasPassword: boolean;
  }>("/auth/login/options", {
    method: "POST",
    body: JSON.stringify({ email: input.email }),
  });
  return { options: res.options, email: res.email, hasPassword: res.hasPassword };
}

export async function postLoginVerify(input: {
  email: string;
  credential: AuthenticationResponseJSON;
  keystrokes: { prev: number; curr: number; delta: number }[];
  deviceFingerprint: string;
  deviceInfo: string;
}): Promise<LoginResult> {
  const res = await apiFetch<{
    stepUpRequired: boolean;
    method?: "otp_email" | "passkey";
    riskScore: number;
    riskAction: string;
    reason?: string;
    devOtp?: string;
    options?: PublicKeyCredentialRequestOptionsJSON;
    accessToken?: string;
    refreshToken?: string;
    user?: { name: string; email: string };
  }>("/auth/login/verify", {
    method: "POST",
    body: JSON.stringify(input),
  });

  const riskLevel: RiskLevel = res.riskScore > 60 ? "high" : res.riskScore > 30 ? "medium" : "low";
  const riskAction: RiskAction =
    res.riskAction === "block" ? "block" : res.riskAction === "allow" ? "allow" : "step_up";
  const reason = res.reason ?? defaultReason(res.riskScore, res.riskAction);

  if (res.stepUpRequired) {
    return {
      stepUpRequired: true,
      ...(res.method ? { method: res.method } : {}),
      riskScore: res.riskScore,
      riskLevel,
      riskAction,
      reason,
      ...(res.devOtp ? { devOtp: res.devOtp } : {}),
      ...(res.options ? { options: res.options } : {}),
    };
  }

  if (res.accessToken && res.refreshToken && res.user) {
    saveSession({
      accessToken: res.accessToken,
      refreshToken: res.refreshToken,
      name: res.user.name,
      email: res.user.email,
    });
    return {
      stepUpRequired: false,
      riskScore: res.riskScore,
      riskLevel,
      riskAction,
      reason,
      session: {
        accessToken: res.accessToken,
        refreshToken: res.refreshToken,
        name: res.user.name,
        email: res.user.email,
      },
    };
  }

  return { stepUpRequired: false, riskScore: res.riskScore, riskLevel, riskAction, reason };
}

function defaultReason(score: number, action: string): string {
  if (action === "block")
    return "Our risk engine stopped this sign-in. If this was you, contact support.";
  if (action === "step_up_email")
    return `Unusual sign-in detected (score ${score}). We emailed you a one-time code.`;
  if (action === "step_up_passkey")
    return `Unusual sign-in detected (score ${score}). Confirm once more with your passkey.`;
  return "Known device, usual location, typical hour.";
}

export async function postPasswordLogin(input: {
  email: string;
  password: string;
  keystrokes: { prev: number; curr: number; delta: number }[];
  deviceFingerprint: string;
  deviceInfo: string;
}): Promise<LoginResult> {
  const res = await apiFetch<{
    stepUpRequired: boolean;
    method?: "otp_email" | "passkey";
    riskScore: number;
    riskAction: string;
    reason?: string;
    devOtp?: string;
    options?: PublicKeyCredentialRequestOptionsJSON;
    accessToken?: string;
    refreshToken?: string;
    user?: { name: string; email: string };
  }>("/auth/password/login", {
    method: "POST",
    body: JSON.stringify(input),
  });

  const riskLevel: RiskLevel = res.riskScore > 60 ? "high" : res.riskScore > 30 ? "medium" : "low";
  const riskAction: RiskAction =
    res.riskAction === "block" ? "block" : res.riskAction === "allow" ? "allow" : "step_up";
  const reason = res.reason ?? defaultReason(res.riskScore, res.riskAction);

  if (res.stepUpRequired) {
    return {
      stepUpRequired: true,
      ...(res.method ? { method: res.method } : {}),
      riskScore: res.riskScore,
      riskLevel,
      riskAction,
      reason,
      ...(res.devOtp ? { devOtp: res.devOtp } : {}),
      ...(res.options ? { options: res.options } : {}),
    };
  }

  if (res.accessToken && res.refreshToken && res.user) {
    saveSession({
      accessToken: res.accessToken,
      refreshToken: res.refreshToken,
      name: res.user.name,
      email: res.user.email,
    });
    return {
      stepUpRequired: false,
      riskScore: res.riskScore,
      riskLevel,
      riskAction,
      reason,
      session: {
        accessToken: res.accessToken,
        refreshToken: res.refreshToken,
        name: res.user.name,
        email: res.user.email,
      },
    };
  }

  return { stepUpRequired: false, riskScore: res.riskScore, riskLevel, riskAction, reason };
}

export async function postSetPassword(input: { password: string; currentPassword?: string }) {
  return apiFetch<{ ok: boolean; hasPassword: boolean }>("/auth/password/set", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
}

export async function postRemovePassword(input: { password: string }) {
  return apiFetch<{ ok: boolean; hasPassword: boolean }>("/auth/password/remove", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
}

export async function postStepUpVerify(input: {
  method: "otp_email" | "passkey" | "recovery_code" | "password";
  email: string;
  otp?: string;
  code?: string;
  password?: string;
  credential?: AuthenticationResponseJSON;
  keystrokes: { prev: number; curr: number; delta: number }[];
  deviceFingerprint: string;
  deviceInfo: string;
}) {
  const res = await apiFetch<{
    verified: boolean;
    accessToken: string;
    refreshToken: string;
    user: { name: string; email: string };
  }>("/auth/step-up/verify", {
    method: "POST",
    body: JSON.stringify(input),
  });
  saveSession({
    accessToken: res.accessToken,
    refreshToken: res.refreshToken,
    name: res.user.name,
    email: res.user.email,
  });
  return { verified: res.verified, session: res };
}

/* ── QR cross-device login ─────────────────────────────────────────────── */

export async function postQrCreate() {
  const res = await apiFetch<{ token: string; expiresAt: string; qrImage: string }>(
    "/auth/login/qr/create",
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
  return { token: res.token, expiresAt: res.expiresAt, qrImage: res.qrImage };
}

export async function getQrStatus(token: string) {
  return apiFetch<{
    status: "pending" | "approved" | "denied" | "expired";
    expiresAt: string;
    grantToken: string | null;
    deviceInfo: string | null;
    location: string | null;
  }>(`/auth/login/qr/status/${encodeURIComponent(token)}`);
}

export async function postQrApprove(input: {
  token: string;
  decision: "approve" | "deny";
  deviceInfo: string;
}) {
  return apiFetch<{ status: string }>("/auth/login/qr/approve", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function postQrExchange(input: {
  grantToken: string;
  deviceFingerprint: string;
  deviceInfo: string;
  keystrokes: { prev: number; curr: number; delta: number }[];
}) {
  const res = await apiFetch<{
    accessToken: string;
    refreshToken: string;
    user: { name: string; email: string };
  }>("/auth/login/qr/exchange", {
    method: "POST",
    body: JSON.stringify(input),
  });
  saveSession({
    accessToken: res.accessToken,
    refreshToken: res.refreshToken,
    name: res.user.name,
    email: res.user.email,
  });
  return res;
}

/* ── Account ───────────────────────────────────────────────────────────── */

export async function getAccountSummary(): Promise<AccountSummary> {
  const res = await apiFetch<{
    balance: string;
    currency: string;
    stats: { totalTransactions: number; totalSpent: string };
  }>("/account/summary", { headers: authHeaders() });

  return {
    accountId: "acc_4471",
    nickname: "Everyday",
    maskedNumber: "•••• 4471",
    balanceMinor: Math.round(Number(res.balance) * 100),
    currency: "INR",
    availableMinor: Math.round(Number(res.balance) * 100),
    monthChangeMinor: 0,
  };
}

export async function getTransactions(): Promise<{
  items: Transaction[];
  nextCursor: string | null;
}> {
  const res = await apiFetch<{
    transactions: {
      id: string;
      recipient: string;
      amount: string;
      note: string | null;
      status: string;
      createdAt: string;
    }[];
    total: number;
  }>("/account/transactions", { headers: authHeaders() });

  return {
    items: res.transactions.map((t) => ({
      id: t.id,
      merchant: t.recipient,
      category: "transfer" as const,
      date: t.createdAt,
      amountMinor: -Math.round(Number(t.amount) * 100),
      status: t.status === "pending" ? "pending" : "settled",
      method: "UPI · passkey verified",
    })),
    nextCursor: null,
  };
}

export async function postTransfer(input: {
  recipient: string;
  amountMinor: number;
  note?: string;
}): Promise<TransferResult> {
  const res = await apiFetch<{
    executed: boolean;
    stepUpRequired?: boolean;
    transferToken?: string;
    devOtp?: string;
    hasPassword?: boolean;
    transaction?: { id: string };
  }>("/account/transfer", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      recipient: input.recipient,
      amount: Math.round(input.amountMinor) / 100,
      note: input.note,
    }),
  });

  if (res.executed) {
    return {
      status: "completed",
      requiresStepUp: false,
      intentId: res.transaction?.id ?? "",
      reference: `NB${Math.floor(Math.random() * 9e7 + 1e7)}`,
    };
  }

  return {
    status: "pending_step_up",
    requiresStepUp: true,
    intentId: res.transferToken ?? "",
    reference: `NB${Math.floor(Math.random() * 9e7 + 1e7)}`,
    ...(res.devOtp ? { devOtp: res.devOtp } : {}),
    ...(typeof res.hasPassword === "boolean" ? { hasPassword: res.hasPassword } : {}),
  };
}

export async function postTransferConfirm(input: {
  transferToken: string;
  otp?: string;
  password?: string;
  method?: "otp_email" | "password";
}) {
  const res = await apiFetch<{
    executed: boolean;
    transaction: {
      id: string;
      recipient: string;
      amount: string;
      status: string;
      createdAt: string;
    };
  }>("/account/transfer/confirm", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
  return { executed: res.executed, transaction: res.transaction };
}

/* ── Security ──────────────────────────────────────────────────────────── */

export async function getActivity(): Promise<ActivityEvent[]> {
  const res = await apiFetch<{
    events: {
      id: string;
      type: string;
      title: string;
      detail: string;
      device: string;
      location: string | null;
      riskScore: number;
      riskAction: string;
      timestamp: string;
    }[];
    total: number;
  }>("/security/activity", { headers: authHeaders() });

  return res.events.map((e) => {
    let detail = e.detail;
    let sessionId: string | undefined;
    try {
      const parsed = JSON.parse(e.detail);
      if (parsed && typeof parsed === "object") {
        detail = parsed.signal ?? parsed.sessionId ?? "";
        sessionId = parsed.sessionId ?? undefined;
      }
    } catch {
      /* detail is a plain string */
    }

    const [city = "Unknown", country = "Unknown"] = (e.location ?? "Unknown, Unknown").split(", ");
    const isLogin = e.type === "login";
    return {
      id: e.id,
      type: (e.type === "transaction" ? "transfer" : e.type) as ActivityEvent["type"],
      timestamp: e.timestamp,
      device: e.device,
      city,
      country,
      ipMasked: maskIp(),
      risk: e.riskScore > 60 ? "high" : e.riskScore > 30 ? "medium" : "low",
      signal: detail || e.title,
      sessionActive: isLogin && e.riskAction === "allow",
      ...(sessionId ? { sessionId } : {}),
    };
  });
}

function maskIp(): string {
  return "•".repeat(8);
}

export async function postRevokeSession(sessionId: string) {
  return apiFetch<{ revoked: boolean; id: string }>(`/security/sessions/${sessionId}/revoke`, {
    method: "POST",
    headers: authHeaders(),
  });
}

export async function postRevokeAllSessions() {
  return apiFetch<{ revoked: number }>("/security/sessions/revoke-all", {
    method: "POST",
    headers: authHeaders(),
  });
}

export async function getPasskeys(): Promise<Passkey[]> {
  const res = await apiFetch<{
    passkeys: {
      id: string;
      credentialId: string;
      nickname: string;
      deviceType: string;
      backedUp: boolean;
      createdAt: string;
      lastUsedAt: string;
    }[];
  }>("/security/passkeys", { headers: authHeaders() });

  return res.passkeys.map((p) => ({
    id: p.id,
    deviceName: p.nickname,
    platform: p.deviceType === "platform" ? "This device" : "Hardware key",
    addedAt: p.createdAt,
    lastUsedAt: p.lastUsedAt,
    synced: p.backedUp,
  }));
}

export async function postPasskey(): Promise<Passkey> {
  const { startRegistration } = await import("@simplewebauthn/browser");
  const optsRes = await apiFetch<{ options: PublicKeyCredentialCreationOptionsJSON }>(
    "/security/passkeys/register/options",
    { method: "POST", headers: authHeaders() },
  );
  const credential = await startRegistration({ optionsJSON: optsRes.options });
  await apiFetch<{ ok: boolean }>("/security/passkeys/register/verify", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ credential }),
  });
  const list = await getPasskeys();
  const created = list.find((p) => p.id !== list[0]?.id) ?? list[0];
  if (!created) throw new Error("Passkey was created but could not be found.");
  return created;
}

export async function deletePasskey(id: string) {
  return apiFetch<{ ok: boolean }>(`/security/passkeys/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
}

export async function getRecoveryCodes() {
  const res = await apiFetch<{
    total: number;
    remaining: number;
    used: number;
    lastGeneratedAt: string | null;
  }>("/security/recovery-codes", { headers: authHeaders() });

  return {
    remaining: res.remaining,
    total: res.total,
    lastGeneratedAt: res.lastGeneratedAt ?? "",
    codes: [] as string[], // plaintext codes are only shown right after generation
  };
}

export async function postRegenerateRecoveryCodes() {
  const res = await apiFetch<{ recoveryCodes: string[] }>("/security/recovery-codes/rotate", {
    method: "POST",
    headers: authHeaders(),
  });
  return {
    remaining: res.recoveryCodes.length,
    total: res.recoveryCodes.length,
    codes: res.recoveryCodes,
  };
}

export async function getNotificationPrefs() {
  return notificationPrefs;
}

export async function getDevices() {
  const res = await apiFetch<{
    devices: {
      id: string;
      deviceInfo: string;
      ipAddress: string;
      location: string | null;
      lastSeen: string;
      createdAt: string;
    }[];
  }>("/security/devices", { headers: authHeaders() });
  return res.devices;
}

export async function revokeDevice(id: string) {
  return apiFetch<{ ok: boolean }>(`/security/devices/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
}

/* ── User ──────────────────────────────────────────────────────────────── */

export async function getProfile(): Promise<UserProfile> {
  const res = await apiFetch<{
    user: {
      id: string;
      email: string;
      name: string;
      balance: string;
      createdAt: string;
      hasPassword: boolean;
    };
  }>("/user/profile", { headers: authHeaders() });

  return {
    id: res.user.id,
    name: res.user.name,
    email: res.user.email,
    phoneMasked: "+91 ••••• ••••",
    avatarUrl: null,
    memberSince: res.user.createdAt,
    hasPassword: res.user.hasPassword,
  };
}

export async function patchProfile(input: Partial<UserProfile>): Promise<UserProfile> {
  const res = await apiFetch<{
    user: { id: string; email: string; name: string };
  }>("/user/profile", {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ name: input.name }),
  });
  const current = getStoredSession();
  if (current?.email === res.user.email) {
    saveSession({ ...current, name: res.user.name });
  }
  return { ...(await getProfile()) };
}

/* ── Session helpers for the UI ────────────────────────────────────────── */

export async function postLogout() {
  const session = getStoredSession();
  if (session?.refreshToken) {
    try {
      await fetch(`${BASE_URL}/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      });
    } catch {
      /* best effort */
    }
  }
  clearSession();
}

export type { AuthenticationResponseJSON, RegistrationResponseJSON };
