/**
 * Phone numbers for WhatsApp delivery.
 *
 * WhatsApp addresses a recipient by their full international number, so
 * everything a student types ("98765 43210", "098765-43210", "+91 (98765)
 * 43210", "0091 9876543210") is reduced to E.164: a "+", the country code
 * and the subscriber number, digits only, at most 15 digits.
 *
 * A number without a country code is read as belonging to
 * DEFAULT_PHONE_COUNTRY_CODE (91, India, unless configured otherwise),
 * because that is how students in one college write their own numbers.
 *
 * This is deliberately a validator, not a full numbering-plan database: it
 * rejects anything that cannot be a valid international number, and applies
 * the stricter Indian mobile rule (+91 followed by ten digits starting 6–9)
 * where the country code is 91. A number that passes and still is not on
 * WhatsApp is reported back by the WhatsApp API and recorded as a failure.
 */

const E164 = /^\+[1-9]\d{7,14}$/;
const INDIA_MOBILE = /^\+91[6-9]\d{9}$/;

/**
 * Returns the E.164 form of `raw`, or null when it cannot be a valid number.
 *
 *   normalizePhone("98765 43210")       -> "+919876543210"
 *   normalizePhone("+44 7700 900123")   -> "+447700900123"
 *   normalizePhone("12345")             -> null
 */
export const normalizePhone = (raw, defaultCountryCode = process.env.DEFAULT_PHONE_COUNTRY_CODE || "91") => {
  if (raw === undefined || raw === null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  // Only digits, spaces and the usual separators are a phone number. Letters
  // ("call me", an email pasted in the wrong box) are rejected, not stripped.
  if (!/^[+\d\s().-]+$/.test(s)) return null;

  const cc = String(defaultCountryCode).replace(/\D/g, "");
  let digits;
  if (s.startsWith("+")) {
    digits = s.slice(1).replace(/\D/g, "");
  } else {
    s = s.replace(/\D/g, "");
    if (s.startsWith("00")) {
      // International dialling prefix.
      digits = s.slice(2);
    } else if (cc === "91" && s.length === 12 && s.startsWith("91")) {
      // "919876543210": the country code typed without the "+".
      digits = s;
    } else if (s.startsWith("0")) {
      // National trunk prefix ("09876543210").
      digits = cc + s.replace(/^0+/, "");
    } else {
      digits = cc + s;
    }
  }

  const e164 = `+${digits}`;
  if (!E164.test(e164)) return null;
  if (e164.startsWith("+91") && !INDIA_MOBILE.test(e164)) return null;
  return e164;
};

export const isValidE164 = (v) => typeof v === "string" && E164.test(v) && (!v.startsWith("+91") || INDIA_MOBILE.test(v));

/** "+919876543210" -> "+91•••••43210": enough for an officer to recognise, not to dial. */
export const maskPhone = (e164) => {
  if (!e164) return "";
  const s = String(e164);
  if (s.length <= 6) return "•••";
  return `${s.slice(0, 3)}${"•".repeat(Math.max(s.length - 7, 3))}${s.slice(-4)}`;
};

/** "kiran@example.com" -> "ki•••@example.com". */
export const maskEmail = (email) => {
  if (!email || !String(email).includes("@")) return "";
  const [local, domain] = String(email).split("@");
  return `${local.slice(0, Math.min(2, local.length))}•••@${domain}`;
};
