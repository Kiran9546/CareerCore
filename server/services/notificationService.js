import nodemailer from "nodemailer";
import Notification from "../models/Notification.js";
import User from "../models/User.js";

let transporter = null;

const getTransporter = () => {
  if (transporter) return transporter;
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return null;

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  return transporter;
};

const sendEmail = async (to, subject, html) => {
  const tx = getTransporter();
  if (!tx) return false;

  try {
    await tx.sendMail({
      from: `"CareerCore" <${process.env.SMTP_USER}>`,
      to, subject, html,
    });
    return true;
  } catch (err) {
    console.error(`Email failed to ${to}: ${err.message}`);
    return false;
  }
};

const emailTemplate = (title, body, link) => `
  <div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:24px">
    <h2 style="color:#0f172a;margin:0 0 4px">CareerCore</h2>
    <p style="color:#64748b;font-size:13px;margin:0 0 24px">Placement Intelligence Platform</p>
    <div style="border:1px solid #e2e8f0;border-radius:12px;padding:20px">
      <h3 style="color:#0f172a;margin:0 0 8px;font-size:16px">${title}</h3>
      <p style="color:#475569;font-size:14px;line-height:1.6;margin:0">${body}</p>
      ${link ? `<a href="${process.env.CLIENT_URL || "http://localhost:5173"}${link}"
        style="display:inline-block;margin-top:16px;padding:8px 16px;background:#0f172a;color:#fff;
        text-decoration:none;border-radius:8px;font-size:14px">View in CareerCore</a>` : ""}
    </div>
    <p style="color:#94a3b8;font-size:12px;margin-top:24px">
      Mangalore Institute of Technology &amp; Engineering
    </p>
  </div>
`;

export const notify = async ({ userId, type, title, body, link, metadata, email = false }) => {
  const notification = await Notification.create({ userId, type, title, body, link, metadata });

  if (email) {
    const user = await User.findById(userId).select("email name");
    if (user?.email) {
      const sent = await sendEmail(user.email, `CareerCore — ${title}`, emailTemplate(title, body, link));
      if (sent) {
        notification.emailSent = true;
        await notification.save();
      }
    }
  }

  return notification;
};

export const notifyMany = async (items) => {
  const results = await Promise.allSettled(items.map((i) => notify(i)));
  return results.filter((r) => r.status === "fulfilled").length;
};

export const getUnreadCount = (userId) =>
  Notification.countDocuments({ userId, isRead: false });

export const listNotifications = (userId, limit = 30) =>
  Notification.find({ userId }).sort("-createdAt").limit(limit);

export const markRead = (userId, ids) =>
  Notification.updateMany(
    { userId, ...(ids?.length ? { _id: { $in: ids } } : {}) },
    { isRead: true }
  );