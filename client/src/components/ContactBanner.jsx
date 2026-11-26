import { Link } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { useAlertChannels } from "../utils/alertChannels";

/**
 * A one-line reminder on the student dashboard while their email is not
 * verified (or, when the placement cell uses WhatsApp, while WhatsApp alerts
 * are not yet active). Read from the account the app already holds, plus
 * which alert channels the server uses.
 */
export default function ContactBanner() {
  const { user } = useAuth() || {};
  const channels = useAlertChannels();
  if (!user || user.role !== "student") return null;
  const emailPending = !user.emailVerifiedAt;
  const whatsappPending = channels.whatsapp && !(user.phoneVerifiedAt && user.whatsapp?.optIn);
  if (!emailPending && !whatsappPending) return null;

  const what = [emailPending && "verify your email", whatsappPending && "verify your WhatsApp number"].filter(Boolean).join(" and ");
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">
      <p>To make sure placement drive alerts reach you outside CareerCore, {what}.</p>
      <Link to="/student/profile#contact" className="font-medium underline">Contact settings</Link>
    </div>
  );
}
