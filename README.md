<div align="center">

# 🏦 NovaBank (`nopass`)

### *Next-Generation Passwordless Banking with Adaptive Risk Intelligence & PCCP Authentication*

[![React](https://img.shields.io/badge/React-19-blue.svg?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg?logo=typescript)](https://www.typescriptlang.org/)
[![TanStack](https://img.shields.io/badge/TanStack-Start%20%26%20Router-ff4154.svg)](https://tanstack.com/)
[![Express](https://img.shields.io/badge/Express-4.21-000000.svg?logo=express)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15%2B-4169E1.svg?logo=postgresql)](https://www.postgresql.org/)
[![WebAuthn](https://img.shields.io/badge/WebAuthn-FIDO2-green.svg)](https://webauthn.io/)
[![License](https://img.shields.io/badge/License-MIT-brightgreen.svg)](LICENSE)

---

**NovaBank** is a passwordless digital banking demonstration platform that completely eliminates passwords. By pairing **WebAuthn FIDO2 Passkeys**, **Graphical Picture Click-Point Patterns (PCCP)**, **Stringee Voice/SMS Dual OTP Fallback**, and an **Adaptive Multi-Signal Risk Engine**, NovaBank delivers zero-friction biometric access while providing enterprise-grade fraud prevention.

[Features](#-key-features) • [Architecture](#-architecture) • [Tech Stack](#-tech-stack) • [Quick Start](#-quick-start) • [Environment Setup](#-environment-variables)

</div>

---

## ✨ Key Features

### 1. 🔑 Seamless Biometric Passkeys (WebAuthn / FIDO2)
- Zero-password authentication using hardware biometrics (**Windows Hello**, **Touch ID**, **Face ID**, or **YubiKeys**).
- Single-shot authentication optimized for instant platform credential verification.

### 2. 🎯 Picture Click-Point Pattern (PCCP) Authentication
- Primary fallback mechanism allowing users to authenticate by selecting 3 points across dynamic image sequences.
- **Chebyshev Quantized Grid**: Maps raw coordinates to 20×20 grid cells for cross-device screen resolution independence.
- **Timing Baseline Z-Score Analysis**: Monitors inter-click duration and velocity against device-class baselines to detect automated bot attacks.

### 3. 📞 Stringee Voice Callout & Dual OTP Verification
- Multi-channel verification combining **Email OTP** and **Mobile Phone OTP**.
- **Stringee Voice Callout Fallback**: Automatic voice callout fallback when SMS OTP delivery is delayed or unavailable.

### 4. 🛡️ Adaptive Multi-Signal Risk Engine
Real-time risk scoring engine that evaluates every sign-in attempt and financial transaction:
- **Impossible Travel & Geolocation Anomaly Detection**: Calculates velocity and country switches.
- **Keystroke Dynamics Analysis**: Evaluates typing rhythm against user historical profiles.
- **Paste & Behavioral Markers**: Flags automated form filling and credential pasting.
- **Transaction Amount Tiers**: Triggers progressive step-up challenges for high-value transfers.

### 5. 👑 Live Executive Admin Console
- **Real-Time Active Sessions**: Monitor active user sessions, device types, operating systems, and **unmasked real IP addresses**.
- **User Account Management**: Remove passkeys, manage security configurations, and trigger administrative rate-limit bypasses.
- **24-Hour Soft-Delete Recovery**: Allows administrators and users to recover accounts scheduled for deletion within a 24-hour grace window.

### 6. 📱 QR Cross-Device Sign-in
- Handoff active sessions between desktop browser and mobile device using short-lived encrypted Redis session tokens.

---

## 🏗️ Architecture

```mermaid
graph TD
    Client["React 19 / TanStack Client (Vite)"] -->|WebAuthn / Passkeys| API["Express 4 API Server"]
    Client -->|PCCP Click Patterns| API
    Client -->|Dual OTP & Voice Callout| API
    API -->|ORM & Persistence| Postgres[(PostgreSQL Database)]
    API -->|Session & Challenge State| Redis[(Redis / Memory Engine)]
    API -->|Voice Callout & SMS| Stringee[Stringee Telephony API]
```

---

## 🛠️ Tech Stack & Modules

| Domain | Technology / Library | Purpose |
| :--- | :--- | :--- |
| **Frontend Framework** | `React 19` + `TanStack Start` | SSR & CSR Hybrid Web Framework |
| **Routing & State** | `TanStack Router` + `TanStack Query` | Type-safe file routes & async data fetching |
| **Biometrics** | `@simplewebauthn/browser` | Client-side FIDO2 passkey registration & auth |
| **Styling & UI** | `Tailwind CSS` + `Lucide Icons` + `Sonner` | Modern dark glassmorphism design system & toasts |
| **Backend Runtime** | `Node.js` + `Express` + `TypeScript` | RESTful API backend server |
| **Database & ORM** | `PostgreSQL 15+` + `Prisma ORM` | Data persistence, schema migrations & relations |
| **Caching & Tokens** | `Redis` (or in-memory fallback) | Challenge tokens, rate limits & QR session states |
| **Passkey Verification**| `@simplewebauthn/server` | FIDO2 webauthn challenge generation & verification |
| **Voice & Telephony** | `Stringee API` + `jsonwebtoken` | Voice OTP callout generation & JWT token signing |
| **Security & Auth** | `jose` + `bcryptjs` + `helmet` + `cors` | Token verification, password hashing, and API security headers |

---

## ⚙️ Environment Variables

Create a `backend/.env` file based on `backend/.env.example`:

```env
# Server
PORT=3001
NODE_ENV=development

# Database & Storage
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/novabank"
REDIS_URL="memory://"

# JWT Secrets
JWT_SECRET="your-unique-jwt-access-secret"
JWT_REFRESH_SECRET="your-unique-jwt-refresh-secret"

# WebAuthn Configuration
WEBAUTHN_RP_ID="localhost"
WEBAUTHN_ORIGIN="http://localhost:5173"

# Telephony (Stringee)
STRINGEE_API_SID="SK.2.wzdW2yR9gbsS58gDHBWvTo8ebaGSOfRZ"
STRINGEE_API_SECRET="VEpvY0RBWFdxRnR3S1BLUXVjeU53eWY2MWpqZmsxSkk="

# Admin Access
ADMIN_EMAILS="admin@novabank.com"
```

---

## 🚀 Quick Start

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/ScienceGear/nopass.git
cd nopass
npm install
npm --prefix backend install
npm --prefix frontend install
```

### 2. Database Migration
```bash
npm --prefix backend run db:migrate
```

### 3. Run Development Servers
```bash
npm run dev
```
- **Web Interface**: `http://localhost:5173`
- **Backend API**: `http://localhost:3001`
- **Health Check**: `http://localhost:3001/api/health`

---

## 🧪 Testing & Validation

```bash
# Run backend unit tests
npm --prefix backend run test

# Run frontend & backend typechecks
npm --prefix frontend run typecheck
npm --prefix backend run typecheck

# Production build test
npm --prefix frontend run build
```

---

<div align="center">

Built for **Hackathons & Modern Security Innovation** by the NovaBank Team.

</div>
