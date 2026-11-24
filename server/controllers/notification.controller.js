import mongoose from "mongoose";
import {
  listNotifications,
  getUnreadCount,
  markRead,
} from "../services/notificationService.js";
import Notification from "../models/Notification.js";

/**
 * The signed-in user's own notifications. Every query is scoped by
 * req.user._id, so no id in a request can reach another user's records.
 */

const MAX_LIMIT = 100;

/** Validate an optional list of notification ids from the body. */
const parseIds = (ids) => {
  if (ids === undefined || ids === null) return { ids: undefined };
  if (!Array.isArray(ids) || ids.length > 500 || !ids.every((id) => mongoose.isValidObjectId(id))) {
    return { error: "ids must be a list of notification ids" };
  }
  return { ids };
};

/**
 * GET /api/notifications
 *   no query           the latest 30, as the bell has always read them
 *   ?page=&limit=      a page of the full history (notification centre)
 *   ?status=unread     unread only
 */
export const list = async (req, res, next) => {
  try {
    const paged = req.query.page !== undefined || req.query.limit !== undefined || req.query.status !== undefined;
    if (!paged) {
      const notifications = await listNotifications(req.user._id, 30);
      const unread = await getUnreadCount(req.user._id);
      return res.json({ notifications, unread });
    }

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), MAX_LIMIT);
    if (req.query.status !== undefined && !["all", "unread", "read"].includes(req.query.status)) {
      return res.status(400).json({ message: "status must be all, unread or read" });
    }
    const filter = { userId: req.user._id };
    if (req.query.status === "unread") filter.isRead = false;
    if (req.query.status === "read") filter.isRead = true;

    const [notifications, total, unread] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Notification.countDocuments(filter),
      getUnreadCount(req.user._id),
    ]);
    res.json({ notifications, unread, total, page, limit });
  } catch (err) { next(err); }
};

export const unreadCount = async (req, res, next) => {
  try {
    res.json({ unread: await getUnreadCount(req.user._id) });
  } catch (err) { next(err); }
};

export const markAsRead = async (req, res, next) => {
  try {
    const { ids, error } = parseIds(req.body?.ids);
    if (error) return res.status(400).json({ message: error });
    await markRead(req.user._id, ids);
    res.json({ unread: await getUnreadCount(req.user._id) });
  } catch (err) { next(err); }
};

/** PATCH /api/notifications/unread { ids } — mark specific notifications unread again. */
export const markAsUnread = async (req, res, next) => {
  try {
    const { ids, error } = parseIds(req.body?.ids);
    if (error || !ids?.length) return res.status(400).json({ message: error || "ids is required" });
    await Notification.updateMany({ userId: req.user._id, _id: { $in: ids } }, { isRead: false });
    res.json({ unread: await getUnreadCount(req.user._id) });
  } catch (err) { next(err); }
};

export const remove = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid notification" });
    const n = await Notification.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id,
    });
    if (!n) return res.status(404).json({ message: "Notification not found" });
    res.json({ message: "Deleted" });
  } catch (err) { next(err); }
};
