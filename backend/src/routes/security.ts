import { Router } from "express";
import * as security from "../controllers/securityController.js";
import { requireAuth, requireCompletedOnboarding } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);
router.use(requireCompletedOnboarding);

router.get("/activity", security.activity);
router.get("/snapshot", security.securitySnapshot);
router.get("/passkeys", security.listPasskeys);
router.post("/passkeys/register/options", security.addPasskeyOptions);
router.post("/passkeys/register/verify", security.addPasskeyVerify);
router.delete("/passkeys/:id", security.deletePasskey);
router.get("/recovery-codes", security.listRecoveryCodesStatus);
router.post("/recovery-codes/rotate", security.rotateRecoveryCodes);
router.get("/devices", security.listDevices);
router.delete("/devices/:id", security.revokeDevice);
router.get("/notification-prefs", security.getNotificationPrefs);
router.put("/notification-prefs", security.updateNotificationPrefs);
router.post("/sessions/:id/revoke", security.revokeSession);
router.post("/sessions/revoke-all", security.revokeAllSessions);

export default router;
