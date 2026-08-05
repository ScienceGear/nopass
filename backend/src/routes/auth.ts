import { Router } from "express";
import * as auth from "../controllers/authController.js";
import { requireAuth, optionalAuth } from "../middleware/auth.js";
import { authLimiter, otpLimiter } from "../middleware/security.js";

const router = Router();

// Registration (email-verified gate)
router.post("/register/initiate", authLimiter, auth.registerInitiate);
router.post("/register/verify-email", otpLimiter, auth.verifyEmail);
router.post("/register/status", authLimiter, auth.registerStatus);
router.post("/register/options", authLimiter, auth.registerOptions);
router.post("/register/verify", authLimiter, auth.registerVerify);

// Authentication
router.post("/login/options", authLimiter, auth.loginOptions);
router.post("/login/verify", authLimiter, auth.loginVerify);

// Password fallback
router.post("/password/login", otpLimiter, auth.passwordLogin);
router.post("/password/set", authLimiter, requireAuth, auth.setPassword);
router.post("/password/remove", authLimiter, requireAuth, auth.removePassword);

// Image-sequence step-up
router.post("/image-challenge/setup", authLimiter, optionalAuth, auth.setupImageChallenge);
router.post("/image-challenge/verify", authLimiter, auth.verifyImageChallengeRoute);

// QR cross-device login
router.post("/login/qr/create", authLimiter, auth.qrCreate);
router.get("/login/qr/status/:token", auth.qrStatus);
router.post("/login/qr/approve", requireAuth, auth.qrApprove);
router.post("/login/qr/exchange", authLimiter, auth.qrExchange);

// Step-up verification
router.post("/step-up/verify", otpLimiter, auth.stepUpVerify);

// Session management
router.post("/refresh", authLimiter, auth.refresh);
router.post("/logout", auth.logout);
router.get("/me", requireAuth, auth.me);

export default router;
