import { Router } from "express";
import * as user from "../controllers/userController.js";
import { requireAuth, requireCompletedOnboarding } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);
router.use(requireCompletedOnboarding);

router.get("/profile", user.getProfile);
router.patch("/profile", user.updateProfile);
router.post("/profile/request-deletion", user.requestDeletion);
router.post("/profile/cancel-deletion", user.cancelDeletion);

export default router;
