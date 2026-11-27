import mongoose from "mongoose";
import ContactMessage, { CONTACT_TOPICS, CONTACT_STATUS } from "../models/ContactMessage.js";
import User from "../models/User.js";
import { ROLES } from "../config/constants.js";
import { verifyToken } from "../utils/jwt.js";
import { notifyOnceMany, sendTextEmail } from "../services/notificationService.js";

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const TOPIC_LABEL = {
  account: "Account or sign-in",
  placement: "Placement drives and results",
  privacy: "Privacy and my data",
  technical: "Something is not working",
  other: "Something else",
};

/** The validation rules, shared with the response so the form can show them. */
export const validateContact = (body = {}) => {
  const errors = {};
  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim();
  const topic = String(body.topic ?? "");
  const message = String(body.message ?? "").trim();

  if (name.length < 2) errors.name = "Enter your name.";
  else if (name.length > 100) errors.name = "Keep your name under 100 characters.";
  if (!EMAIL_RX.test(email)) errors.email = "Enter a valid email address, like name@college.edu.";
  else if (email.length > 200) errors.email = "That email address is too long.";
  if (!CONTACT_TOPICS.includes(topic)) errors.topic = "Choose what your message is about.";
  if (message.length < 10) errors.message = "Write at least 10 characters so we can help.";
  else if (message.length > 2000) errors.message = "Keep your message under 2000 characters.";

  return { errors, value: { name, email, topic, message } };
};

/** The signed-in user, if the request carries a valid token. Never rejects. */
const optionalUser = async (req) => {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return null;
  try {
    const { id, iat } = verifyToken(header.slice(7));
    const user = await User.findById(id);
    // A session from before a password change counts as signed out.
    if (!user || user.tokenPredatesPasswordChange(iat)) return null;
    return { _id: user._id, isActive: user.isActive };
  } catch {
    return null;
  }
};

/** POST /api/contact  Public. Stores the message and alerts administrators. */
export const createContactMessage = async (req, res, next) => {
  try {
    // Hidden field that people never see; automated form fillers do. Answer
    // as if it worked so the bot learns nothing, but store nothing.
    if (req.body?.website) return res.status(201).json({ ok: true });

    const { errors, value } = validateContact(req.body);
    if (Object.keys(errors).length) {
      return res.status(400).json({ message: "Please correct the highlighted fields.", errors });
    }

    const user = await optionalUser(req);
    const msg = await ContactMessage.create({ ...value, userId: user?.isActive ? user._id : undefined });

    const admins = await User.find({ role: ROLES.ADMIN, isActive: true }).select("_id").lean();
    await notifyOnceMany(
      admins.map((a) => ({
        userId: a._id,
        type: "system",
        title: `New message: ${TOPIC_LABEL[value.topic]}`,
        body: `${value.name} wrote through the contact form.`,
        link: "/admin/messages",
        dedupeKey: `contact:${msg._id}:${a._id}`,
      })),
    );

    const inbox = process.env.CONTACT_INBOX;
    if (inbox) {
      const emailed = await sendTextEmail({
        to: inbox,
        replyTo: value.email,
        subject: `CareerCore contact: ${TOPIC_LABEL[value.topic]}`,
        text: `From: ${value.name} <${value.email}>\nTopic: ${TOPIC_LABEL[value.topic]}\n\n${value.message}\n`,
      });
      if (emailed) await ContactMessage.updateOne({ _id: msg._id }, { emailed: true });
    }

    res.status(201).json({ ok: true, id: msg._id, receivedAt: msg.createdAt });
  } catch (err) {
    next(err);
  }
};

/** GET /api/admin/messages?status=new|resolved  Newest first. */
export const listContactMessages = async (req, res, next) => {
  try {
    const filter = {};
    if (CONTACT_STATUS.includes(req.query.status)) filter.status = req.query.status;
    const [messages, newCount] = await Promise.all([
      ContactMessage.find(filter).sort({ createdAt: -1 }).limit(200).populate("userId", "name role").lean(),
      ContactMessage.countDocuments({ status: "new" }),
    ]);
    res.json({
      messages: messages.map((m) => ({
        ...m,
        topicLabel: TOPIC_LABEL[m.topic],
        account: m.userId ? { name: m.userId.name, role: m.userId.role } : null,
        userId: undefined,
      })),
      newCount,
    });
  } catch (err) {
    next(err);
  }
};

/** PATCH /api/admin/messages/:id  { status: "new" | "resolved" } */
export const updateContactMessage = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid message" });
    const status = req.body?.status;
    if (!CONTACT_STATUS.includes(status)) return res.status(400).json({ message: "Status must be new or resolved" });
    const update =
      status === "resolved"
        ? { status, resolvedBy: req.user._id, resolvedAt: new Date() }
        : { status, $unset: { resolvedBy: 1, resolvedAt: 1 } };
    const msg = await ContactMessage.findByIdAndUpdate(req.params.id, update, { new: true }).lean();
    if (!msg) return res.status(404).json({ message: "Message not found" });
    res.json({ message: { ...msg, topicLabel: TOPIC_LABEL[msg.topic] } });
  } catch (err) {
    next(err);
  }
};
