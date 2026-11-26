import { deliveryConfig, deliveryWarnings } from "../config/notifications.js";
import { kickDeliveryWorker, stopDeliveryLoops, releaseCredentialHolds, checkEmailLogin } from "../services/notificationDeliveryService.js";
import { maskEmail } from "../utils/phone.js";

/**
 * Background sender for email and WhatsApp notifications.
 *
 * Publishing a drive kicks the worker straight away; this poll picks up
 * everything else — scheduled retries, rows queued while another process was
 * busy, and whatever was pending when the server last stopped (the queue is
 * the notificationdeliveries collection, so a restart loses nothing).
 *
 * Every process may poll: rows are claimed atomically, so running several
 * API instances or cluster workers never sends a row twice. Independent of
 * DISABLE_CRON; turn it off with DELIVERY_WORKER=off.
 */

let timer = null;

export const startDeliveryWorker = () => {
  const cfg = deliveryConfig();
  if (!cfg.worker.enabled) {
    console.log("[delivery] worker disabled via DELIVERY_WORKER=off");
    return;
  }
  if (timer) return;
  console.log(`[delivery] worker polling every ${Math.round(cfg.worker.pollMs / 1000)}s (mode: ${cfg.mode})`);
  // Say plainly, at start-up, whether students will really receive anything.
  const warnings = deliveryWarnings(cfg);
  for (const w of warnings) console.warn(`[delivery] WARNING: ${w}`);
  if (cfg.mode === "live") {
    const channels = ["email", ...(cfg.whatsapp.enabled ? ["WhatsApp"] : [])].join(" + ");
    console.log(`[delivery] LIVE: real ${channels} delivery; links use ${cfg.appUrl || "(no PUBLIC_APP_URL)"}`);
    // Log in to the mail server once (sends nothing), so a wrong App
    // Password shows up now rather than on the first student's email.
    checkEmailLogin(cfg).then((r) => {
      if (r.skipped) return;
      if (r.ok) console.log(`[delivery] email: logged in to ${r.host} as ${maskEmail(process.env.SMTP_USER)}`);
      else console.error(`[delivery] EMAIL NOT WORKING (${r.code}): ${r.message}${r.credential ? " Check SMTP_USER / SMTP_PASS (a Google App Password)." : ""}`);
    });
  }
  // Messages held by a credential error go first: the fix is usually why
  // the server was just restarted.
  releaseCredentialHolds()
    .catch((err) => console.error(`[delivery] could not release held messages: ${err.message}`))
    .finally(kickDeliveryWorker);
  timer = setInterval(kickDeliveryWorker, cfg.worker.pollMs);
  timer.unref();
};

/** Stop polling and wait for in-flight sends to be recorded. */
export const stopDeliveryWorker = async () => {
  if (timer) clearInterval(timer);
  timer = null;
  await stopDeliveryLoops();
};
