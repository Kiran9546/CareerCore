import express from "express";
import { protect } from "../middleware/auth.js";
import { list, unreadCount, markAsRead, markAsUnread, remove } from "../controllers/notification.controller.js";

const router = express.Router();

router.use(protect);

router.get("/", list);
router.get("/unread", unreadCount);
router.patch("/read", markAsRead);
router.patch("/unread", markAsUnread);
router.delete("/:id", remove);

export default router;