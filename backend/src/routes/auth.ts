import { Router } from "express";
import * as auth from "../controllers/authController.js";
import { requireAuth, optionalAuth } from "../middleware/auth.js";
import { authLimiter, otpLimiter, phoneOtpLimiter, statusLimiter } from "../middleware/security.js";

const router = Router();

// Registration (email-verified gate)
router.post("/register/initiate", authLimiter, auth.registerInitiate);
router.post("/register/verify-email", otpLimiter, auth.verifyEmail);
router.post("/register/status", statusLimiter, auth.registerStatus);
router.post("/register/options", authLimiter, requireAuth, auth.registerOptions);
router.post("/register/verify", authLimiter, requireAuth, auth.registerVerify);

// Authenticated, strictly ordered onboarding after email verification.
router.get("/onboarding/status", requireAuth, auth.onboardingStatus);
router.post("/onboarding/passkey/options", authLimiter, requireAuth, auth.onboardingPasskeyOptions);
router.post("/onboarding/passkey/verify", authLimiter, requireAuth, auth.onboardingPasskeyVerify);
router.get("/onboarding/image-challenge/pool", requireAuth, auth.onboardingImagePool);
router.post("/onboarding/image-challenge/setup", authLimiter, requireAuth, auth.onboardingImageSetup);

// Authentication
router.post("/login/options", authLimiter, auth.loginOptions);
router.post("/login/verify", authLimiter, auth.loginVerify);

// Passwordless email (magic-link) + recovery-code login
router.post("/login/email-otp", otpLimiter, auth.requestEmailLogin);
router.post("/login/email-otp/verify", otpLimiter, auth.verifyEmailLogin);
router.post("/login/recovery-code", otpLimiter, auth.recoverLogin);

// Phone (SMS) OTP — signup verification, phone change, step-up, recovery
router.post("/phone-otp/request", phoneOtpLimiter, optionalAuth, auth.requestPhoneOtp);
router.post("/phone-otp/verify", phoneOtpLimiter, optionalAuth, auth.verifyPhoneOtpRoute);
router.post("/login/phone-otp", phoneOtpLimiter, auth.requestPhoneLogin);
router.post("/login/phone-otp/verify", phoneOtpLimiter, auth.verifyPhoneLogin);

// Image-sequence step-up
router.post("/image-challenge/setup", authLimiter, optionalAuth, auth.setupImageChallenge);
router.post("/image-challenge/verify", authLimiter, auth.verifyImageChallengeRoute);

// QR cross-device login
router.post("/login/qr/create", authLimiter, auth.qrCreate);
router.get("/login/qr/status/:token", auth.qrStatus);
router.post("/login/qr/approve/options", authLimiter, requireAuth, auth.qrApproveOptions);
router.post("/login/qr/approve", requireAuth, auth.qrApprove);
router.post("/login/qr/exchange", authLimiter, auth.qrExchange);

// Step-up verification
router.post("/step-up/verify", otpLimiter, auth.stepUpVerify);

// Session management
router.post("/refresh", authLimiter, auth.refresh);
router.post("/logout", auth.logout);
router.get("/me", requireAuth, auth.me);

export default router;
