import { Router } from "express";
import {
  lookupIp,
  revokeUserSessions,
  securityOverview,
  userLookup,
  listUsers,
  deleteUser,
  deleteUserPasskey,
  sendUserResetEmail,
  clearUserRateLimits,
  systemStatus,
  scheduleUserDeletion,
  restoreUserAccount,
} from "../controllers/adminController.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth, requireAdmin);
router.get("/security-overview", securityOverview);
router.get("/system-status", systemStatus);
router.get("/user", userLookup);
router.get("/users", listUsers);
router.post("/user/:id/clear-rate-limits", clearUserRateLimits);
router.post("/user/:id/schedule-deletion", scheduleUserDeletion);
router.post("/user/:id/restore-account", restoreUserAccount);
router.delete("/user/:id", deleteUser);
router.delete("/user/:id/passkeys", deleteUserPasskey);
router.delete("/user/:id/passkeys/:passkeyId", deleteUserPasskey);
router.post("/user/:id/send-reset-email", sendUserResetEmail);
router.post("/user/:id/revoke-sessions", revokeUserSessions);
router.get("/ip/:ip", lookupIp);

export default router;
