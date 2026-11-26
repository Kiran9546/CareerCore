import { useEffect, useState } from "react";
import api from "../api/axios";

/**
 * Which placement alert channels the server uses: always in-app, email
 * unless switched off, WhatsApp only when the placement cell turned it on
 * (NOTIFY_WHATSAPP_ENABLED=true). Until the answer arrives, or if it cannot
 * be fetched, WhatsApp is treated as off, so nothing WhatsApp-related is
 * shown or offered.
 */
const DEFAULT = { inApp: true, email: true, whatsapp: false };

export function useAlertChannels() {
  const [channels, setChannels] = useState(DEFAULT);
  useEffect(() => {
    let live = true;
    Promise.resolve()
      .then(() => api.get("/auth/alert-channels"))
      .then((r) => live && r?.data && setChannels({ ...DEFAULT, ...r.data }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return channels;
}
