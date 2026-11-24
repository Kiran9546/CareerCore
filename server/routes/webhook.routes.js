import express from "express";
import { verifyWhatsAppWebhook, receiveWhatsAppWebhook } from "../controllers/notificationDelivery.controller.js";

/**
 * /api/webhooks — callbacks from external providers. No user session: each
 * handler authenticates the caller itself (WhatsApp: the verify token for
 * the handshake, an HMAC signature on every callback).
 *
 * Mounted in app.js BEFORE the JSON body parser, because the signature is
 * computed over the exact bytes Meta sent.
 */
const router = express.Router();

router.get("/whatsapp", verifyWhatsAppWebhook);
router.post("/whatsapp", express.raw({ type: "*/*", limit: "1mb" }), receiveWhatsAppWebhook);

export default router;
