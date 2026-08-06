# NovaBank / `nopass` Agent Guide

## Purpose

NovaBank is a passwordless banking demo. It combines a React/TanStack Start web app with an Express API, PostgreSQL persistence, Redis-backed short-lived state, WebAuthn passkeys, adaptive login risk scoring, email verification, QR cross-device sign-in, and account/security flows. It is a demo—not a production banking system.

## Repository layout

```text
./
├── frontend/          React 19 + TanStack Start + Vite UI
├── backend/           Express API, Prisma schema/migrations, WebAuthn services
├── dev.mjs            Root development launcher
├── docker-compose.yml Containerized Postgres, Redis, API, and web stack
├── README.md          Product and API documentation
└── SECURITY.md        Security reporting guidance
```

### Frontend

- `frontend/src/routes/`: file-based routes. `__root.tsx` is the application shell.
- `frontend/src/lib/api.ts`: the sole frontend API client; keep browser network access here.
- `frontend/src/components/`: shared UI components. `components/nova/` holds NovaBank-specific presentation components.
- `frontend/vite.config.ts`: serves on port `5173` and proxies `/api` to port `3001` by default.
- The frontend uses React Query, Tailwind CSS, Radix primitives, and Lucide icons.

### Backend

- `backend/src/index.ts`: Express setup, CORS/security middleware, `/api/health`, and API-route mounting.
- `backend/src/routes/`: route definitions grouped by `auth`, `account`, `security`, and `user`.
- `backend/src/controllers/`: HTTP request handlers.
- `backend/src/services/`: domain logic, including WebAuthn and risk scoring. Unit tests live here as `*.test.ts`.
- `backend/src/config/`: environment validation, Prisma, and Redis configuration.
- `backend/prisma/schema.prisma`: PostgreSQL data model; treat it as the source of truth for persisted entities.
- `backend/prisma/migrations/`: committed Prisma migrations. Never edit an already-applied migration; create a new one.

## Local development

### Prerequisites

- Node.js and npm
- A reachable PostgreSQL database (PostgreSQL 15+)
- `backend/.env`, copied from `backend/.env.example`

Install dependencies for all three packages after a fresh clone:

```powershell
npm install
npm --prefix backend install
npm --prefix frontend install
```

Set `DATABASE_URL` in `backend/.env` to a working database connection string. Do not commit this file or put credentials in source code. `REDIS_URL="memory://"` uses the development-only in-process Redis replacement; use a real `redis://...` URL for shared or production environments.

Start both applications from the repository root:

```powershell
npm run dev
```

`dev.mjs` runs pending Prisma migrations, then starts the API and web app. For a localhost database it can initialize/start a project-local PostgreSQL 17 cluster on port `5432`; for a remote URL it validates DNS and uses that database directly. The app addresses are:

- Web: `http://localhost:5173`
- API: `http://localhost:3001`
- Health: `http://localhost:3001/api/health`

If `/api/*` requests return `502`, Vite is running but the API is unavailable. Check the root terminal, then test `/api/health`. A remote database hostname must resolve and accept the configured credentials before the API can start.

### Docker option

`docker-compose.yml` provides an alternative full container stack: `db` (PostgreSQL), `redis`, `api`, and `web`. It expects Docker Desktop and uses container-specific hostnames (`db` and `redis`). Do not mix its container connection values into normal host-mode development.

## Commands

```powershell
# Root
npm run dev
npm test
npm run lint
npm run typecheck

# Backend
npm --prefix backend run dev
npm --prefix backend run db:generate
npm --prefix backend run db:migrate    # create/apply development migrations
npm --prefix backend run db:deploy     # apply committed migrations only
npm --prefix backend run db:seed
npm --prefix backend run test
npm --prefix backend run typecheck

# Frontend
npm --prefix frontend run dev
npm --prefix frontend run build
npm --prefix frontend run lint
npm --prefix frontend run typecheck
```

Run the narrowest useful validation after a change. For example, run frontend typecheck for a route/component update, backend typecheck and relevant service tests for API changes, and `db:deploy` only against a safe database when migration behavior must be checked.

## Environment and security rules

- `backend/.env` is ignored by Git. Keep all credentials there.
- `DATABASE_URL`, `JWT_SECRET`, and `JWT_REFRESH_SECRET` are required. Production must use strong unique JWT secrets.
- `WEBAUTHN_RP_ID` and `WEBAUTHN_ORIGIN` must exactly match the browser origin. Local defaults are `localhost` and `http://localhost:5173`.
- Keep `CORS_ORIGINS` explicit in production.
- Do not log access tokens, refresh tokens, recovery codes, passkey challenges, database URLs, or email/SMTP credentials.
- `memory://` Redis is for local development only; it loses all challenge/session state on API restart and is not shared across processes.

## API map

All routes are mounted below `/api`:

- `/health`: database and Redis health.
- `/auth`: registration, email verification, WebAuthn registration/login, password fallback, image challenge, QR login, refresh, logout, and current-user endpoints.
- `/account`: summary, transactions, transfer creation, and transfer confirmation.
- `/security`: login activity, passkeys, recovery codes, trusted devices, and session revocation.
- `/user`: profile retrieval and updates.

Refer to `README.md` and the route files for payload contracts before changing an endpoint.

## Change guidelines

- Preserve the frontend API boundary: add or change API calls in `frontend/src/lib/api.ts`, not directly in route components.
- Validate untrusted backend input and return consistent API errors.
- Add a Prisma migration for schema changes, then regenerate Prisma client if required.
- Keep authentication, risk, and WebAuthn changes conservative; they are security-sensitive and often have client/server coupling.
- Avoid rendering empty image `src` attributes. Use `null`/conditional rendering or a non-image placeholder instead.
- Hydration warnings that include browser-extension attributes (for example Grammarly) are client-environment noise; reproduce with extensions disabled before changing SSR code.
- Preserve existing user changes in a dirty working tree. Do not reset or overwrite environment files unless explicitly asked.
