# NovaBank Tech Stack &amp; Technology Decisions

> Everything used to build NovaBank, what it does in this project, and **why it was chosen** over the alternatives. This is the "why" companion to the [README](README.md) — read it when you want to understand a decision rather than just what a file does.

---

## 1. The design philosophy

Three principles drive every choice in this repo:

1. **Passwordless is the product.** The whole point is that a user never types a password — so authentication must be built on public-key cryptography (WebAuthn) rather than on a shared secret we'd have to store, reset, and lose.
2. **Security is layered, not bolted on.** A passkey alone stops phishing, but a stolen device is still a risk. So every sign-in is *scored* by a risk engine that can escalate to step-up verification — behavioral biometrics, device trust, and challenge-response — rather than a single yes/no check.
3. **It's a demo that must actually run.** Everything is chosen to be deployable for free (Render + Vercel + Upstash + Resend/TextBee free tiers) while still being realistic about how a real bank would be built.

That philosophy is why the stack splits into "cryptographic identity" (WebAuthn), "risk context" (fingerprinting + keystroke dynamics + geolocation), "durable data" (PostgreSQL), and "short-lived, security-critical state" (Redis).

---

## 2. Authentication &amp; Identity

### 2.1 WebAuthn / Passkeys — `@simplewebauthn/server` (backend) + `@simplewebauthn/browser` (frontend)

- **What it is.** The W3C WebAuthn standard (part of the FIDO2 framework). It lets a website register a public key bound to a user's *authenticator* — a platform authenticator (Face ID / Touch ID / Windows Hello) or a roaming security key. The private key never leaves the device; the server only ever stores and verifies the public key.
- **What it does here.** Every primary sign-in is a WebAuthn ceremony. `@simplewebauthn` handles the protocol-level details: generating registration/authentication options, verifying the signed `clientDataJSON` + `attestationObject`, origin/RP-ID binding, and counter rollback checks. Challenges are stored in Redis with a 300-second TTL and are **single-use**.
- **Why we chose it.**
  - **Structurally eliminates the top attack classes.** Passwords are phished, stuffed, and reused; a passkey is bound to the origin (RP-ID), so a phishing site can't replay it, and each credential is unique per site.
  - **`@simplewebauthn` over raw WebAuthn.** Implementing the full ceremony by hand (CBOR attestation parsing, signature verification across algorithms −7/−257, counter management) is deep, security-sensitive work. SimpleWebAuthn is the de-facto reference library, actively maintained, and TypeScript-first — which matters for a demo that must *correctly* implement a security-critical standard.
  - **Browser support is mature.** Platform passkeys work in Chrome, Edge, Safari, and Firefox on modern OSes.
  - *Alternatives considered:* WebAuthn is the standard — there is no meaningful alternative for genuine passkeys. We considered TOTP/authenticator apps (like Google Authenticator) as a *fallback* but kept them out of the primary flow because they still introduce a shared secret and a code-stealing surface; instead we use one-time codes sent over email/SMS for recovery.

### 2.2 Argon2 — `argon2` (argon2id)

- **What it is.** The password-hashing function that won the Password Hashing Competition (2015).
- **What it does here.** Hashes recovery codes and every OTP (email, SMS) before they're stored in PostgreSQL. `verifyPassword()` in [backend/src/utils/crypto.ts](backend/src/utils/crypto.ts) is the single entry point for checking a candidate against a stored hash.
- **Why we chose it.** Recovery codes and OTPs are still *secrets* — if the database leaks, they must not be recoverable.
  - **Argon2id is the current best-practice KDF:** memory-hard (resists GPU/ASIC cracking), the PHC winner, and the OWASP recommendation.
  - **vs bcrypt/scrypt:** argon2 is more modern and memory-hard by design (bcrypt's memory-hardness is effectively fixed/legacy). *vs plain SHA-256:* naive hashing is trivially brute-forced for 6-digit codes — we deliberately never do that.
  - *Note:* we did *not* need argon2 for passwords because there are no passwords — the migration `20260806220000_remove_password_hash` deleted the password hash column.

### 2.3 JWT access/refresh tokens — `jsonwebtoken`

- **What it is.** JSON Web Tokens: signed, self-contained claims.
- **What it does here.** Short-lived **access tokens** (15 min) authenticate each API call; **refresh tokens** (7 days) are rotated on every refresh and stored **SHA-256-hashed** in the `Session` table so sessions can be listed and revoked per-device from the Security Center. QR cross-device login issues a separate 5-minute "grant" JWT.
- **Why we chose it.** Banking UIs are SPA-heavy (React + TanStack Start on Vercel, API on Render), so a token model that works across origins with a single `Bearer` header fits better than cookie sessions that fight CORS/CSRF.
  - **Server-side revocability.** Pure stateless JWTs can't be revoked; ours are backed by a hashed `Session` row precisely so the user can see "active sessions" and kill them — a real bank must be able to revoke a compromised device.
  - **Separate secrets** for access vs refresh mean a leaked access token can't forge refresh tokens.
  - *Alternatives considered:* opaque server-side session tokens (Redis/PG) — equally valid, more state to manage; cookie sessions — harder across the Vercel/Render split; Passport/NextAuth-style frameworks — overkill for a focused auth demo we wanted to show in code.

### 2.4 Device fingerprinting — [backend/src/services/deviceService.ts](backend/src/services/deviceService.ts) + [frontend/src/lib/fingerprint.ts](frontend/src/lib/fingerprint.ts)

- **What it is.** A best-effort SHA-256 hash of stable browser signals (UA, language, screen, timezone, hardware concurrency, …), computed client-side and sent with every login.
- **Why we chose it.** "Is this a device this account has used before?" is the #1 risk signal, and we can't use a tracking cookie (users clear them) or a hardware serial (impossible). A hashed fingerprint gives us:
  - **Trusted-device recognition** without storing anything sensitive — we store only the SHA-256 digest.
  - **A `was_pasted` / keystroke signal** that only makes sense attached to a device identity.
  - *Honesty about limits:* it's best-effort; it falls back to a random id, and it's never the *only* gate — just one weighted signal in the risk engine.

### 2.5 Keystroke-dynamics behavioral biometrics — [backend/src/services/keystrokeService.ts](backend/src/services/keystrokeService.ts) + [frontend/src/lib/keystroke.ts](frontend/src/lib/keystroke.ts)

- **What it is.** Measuring *how* someone types (dwell times between key transitions) and comparing it to their own historical profile. Each transition pair (`prev-curr` charCodes) builds an incremental mean/std model.
- **Why we chose it.** Something you *are* — not just what you have. A stolen passkey/device can't reproduce the owner's typing rhythm.
  - **Cold-start safe.** The signal is suppressed for the first 5 logins while the profile populates, so brand-new users aren't falsely challenged.
  - **Paste detection.** Pasting a secret skips the typing signal, so a paste is its own +15 risk signal.
  - *Alternatives:* full behavioral platforms (BioCatch, etc.) are commercial and closed; implementing a simple per-transition statistical model shows the concept transparently — good for a demo, and the math is in one small file you can read.

### 2.6 Recovery fallbacks — email OTP, SMS OTP, recovery codes, image challenge

All stored **hashed**, all **single-use**, all with TTLs:

- **Email OTP** — [backend/src/services/emailService.ts](backend/src/services/emailService.ts) (10-min TTL, argon2-hashed).
- **SMS OTP** — [backend/src/services/smsService.ts](backend/src/services/smsService.ts) via TextBee, with a **6/day quota per identity** enforced with Redis counters (`INCR` + `EXPIRE`).
- **Recovery codes** — 10 one-time codes issued at passkey setup, argon2id-hashed, ambiguous-character alphabet (`no 0/O/1/I`), `XXXX-XXXX` format, exported to a PDF.
- **Image challenge** — a "click-in-region" sequence the user *chooses* during onboarding and must reproduce under high risk; the sequence is stored server-side in Redis (single-use) and verified against bounding boxes with tolerance. It's a knowledge factor that's easier than a password but hard to phish.

Why this mix: a bank must never lock a legitimate user out (passkey lost → recovery codes) and must never let one factor alone decide (high-risk → step up). Each fallback has a different phishability/cost profile, which is exactly what layered security wants.

---

## 3. Data layer

### 3.1 PostgreSQL

- **What it is.** The world's most popular open-source relational database.
- **What it does here.** The single source of truth for everything durable: users, passkeys (public keys!), sessions, transactions, trusted devices, login history/audit trail, recovery-code hashes, OTPs, notification prefs, and the admin risk events.
- **Why we chose it.**
  - **We have real relational structure and integrity needs:** users ↔ credentials ↔ sessions ↔ transactions are all linked by foreign keys with `onDelete: Cascade`, unique constraints (`credentialId`, `userId_fingerprint`), and money as `Decimal(12,2)`. That's what a relational DB does best.
  - **Money needs correctness, not flexible shapes.** PostgreSQL's `DECIMAL` and transactions give exact, auditable amounts; a document store wouldn't.
  - **Free, mature, and everywhere** — works locally, in Docker, and on every free managed tier (Render Postgres, Neon, Aiven).
  - *Alternatives considered:* MySQL (equivalent features, weaker decimal/type story, licensing nuance) — no reason to prefer it; MongoDB/NoSQL — wrong fit for relational, integrity-critical banking data; SQLite — can't serve a multi-user API on Render.
  - **The row at risk:** the `Credential.publicKey Bytes` column is the whole security model — the *public* half of the passkey, which is the only thing we ever see.

### 3.2 Prisma ORM — `@prisma/client` + `prisma`

- **What it is.** A TypeScript-first ORM with a schema DSL, type-safe queries, and a migrations system.
- **What it does here.** `prisma/schema.prisma` is the **single source of truth** for the data model. Migrations are committed under `prisma/migrations/`. The client gives fully typed queries and `$transaction` for atomic operations (e.g. transfer + history write together).
- **Why we chose it.**
  - **Type safety across the whole stack.** The query result types are generated from the schema, so a typo'd field is a compile error — huge for a codebase where schema and controllers must stay in sync.
  - **Migrations are code-reviewed artifacts.** `migrate dev` locally, `migrate deploy` in CI/production — the deploy command is what Render runs in `preDeployCommand`.
  - **`$transaction`** is exactly what transfer confirmation needs (deduct + record + log atomically).
  - *Alternatives considered:* Drizzle (lighter, SQL-first — great, but Prisma's migrations + schema-as-source-of-truth fit a demo that needs to move fast and be legible); raw SQL (too error-prone across 15+ tables); TypeORM (mature but heavier DX, noisier).
  - *Tradeoff we accepted:* Prisma adds a client generation step, but `npm run db:generate` is a one-liner.

### 3.3 Redis — `ioredis` (with `ioredis-mock` for dev)

- **What it is.** An in-memory key-value store with TTLs, counters, and atomic operations.
- **What it does here.** Holds exactly the things that should **not** be in PostgreSQL — short-lived, security-critical, high-churn state:
  1. **WebAuthn challenges** (`webauthn:challenge:…`, 300s TTL, single-use `GET` + `DEL`) — the heart of the passkey flow.
  2. **QR cross-device grant tokens** (`qr:grant:…`, 300s).
  3. **Login-velocity counters** (`auth:velocity:<user>`, 10-min window, `INCR` + `EXPIRE`).
  4. **SMS daily-quota counters** (`sms:quota:…`, 48h) for the 6-per-day limit.
  5. **Image-challenge state** (single-use, 5-min TTL, attempts counter).
- **Why we chose it.** These are all "write a lot, read once, must expire, must be atomic" workloads:
  - **Native TTLs + atomic `INCR`/`GETDEL`** are exactly the primitives a challenge/rate-limit needs — doing them in SQL would be slower and more awkward.
  - **Speed.** Challenge verify happens on the hot path of every login; Redis is sub-millisecond and doesn't add load to Postgres.
  - **Memory, not durability, is the point.** We *want* challenges to vanish — Redis is a cache of transient secrets, PostgreSQL is the ledger.
  - **Dev ergonomics.** `REDIS_URL="memory://"` swaps in `ioredis-mock`, so a developer with zero Redis infrastructure can run the whole app (`dev.mjs` / Docker also provide real Redis).
  - *Alternatives considered:* PostgreSQL-only (works but bloats the DB with churn and needs manual cleanup); an in-process Map (loses state on restart, not atomic across processes); Memcached (no rich types, no Lua/INCR ergonomics). Redis is the obvious fit.
  - **Where it would NOT be used:** we deliberately do **not** store sessions in Redis — sessions need to be listed/revoked and survived restarts, which is a PostgreSQL job here.

---

## 4. Backend

### 4.1 Express 4 + TypeScript (strict, ESM)

- **Why.** Minimal, ubiquitous, and readable. For a demo whose value is the *auth logic*, a framework that stays out of the way and shows every route/middleware plainly is better than a batteries-included framework. TypeScript strict mode gives compile-time confidence across the security-critical paths. ESM (`"type": "module"`) matches modern tooling.
- *Alternatives considered:* Fastify (faster, schema-first — but Express is the default the ecosystem and Render docs assume); NestJS (too much structure for a demo); Hono (nice, but less familiar). Express 4 (not 5) because the middleware ecosystem is battle-tested and 5 is newer.

### 4.2 zod — validation

- **What it does here.** Every request body is parsed against a zod schema at the controller boundary (`registerInitiateSchema`, `loginVerifySchema`, …). Failures become consistent `400 { error, details }` responses via the error handler; nothing untrusted reaches the services.
- **Why we chose it.** Type-safe runtime validation that *also* produces the types (`z.infer`). On a demo that accepts emails, phones, and credential blobs from the internet, validation at the edge is non-negotiable — and zod is the standard, with great error flattening (`err.flatten()`).

### 4.3 Hardening middleware — `helmet`, `hpp`, `express-rate-limit`, `cors`

- **`helmet`** — sets secure HTTP headers (HSTS, CSP, X-Content-Type-Options, etc.) in one line.
- **`hpp`** — HTTP Parameter Pollution protection (rejects `?a=1&a=2` style attacks).
- **`express-rate-limit`** — a *layered* set of limiters: auth endpoints (30/15min), OTP/credential routes keyed **per IP × email** (5/15min), transfer (10/min), phone OTP (6/15min), and a generous status-polling limiter (90/15min).
- **`cors`** — strict allowlist derived from `WEBAUTHN_ORIGIN` + `CORS_ORIGINS`; only configured origins pass, plus any localhost port in dev.
- **Why.** A public auth API is the most-attacked surface there is. Each of these is a cheap, standard mitigation; the CORS allowlist especially matters because a passkey is bound to an origin — we must never let a random site drive the API.

### 4.4 Email — `nodemailer` (SMTP) + Resend HTTPS API

- **What it does here.** Delivers verification links, OTPs, transfer receipts, and security alerts with styled HTML templates.
- **Why two paths?** Local dev uses SMTP (`nodemailer`, logs to console when unconfigured). **Production on Render uses the Resend HTTPS API** — Render blocks outbound SMTP port 587/465, so port 443 is the only reliable path. The email service fails loudly when neither is configured (previous bug: silently sending nothing).
- **Why Resend.** Free tier, simple HTTPS API, custom-domain sending (the `updates.sciencegear.tech` domain is verified), and good deliverability without managing our own SMTP server.
- **Design detail:** OTPs are generated with `randomInt`, stored argon2-hashed, 10-min TTL, and echoed in responses only in dev.

### 4.5 SMS — TextBee

- **What it does here.** Delivers phone-verification and SMS sign-in codes.
- **Why TextBee.** It's a low-cost Indian SMS gateway with a dead-simple REST API, and this demo's phone verification is India-flavored (₹-denominated demo). When `TEXTBEE_API_KEY` is absent, codes log to the console so dev needs no SMS account. Quota is enforced in Redis (6/day) to prevent abuse-spend.

### 4.6 External lookups — Have I Been Pwned + ipapi.co

- **HIBP (k-anonymity).** At signup we check the email against breached-credential sets **without ever sending the full hash**: we send only the first 5 hex chars of the SHA-1 and match the suffix locally. Free, privacy-preserving, and a nice touch for a security demo. (`HIBP_API_KEY` is optional for this range API.)
- **ipapi.co.** Free-tier IP → city/country/lat/lon, used for the country-change and impossible-travel signals and for the admin risk map. It's best-effort and **never throws** — if geolocation fails, the risk engine just scores on the other signals.

### 4.7 QR generation — `qrcode`

- **What it does here.** Renders the cross-device login QR as a data URL pointing at `/login/approve?t=<token>`. A scanner must receive a *navigable URL*, not an app-specific blob, so the QR encodes a real https link.
- **Why.** Cross-device passkey onboarding is how real ecosystems handle "new device, no shared secret." The QR carries a random single-use token; a request secret must be presented by the polling browser, and approval requires a passkey gesture on the already-signed-in device.

---

## 5. Frontend

### 5.1 React 19

- **Why.** The standard UI library with the largest ecosystem; 19 brings concurrent rendering and better server components. The team's familiarity + ecosystem fit (TanStack, shadcn, Radix) made it the obvious call over Vue/Svelte/Solid.

### 5.2 TanStack Start + Router + Query

- **What it does here.** **Start** provides file-based routing + SSR (routes live in `frontend/src/routes/`). **Router** handles type-safe navigation. **Query** manages server state (dashboard, activity, security data) with caching and background refetch.
- **Why we chose it over Next.js.** TanStack Start is the file-based, Vite-native sibling of Next.js — full-stack React with SSR and a Nitro server, but:
  - **Type-safe routing out of the box** (route params, links, search params typed).
  - **Vite-based** — same tooling as the rest of the stack, no Next.js framework coupling.
  - **Renders to a Nitro server** that can target Vercel via the `vercel` preset — clean deploy.
- *Alternatives:* Next.js (the default, but its server model + config is heavier and we wanted to showcase TanStack's React-router-first approach); Remix (great, but TanStack Router's typing is the standout).

### 5.3 TypeScript strict

- **Why.** Same reason as the backend, but it pays off doubly at the frontend because TanStack Router + Query derive types (route params, query keys, API shapes) — see `frontend/src/lib/api.ts`, the **only** network boundary, which maps backend payloads into typed domain shapes.

### 5.4 Tailwind CSS 4 + shadcn/ui (Radix primitives) + `lucide-react` + `sonner`

- **Tailwind 4** — utility-first CSS with the new Vite plugin (`@tailwindcss/vite`), zero-config theming, small bundles.
- **shadcn/ui on Radix** — copy-in, own-the-code accessible components (dialogs, switches, labels, alert dialogs) rather than a heavyweight component library; styled with Tailwind and `class-variance-authority`.
- **lucide-react** — crisp, consistent icon set.
- **sonner** — toasts for auth outcomes ("Signed in", "Transfer approved").
- **Why.** Fast to build a polished, consistent, dark fintech UI; accessible primitives for free; no design-system lock-in (components are ours, editable).

### 5.5 `@simplewebauthn/browser` + `qrcode.react`

- `@simplewebauthn/browser` wraps `navigator.credentials.create/get` and marshals `PublicKeyCredential` into the JSON shapes the backend verifies.
- `qrcode.react` renders the cross-device login QR on the login screen.
- **Why.** Same rationale as the server library: protocol-correct, typed, maintained — don't hand-roll WebAuthn marshalling.

### 5.6 Leaflet (`leaflet` + `@types/leaflet`)

- **What it does here.** The admin risk map renders risky login events as lat/lon markers.
- **Why.** Free, no API key, lightweight enough to drop into one admin page. *Alternatives:* Mapbox/Google Maps (key + cost), deck.gl (overkill).

### 5.7 Bun + Vite + Nitro

- **Bun** — the frontend package manager (`bun.lock`) and a fast runtime; installs and runs scripts noticeably faster than npm.
- **Vite** — dev server (pinned to `:5173` so the WebAuthn origin always matches) and build tool.
- **Nitro** — the server engine TanStack Start builds on; configured with `preset: "vercel"` so `vite build` emits `.vercel/output` (Build Output API v3), which Vercel serves directly.

---

## 6. Tooling &amp; Infrastructure

| Tool | What it does here | Why |
|---|---|---|
| **tsx** | Runs TypeScript directly (`tsx watch` for dev, `node --import tsx` for tests) | No build step in dev; instant restart |
| **Node built-in test runner** | `riskEngine.test.ts` and future service tests | Zero-dependency, fast; good enough for unit tests (vitest/jest add weight) |
| **Husky** | Git hooks (runs lint/format checks on commit) | Enforces quality without a CI dependency locally |
| **ESLint + Prettier** | Lint + format both apps | Standard, preconfigured in both packages |
| **Docker Compose** | `db` (postgres:16), `redis` (redis:7), `api`, `web` | One command to a full local stack; healthchecks gate the API on `db`/`redis` |
| **Render** | Hosts the API via the `render.yaml` blueprint | Free tier; blueprint = infra-as-code; `preDeployCommand` runs Prisma migrations |
| **Vercel** | Hosts the web app (Nitro `vercel` preset → `.vercel/output`) | Free tier; first-class Nitro target; custom domain |
| **Upstash / managed Redis** | Production `REDIS_URL` | Serverless-friendly Redis free tier over `rediss://` |
| **`dev.mjs`** | Root launcher: boots a project-local PostgreSQL 17 (via `initdb`/`pg_ctl`) when pointed at localhost, validates a remote DB host, runs migrations, starts both apps | One command (`npm run dev`) for a Windows/Linux dev machine with zero manual DB setup |

---

## 7. Key security decisions &amp; the tradeoffs we accepted

| Decision | Why | Tradeoff |
|---|---|---|
| **No password anywhere** | Eliminates phishing/stuffing/reuse; the migration `remove_password_hash` proves it | Users lose a familiar fallback → we compensate with email/SMS/recovery/image fallbacks |
| **Challenges in Redis, single-use** | A replay of an old signed challenge fails because the token is `GET`+`DEL`'d | Redis is a dependency of the auth path; `memory://` dev store makes it painless locally |
| **Refresh tokens hashed in Postgres** | Sessions are revocable per-device — a real requirement for a bank | Slightly more DB work per refresh |
| **argon2id for OTPs/codes** | DB leaks can't be brute-forced | Hashing cost per verify (fine at demo scale) |
| **Risk signals are weighted, not absolute** | Adapts to context (allow / step-up / challenge / block) instead of binary | Risk engines are heuristic — hence full audit logging so decisions can be reviewed in `/admin` |
| **Email/SMS providers swap in dev** | Unconfigured providers log codes to the console; nothing blocks local dev | Production must set real keys, or email fails loudly (by design) |
| **Everything public-facing rate-limited** | Per-IP×email limiters + SMS quota stop abuse/credential-stuffing | Legit users can occasionally hit limits (generous budgets set) |

---

## 8. Quick reference — every dependency and why (one-liner)

### Backend (`backend/package.json`)
| Package | Role | Why |
|---|---|---|
| `express` | HTTP framework | Minimal, standard, transparent |
| `typescript` / `tsx` | Types + dev runner | Strict TS for a security-sensitive codebase |
| `zod` | Input validation | Typed runtime validation at the edge |
| `@prisma/client` + `prisma` | ORM + migrations | Type-safe queries, schema-as-source-of-truth |
| `@simplewebauthn/server` / `types` | WebAuthn verification | Correct, maintained protocol implementation |
| `ioredis` (+ `ioredis-mock`) | Redis client | Challenges/counters/quota with TTLs |
| `argon2` | KDF for secrets | Memory-hard, OWASP-recommended hashing |
| `jsonwebtoken` | Access/refresh/grant tokens | Stateless bearer auth, revocable via DB sessions |
| `nodemailer` | SMTP transport | Dev/local email; prod uses Resend HTTPS |
| `axios` | HTTP for HIBP + ipapi.co | Small, typed HTTP client |
| `qrcode` | QR data-URL generation | Cross-device login URLs |
| `helmet` / `hpp` / `express-rate-limit` / `cors` | Hardening | Cheap, standard attack mitigations |

### Frontend (`frontend/package.json`)
| Package | Role | Why |
|---|---|---|
| `react` / `react-dom` | UI | Standard, ecosystem-rich |
| `@tanstack/react-start` / `react-router` / `react-query` | Full-stack React + routing + data | Vite-native, type-safe, SSR |
| `tailwindcss` + `@tailwindcss/vite` | Styling | Fast, config-free utility CSS |
| `@radix-ui/*` | Accessible primitives | Headless, unstyled building blocks |
| `class-variance-authority` / `clsx` / `tailwind-merge` | Styling utilities | shadcn/ui component conventions |
| `@simplewebauthn/browser` | Client WebAuthn | Marshals credentials to JSON |
| `qrcode.react` | QR rendering | Login screen QR |
| `leaflet` | Admin risk map | Free, keyless, light |
| `lucide-react` | Icons | Consistent, tree-shakeable |
| `sonner` | Toasts | Clean feedback for auth flows |
| `vite` / `nitro` / `@lovable.dev/vite-tanstack-config` | Build + server | `vercel` preset → `.vercel/output` |

---

## 9. If we were doing it again

Nothing here was chosen blindly, but if we rebuilt today we'd consider three changes:

1. **A CI pipeline** running `typecheck` + `lint` + `test` on every PR — the roadmap's top item, since the repo is already hook-checked locally.
2. **WebAuthn conditional UI** (passkey autofill) — same protocol, much better UX on the login form.
3. **Opaque session tokens instead of JWT** for access tokens — we chose JWT for cross-origin simplicity, but at larger scale an in-Redis opaque token with an explicit allowlist is easier to invalidate instantly. The current design (short TTL + revocable refresh) is a solid middle ground.
