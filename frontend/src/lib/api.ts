/**
 * NovaBank API layer  the ONLY place network access lives.
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
import { getDeviceFingerprint, getDeviceInfo } from "./fingerprint";
import { parseDeviceInfo, resolveDeviceIconKind, type DeviceIconKind, type DevicePlatform } from "./device";

export const BASE_URL = import.meta.env["VITE_API_BASE_URL"] ?? "/api";

/* ── Shared domain types (kept source-compatible with the previous layer) ─ */

export type RiskLevel = "low" | "medium" | "high";
export type RiskAction = "allow" | "step_up" | "block";

/** Image-sequence step-up challenge (Phase 8). */
export interface ImageChallenge {
  challengeToken: string;
  prompt: string[];
  image: { key: string; name: string; svg: string };
  expiresAt: number;
  /** Dev-only: exact target boxes so tooling/tests can click precisely. */
  devRegions?: { regionId: string; box: [number, number, number, number] }[];
}

export interface ChallengeClick {
  x: number;
  y: number;
}

/** Thrown on non-2xx responses; carries the backend's machine-readable code. */
export class ApiError extends Error {
  code: string | undefined;
  details: unknown;
  constructor(message: string, code?: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.details = details;
  }
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  phoneMasked: string;
  phone: string | null;
  phoneVerified: boolean;
  avatarUrl: string | null;
  memberSince: string;
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
  deviceLabel: string;
  devicePlatform: DevicePlatform;
  city: string;
  country: string;
  ipAddress: string | null;
  ipMasked: string;
  deviceIcon: DeviceIconKind;
  risk: RiskLevel;
  signal: string;
  sessionActive: boolean;
  /** True when this event belongs to the current session/device. */
  isCurrent?: boolean;
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
  method?: "otp_email" | "otp_sms" | "passkey" | "image_challenge";
  riskScore: number;
  riskLevel: RiskLevel;
  riskAction: RiskAction;
  reason: string;
  session?: Session;
  devOtp?: string;
  options?: PublicKeyCredentialRequestOptionsJSON;
  challenge?: ImageChallenge;
  /** Present once a session is issued. */
  onboardingStep?: OnboardingStep;
  onboardingIncomplete?: boolean;
}

export interface TransferResult {
  status: "completed" | "pending_step_up";
  requiresStepUp: boolean;
  intentId: string;
  reference: string;
  devOtp?: string;
  method?: "otp_email" | "image_challenge";
  challenge?: ImageChallenge;
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

/* ── Request plumbing with token refresh ───────────────────────────────── */

async function rawFetch(path: string, init: RequestInit = {}) {
  const session = getStoredSession();
  const headers = new Headers(init.headers);
  if (init.body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (session?.accessToken) headers.set("Authorization", `Bearer ${session.accessToken}`);

  // Bounded request so a slow/unreachable API never leaves a button spinning
  // on "Sending…" / "Checking…" forever.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    return await fetch(`${BASE_URL}${path}`, { ...init, headers, signal: controller.signal });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new ApiError("The request took too long. Check your connection and try again.", "TIMEOUT");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Single-flight token refresh. The backend rotates the refresh token on every
 * call, so when several requests hit a 401 at once (e.g. the dashboard's four
 * parallel queries after the access token expires) they must share ONE refresh.
 * Otherwise the concurrent calls race the rotation and wipe the session.
 */
let refreshInFlight: Promise<{ accessToken: string; refreshToken: string } | null> | null = null;

async function refreshSession(): Promise<{ accessToken: string; refreshToken: string } | null> {
  const session = getStoredSession();
  if (!session?.refreshToken) return null;
  const res = await fetch(`${BASE_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: session.refreshToken }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { accessToken?: string; refreshToken?: string };
  if (!data.accessToken) return null;
  return { accessToken: data.accessToken, refreshToken: data.refreshToken ?? session.refreshToken };
}

async function apiFetch<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  let res = await rawFetch(path, init);

  if (res.status === 401 && retry) {
    const session = getStoredSession();
    if (session?.refreshToken) {
      try {
        refreshInFlight ??= refreshSession().finally(() => {
          refreshInFlight = null;
        });
        const tokens = await refreshInFlight;
        if (tokens) {
          saveSession({
            ...session,
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
          });
          res = await rawFetch(path, init);
        }
      } catch {
        /* refresh failed  fall through to the 401 handling below */
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
    let code: string | undefined;
    let details: unknown;
    if (body && typeof body === "object") {
      const maybeDetails = (body as { details?: unknown }).details;
      if (maybeDetails && typeof maybeDetails === "object") {
        const d = maybeDetails as { code?: unknown };
        if (typeof d.code === "string") code = d.code;
        details = maybeDetails;
      }
    }
    throw new ApiError(message, code, details);
  }
  return body as T;
}

function authHeaders(): Record<string, string> {
  const session = getStoredSession();
  return session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {};
}

/* ── Auth ──────────────────────────────────────────────────────────────── */

export async function postRegisterInitiate(input: { email: string; name: string; phone: string }) {
  const res = await apiFetch<{ ok: boolean; email: string }>("/auth/register/initiate", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return { ok: res.ok, email: res.email };
}

export async function postVerifyEmail(token: string) {
  const res = await apiFetch<{
    ok: boolean;
    email: string;
    user: { id: string; email: string; name: string };
    accessToken: string;
    refreshToken: string;
    onboardingStep: OnboardingStep;
  }>("/auth/register/verify-email", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
  saveSession({
    accessToken: res.accessToken,
    refreshToken: res.refreshToken,
    name: res.user.name,
    email: res.user.email,
    onboardingIncomplete: res.onboardingStep !== "complete",
  });
  return res;
}

export type OnboardingStep = "email_pending" | "passkey_set" | "complete";

/** A session plus the account's onboarding state, returned by sign-in endpoints. */
export interface OnboardingAwareSession extends Session {
  onboardingStep: OnboardingStep;
  onboardingIncomplete: boolean;
}

export interface OnboardingStatus {
  email: string;
  name: string;
  emailVerified: boolean;
  onboardingStep: OnboardingStep;
}

export async function getOnboardingStatus() {
  return apiFetch<OnboardingStatus>("/auth/onboarding/status");
}

export async function postOnboardingPasskeyOptions() {
  const res = await apiFetch<{ options: PublicKeyCredentialCreationOptionsJSON }>(
    "/auth/onboarding/passkey/options",
    { method: "POST" },
  );
  return res.options;
}

export async function postOnboardingPasskeyVerify(input: { credential: RegistrationResponseJSON }) {
  const [deviceFingerprint, deviceInfo] = await Promise.all([
    getDeviceFingerprint(),
    Promise.resolve(getDeviceInfo()),
  ]);
  return apiFetch<{ ok: boolean; recoveryCodes: string[]; onboardingStep: OnboardingStep }>(
    "/auth/onboarding/passkey/verify",
    {
      method: "POST",
      body: JSON.stringify({ ...input, deviceFingerprint, deviceInfo }),
    },
  );
}

export interface ImageSetupScene {
  key: string;
  name: string;
  svg: string;
  regions: { id: string; box: [number, number, number, number] }[];
}

export async function getOnboardingImagePool() {
  return apiFetch<{ pool: ImageSetupScene[] }>("/auth/onboarding/image-challenge/pool");
}

export async function postOnboardingImageSetup(sequence: { imageKey: string; regionId: string }[]) {
  return apiFetch<{ ok: boolean; onboardingStep: OnboardingStep }>(
    "/auth/onboarding/image-challenge/setup",
    { method: "POST", body: JSON.stringify({ sequence }) },
  );
}

export async function postRegisterStatus(email: string) {
  const res = await apiFetch<{ email: string; verified: boolean; name: string }>(
    "/auth/register/status",
    { method: "POST", body: JSON.stringify({ email }) },
  );
  return res;
}

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
  const [deviceFingerprint, deviceInfo] = await Promise.all([
    getDeviceFingerprint(),
    Promise.resolve(getDeviceInfo()),
  ]);
  const res = await apiFetch<{
    user: { id: string; email: string; name: string };
    accessToken: string;
    refreshToken: string;
    recoveryCodes: string[];
    breachCount?: number | null;
  }>("/auth/register/verify", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      email: input.email,
      credential: input.credential,
      deviceFingerprint,
      deviceInfo,
    }),
  });
  saveSession({
    accessToken: res.accessToken,
    refreshToken: res.refreshToken,
    name: res.user.name,
    email: res.user.email,
  });
  return { user: res.user, recoveryCodes: res.recoveryCodes, breachCount: res.breachCount };
}

export async function postLoginOptions(input: { email: string }) {
  const res = await apiFetch<{
    options: PublicKeyCredentialRequestOptionsJSON;
    email: string;
  }>("/auth/login/options", {
    method: "POST",
    body: JSON.stringify({ email: input.email }),
  });
  return { options: res.options, email: res.email };
}

export async function postLoginVerify(input: {
  email: string;
  credential: AuthenticationResponseJSON;
  keystrokes: { prev: number; curr: number; delta: number }[];
  deviceFingerprint: string;
  deviceInfo: string;
  pasted?: boolean;
}): Promise<LoginResult> {
  const res = await apiFetch<{
    stepUpRequired: boolean;
    method?: "otp_email" | "otp_sms" | "passkey" | "image_challenge";
    riskScore: number;
    riskAction: string;
    reason?: string;
    devOtp?: string;
    options?: PublicKeyCredentialRequestOptionsJSON;
    challenge?: ImageChallenge;
    accessToken?: string;
    refreshToken?: string;
    user?: { name: string; email: string; onboardingStep?: OnboardingStep; onboardingIncomplete?: boolean };
  }>("/auth/login/verify", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return toLoginResult(res);
}

function toLoginResult(res: {
  stepUpRequired: boolean;
  method?: "otp_email" | "otp_sms" | "passkey" | "image_challenge";
  riskScore: number;
  riskAction: string;
  reason?: string;
  devOtp?: string;
  options?: PublicKeyCredentialRequestOptionsJSON;
  challenge?: ImageChallenge;
  accessToken?: string;
  refreshToken?: string;
  user?: { name: string; email: string; onboardingStep?: OnboardingStep; onboardingIncomplete?: boolean };
}): LoginResult {
  const riskLevel: RiskLevel = res.riskScore > 60 ? "high" : res.riskScore > 30 ? "medium" : "low";
  const riskAction: RiskAction =
    res.riskAction === "block" ? "block" : res.riskAction === "allow" ? "allow" : "step_up";
  const reason = res.reason ?? defaultReason(res.riskScore, res.riskAction);
  const onboardingStep = res.user?.onboardingStep;
  const onboardingIncomplete = res.user?.onboardingIncomplete ?? false;
  const onboarding = onboardingStep ? { onboardingStep, onboardingIncomplete } : { onboardingIncomplete };

  if (res.stepUpRequired) {
    return {
      stepUpRequired: true,
      ...(res.method ? { method: res.method } : {}),
      riskScore: res.riskScore,
      riskLevel,
      riskAction,
      reason,
      ...onboarding,
      ...(res.devOtp ? { devOtp: res.devOtp } : {}),
      ...(res.options ? { options: res.options } : {}),
      ...(res.challenge ? { challenge: res.challenge } : {}),
    };
  }

  if (res.accessToken && res.refreshToken && res.user) {
    const session = {
      accessToken: res.accessToken,
      refreshToken: res.refreshToken,
      name: res.user.name,
      email: res.user.email,
      onboardingIncomplete,
    };
    saveSession(session);
    return {
      stepUpRequired: false,
      riskScore: res.riskScore,
      riskLevel,
      riskAction,
      reason,
      ...onboarding,
      session: {
        accessToken: res.accessToken,
        refreshToken: res.refreshToken,
        name: res.user.name,
        email: res.user.email,
      },
    };
  }

  return {
    stepUpRequired: false,
    riskScore: res.riskScore,
    riskLevel,
    riskAction,
    reason,
    ...onboarding,
  };
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

export async function postEmailLoginRequest(input: {
  email: string;
  keystrokes: { prev: number; curr: number; delta: number }[];
}) {
  const [deviceFingerprint, deviceInfo] = await Promise.all([
    getDeviceFingerprint(),
    Promise.resolve(getDeviceInfo()),
  ]);
  const res = await apiFetch<{ ok: boolean; email: string; devOtp?: string }>(
    "/auth/login/email-otp",
    {
      method: "POST",
      body: JSON.stringify({ ...input, deviceFingerprint, deviceInfo }),
    },
  );
  return res;
}

export async function postEmailLoginVerify(input: {
  email: string;
  otp: string;
  keystrokes: { prev: number; curr: number; delta: number }[];
}): Promise<OnboardingAwareSession> {
  const [deviceFingerprint, deviceInfo] = await Promise.all([
    getDeviceFingerprint(),
    Promise.resolve(getDeviceInfo()),
  ]);
  const res = await apiFetch<{
    verified: boolean;
    accessToken: string;
    refreshToken: string;
    user: { name: string; email: string; onboardingStep: OnboardingStep; onboardingIncomplete: boolean };
  }>("/auth/login/email-otp/verify", {
    method: "POST",
    body: JSON.stringify({ ...input, deviceFingerprint, deviceInfo }),
  });
  const onboardingIncomplete = res.user.onboardingIncomplete ?? false;
  const session = {
    accessToken: res.accessToken,
    refreshToken: res.refreshToken,
    name: res.user.name,
    email: res.user.email,
    onboardingStep: res.user.onboardingStep,
    onboardingIncomplete,
  };
  saveSession({
    ...session,
    onboardingIncomplete,
  });
  return session;
}

export async function postRecoveryLogin(input: {
  email: string;
  code: string;
  keystrokes: { prev: number; curr: number; delta: number }[];
}): Promise<OnboardingAwareSession> {
  const [deviceFingerprint, deviceInfo] = await Promise.all([
    getDeviceFingerprint(),
    Promise.resolve(getDeviceInfo()),
  ]);
  const res = await apiFetch<{
    verified: boolean;
    accessToken: string;
    refreshToken: string;
    user: { name: string; email: string; onboardingStep: OnboardingStep; onboardingIncomplete: boolean };
  }>("/auth/login/recovery-code", {
    method: "POST",
    body: JSON.stringify({ ...input, deviceFingerprint, deviceInfo }),
  });
  const onboardingIncomplete = res.user.onboardingIncomplete ?? false;
  const session = {
    accessToken: res.accessToken,
    refreshToken: res.refreshToken,
    name: res.user.name,
    email: res.user.email,
    onboardingStep: res.user.onboardingStep,
    onboardingIncomplete,
  };
  saveSession({
    ...session,
    onboardingIncomplete,
  });
  return session;
}

export async function postStepUpVerify(input: {
  method: "otp_email" | "passkey" | "recovery_code" | "image_challenge";
  email: string;
  otp?: string;
  code?: string;
  credential?: AuthenticationResponseJSON;
  challengeToken?: string;
  clicks?: ChallengeClick[];
  keystrokes: { prev: number; curr: number; delta: number }[];
  deviceFingerprint: string;
  deviceInfo: string;
  pasted?: boolean;
}) {
  const res = await apiFetch<{
    verified: boolean;
    accessToken: string;
    refreshToken: string;
    user: { name: string; email: string; onboardingStep?: OnboardingStep; onboardingIncomplete?: boolean };
  }>("/auth/step-up/verify", {
    method: "POST",
    body: JSON.stringify(input),
  });
  const onboardingIncomplete = res.user?.onboardingIncomplete ?? false;
  saveSession({
    accessToken: res.accessToken,
    refreshToken: res.refreshToken,
    name: res.user.name,
    email: res.user.email,
    onboardingIncomplete,
  });
  return {
    verified: res.verified,
    session: res,
    onboardingIncomplete,
  };
}

/* ── Phone (SMS) OTP verification ───────────────────────────────────────── */

export type PhoneOtpPurpose =
  | "signup"
  | "phone_change"
  | "verify"
  | "login_step_up"
  | "recover";

export interface PhoneOtpRequestResult {
  ok: boolean;
  phoneMasked: string;
  devOtp?: string;
  remaining?: number;
  /** Seconds until the 6-SMS/day quota resets. */
  retryAfter?: number;
}

export async function postPhoneOtpRequest(input: {
  phone: string;
  purpose: PhoneOtpPurpose;
  email?: string;
  channel?: "sms" | "voice";
}): Promise<PhoneOtpRequestResult> {
  return apiFetch<PhoneOtpRequestResult>("/auth/phone-otp/request", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function postPhoneOtpVerify(input: {
  phone: string;
  code: string;
  purpose: PhoneOtpPurpose;
  email?: string;
}): Promise<{ ok: boolean; phoneVerified: boolean }> {
  return apiFetch<{ ok: boolean; phoneVerified: boolean }>("/auth/phone-otp/verify", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** Send an SMS sign-in code to the phone number on file. */
export async function postPhoneLoginRequest(input: {
  phone: string;
  keystrokes: { prev: number; curr: number; delta: number }[];
}): Promise<PhoneOtpRequestResult> {
  const [deviceFingerprint, deviceInfo] = await Promise.all([
    getDeviceFingerprint(),
    Promise.resolve(getDeviceInfo()),
  ]);
  return apiFetch<PhoneOtpRequestResult>("/auth/login/phone-otp", {
    method: "POST",
    body: JSON.stringify({ ...input, deviceFingerprint, deviceInfo }),
  });
}

/** Exchange an SMS code for a signed-in session. */
export async function postPhoneLoginVerify(input: {
  phone: string;
  otp: string;
  keystrokes: { prev: number; curr: number; delta: number }[];
}): Promise<OnboardingAwareSession> {
  const [deviceFingerprint, deviceInfo] = await Promise.all([
    getDeviceFingerprint(),
    Promise.resolve(getDeviceInfo()),
  ]);
  const res = await apiFetch<{
    verified: boolean;
    accessToken: string;
    refreshToken: string;
    user: { name: string; email: string; onboardingStep: OnboardingStep; onboardingIncomplete: boolean };
  }>("/auth/login/phone-otp/verify", {
    method: "POST",
    body: JSON.stringify({ ...input, deviceFingerprint, deviceInfo }),
  });
  const onboardingIncomplete = res.user.onboardingIncomplete ?? false;
  const session = {
    accessToken: res.accessToken,
    refreshToken: res.refreshToken,
    name: res.user.name,
    email: res.user.email,
    onboardingStep: res.user.onboardingStep,
    onboardingIncomplete,
  };
  saveSession({ ...session, onboardingIncomplete });
  return session;
}

/* ── Image-sequence step-up (Phase 8) ──────────────────────────────────── */

export async function postImageChallengeSetup(email?: string): Promise<ImageChallenge> {
  return apiFetch<ImageChallenge>("/auth/image-challenge/setup", {
    method: "POST",
    body: JSON.stringify(email ? { email } : {}),
  });
}

export async function postImageChallengeVerify(challengeToken: string, clicks: ChallengeClick[]) {
  return apiFetch<{ ok: boolean; attemptsLeft: number }>("/auth/image-challenge/verify", {
    method: "POST",
    body: JSON.stringify({ challengeToken, clicks }),
  });
}

/* ── PCCP click-points ──────────────────────────────────────────────────── */

export interface PccpImage {
  id: string;
  url: string;
}

export type PccpDeviceClass = "desktop" | "mobile";

export interface PccpClickWithTiming {
  /** Normalized 0..1 — raw pixel coordinates are never accepted by the API. */
  x: number;
  y: number;
  /** ms since this image's reveal finished. */
  timeToClick: number;
  /** ms since the previous click (0 for the first). */
  interClick: number;
  pointerType?: "mouse" | "touch" | "stylus";
}

export interface PccpRegisterInitResult {
  token: string;
  images: PccpImage[];
  order: string[];
  repetition: number;
  repetitionsRequired: number;
}

export interface PccpRegisterConfirmResult {
  ok: boolean;
  complete?: boolean;
  repetition?: number;
  order?: string[];
  error?: string;
}

export interface PccpLoginInitResult {
  token: string;
  images: PccpImage[];
  order: string[];
  status?: "ok" | "locked";
  lockoutUntil?: string;
}

export type PccpLoginStatus = "success" | "stepup_required" | "rejected" | "locked";

export interface PccpLoginVerifyResult {
  status: PccpLoginStatus;
  accessToken?: string;
  refreshToken?: string;
  user?: {
    name: string;
    email: string;
    onboardingStep?: OnboardingStep;
    onboardingIncomplete?: boolean;
  };
  lockoutUntil?: string;
  attemptsLeft?: number;
  reason?: string;
  stepupToken?: string;
  options?: PublicKeyCredentialRequestOptionsJSON;
}

export async function postPccpRegisterInit(): Promise<PccpRegisterInitResult> {
  return apiFetch<PccpRegisterInitResult>("/auth/pccp/register/init", { method: "POST" });
}

export async function postPccpRegisterConfirm(input: {
  token: string;
  clicks: PccpClickWithTiming[];
  deviceClass: PccpDeviceClass;
}): Promise<PccpRegisterConfirmResult> {
  return apiFetch<PccpRegisterConfirmResult>("/auth/pccp/register/confirm", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function postPccpLoginInit(input: {
  email: string;
  deviceFingerprint: string;
  deviceInfo: string;
}): Promise<PccpLoginInitResult> {
  return apiFetch<PccpLoginInitResult>("/auth/pccp/login/init", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function postPccpLoginVerify(input: {
  token: string;
  clicks: PccpClickWithTiming[];
  deviceClass: PccpDeviceClass;
  deviceFingerprint: string;
  deviceInfo: string;
  keystrokes: { prev: number; curr: number; delta: number }[];
}): Promise<PccpLoginVerifyResult> {
  return apiFetch<PccpLoginVerifyResult>("/auth/pccp/login/verify", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function postPccpStepupConfirm(input: {
  token: string;
  credential: AuthenticationResponseJSON;
  deviceFingerprint: string;
  deviceInfo: string;
  keystrokes: { prev: number; curr: number; delta: number }[];
}): Promise<OnboardingAwareSession> {
  const res = await apiFetch<{
    accessToken: string;
    refreshToken: string;
    user: {
      name: string;
      email: string;
      onboardingStep: OnboardingStep;
      onboardingIncomplete: boolean;
    };
  }>("/auth/pccp/stepup/confirm", {
    method: "POST",
    body: JSON.stringify(input),
  });
  const onboardingIncomplete = res.user?.onboardingIncomplete ?? false;
  const session = {
    accessToken: res.accessToken,
    refreshToken: res.refreshToken,
    name: res.user.name,
    email: res.user.email,
    onboardingStep: res.user.onboardingStep,
    onboardingIncomplete,
  };
  saveSession({ ...session, onboardingIncomplete });
  return session;
}

/* ── QR cross-device login ─────────────────────────────────────────────── */

export async function postQrCreate() {
  const res = await apiFetch<{
    token: string;
    requestSecret: string;
    expiresAt: string;
    qrImage: string;
  }>("/auth/login/qr/create", {
    method: "POST",
    body: JSON.stringify({}),
  });
  return {
    token: res.token,
    requestSecret: res.requestSecret,
    expiresAt: res.expiresAt,
    qrImage: res.qrImage,
  };
}

export async function getQrStatus(token: string, requestSecret: string) {
  return apiFetch<{
    status: "pending" | "approved" | "denied" | "expired";
    expiresAt: string;
    grantToken: string | null;
    deviceInfo: string | null;
    location: string | null;
  }>(`/auth/login/qr/status/${encodeURIComponent(token)}`, {
    headers: { "X-QR-Request-Secret": requestSecret },
  });
}

export async function postQrApprove(input: {
  token: string;
  decision: "approve" | "deny";
  deviceInfo: string;
  credential?: AuthenticationResponseJSON;
}) {
  return apiFetch<{ status: string }>("/auth/login/qr/approve", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function postQrApproveOptions() {
  const res = await apiFetch<{ options: PublicKeyCredentialRequestOptionsJSON }>(
    "/auth/login/qr/approve/options",
    { method: "POST" },
  );
  return res.options;
}

export async function postQrExchange(input: {
  grantToken: string;
  requestSecret: string;
  deviceFingerprint: string;
  deviceInfo: string;
  keystrokes: { prev: number; curr: number; delta: number }[];
}) {
  const res = await apiFetch<{
    accessToken: string;
    refreshToken: string;
    user: { name: string; email: string; onboardingStep?: OnboardingStep; onboardingIncomplete?: boolean };
  }>("/auth/login/qr/exchange", {
    method: "POST",
    body: JSON.stringify(input),
  });
  saveSession({
    accessToken: res.accessToken,
    refreshToken: res.refreshToken,
    name: res.user.name,
    email: res.user.email,
    onboardingIncomplete: res.user?.onboardingIncomplete ?? false,
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
  const [deviceFingerprint, deviceInfo] = await Promise.all([
    getDeviceFingerprint(),
    Promise.resolve(getDeviceInfo()),
  ]);
  const res = await apiFetch<{
    executed: boolean;
    stepUpRequired?: boolean;
    transferToken?: string;
    devOtp?: string;
    method?: "otp_email" | "image_challenge";
    challenge?: ImageChallenge;
    transaction?: { id: string };
  }>("/account/transfer", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      recipient: input.recipient,
      amount: Math.round(input.amountMinor) / 100,
      note: input.note,
      deviceFingerprint,
      deviceInfo,
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
    ...(res.method ? { method: res.method } : {}),
    ...(res.challenge ? { challenge: res.challenge } : {}),
  };
}

export async function postTransferConfirm(input: {
  transferToken: string;
  otp?: string;
  method?: "otp_email" | "image_challenge";
  challengeToken?: string;
  clicks?: ChallengeClick[];
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
      signal: string | null;
      device: string;
      ipAddress: string | null;
      ipMasked: string | null;
      location: string | null;
      city: string | null;
      country: string | null;
      riskScore: number;
      riskAction: string;
      timestamp: string;
      sessionId: string | null;
      sessionActive: boolean;
      isCurrent: boolean;
    }[];
    total: number;
  }>("/security/activity", { headers: authHeaders() });

  return res.events.map((e) => {
    let detail = e.detail;
    let sessionId = e.sessionId;
    let signal = e.signal;
    try {
      const parsed = JSON.parse(e.detail);
      if (parsed && typeof parsed === "object") {
        if (typeof parsed.signal === "string") signal = parsed.signal;
        if (typeof parsed.sessionId === "string") {
          sessionId = sessionId ?? parsed.sessionId;
        }
        detail = signal ?? detail;
      }
    } catch {
      /* detail is a plain string */
    }

    const parsedDevice = parseDeviceInfo(e.device);
    const city = e.city ?? (e.location?.split(",")[0]?.trim() || "Unknown");
    const country = e.country ?? (e.location?.split(",")[1]?.trim() || "");
    const isLogin = e.type === "login";
    return {
      id: e.id,
      type: (e.type === "transaction" ? "transfer" : e.type) as ActivityEvent["type"],
      timestamp: e.timestamp,
      device: e.device,
      deviceLabel: parsedDevice.label,
      devicePlatform: parsedDevice.platform,
      deviceIcon: resolveDeviceIconKind(e.device),
      city,
      country,
      ipAddress: e.ipAddress ?? null,
      ipMasked: e.ipMasked ?? "Unknown IP",
      risk: e.riskScore > 60 ? "high" : e.riskScore > 30 ? "medium" : "low",
      signal: signal || detail || e.title,
      sessionActive: e.sessionActive ?? (isLogin && e.riskAction === "allow"),
      isCurrent: e.isCurrent ?? false,
      ...(sessionId ? { sessionId } : {}),
    };
  });
}

export async function getSecuritySnapshot() {
  return apiFetch<{
    lastLogin: {
      deviceInfo: string;
      location: string | null;
      ipAddress: string;
      riskScore: number;
      createdAt: string;
      details: string | null;
    } | null;
    activeSessions: number;
    passkeys: number;
    blockedThisMonth: number;
  }>("/security/snapshot", { headers: authHeaders() });
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

export interface NotificationPref {
  id: string;
  label: string;
  hint: string;
  enabled: boolean;
}

interface PrefBackend {
  alertNewDevice: boolean;
  alertLargeTransfer: boolean;
  alertBlockedSignIn: boolean;
  alertProductUpdates: boolean;
}

export async function getNotificationPrefs(): Promise<NotificationPref[]> {
  const p = await apiFetch<PrefBackend>("/security/notification-prefs", {
    headers: authHeaders(),
  });
  return [
    {
      id: "new_device",
      label: "Email me when a new device signs in",
      hint: "Sent within seconds of the session starting",
      enabled: p.alertNewDevice,
    },
    {
      id: "large_transfer",
      label: "Email me for transfers above ₹50,000",
      hint: "Receipt plus the device that approved it",
      enabled: p.alertLargeTransfer,
    },
    {
      id: "blocked",
      label: "Email me when we block a sign-in",
      hint: "Includes the signal that triggered the block",
      enabled: p.alertBlockedSignIn,
    },
    {
      id: "product",
      label: "Product updates from NovaBank",
      hint: "Roughly once a month. No marketing blasts.",
      enabled: p.alertProductUpdates,
    },
  ];
}

export async function putNotificationPrefs(
  prefs: Partial<{
    alertNewDevice: boolean;
    alertLargeTransfer: boolean;
    alertBlockedSignIn: boolean;
    alertProductUpdates: boolean;
  }>,
): Promise<PrefBackend> {
  return apiFetch<PrefBackend>("/security/notification-prefs", {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(prefs),
  });
}

export interface TrustedDevice {
  id: string;
  deviceName: string;
  deviceInfo: string;
  ipAddress: string;
  ipMasked: string;
  location: string | null;
  lastSeen: string;
  createdAt: string;
  isCurrent: boolean;
}

export async function getDevices(): Promise<TrustedDevice[]> {
  const res = await apiFetch<{
    devices: {
      id: string;
      deviceName: string;
      deviceInfo: string;
      ipAddress: string;
      ipMasked: string;
      location: string | null;
      lastSeen: string;
      createdAt: string;
      isCurrent: boolean;
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

export interface PccpStatus {
  enrolled: boolean;
  clickpoints: number;
  locked: boolean;
  lockedUntil?: string;
}

export async function getPccpStatus(): Promise<PccpStatus> {
  return apiFetch<PccpStatus>("/security/pccp", { headers: authHeaders() });
}

export async function deletePccpEnrollment() {
  return apiFetch<{ disabled: boolean }>("/security/pccp", {
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
      phone: string | null;
      phoneVerified: boolean;
    };
  }>("/user/profile", { headers: authHeaders() });

  return {
    id: res.user.id,
    name: res.user.name,
    email: res.user.email,
    phoneMasked: res.user.phone
      ? `${res.user.phone.slice(0, 3)} ••••• ${res.user.phone.slice(-4)}`
      : "Not provided",
    phone: res.user.phone,
    phoneVerified: res.user.phoneVerified,
    avatarUrl: null,
    memberSince: res.user.createdAt,
  };
}

export async function patchProfile(
  input: Partial<UserProfile> & { phoneOtp?: string },
): Promise<UserProfile> {
  const res = await apiFetch<{
    user: { id: string; email: string; name: string; phone: string | null };
  }>("/user/profile", {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ name: input.name, phone: input.phone, phoneOtp: input.phoneOtp }),
  });
  const current = getStoredSession();
  if (current?.email === res.user.email) {
    saveSession({ ...current, name: res.user.name });
  }
  return { ...(await getProfile()) };
}

export async function getAdminSecurityOverview() {
  return apiFetch<{
    totals: { users: number; activeSessions: number; riskyEvents: number; blockedEvents: number };
    events: {
      id: string;
      at: string;
      user: { id: string; name: string; email: string; phone: string | null };
      type: string;
      device: string;
      ipAddress: string;
      location: string | null;
      lat: number | null;
      lon: number | null;
      riskScore: number;
      riskAction: string;
      details: string | null;
    }[];
  }>("/admin/security-overview", { headers: authHeaders() });
}

export interface AdminUserLookup {
  user: {
    id: string;
    email: string;
    name: string;
    phone: string | null;
    phoneVerified: boolean;
    emailVerified: boolean;
    onboardingStep: string;
    createdAt: string;
  };
  stats: {
    openSessions: number;
    passkeys: number;
    unusedRecoveryCodes: number;
    blockedLast7d: number;
  };
  sessions: {
    id: string;
    device: string;
    ipAddress: string;
    location: string | null;
    riskScore: number;
    revoked: boolean;
    createdAt: string;
    expiresAt: string;
    active: boolean;
  }[];
  passkeys: { id: string; nickname: string; deviceType: string; lastUsedAt: string }[];
  recentLogins: {
    id: string;
    type: string;
    device: string;
    ipAddress: string;
    location: string | null;
    riskScore: number;
    riskAction: string;
    createdAt: string;
  }[];
}

export async function getAdminUserLookup(email: string) {
  return apiFetch<AdminUserLookup>(
    `/admin/user?email=${encodeURIComponent(email)}`,
    { headers: authHeaders() },
  );
}

export async function postAdminRevokeUserSessions(userId: string) {
  return apiFetch<{ revoked: number; email: string }>(
    `/admin/user/${encodeURIComponent(userId)}/revoke-sessions`,
    { method: "POST", headers: authHeaders() },
  );
}

export async function getAdminIpLookup(ip: string) {
  return apiFetch<{
    ip: string;
    geo: { city?: string; country?: string; countryCode?: string; lat?: number; lon?: number } | null;
  }>(`/admin/ip/${encodeURIComponent(ip)}`, { headers: authHeaders() });
}

export interface AdminUserListItem {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
  onboardingStep: string;
  createdAt: string;
  passkeysCount: number;
  activeSessionsCount: number;
  activeSessions: {
    id: string;
    device: string;
    ipAddress: string;
    location: string | null;
    createdAt: string;
    active: boolean;
  }[];
}

export async function getAdminUsersList() {
  return apiFetch<{ users: AdminUserListItem[] }>("/admin/users", { headers: authHeaders() });
}

export async function deleteAdminUser(userId: string) {
  return apiFetch<{ ok: boolean; deletedUserId: string; email: string }>(
    `/admin/user/${encodeURIComponent(userId)}`,
    { method: "DELETE", headers: authHeaders() },
  );
}

export async function deleteAdminUserPasskeys(userId: string, passkeyId?: string) {
  const url = passkeyId
    ? `/admin/user/${encodeURIComponent(userId)}/passkeys/${encodeURIComponent(passkeyId)}`
    : `/admin/user/${encodeURIComponent(userId)}/passkeys`;
  return apiFetch<{ ok: boolean; userId: string; email: string }>(url, {
    method: "DELETE",
    headers: authHeaders(),
  });
}

export async function postAdminSendUserResetEmail(userId: string) {
  return apiFetch<{ ok: boolean; sentTo: string; verifyLink: string }>(
    `/admin/user/${encodeURIComponent(userId)}/send-reset-email`,
    { method: "POST", headers: authHeaders() },
  );
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
