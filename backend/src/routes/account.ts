import { Router } from "express";
import * as account from "../controllers/accountController.js";
import { requireAuth } from "../middleware/auth.js";
import { transferLimiter } from "../middleware/security.js";

const router = Router();

router.use(requireAuth);

router.get("/summary", account.summary);
router.get("/transactions", account.transactions);
router.post("/transfer", transferLimiter, account.transferCreate);
router.post("/transfer/confirm", transferLimiter, account.transferConfirm);

export default router;
