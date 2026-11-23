import express from "express";
import { protect } from "../middleware/auth.js";
import { search } from "../controllers/search.controller.js";

const router = express.Router();

router.get("/", protect, search);

export default router;
