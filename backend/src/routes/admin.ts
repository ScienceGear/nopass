import { Router } from "express";
import { securityOverview } from "../controllers/adminController.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth, requireAdmin);
router.get("/security-overview", securityOverview);

export default router;
