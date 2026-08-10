import {
  listNotifications,
  getUnreadCount,
  markRead,
} from "../services/notificationService.js";
import Notification from "../models/Notification.js";

export const list = async (req, res, next) => {
  try {
    const notifications = await listNotifications(req.user._id, 30);
    const unread = await getUnreadCount(req.user._id);
    res.json({ notifications, unread });
  } catch (err) { next(err); }
};

export const unreadCount = async (req, res, next) => {
  try {
    res.json({ unread: await getUnreadCount(req.user._id) });
  } catch (err) { next(err); }
};

export const markAsRead = async (req, res, next) => {
  try {
    await markRead(req.user._id, req.body.ids);
    res.json({ unread: await getUnreadCount(req.user._id) });
  } catch (err) { next(err); }
};

export const remove = async (req, res, next) => {
  try {
    const n = await Notification.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id,
    });
    if (!n) return res.status(404).json({ message: "Notification not found" });
    res.json({ message: "Deleted" });
  } catch (err) { next(err); }
};