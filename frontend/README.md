# NovaBank — Frontend

The passwordless banking UI. Built with TanStack Start, React 19, Tailwind CSS 4, shadcn/ui-style components, lucide-react and `@simplewebauthn/browser` for real WebAuthn passkeys.

All network access lives in `src/lib/api.ts`, which talks to the Express backend in `../backend` (see the root README). In dev, Vite proxies `/api` → `http://localhost:3001`.

## Tech stack

- [TanStack Start](https://tanstack.com/start) (file-based routing) + TanStack Router + TanStack Query
- [React](https://react.dev) 19
- [Tailwind CSS](https://tailwindcss.com) 4
- [shadcn/ui](https://ui.shadcn.com)-style components in `src/components/ui`
- [lucide-react](https://lucide.dev) icons
- [sonner](https://sonner.emilkowal.ski) toasts
- [@simplewebauthn/browser](https://github.com/MasterKale/SimpleWebAuthn) v12

## Getting started

Requires Node.js and [Bun](https://bun.sh) (the project uses `bun.lock`).

```sh
bun install
bun run dev
```

The dev server is pinned to `http://localhost:5173` (strict port) because the backend's WebAuthn origin must match exactly.

## Scripts

| Command            | Description                       |
| ------------------ | --------------------------------- |
| `bun run dev`      | Start the dev server on :5173     |
| `bun run build`    | Production build                  |
| `bun run preview`  | Preview the production build      |
| `bun run lint`     | Run ESLint                        |
| `bun run format`   | Format the codebase with Prettier |

## Project structure

```
src/
  components/
    nova/        # NovaBank-specific components (shell, primitives, rows, skeletons)
    ui/          # shadcn/ui base components
  lib/
    api.ts       # The ONLY place network access lives (token refresh, domain mapping)
    session.ts   # Access/refresh token store (localStorage + session events)
    fingerprint.ts # Device fingerprint + UA helpers for the risk engine
    keystroke.ts # Keystroke dwell-time capture for behavioural risk scoring
  routes/        # File-based routes (TanStack Start)
```

## Routes

- `/` — marketing home
- `/signup` — passkey registration flow (creates 10 one-time recovery codes)
- `/login` — passkey sign-in with adaptive step-up (OTP / re-confirm / block)
- `/login/approve` — cross-device QR approval
- `/dashboard` — account summary, transactions, security snapshot
- `/transfer` — send money; amounts ≥ ₹50,000 require an emailed OTP step-up
- `/activity` — login & transfer history with one-tap session revoke
- `/settings/security` — passkeys, recovery codes, devices, alerts
- `/accounts`, `/security`, `/about`, `/pricing` — supporting pages

## API layer

`src/lib/api.ts` is the single boundary with the backend:

- Attaches the access token, auto-refreshes once on 401, clears the session if refresh fails.
- Maps backend responses into the UI's domain shapes (minor-unit amounts, `formatINR`, etc.).
- Keystroke samples (`{ prev, curr, delta }[]`) and the device fingerprint are captured in the UI and sent with login/step-up calls.
