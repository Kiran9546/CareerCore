import dotenv from "dotenv";
import { deliveryConfig, driveRegistrationUrl } from "../config/notifications.js";
import { normalizePhone, maskEmail } from "../utils/phone.js";
import { smtpEmailProvider, whatsappCloudProvider, classifySmtpError } from "../services/delivery/providers.js";
import {
  opportunityFacts,
  renderOpportunityEmail,
  whatsappTemplateParams,
  buildWhatsAppTemplatePayload,
} from "../services/delivery/driveOpportunityMessages.js";
import { mailFrom, getTransporter } from "../services/notificationService.js";

/**
 * CareerCore — send ONE real test notification to yourself
 * ========================================================
 *
 * Checks the email and WhatsApp settings in server/.env and sends a sample
 * "new placement opportunity" message, through the same providers and
 * templates the drive announcements use, to the address and number given.
 * It never writes to the database and never messages anyone else.
 *
 *   npm run notify:test -- --check                  (log in to the mail server only; sends nothing)
 *   npm run notify:test -- --student 4MT23IS039     (that student's registered email; plus their
 *                                                    WhatsApp only when NOTIFY_WHATSAPP_ENABLED=true)
 *   npm run notify:test -- --email you@gmail.com
 *   npm run notify:test -- --whatsapp "+91 98765 43210"
 *   npm run notify:test -- --whatsapp +919876543210 --hello-world
 *
 * --hello-world sends Meta's pre-approved "hello_world" template instead of
 * placement_drive_alert: use it to prove the token, phone number ID and
 * recipient work while your own template is still waiting for approval.
 *
 * Exit code 0 when every requested send was accepted, 1 otherwise.
 */

dotenv.config();

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
let emailTo = arg("email");
let whatsappTo = arg("whatsapp");
const studentUsn = arg("student");
const checkOnly = args.includes("--check");
const helloWorld = args.includes("--hello-world");

/**
 * --student <USN>: read that student's profile (read-only) and send to the
 * addresses the drive announcements would use — the account's registered
 * email and the profile WhatsApp number — so the targeting itself is tested.
 */
const loadStudentTargets = async (usn) => {
  const { default: mongoose } = await import("mongoose");
  const { default: Student } = await import("../models/Student.js");
  const { default: User } = await import("../models/User.js");
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not set");
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  try {
    const student = await Student.findOne({ usn: String(usn).toUpperCase() }).select("usn userId").lean();
    if (!student) throw new Error(`No student with USN ${usn}`);
    const user = await User.findById(student.userId).select("email emailVerifiedAt phone phoneVerifiedAt whatsapp").lean();
    console.log(`\nStudent ${student.usn} (contact details from their account):`);
    console.log(`  registered email: ${user?.email ? "set" : "none"} · ${user?.emailVerifiedAt ? "verified" : "not verified"}`);
    console.log(`  mobile number:    ${user?.phone ? "set" : "none"} · ${user?.phoneVerifiedAt ? "verified" : "NOT verified (the app sends no WhatsApp until the student enters their code)"}`);
    console.log(`  WhatsApp alerts:  ${user?.whatsapp?.optIn ? "consented" : "no consent (the app sends no WhatsApp)"}`);
    return { email: user?.email, whatsapp: user?.phone };
  } finally {
    await mongoose.disconnect();
  }
};

const ok = (s) => console.log(`  ✔ ${s}`);
const bad = (s) => console.log(`  ✖ ${s}`);
const note = (s) => console.log(`    ${s}`);

/** What to do about the errors people actually hit. */
const HINTS = {
  CHANNEL_NOT_CONFIGURED: "The required settings are missing; see the checklist above.",
  EAUTH:
    "Gmail rejected the login. SMTP_USER must be your full Gmail address and SMTP_PASS a 16-character " +
    "App Password (Google Account → Security → 2-Step Verification must be ON → App passwords), not your normal password.",
  SMTP_535: "Gmail rejected the login; use a Google App Password as SMTP_PASS (see EAUTH).",
  ECONNECTION: "Could not reach the mail server. For Gmail: SMTP_HOST=smtp.gmail.com, SMTP_PORT=587. Check your network/firewall.",
  ETIMEDOUT: "The mail server did not answer. For Gmail: SMTP_HOST=smtp.gmail.com, SMTP_PORT=587 (or 465 with SMTP_SECURE=true).",
  ESOCKET: "TLS/connection problem. For port 465 set SMTP_SECURE=true; for 587 leave it empty.",
  RECIPIENT_REJECTED: "The mail server refused the recipient address. Check it is typed correctly.",
  SMTP_QUOTA: "The Gmail account reached its daily sending limit (about 500/day, 2,000 for Google Workspace). Try again tomorrow.",
  WA_190: "The WhatsApp access token is invalid or expired. Temporary tokens from 'API Setup' last 24 hours; generate a new one or a permanent System User token.",
  WA_131030:
    "This number is not an allowed recipient of the TEST sender number. In Meta → WhatsApp → API Setup, add it under 'To' and confirm the code WhatsApp sends to it.",
  WA_132001:
    "The template does not exist in that language. Check WHATSAPP_TEMPLATE_NAME and WHATSAPP_TEMPLATE_LANGUAGE (Meta shows 'English' as en and 'English (US)' as en_US), and that it is Approved.",
  WA_132000:
    "The template's variables do not match: placement_drive_alert must have exactly 7 body variables and a URL button ending in {{1}} (or set WHATSAPP_TEMPLATE_URL_BUTTON=false if it has no button).",
  WA_132012: "A template variable has the wrong format; the template body variables must be plain text.",
  WA_132015: "The template is paused or disabled in WhatsApp Manager.",
  WA_131026: "WhatsApp could not deliver to this number (not a WhatsApp account, or it cannot receive business messages).",
  WA_133010: "The sender phone number is not registered with the Cloud API. Register it in WhatsApp Manager / API Setup.",
  WA_100: "Invalid request: usually a wrong WHATSAPP_PHONE_NUMBER_ID (use the Phone number ID, not the phone number or the business account ID).",
  WA_10: "The token lacks permission: it needs whatsapp_business_messaging for this WhatsApp account.",
  WA_200: "The token lacks permission: it needs whatsapp_business_messaging for this WhatsApp account.",
  WA_131031: "The WhatsApp Business account is restricted or locked; see WhatsApp Manager.",
};
const explain = (err) => {
  bad(`${err.code}: ${err.message}`);
  // Nodemailer reports a refused or unresolvable host as a socket error.
  const unreachable = /ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT/.test(err.message);
  const hint = unreachable ? HINTS.ECONNECTION : HINTS[err.code];
  if (hint) note(`Fix: ${hint}`);
};

const sampleDrive = {
  _id: "000000000000000000000000",
  companyName: "CareerCore Test Company",
  role: "Test Notification",
  description: "This is a test message from your CareerCore notification setup. No drive was created.",
  location: "Mangaluru",
  ctc: 6,
  driveDate: new Date(Date.now() + 10 * 86400000),
  registrationDeadline: new Date(Date.now() + 5 * 86400000),
};

/** --check: open an authenticated SMTP session and close it. No email is sent. */
const checkLogin = async () => {
  console.log("\nCareerCore email login check (server/.env) — nothing is sent\n");
  const missing = ["SMTP_USER", "SMTP_PASS"].filter((k) => !process.env[k]);
  if (missing.length) {
    bad(`Missing in server/.env: ${missing.join(", ")}`);
    return 1;
  }
  const tx = getTransporter();
  const opts = tx.options || {};
  note(`Server: ${opts.host}:${opts.port} (${opts.secure ? "TLS" : opts.requireTLS ? "STARTTLS required" : "STARTTLS if offered"})`);
  note(`Account: ${maskEmail(process.env.SMTP_USER)} · From: ${maskEmail(mailFrom().address)}`);
  try {
    await tx.verify();
    ok("Logged in to the mail server. Email settings work.");
    return 0;
  } catch (err) {
    explain(classifySmtpError(err));
    return 1;
  } finally {
    tx.close();
  }
};

const main = async () => {
  const cfg = deliveryConfig();
  if (checkOnly) process.exit(await checkLogin());
  if (studentUsn) {
    const t = await loadStudentTargets(studentUsn);
    emailTo = emailTo || t.email;
    // WhatsApp only when the app itself uses it.
    if (cfg.whatsapp.enabled) whatsappTo = whatsappTo || t.whatsapp;
  }
  if (!emailTo && !whatsappTo) {
    console.log('Usage: npm run notify:test -- --student <USN> | --email you@gmail.com --whatsapp "+91 98765 43210" [--hello-world]');
    process.exit(1);
  }

  console.log("\nCareerCore notification check (server/.env)\n");
  console.log(`Delivery mode: ${cfg.mode}`);
  if (cfg.mode !== "live") {
    note(`The app itself will NOT send real messages until NOTIFICATION_DELIVERY_MODE=live (this test sends regardless).`);
  }
  console.log(`Registration links: ${cfg.appUrl || "(not set: add PUBLIC_APP_URL)"}`);

  const facts = opportunityFacts({
    drive: sampleDrive,
    criteria: ["CGPA ≥ 7", "No backlogs"],
    registrationUrl: driveRegistrationUrl(sampleDrive._id) || "https://example.edu/student/drives/test",
    timeZone: cfg.timeZone,
  });
  let failures = 0;

  if (emailTo) {
    console.log(`\nEmail → ${emailTo}`);
    const missing = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"].filter((k) => !process.env[k]);
    if (!cfg.email.enabled) note("NOTIFY_EMAIL_ENABLED is false: the app will not send drive emails.");
    if (missing.length) {
      bad(`Missing in server/.env: ${missing.join(", ")}`);
      note("For Gmail: SMTP_HOST=smtp.gmail.com  SMTP_PORT=587  SMTP_USER=<your Gmail>  SMTP_PASS=<16-character App Password>");
      failures++;
    } else {
      try {
        const { subject, html, text } = renderOpportunityEmail({ studentName: "Test Student", facts });
        const r = await smtpEmailProvider.send({
          to: emailTo,
          subject: `[TEST] ${subject}`,
          html,
          text,
          from: { name: cfg.email.fromName, address: cfg.email.fromAddress || mailFrom().address },
          replyTo: cfg.email.replyTo,
          reference: `notify-test-${Date.now()}`,
        });
        ok(`Accepted by ${process.env.SMTP_HOST} (message id ${r.providerMessageId}).`);
        note("Check the inbox, and the Spam/Promotions tabs, within a minute.");
      } catch (err) {
        explain(err);
        failures++;
      }
    }
  }

  if (whatsappTo) {
    console.log(`\nWhatsApp → ${whatsappTo}`);
    const to = normalizePhone(whatsappTo, cfg.defaultCountryCode);
    const missing = ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", ...(helloWorld ? [] : ["WHATSAPP_TEMPLATE_NAME"])].filter(
      (k) => !process.env[k],
    );
    if (!cfg.whatsapp.enabled) note("NOTIFY_WHATSAPP_ENABLED is not true: the app will not send drive WhatsApp messages.");
    if (!to) {
      bad("That is not a valid mobile number. Use the international form, e.g. +91 98765 43210.");
      failures++;
    } else if (missing.length) {
      bad(`Missing in server/.env: ${missing.join(", ")}`);
      note("From Meta for Developers → your app → WhatsApp → API Setup: the access token and the Phone number ID.");
      failures++;
    } else {
      const payload = helloWorld
        ? { messaging_product: "whatsapp", to: to.slice(1), type: "template", template: { name: "hello_world", language: { code: "en_US" } } }
        : buildWhatsAppTemplatePayload({
            to,
            templateName: cfg.whatsapp.templateName,
            language: cfg.whatsapp.templateLanguage,
            params: whatsappTemplateParams({ studentName: "Test Student", facts }),
            urlButtonSuffix: cfg.whatsapp.urlButton ? sampleDrive._id : null,
          });
      note(`Template: ${helloWorld ? "hello_world (en_US)" : `${cfg.whatsapp.templateName} (${cfg.whatsapp.templateLanguage})`}, sender ID ${cfg.whatsapp.phoneNumberId}`);
      try {
        const r = await whatsappCloudProvider.send(payload, {
          ...cfg,
          whatsapp: { ...cfg.whatsapp, configured: true, templateName: cfg.whatsapp.templateName || "hello_world" },
        });
        ok(`Accepted by WhatsApp (message id ${r.providerMessageId}).`);
        note("It should arrive on the phone within seconds. If it does not, the sender may be a test number that");
        note("has not added this recipient, or the number cannot receive WhatsApp business messages.");
      } catch (err) {
        explain(err);
        failures++;
      }
    }
  }

  console.log(failures ? `\n${failures} check(s) failed.\n` : "\nAll requested test messages were accepted.\n");
  process.exit(failures ? 1 : 0);
};

main().catch((err) => {
  console.error(`notify:test failed: ${err.message}`);
  process.exit(1);
});
