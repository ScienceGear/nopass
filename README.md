# NovaBank
> Passwordless banking, end to end — no passwords, anywhere, ever.

## Overview / About
NovaBank is a full-stack demonstration of a passwordless digital bank. It exists to show that a complete passwordless flow can be built from the ground up, moving beyond simple login screens to encompass registration, sign-in, recovery, and step-up authentication using WebAuthn passkeys (Face ID, Touch ID, or security keys). 

This project is for developers, security professionals, and product managers interested in modern authentication flows, adaptive risk scoring (behavioral biometrics like keystroke dynamics, IP/geolocation changes), and WebAuthn integrations. It solves the ubiquitous problem of credential vulnerability (phishing, password reuse, credential stuffing) by structurally eliminating shared secrets.

## Features
- **Passkey-Native Authentication:** No fallback passwords. Registration, login, and recovery are entirely passkey-based.
- **Cross-Device Login:** Support for signing into new devices by scanning a QR code and approving from an authenticated device.
- **Adaptive Risk Engine:** Every sign-in request is scored across multiple signals (new device, new IP, country changes, keystroke-pattern anomalies, login velocity, unusual hours). The engine maps the score to an action: Allow, Step-up (email/SMS OTP, 2nd passkey), or Block.
- **Banking Functionality:** A realistic banking surface covering account summaries, transaction histories, and money transfers that require step-up verification for large amounts.
- **Security Center:** Manage active sessions (revoke individual or all), trusted devices, recovery codes, and passkeys in one place.
- **Breach Checking:** Automatic k-anonymity checks against the Have I Been Pwned API during registration.

## Tech Stack
**Frontend:**
- **Framework:** React 19, [TanStack Start](https://tanstack.com/start) (TanStack Router & Query)
- **Styling:** Tailwind CSS v4, shadcn/ui-style components (Radix primitives), Lucide React
- **WebAuthn:** `@simplewebauthn/browser` for passkey ceremonies
- **Package Manager:** Bun

**Backend:**
- **Framework:** Node.js, Express 4, TypeScript
- **Database / ORM:** PostgreSQL 15+, Prisma ORM
- **In-Memory Store:** Redis (for short-lived state like WebAuthn challenges, transfer tokens, login velocity)
- **WebAuthn:** `@simplewebauthn/server` for passkey verification
- **Security & Crypto:** argon2 (hashing), jsonwebtoken (auth), helmet, hpp, express-rate-limit

## Project Structure
```text
novabank/
├── backend/               # Express API and core logic
│   ├── prisma/            # PostgreSQL schema (schema.prisma) and migrations
│   └── src/
│       ├── config/        # Environment, DB, and Redis configurations
│       ├── controllers/   # Request/response shaping (auth, account, security, user)
│       ├── middleware/    # Auth guards, rate limiters, error handling
│       ├── routes/        # API route definitions
│       ├── services/      # Domain logic (webauthn, riskEngine, keystroke, qr, email, etc.)
│       └── utils/         # Crypto helpers, geo tracking, zod validators
├── frontend/              # TanStack Start web application
│   └── src/
│       ├── components/    # UI components (shadcn base and NovaBank specifics)
│       ├── lib/           # API client (network boundary), session store, keystroke capture
│       └── routes/        # File-based routes for pages (signup, login, dashboard, transfer, etc.)
├── dev.mjs                # Root launcher script for local dev (starts DB, API, and Web)
└── docker-compose.yml     # Containerized dev stack for PostgreSQL and Redis
```

## Prerequisites
- **Node.js** (v20+ recommended)
- **Bun** (required for frontend package management)
- **PostgreSQL 15+** (locally installed, or via Docker)
- **Redis** (locally installed, or via Docker)

## Installation & Setup
1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/novabank.git
   cd novabank
   ```

2. **Install all dependencies:**
   ```bash
   npm install
   npm run --prefix backend install
   npm run --prefix frontend install
   ```

3. **Configure Environment Variables:**
   Copy the example config in the backend and fill in missing credentials.
   ```bash
   cd backend
   cp .env.example .env
   ```

4. **Initialize the Database:**
   ```bash
   npm run db:generate
   npm run db:migrate
   ```

5. **Start the Application:**
   From the repository root, start everything with the orchestrator script:
   ```bash
   npm run dev
   ```
   *This starts the API on `http://localhost:3001` and the Frontend on `http://localhost:5173`.*

## Environment Variables
The backend requires configuration through `backend/.env`. Below is a template:

```env
# Database connection (PostgreSQL)
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/novabank?schema=public"

# Redis connection (use memory:// for local dev or a real URL for production)
REDIS_URL="memory://"

# API Port
PORT=3001

# JWT Signing secrets (Use 256-bit random strings)
JWT_SECRET="your-access-token-secret"
JWT_REFRESH_SECRET="your-refresh-token-secret"

# WebAuthn Configuration
WEBAUTHN_RP_NAME="NovaBank"
WEBAUTHN_RP_ID="localhost"
WEBAUTHN_ORIGIN="http://localhost:5173"
CORS_ORIGINS=""

# SMTP (e.g., Resend) for OTP and Alerts. Leave EMAIL_PASS empty in dev to console.log instead.
EMAIL_HOST="smtp.resend.com"
EMAIL_PORT=587
EMAIL_USER="resend"
EMAIL_PASS=""
EMAIL_FROM_NAME="NovaBank Security"
EMAIL_FROM_ADDRESS="noreply@updates.yourdomain.tech"

# TextBee SMS Gateway (Optional)
# TEXTBEE_API_KEY=""
# TEXTBEE_DEVICE_ID=""
# TEXTBEE_BASE_URL="https://api.textbee.dev/api/v1"

# Have I Been Pwned API Key (Optional)
HIBP_API_KEY=""

# Admin emails permitted to access /admin routes
ADMIN_EMAILS="admin@example.com"

# Execution Environment
NODE_ENV="development"
```

## Usage
To access the application:
1. Open your browser and navigate to `http://localhost:5173`.
2. **Sign Up:** Go to `/signup` and create an account by generating a WebAuthn passkey.
3. **Dashboard:** You will be taken to your dashboard, showing a 0 balance and transaction history.
4. **Seed Data:** To test realistic scenarios, you can optionally run `npm run db:seed` in the `backend/` directory after your first signup to generate mock transfers and a login history.
5. **Transfers:** Try initiating a money transfer from the `/transfer` page.
6. **Cross-Device:** Open the app on your phone, click "Login via QR", and scan it from the authenticated browser on your desktop to seamlessly log in.

> *![Dashboard screenshot placeholder](docs/screenshots/dashboard.png)*
> *![Login screenshot placeholder](docs/screenshots/login.png)*

## API Reference
The backend exposes a REST API at `/api`. Protected routes require a `Bearer` token.

**Auth endpoints (`/api/auth`)**
- `POST /register/options` & `/register/verify`: Passkey registration ceremony.
- `POST /login/options` & `/login/verify`: Passkey sign-in. Can return `stepUpRequired`.
- `POST /login/qr/create` & `/login/qr/approve`: Cross-device QR login initiation and approval.
- `POST /step-up/verify`: Complete a step-up challenge (OTP or Passkey).
- `POST /refresh`: Refresh access token.
- `GET /me`: Get current authenticated user context.

**Account endpoints (`/api/account`)**
- `GET /summary`: Fetch balance and quick stats.
- `GET /transactions`: Paginated list of transactions.
- `POST /transfer`: Initiate a money transfer.
- `POST /transfer/confirm`: Complete a transfer requiring step-up validation.

**Security endpoints (`/api/security`)**
- `GET /activity`: Security logs and sign-in attempts.
- `GET /passkeys`: List registered passkeys.
- `DELETE /passkeys/:id`: Revoke a specific passkey.
- `POST /recovery-codes/rotate`: Rotate all active recovery codes.
- `POST /sessions/:id/revoke`: Terminate a specific session.

## Testing
To run the automated backend test suite (unit and service-level tests):
```bash
# Backend tests
cd backend
npm run test

# Type checking across both apps
npm run typecheck
```
*Frontend UI tests are currently part of the roadmap.*

## Roadmap / Future Improvements
- [ ] Add automated frontend testing and continuous integration (CI) pipeline.
- [ ] Implement WebAuthn Conditional UI (Passkey Autofill) for seamless login experiences.
- [ ] Build a React Native mobile client utilizing platform-native passkeys.
- [ ] Add real-time transaction and security notifications (via WebSockets/SSE).
- [ ] Build a risk-analyst admin view for reviewing anomalous or blocked sign-in attempts.
- [ ] Conduct a full WCAG 2.1 AA accessibility audit.
- [ ] Add Dockerized `docker-compose` setup mapping for both the apps alongside dependencies.

## Contributing
Contributions are welcome! Please follow these guidelines:
1. Fork the repository and create your feature branch: `git checkout -b feature/my-new-feature`
2. Commit your changes: `git commit -am 'Add some feature'`
3. Push to the branch: `git push origin feature/my-new-feature`
4. Submit a pull request.
Ensure that you run `npm run lint` and `npm run typecheck` before submitting to maintain code quality.

## License
No license file is currently included in this repository. All rights reserved by default unless the maintainer adds one. *(Placeholder, replace with actual license if desired).*
