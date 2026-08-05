# Security Policy

NovaBank is a demonstration banking app. This policy covers both the app and
its backend services.

## Reporting a vulnerability

Please do **not** open a public issue for security problems. Instead, email
`security@novabank.local` with as much of the following as you can:

- What you found and how to reproduce it (steps, requests, screenshots).
- Which component is affected (frontend, backend, webauthn, email, risk engine).
- Whether the issue is public (e.g. a CVE) or private.

You should receive an acknowledgement within 48 hours. We will triage the
report, keep you updated on the fix, and credit you (if you want) once it
lands.

## Supported versions

| Version | Status          |
| ------- | --------------- |
| `main`  | Actively supported |
| Older tags | Best effort, no guarantees |

## Scope

We care about the security of:

- Authentication and session handling (WebAuthn/passkeys, OTP, recovery codes).
- The risk engine's decision boundaries and signals.
- PII handling and audit logging.

Out of scope for this demonstration project: load testing, performance, and
issues in third-party dependencies that already have a published fix.

## Safe harbour

We will not pursue legal action against researchers who:

- Test against the app running in a local development environment.
- Avoid production data, and don't exfiltrate or destroy data.
- Stop once they have proof of the issue and don't test unrelated targets.

## Disclosure

We prefer coordinated disclosure. Please give us time to fix and roll out a
fix before publishing details.
