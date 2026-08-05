import { Router } from "express";
import * as auth from "../controllers/authController.js";
import { requireAuth } from "../middleware/auth.js";
import { authLimiter } from "../middleware/security.js";

const router = Router();

// Registration
router.post("/register/options", authLimiter, auth.registerOptions);
router.post("/register/verify", authLimiter, auth.registerVerify);

// Authentication
router.post("/login/options", authLimiter, auth.loginOptions);
router.post("/login/verify", authLimiter, auth.loginVerify);

// Password fallback
router.post("/password/login", authLimiter, auth.passwordLogin);
router.post("/password/set", authLimiter, requireAuth, auth.setPassword);
router.post("/password/remove", authLimiter, requireAuth, auth.removePassword);

// QR cross-device login
router.post("/login/qr/create", authLimiter, auth.qrCreate);
router.get("/login/qr/status/:token", auth.qrStatus);
router.post("/login/qr/approve", requireAuth, auth.qrApprove);
router.post("/login/qr/exchange", authLimiter, auth.qrExchange);

// Step-up verification
router.post("/step-up/verify", authLimiter, auth.stepUpVerify);

// Session management
router.post("/refresh", authLimiter, auth.refresh);
router.post("/logout", auth.logout);
router.get("/me", requireAuth, auth.me);

export default router;
