# NovaBank — Passwordless Bank UI

A premium, frontend-only digital bank UI built with TanStack Start, React 19, Tailwind CSS 4, shadcn/ui-style components and lucide-react. Passwordless by design: sign-in runs on passkeys (Face ID / Touch ID) backed by a mock adaptive risk engine.

This is a **frontend-only** project — there is no backend. Every API call runs through a typed mock layer (`src/lib/api.ts`) backed by fixtures (`src/lib/mockData.ts`), so each flow is fully clickable end-to-end and a real backend can be wired in later without touching component code.

## Tech stack

- [TanStack Start](https://tanstack.com/start) (file-based routing) + TanStack Router + TanStack Query
- [React](https://react.dev) 19
- [Tailwind CSS](https://tailwindcss.com) 4
- [shadcn/ui](https://ui.shadcn.com)-style components in `src/components/ui`
- [lucide-react](https://lucide.dev) icons
- [sonner](https://sonner.emilkowal.ski) toasts

## Getting started

Requires Node.js and [Bun](https://bun.sh) (the project uses `bun.lock`).

```sh
bun install
bun run dev
```

Then open the URL printed by Vite (default `http://localhost:3000`).

## Scripts

| Command           | Description                       |
| ----------------- | --------------------------------- |
| `bun run dev`     | Start the dev server              |
| `bun run build`   | Production build                  |
| `bun run preview` | Preview the production build      |
| `bun run lint`    | Run ESLint                        |
| `bun run format`  | Format the codebase with Prettier |

## Project structure

```
src/
  components/
    nova/        # NovaBank-specific components (shell, primitives, rows, skeletons)
    ui/          # shadcn/ui base components
  hooks/         # Shared hooks
  lib/
    api.ts       # Typed API layer (mock now, real backend later)
    mockData.ts  # Fixture data for every API function
    session.ts   # Client-side session store
  routes/        # File-based routes (TanStack Start)
```

## Routes

- `/` — marketing home
- `/signup` — passkey registration flow
- `/login` — passkey sign-in (with `?risk=low|medium|high` to demo risk states)
- `/login/approve` — cross-device QR approval
- `/dashboard` — account summary, transactions, security snapshot
- `/transfer` — send money with step-up verification
- `/activity` — login & security history
- `/settings/security` — passkeys, recovery codes, trusted devices, notification prefs

## Connecting a real backend

All network access is isolated in `src/lib/api.ts`. Every function is marked with a `// TODO: replace mock with real fetch to ${BASE_URL}/...` comment showing the intended request/response shape. Set `VITE_API_BASE_URL` to point at your API; components never change.
