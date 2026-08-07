import { Router } from "express";
import {
  lookupIp,
  revokeUserSessions,
  securityOverview,
  userLookup,
} from "../controllers/adminController.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth, requireAdmin);
router.get("/security-overview", securityOverview);
router.get("/user", userLookup);
router.post("/user/:id/revoke-sessions", revokeUserSessions);
router.get("/ip/:ip", lookupIp);

export default router;
