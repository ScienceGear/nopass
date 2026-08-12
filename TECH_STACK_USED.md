# NovaBank (`nopass`) — Technology Stack & Engineering Reference

> A from-basic-to-advanced guide to everything this passwordless banking demo uses,
> including exactly how the risk index is computed and how behaviour is predicted.

---

## 1. Languages & Module System ("what text type we are using")

| Layer | Language | Module system | Notes |
|-------|----------|---------------|-------|
| Backend | **TypeScript 5.7** | **ESM** (`"type": "module"`, `.js` import specifiers, e.g. `../services/riskEngine.js`) | Run via `tsx` in dev, compiled to `dist/` with `tsc` for production |
| Frontend | **TypeScript 5.8** + **JSX/TSX** | **ESM** (`"type": "module"`) | File-based routes, server/client components |
| Tooling | Node.js (22+), PowerShell, npm workspaces (not configured — separate installs per package) | — | — |
| Database | **SQL** (PostgreSQL 15+), Prisma schema language | — | Prisma is the single source of truth for the data model |

- **Linting / formatting**: ESLint 9 (flat config, `typescript-eslint`, `eslint-plugin-react-hooks`, `react-refresh`, Prettier) on both packages; Husky pre-commit hook at the root.
- **Strictness**: `tsc --noEmit` typecheck on both packages, `zod` schema validation on all backend input.

---

## 2. Repository Layout & Monorepo Structure

```text
./
├── dev.mjs                 Root dev launcher (Postgres boot, migrations, spawns both apps)
├── docker-compose.yml      Containerised db + redis + api + web
├── backend/                Express API + Prisma + WebAuthn + risk engine
│   └── src/
│       ├── config/         env validation (zod), Prisma client, Redis client
│       ├── controllers/    HTTP handlers (auth, account, security, user, admin, pccp)
│       ├── routes/         route groups mounted under /api
│       ├── middleware/     auth, security (rate limits), error handler
│       ├── services/       domain logic + unit tests (*.test.ts)
│       └── utils/          crypto, geo, ip, device, logger, validators
└── frontend/               React 19 + TanStack Start + Vite + Tailwind 4
    └── src/
        ├── routes/         File-based routes (login, onboarding, pccp, dashboard, admin…)
        ├── lib/            api.ts (sole API client), keystroke, fingerprint, session, device…
        └── components/     ui/ (Radix/shadcn-style) + nova/ (bank-specific)
```

---

## 3. Frontend Stack

| Concern | Technology |
|---------|-----------|
| Framework | **React 19.2** + **TanStack Start** (`@tanstack/react-start`) |
| Routing | **TanStack Router** (file-based, `src/routes/`, `routeTree.gen.ts` auto-generated) |
| Server rendering | TanStack Start SSR, custom entry `src/server.ts` (h3 error normalisation) + `src/start.ts` (CSRF middleware) |
| Data fetching / caching | **TanStack Query** (React Query v5) |
| Styling | **Tailwind CSS 4** (`@tailwindcss/vite`), `tailwind-merge`, `clsx`, `tw-animate-css` |
| UI primitives | **Radix UI** (AlertDialog, Dialog, Label, Slot, Switch), **CVA** (class-variance-authority) |
| Icons | **Lucide React** |
| Charts / maps | **Leaflet** (OpenStreetMap tile layer) in `RiskMap.tsx` — admin view of risky sign-ins |
| Toasts | **Sonner** |
| QR codes (render) | **qrcode.react** |
| WebAuthn (browser) | **@simplewebauthn/browser** |
| Build tooling | **Vite 8** (`vite.config.ts` provided by `@lovable.dev/vite-tanstack-config`), **Nitro** build target, `@tanstack/router-plugin`, `vite-tsconfig-paths`, Vercel preset |
| Client helpers | `lib/session.ts` (localStorage + refresh), `lib/api.ts` (single-flight token refresh), `lib/fingerprint.ts`, `lib/keystroke.ts`, `lib/device.ts` (UA parsing), `lib/recoveryPdf.ts` (dependency-free PDF builder) |

**Frontend conventions worth knowing:**

- **`src/lib/api.ts` is the *only* file that touches the network** (per `AGENTS.md`). All API calls, WebAuthn JSON payloads, token refresh and error mapping live there.
- Sessions are stored in `localStorage` under `novabank.session`; access token is attached as `Bearer`, and a **single-flight refresh** avoids racing refresh-token rotation when parallel queries 401 at once.
- Device fingerprint = SHA-256 of `userAgent | language | screen size | colorDepth | timezone | hardwareConcurrency | platform`, cached in `localStorage`.

---

## 4. Backend Stack

| Concern | Technology |
|---------|-----------|
| HTTP framework | **Express 4** |
| Middleware / security | **Helmet**, **CORS** (explicit allowlist), **hpp** (HTTP param pollution), JSON body limit `1mb` |
| Rate limiting | **express-rate-limit** (5 limiters: `authLimiter`, `otpLimiter`, `pollLimiter`, `transferLimiter`, `phoneOtpLimiter`) |
| ORM | **Prisma 6** (`@prisma/client`, `prisma`), PostgreSQL provider, committed migrations |
| Database | **PostgreSQL** (15+ / 16-alpine in Docker / local PG 17 cluster booted by `dev.mjs`) |
| Cache / transient state | **Redis** (`ioredis`), with **`ioredis-mock`** for the `memory://` dev URL |
| Password hashing | **Argon2id** (`argon2`) — recovery codes, OTPs, PCCP click-points |
| WebAuthn (server) | **@simplewebauthn/server** + **@simplewebauthn/types** |
| JWT | **jsonwebtoken** (15-min access, 7-day refresh; refresh stored hashed in DB) |
| Email | **nodemailer** (SMTP) **or Resend HTTP API** (used on Render) |
| SMS | **TextBee** HTTP gateway (dev logs to console) |
| IP geolocation | **axios** → `https://ipapi.co/{ip}/json` (in-process cache; skips private IPs) |
| Breach checking | **axios** → HIBP `api.pwnedpasswords.com/range/{prefix}` (k-anonymity, SHA-1) |
| QR generation | **qrcode** (`toDataURL`, error correction level H) |
| Validation | **zod** (env schema + all request bodies) |
| Tests | Node built-in **`node:test`** runner via `tsx` (`backend/src/services/*.test.ts`) |
| Logging | Custom `utils/logger.ts` — stderr only in production, no sensitive fields |
| Dev runtime | **tsx watch** |

---

## 5. Data Model (Prisma → PostgreSQL)

Persisted entities (`backend/prisma/schema.prisma`, 17 models):

| Model | Purpose |
|-------|---------|
| `User` | Email, name, phone, balance (`Decimal(12,2)`), `emailVerified`, **`onboardingStep`** state machine, `keystrokeProfile` relation |
| `Credential` | WebAuthn passkey: `credentialId` (base64url), `publicKey` (bytes), `counter` (anti-clone), `deviceType`, `backedUp`, `transports[]` |
| `TrustedDevice` | `fingerprint` = **SHA-256 of the device fingerprint**, `deviceInfo`, IP, location, `isRevoked`, `@@unique([userId, fingerprint])` |
| `Session` | Refresh-token session: hashed refresh token, device, IP, location, **`riskScore`**, `expiresAt` |
| `LoginHistory` | Audit trail: `eventType` (login/logout/transfer/alert/step_up), `riskScore`, **`riskAction`** (allow/step_up/image_challenge/block), JSON `details` (contains signal list + lat/lon) |
| `Transaction` | Transfers, `status` pending/completed/blocked/step_up_required |
| `KeystrokeProfile` | JSON `{ "prev-curr": { mean, std, count } }` transition dwell-times + `sampleCount` |
| `RecoveryCode` | Argon2id-hashed one-time codes |
| `OtpCode` | Email OTPs (hashed), single-use, 10-min TTL, purpose-keyed |
| `QrSession` | QR sign-in: random token, hashed request-secret, status machine pending→approved/denied/expired |
| `EmailVerificationToken` | One per user, hashed, 15-min TTL, single-use |
| `ImageChallengeSetup` | Image-sequence step-up audit: JSON sequence `[{imageKey, regionId}]`, attempts, verified |
| `PhoneOtp` | SMS OTPs (argon2 hash), one per purpose, 10-min TTL, `@@index([phone, purpose])` |
| `UserSecuritySettings` | Email-alert preferences (new device, large transfer, blocked sign-in, product updates) |
| `PccpConfig` | PCCP enrollment: fixed 3-image set from pool of 5, `orderSeed`, `attemptIndex` (rotates display order per attempt) |
| `PccpClickpoint` | Memorised click-points: **only an argon2id hash** of `salt + gridCellX + gridCellY + imageId + sequencePosition` (21×21 grid), never raw coordinates |
| `PccpBehaviorBaseline` | Timing baseline per (user, deviceClass, sequencePosition): mean/std of time-to-click & inter-click + rolling window (max 20 samples) |
| `PccpLockout` | PCCP-method-only lockout (does NOT lock the whole account) |

### Registration state machine (enforced)

```text
email_pending → passkey_set → complete
```

`/verify-email` gives an authenticated onboarding session; onboarding reads
`/api/auth/onboarding/status` and steps through backup-password sample (keystroke),
passkey, then image sequence. `requireCompletedOnboarding` middleware rejects
banking/settings/profile endpoints until `onboardingStep === "complete"`.

---

## 6. Runtime State & Infrastructure

### Redis keys (all short-lived, `EX` TTL)

- `webauthn:challenge:<challenge>` — 300 s, popped on use (anti-replay)
- `image-challenge:<token>` — 300 s, single-use, 3 attempts max
- `pccp:reg:<token>` / `pccp:login:<token>` / `pccp:stepup:<token>` — 600 s
- `transfer:<token>` — 900 s
- `auth:velocity:<userId>` — 600 s, INCR counter for login velocity
- `qr:grant:<token>` — 300 s
- `sms:quota:<date>:<key>` — 48 h, max 6 SMS/day/identity

### Dev launcher (`dev.mjs`)

- Boots a project-local **PostgreSQL 17** cluster (or validates a remote host via DNS), applies committed migrations with `prisma migrate deploy`, then spawns API + web.
- Uses `taskkill` for clean shutdown on Windows.

### Docker (`docker-compose.yml`)

- `db` (postgres:16-alpine), `redis` (redis:7-alpine), `api` (Express), `web` (Vite dev server with `/api` proxy to the `api` service).

### Production build

- Backend: `tsc` → `dist/`, Express listens on `PORT` (3001).
- Frontend: Vite build via Nitro with **Vercel** preset (Build Output API v3).

---

## 7. Authentication & Identity Stack ("important things we are using")

### 7.1 WebAuthn / Passkeys (`webauthnService.ts`, `@simplewebauthn/*`)

- Registration: `generateRegistrationOptions` with `rpID`, `rpName`, `attestationType: "none"`, `authenticatorSelection: { residentKey: "preferred", userVerification: "required", authenticatorAttachment: "platform" }`, algorithms `[-7, -257]` (ES256, RS256).
- Verification: challenge is popped from Redis and must match the challenge signed in `clientDataJSON`; origin and RP ID are validated; `requireUserVerification: true`.
- Authentication: `generateAuthenticationOptions` / `verifyAuthenticationResponse`; the credential **counter is checked and updated** to detect cloned keys.
- Browser side uses `@simplewebauthn/browser` `startRegistration`/`startAuthentication` with `optionsJSON`.

### 7.2 Token & session model

- **Access token**: JWT, 15 min, `{ sub, email, sessionId }`.
- **Refresh token**: JWT, 7 days, stored in DB **hashed with SHA-256**; rotated on every refresh (old hash replaced). Revocation = flip `revoked` or rotate the hash.
- Sessions carry the **`riskScore`** at creation and appear in the security/activity UI; sessions can be revoked individually or en-masse.

### 7.3 Passwordless login paths (all funnel through the risk engine)

1. **Passkey** (primary) — `/auth/login/options` + `/auth/login/verify`
2. **Email OTP / magic code** — `/auth/login/email-otp`
3. **SMS OTP** (phone on file) — `/auth/login/phone-otp`
4. **Recovery code** (10× one-time, Argon2id-hashed, PDF download) — `/auth/login/recovery-code`
5. **QR cross-device sign-in** — browser A shows QR (encodes `https://<origin>/login/approve?t=<token>`); authenticated browser B approves **after a passkey gesture**; the scan browser polls status with a **request-secret** (SHA-256 hashed, constant-time compare), then exchanges a 5-min JWT grant.
6. **PCCP click-points** — Persuasive Cued Click-Points (below).
7. **Image-sequence step-up** — click 2–4 objects in order on a procedural SVG scene (below).

### 7.4 PCCP — Persuasive Cued Click-Points (`pccpService.ts`, `PccpChallenge.tsx`)

- User memorises **one click-point on each of 3 images** (chosen from a fixed pool of 5).
- Clicks are normalised 0..1 by the client, **quantised to a 21×21 grid** server-side, and stored **only as an argon2id hash** (per-clickpoint salt). Raw coordinates never persist.
- Login re-produces the sequence within a **Chebyshev tolerance of 1 grid cell** (the hard gate).
- Registration uses the *persuasive* viewport: a highlighted ~40%-area region moves around (shuffle up to 2×), forcing the user to spread clicks — makes shoulder-surfing / smudge attacks harder.
- **Per-attempt display order** is a deterministic shuffle from `mulberry32(orderSeed ^ attemptIndex)` so both sides agree without storing arrays; every attempt shows a different order.
- Lockout is **method-only**: 3 failures → 1-hour `PccpLockout`; passkey/email/SMS logins are unaffected.

### 7.5 Image-sequence challenge (`imageChallengeService.ts`)

- Procedurally drawn SVG scenes (living-room, kitchen, garden) with fixed bounding boxes; the challenge picks a random scene + 3 shuffled objects.
- The user's personal onboarding sequence is reused when it exists (their chosen image + objects).
- Click-in-box with `TOLERANCE = 0.06`; token is single-use (deleted on success or after 3 fails); `devRegions` exposed only in non-production.

### 7.6 Other security mechanisms

- **Device fingerprinting** — SHA-256 of browser signals; trusted-device registry keyed `@@unique([userId, fingerprint])`.
- **Recovery codes** — 10 one-time codes, alphabet avoids confusing characters (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`), Argon2id-hashed, downloadable as a dependency-free PDF.
- **HIBP breach check** — k-anonymity: only the first 5 hex chars of the SHA-1 email hash leave the server.
- **Email alerts** — new device, large transfer, blocked sign-in (respecting `UserSecuritySettings`).
- **Rate limiting** — layered limiters keyed by IP and by `IP:email` / `IP:phone`.
- **IP geolocation + private-IP detection** — `cf-connecting-ip` → `x-real-ip` → `x-forwarded-for` → `req.ip`; masks IPs for display (`maskIp`).
- **Phone OTP** — hashed, single-use, 10-min TTL, 6 SMS/day quota via Redis.
- **CSRF** on TanStack server functions (`createCsrfMiddleware`), `helmet`, `hpp`, explicit CORS allowlist.

---

## 8. The Risk Engine — how the risk index is calculated

**Files:** `backend/src/services/riskEngine.ts` (decision function), `riskContextService.ts` (signal collection), `backend/src/services/riskEngine.test.ts` (specs).

### 8.1 One decision function everywhere

`evaluateRisk(input: RiskInput): RiskAssessment` is the **single** risk decision used by both login and transfer routes — one set of thresholds, one decision.

### 8.2 Signals & weights (additive weighted sum)

```text
new_device           30   Sign-in from a device never seen on the account
new_ip               20   Sign-in from an IP not seen in the last 90 days
country_change       20   Country differs from the account's history
impossible_travel    40   Previous login too far away for elapsed time (haversine)
keystroke_anomaly    20   Behavioural typing score > 0.55 (and not cold start)
login_velocity       15   >3 logins inside the 10-minute Redis window
unusual_hour         10   Login outside 06:00–23:00 local time
was_pasted           15   Password was pasted, not typed
amount               tier  Transfer amount floor (0 / 31 / 61), replaces static weight
```

```
score = Σ enabled_signal.weights
```

### 8.3 Action bands

| Score | Action |
|-------|--------|
| 0–30  | `allow` |
| 31–60 | `step_up` (passkey re-confirm, SMS OTP, or email OTP) |
| 61–80 | `image_challenge` (click 2–4 objects on a scene) |
| >80   | `block` (+ alert email, audit entry) |

**Passkey downgrade rule:** passkey logins that only trip *routine* signals (new device/IP) are downgraded to `allow` because the passkey gesture is already strong proof; only security-critical signals (`impossible_travel`, `country_change`) force a step-up.

### 8.4 Transfer-specific risk

`amountRisk(amount)` returns a **floor** that merges into the same bands:

- `> ₹5,00,000` → **61** → image challenge
- `> ₹50,000` → **31** → step-up OTP
- otherwise → 0

So a transfer combines `assessContext(...)` + `amountRisk(...)` and reuses `evaluateRisk`.

### 8.5 How the context is collected (`assessContext`)

For every entry point (login or transfer), with the device fingerprint + IP + keystroke sample:

1. **Trusted device?** → `isNewDevice` (SHA-256 fingerprint lookup).
2. **Geolocation** of the IP (ipapi.co) → `isNewIp`, `countryChanged`, coordinates.
3. **90-day history** (last 50 `LoginHistory` rows) → known IPs, known countries.
4. **Impossible travel**: for the most recent historical login that has coordinates, `haversineKm(new, old) > 900 km × hoursSince` and `0.1h < hoursSince < 24h` → flag.
5. **Keystroke anomaly** via `anomalyScore(profile, sample)` — suppressed during **cold start** (first `COLD_START_LOGINS = 5` logins while the profile populates).
6. **Login velocity**: Redis `INCR auth:velocity:<userId>` with 10-min expiry; `recentLogins > 3` → `loginCountIsAnomalous`.
7. **Unusual hour**: `!isUsualHour()` → 06:00–23:00 is usual.

Result is a `RiskContext extends RiskInput` fed to `evaluateRisk`.

---

## 9. Behaviour Prediction — how we model the user's behaviour

There are **two independent behavioural biometrics** (soft signals, never hard gates) plus the risk engine's adaptive features.

### 9.1 Keystroke dynamics (`keystrokeService.ts`)

- **Feature**: per-key-transition dwell-times. A transition is `(prevKeyCode, currKeyCode)`, keyed as `"97-98"`, value = ms between key-downs.
- **Client capture** (`lib/keystroke.ts`): `useKeystrokeCapture` records up to 600 samples (modifier keys, Tab, CapsLock skipped) plus a `wasPasted` flag (paste bypasses typing capture, so it is its own risk signal).
- **Profile learning** (`mergeSample`): **incremental mean + variance** (Welford-style online update, no need to store raw samples):

```
count' = count + 1
delta  = t - mean
mean'  = mean + delta / count'
std'²  = ( std²·(count-1) + delta·(t - mean') ) / (count'-1)
```

- **Anomaly score** (`anomalyScore`): returns `0..1` = fraction of scored transitions flagged.
  - A known transition scores a **z-score** `z = |t − mean| / max(std, 1)`; `z > 2.5` → anomalous.
  - A never/rarely seen transition is *mildly* suspicious: flagged when `|t − 180ms| > 120ms`.
  - Requires `MIN_SAMPLES = 3` per transition; profile needs ≥ 3 transitions (`profileHasData`).
  - `keystroke_anomaly` only fires when score **> 0.55** and the profile is out of cold start.
- **Folding**: after a successful login, `completeLogin` merges the new sample back into the profile (adaptive learning).

### 9.2 PCCP timing baseline (`pccpService.ts`)

- During enrollment each click also captures `timeToClick` (ms since image reveal) and `interClick` (ms since previous click), plus `pointerType` (mouse/touch/stylus).
- Baselines are stored **per (user, deviceClass "desktop"|"mobile", sequencePosition 0/1/2)**: mean & std of time-to-click and inter-click, updated from a **rolling window of max 20 samples** with recomputed mean/std.
- On login the attempt's timings are compared via **z-scores**: `maxZ = max(|z_timeToClick|, |z_interClick|)` per position.
  - `STEPUP_Z_MIN = 1.5` → require a passkey step-up.
  - `STEPUP_Z_MAX = 3.0` → anomaly rejection (logged/flagged).
- This is a **soft signal only**: correct clicks are never rejected purely on timing; it feeds step-up escalation.

### 9.3 Adaptive / online properties

- Keystroke profile is **incremental** (online mean/std) — no batch retraining.
- PCCP baselines adapt via a **rolling window** so drift in a user's rhythm is tracked.
- **Cold start suppression** avoids punishing new accounts before a baseline exists.
- **Login velocity** is measured live in Redis (INCR + TTL).
- Login history feeds **90-day behavioural context** (known IPs/countries/coordinates) that makes `isNewIp`, `countryChanged`, and `impossibleTravel` adaptive per account.

---

## 10. The Mathematics Used (complete list)

| # | Math / algorithm | Where | Purpose |
|---|------------------|-------|---------|
| 1 | **Additive weighted scoring** | `riskEngine.ts` | Risk index: sum of enabled signal weights → bands |
| 2 | **Online (Welford) mean & variance** | `keystrokeService.ts:mergeSample` | Learn per-transition dwell-time mean/std without storing raw data |
| 3 | **Z-score** `(x − μ)/σ` | `keystrokeService.ts`, `pccpService.ts` | Normalised deviation of a timing from its baseline; thresholded (2.5, 1.5, 3.0) |
| 4 | **Haversine great-circle distance** | `utils/geo.ts:haversineKm` | km between two lat/lon points → impossible-travel detection |
| 5 | **Speed/velocity threshold** `distance > 900 km × hours` | `riskContextService.ts` | Impossible travel heuristic (900 km/h ≈ commercial aircraft) |
| 6 | **Chebyshev distance** `max(Δx, Δy)` | `pccpService.ts` | Click tolerance: ≤ 1 grid cell (3×3 neighbourhood) |
| 7 | **Grid quantization** `floor(v × 21)` to 21×21 | `pccpService.ts:quantizeGrid` | Map normalised 0..1 clicks to discrete cells for hashing |
| 8 | **Rolling-window mean/std (≤ 20 samples)** | `pccpService.ts:appendTimingSample` | Adaptive timing baseline; mean = Σx/n, std = √(Σ(x−μ)²/n) |
| 9 | **Fisher–Yates (partial) shuffle** | `pccpService.ts:selectImageSet`, `imageChallengeService.ts` | Pick 3-of-5 image sets / shuffle challenge objects |
| 10 | **mulberry32 seeded PRNG** | `pccpService.ts` | Deterministic per-attempt image order: `seed ^ (attemptIndex+1)·2654435761` |
| 11 | **Argon2id password hashing** | `utils/crypto.ts`, `pccpService.ts`, `smsService.ts`, `emailService.ts` | Recovery codes, OTPs, PCCP click-point hashing (`salt:x:y:image:pos`) |
| 12 | **SHA-256** | `deviceService.ts`, `fingerprint.ts`, `crypto.ts` (auth), QR secret | Device fingerprints, refresh-token hashing, email-verification tokens, QR request-secret |
| 13 | **SHA-1 + k-anonymity range query** | `hibpService.ts` | HIBP breach check (send only 5-hex-char prefix) |
| 14 | **HMAC-ish constant-time compare** `timingSafeEqual` | `qrService.ts` | QR request-secret verification (prevents timing attacks) |
| 15 | **JWT signing/verification (HS family via `jsonwebtoken`)** | `utils/crypto.ts` | Access (15 m) + refresh (7 d) tokens |
| 16 | **Bounding-box hit test with tolerance** | `imageChallengeService.ts:clickInBox` | Image object click verification (`pad = 0.06`) |
| 17 | **Decimal arithmetic for money** (`Decimal(12,2)`, `INR`) | Prisma schema, `api.ts:formatINR` | Currency handling — never float for balances |
| 18 | **Basic statistics / probability** | Throughout | Mean, standard deviation, fractions (`anomalous/scored`), thresholds |
| 19 | **Bit-mixing hash (`Math.imul`)** | `mulberry32` | Deterministic shuffle seeding |
| 20 | **ISO/UTC time arithmetic** | Sessions, OTPs, challenges, lockouts | TTLs, expiry checks, 90-day windows |

---

## 11. Key Security Decisions (why it's designed this way)

1. **One risk function, everywhere** — login and transfer share `evaluateRisk`, so bands are consistent and testable (see `riskEngine.test.ts`).
2. **Behavioral biometrics are soft, knowledge is hard** — keystrokes and click-timing only escalate/step-up; only the click-sequence gate (Chebyshev) and WebAuthn signatures actually reject.
3. **Nothing sensitive is stored raw** — click-points are argon2 hashes, refresh tokens are SHA-256, OTPs/codes are argon2 hashes, QR secrets are hashed + constant-time compared, tokens are single-use + TTL'd in Redis.
4. **Replay prevention** — WebAuthn challenges, image-challenge tokens, QR grants and transfer tokens are deleted on first use.
5. **Method-isolated lockout** — PCCP lockout never blocks passkey/email/SMS.
6. **Anti-enumeration** — rate limiters keyed by `IP:email` / `IP:phone`; login velocity tracked in Redis; OTP codes are hashed with per-record salt.
7. **Passkey as step-up** — high-risk events always resolve to a second factor: passkey re-confirm, OTP (email/SMS), or the personal image sequence.

---

## 12. Quick Reference — Where Things Live

| Topic | File |
|-------|------|
| Risk decision + bands + weights | `backend/src/services/riskEngine.ts` |
| Risk signal collection | `backend/src/services/riskContextService.ts` |
| Risk engine tests | `backend/src/services/riskEngine.test.ts` |
| Keystroke maths | `backend/src/services/keystrokeService.ts` |
| Keystroke capture (browser) | `frontend/src/lib/keystroke.ts` |
| PCCP (click-points + timing + shuffle) | `backend/src/services/pccpService.ts` (+ `.test.ts`) |
| PCCP UI | `frontend/src/components/nova/PccpChallenge.tsx` |
| WebAuthn | `backend/src/services/webauthnService.ts` |
| Image challenge | `backend/src/services/imageChallengeService.ts` |
| QR cross-device login | `backend/src/services/qrService.ts` |
| Device trust | `backend/src/services/deviceService.ts` |
| Device fingerprinting | `frontend/src/lib/fingerprint.ts` |
| Geo / haversine | `backend/src/utils/geo.ts` |
| Client IP / masking | `backend/src/utils/clientIp.ts` |
| Crypto (argon2, JWT, recovery codes) | `backend/src/utils/crypto.ts` |
| Email / OTP | `backend/src/services/emailService.ts` |
| SMS OTP | `backend/src/services/smsService.ts` |
| Breach check | `backend/src/services/hibpService.ts` |
| Prisma schema | `backend/prisma/schema.prisma` |
| Migrations | `backend/prisma/migrations/` (never edit applied ones) |
| Env config (zod) | `backend/src/config/env.ts` |
| API client (only network file) | `frontend/src/lib/api.ts` |
| Frontend routes | `frontend/src/routes/` |
