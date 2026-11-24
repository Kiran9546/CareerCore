import { deliveryConfig } from "../config/notifications.js";
import { kickDeliveryWorker, stopDeliveryLoops } from "../services/notificationDeliveryService.js";

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
  kickDeliveryWorker();
  timer = setInterval(kickDeliveryWorker, cfg.worker.pollMs);
  timer.unref();
};

/** Stop polling and wait for in-flight sends to be recorded. */
export const stopDeliveryWorker = async () => {
  if (timer) clearInterval(timer);
  timer = null;
  await stopDeliveryLoops();
};
