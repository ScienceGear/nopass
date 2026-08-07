# NovaBank Backend

Express + TypeScript API for the passwordless banking demo. Talks to PostgreSQL (via Prisma), Redis (ioredis) and implements WebAuthn server-side with `@simplewebauthn/server`.

## Stack

- **Express 4** + TypeScript (strict), zod validation, helmet, hpp, express-rate-limit
- **Prisma 6** + PostgreSQL  schema in `prisma/schema.prisma`
- **Redis**  WebAuthn challenges, QR grants, transfer tokens, login-velocity counters
- **WebAuthn**  `@simplewebauthn/server` 11 (attestation `none`, platform authenticators)
- **argon2**  recovery-code hashes, OTP hashes
- **nodemailer**  Ethereal (dev) mailer for OTPs and security alerts
- **ipapi.co**  IP → city/country geolocation (best-effort; failures are non-fatal)

## Getting started

```sh
cp .env.example .env   # DATABASE_URL, JWT secrets, Ethereal SMTP creds, etc.
npm install
npx prisma migrate deploy
npm run dev            # tsx watch, http://localhost:3001
```

Health check: `GET /api/health` → `{ status, database, redis, uptime }`.

Seed a registered account with sample transactions and login history:

```sh
npm run db:seed        # after registering a passkey in the UI
```

## Architecture

```
src/
  config/        env.ts (zod-validated), db.ts (Prisma client), redis.ts (ioredis)
  controllers/   auth, account, security, user  request/response shaping
  middleware/    errorHandler, auth (requireAuth/optionalAuth), security (rate limits)
  services/      webauthn, riskEngine, keystroke, email, hibp, qr, device
  utils/         crypto (argon2 + JWT), geo, logger, validators (zod)
  routes/        auth, account, security, user
  index.ts       app wiring + /api/health + 404 + error middleware
```

## Endpoints

### Auth  `/api/auth`
| Method | Path | Notes |
| --- | --- | --- |
| POST | `/register/options` | `{ name, email }` → WebAuthn creation options (challenge in Redis, TTL 300s) |
| POST | `/register/verify` | `{ name, email, credential }` → creates user + credential + 10 recovery codes, returns tokens + codes |
| POST | `/login/options` | `{ email }` → 404 if no account; assertion options |
| POST | `/login/verify` | `{ email, credential, keystrokes, deviceFingerprint, deviceInfo }` → allow / step_up_email / step_up_passkey / block with risk score |
| POST | `/step-up/verify` | `{ method: otp_email\|passkey\|recovery_code, ... }` → tokens |
| POST | `/login/qr/create` | (auth) → QR token + data-URL image |
| GET  | `/login/qr/status/:token` | pending / approved / denied / expired (+ grant token when approved) |
| POST | `/login/qr/approve` | (auth) `{ token, decision, deviceInfo }` → approves/denies |
| POST | `/login/qr/exchange` | `{ grantToken, deviceFingerprint, deviceInfo, keystrokes }` → tokens |
| POST | `/refresh` | rotates refresh token |
| POST | `/logout` | revokes the refresh token (stored as SHA-256) |
| GET  | `/me` | current user |

### Account  `/api/account`
| Method | Path | Notes |
| --- | --- | --- |
| POST | `/summary` | balance, recent transactions, stats |
| POST | `/transactions` | paginated list |
| POST | `/transfer` | `{ recipient, amount (₹), note }`; amount ≥ ₹50,000 → OTP step-up (transfer token in Redis, TTL 15min) |
| POST | `/transfer/confirm` | `{ transferToken, otp }` → executes inside a `$transaction` |

### Security  `/api/security`
| Method | Path | Notes |
| --- | --- | --- |
| POST | `/activity` | merged login + transfer events, newest first |
| POST | `/passkeys` | list (cannot delete the last one) |
| POST | `/passkeys/register/options` | additional-passkey registration options |
| POST | `/passkeys/register/verify` | verify + store a new credential |
| DELETE | `/passkeys/:id` | revoke a passkey |
| POST | `/recovery-codes` | status (`remaining`, `total`, `lastGeneratedAt`) |
| POST | `/recovery-codes/rotate` | invalidate old + issue 10 new plaintext codes |
| POST | `/devices` / DELETE `/devices/:id` | trusted devices |
| POST | `/sessions/:id/revoke` / `/sessions/revoke-all` | revoke sessions |

### User  `/api/user`
| Method | Path | Notes |
| --- | --- | --- |
| POST | `/profile` / PATCH `/profile` | read / update profile |

## Risk engine

Weights (`riskEngine.ts`): new device 30, new IP 20, country change 20, keystroke anomaly > 0.55 → 20, login velocity 15, unusual hour 10.

- Score > 60 → **block** (403 + alert email)
- Score > 30 → **step-up** (email OTP, or a fresh passkey prompt)
- Otherwise → **allow**

Keystroke profiles (`keystrokeService.ts`) are per-transition dwell-time distributions (`prev-curr` char-code keys); a new sample scores an anomaly based on z > 2.5 per transition. Trusted devices are upserted on every successful login.

## Notes

- `.env.example` documents every variable; `WEBAUTHN_ORIGIN` must exactly match the frontend origin (dev: `http://localhost:5173`).
- `npm audit` reports high-severity advisories in transitive deps of this demo scaffold  acceptable for a non-production demo.
