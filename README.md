# NovaBank

A full-stack demo of passwordless banking. Passkeys (WebAuthn) replace passwords, a live risk engine scores every sign-in and transfer, and large transactions require an adaptive step-up.

```
nopass/
  backend/   Express + TypeScript + Prisma + PostgreSQL + Redis + WebAuthn (port 3001)
  frontend/  TanStack Start + React 19 + Tailwind 4 (port 5173, proxies /api → 3001)
```

## Features

- **Passkeys, not passwords** — register and sign in with Face ID / Touch ID via WebAuthn. The private key never leaves the device; the backend only stores the public key.
- **Adaptive risk engine** — every session is scored from device, IP/location, keystroke timing, login velocity and hour-of-day signals. Low risk sails through, medium triggers a step-up (email OTP or a fresh passkey confirmation), high is blocked.
- **Transfer step-up** — amounts ≥ ₹50,000 require an emailed OTP. On the Ethereal dev mailer the OTP is shown in the UI.
- **Cross-device sign-in** — generate a QR code, approve it with your phone's passkey, and the desktop session is issued via a short-lived grant token.
- **Session control** — full activity history with risk scores, one-tap session revoke, passkey management, 10 one-time recovery codes, trusted devices.
- **Behavioural biometrics** — keystroke dwell-time profiles are built per user and used to flag impostors.

## Stack

| Layer    | Tech |
| -------- | ---- |
| Backend  | Express 4, TypeScript, Prisma 6, PostgreSQL, Redis (ioredis), WebAuthn (`@simplewebauthn/server` 11), argon2, zod, nodemailer (Ethereal), helmet, express-rate-limit |
| Frontend | TanStack Start, React 19, Tailwind CSS 4, TanStack Query, `@simplewebauthn/browser` 12, sonner, lucide-react |

## Running it locally

Prereqs: Node 20+, [Bun](https://bun.sh), PostgreSQL on `localhost:5432` (database `novabank`), Redis on `localhost:6379`.

1. **Backend**

   ```sh
   cd backend
   cp .env.example .env          # fill in DATABASE_URL, JWT secrets, Ethereal creds
   npm install
   npx prisma migrate deploy
   npm run dev                   # http://localhost:3001  (health: /api/health)
   ```

2. **Frontend**

   ```sh
   cd frontend
   bun install
   bun run dev                   # http://localhost:5173
   ```

3. Open `http://localhost:5173/signup` and register a passkey. After registering you'll see your 10 one-time recovery codes. Optional: `npm run db:seed` (in `backend/`) fills the account with sample transactions and login history.

> In dev, email OTPs are delivered via Ethereal and also shown directly in the UI, so no mail client is needed.

## Docker

A `docker-compose.yml` at the repo root brings up Postgres, Redis, the API and the frontend. See `backend/.env.example` for the values to set.

## Docs

- `backend/README.md` — API, endpoints, architecture
- `frontend/README.md` — UI structure and routes
- `backend/.env.example` — every environment variable with a note on how to fill it

## Verification

The repo has been exercised end-to-end with a real browser (Playwright + Chrome virtual authenticator):

- Signup → passkey creation → recovery codes → dashboard (live balance)
- Logout → passkey login (risk engine allows the trusted device)
- ₹60,000 transfer → OTP step-up → confirmed

## Notes

- This is a **demo**, not a licensed bank. No real money or credentials.
- WebAuthn requires a secure context; `localhost` is treated as secure, so passkeys work locally without HTTPS. In production set `WEBAUTHN_ORIGIN` to your real origin.
