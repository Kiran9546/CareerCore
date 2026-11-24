/**
 * The "new placement opportunity" message, rendered for each external
 * channel. Pure functions: no database, no network — the delivery worker
 * gathers the data and passes it in, and the tests render them directly.
 *
 * Every value that came from a person (company name, role, description,
 * student name) is escaped before it is placed in HTML, and cleaned of the
 * characters WhatsApp rejects in template parameters.
 */

const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);

/** Only http(s) links are ever placed in a message. */
export const safeUrl = (url) => {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : "";
  } catch {
    return "";
  }
};

export const formatPackage = (ctc) =>
  typeof ctc === "number" && Number.isFinite(ctc) && ctc > 0 ? `₹${ctc} LPA` : "";

export const formatDeadline = (d, timeZone = "Asia/Kolkata") => {
  if (!d) return "";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-IN", {
    timeZone,
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
};

const summarise = (text, max = 600) => {
  const t = String(text || "").replace(/\s+\n/g, "\n").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
};

/**
 * The shared facts every channel shows, already formatted.
 * `drive` is a Drive document or lean object; `criteria` comes from the
 * existing describeEligibility(), never recomputed here.
 */
export const opportunityFacts = ({ drive, criteria = [], registrationUrl, timeZone }) => ({
  companyName: String(drive.companyName || "").trim(),
  role: String(drive.role || "").trim(),
  packageText: formatPackage(drive.ctc),
  location: String(drive.location || "").trim(),
  deadline: formatDeadline(drive.registrationDeadline, timeZone),
  driveDate: drive.driveDate
    ? new Date(drive.driveDate).toLocaleDateString("en-IN", { timeZone, day: "numeric", month: "long", year: "numeric" })
    : "",
  description: summarise(drive.description),
  criteria,
  registrationUrl: safeUrl(registrationUrl),
});

export const emailSubject = (facts) => `New Placement Opportunity – ${facts.companyName} | ${facts.role}`;

/**
 * HTML and plain-text bodies. The HTML uses tables and inline styles only,
 * with a "bulletproof" button (a coloured table cell around the link), which
 * is what renders consistently in Gmail, Outlook (Word engine) and mobile
 * mail apps. The plain-text part carries the same content and the full URL.
 */
export const renderOpportunityEmail = ({ studentName, facts, brand = {} }) => {
  const institution = brand.institution || "Mangalore Institute of Technology & Engineering";
  const name = studentName ? String(studentName).trim() : "Student";
  const rows = [
    ["Company", facts.companyName],
    ["Job Role", facts.role],
    ["Package", facts.packageText],
    ["Location", facts.location],
    ["Drive Date", facts.driveDate],
    ["Registration Deadline", facts.deadline],
  ].filter(([, v]) => v);

  const e = escapeHtml;
  const url = facts.registrationUrl;

  const rowHtml = rows
    .map(
      ([k, v]) => `
              <tr>
                <td style="padding:6px 0;font-size:14px;color:#64748b;width:42%;vertical-align:top">${e(k)}</td>
                <td style="padding:6px 0;font-size:14px;color:#0f172a;font-weight:600;vertical-align:top">${e(v)}</td>
              </tr>`,
    )
    .join("");

  const criteriaHtml = facts.criteria.length
    ? `
          <tr><td style="padding:20px 28px 0">
            <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#0f172a;text-transform:uppercase;letter-spacing:.04em">Eligibility criteria</p>
            <ul style="margin:0;padding-left:20px;font-size:14px;line-height:1.6;color:#334155">
              ${facts.criteria.map((c) => `<li>${e(c)}</li>`).join("")}
            </ul>
          </td></tr>`
    : "";

  const descriptionHtml = facts.description
    ? `
          <tr><td style="padding:20px 28px 0">
            <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#0f172a;text-transform:uppercase;letter-spacing:.04em">About the role</p>
            <p style="margin:0;font-size:14px;line-height:1.6;color:#334155">${e(facts.description).replace(/\n/g, "<br>")}</p>
          </td></tr>`
    : "";

  const buttonHtml = url
    ? `
          <tr><td align="center" style="padding:28px 28px 8px">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr><td align="center" bgcolor="#0f172a" style="border-radius:8px">
                <a href="${e(url)}" target="_blank" rel="noopener"
                   style="display:inline-block;padding:14px 32px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;letter-spacing:.04em">REGISTER NOW</a>
              </td></tr>
            </table>
          </td></tr>
          <tr><td align="center" style="padding:4px 28px 0">
            <p style="margin:0;font-size:12px;line-height:1.5;color:#64748b">Or open this link:<br>
              <a href="${e(url)}" target="_blank" rel="noopener" style="color:#4338ca;word-break:break-all">${e(url)}</a></p>
          </td></tr>`
    : "";

  const preheader = `${facts.companyName} is hiring for ${facts.role}. Register by ${facts.deadline}.`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${e(emailSubject(facts))}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f1f5f9">${e(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f1f5f9">
    <tr><td align="center" style="padding:24px 12px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px">
        <tr><td style="padding:24px 28px;border-bottom:1px solid #e2e8f0">
          <p style="margin:0;font-size:20px;font-weight:700;color:#0f172a">CareerCore</p>
          <p style="margin:2px 0 0;font-size:12px;color:#64748b">Placement Intelligence Platform</p>
        </td></tr>
        <tr><td style="padding:24px 28px 0">
          <p style="margin:0 0 12px;font-size:15px;color:#0f172a">Hello ${e(name)},</p>
          <p style="margin:0;font-size:15px;line-height:1.6;color:#334155">A new placement opportunity is available for you on CareerCore!</p>
        </td></tr>
        <tr><td style="padding:16px 28px 0">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e2e8f0;border-radius:10px">
            <tr><td style="padding:12px 16px">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rowHtml}
              </table>
            </td></tr>
          </table>
        </td></tr>${descriptionHtml}${criteriaHtml}
        <tr><td style="padding:20px 28px 0">
          <p style="margin:0;font-size:15px;line-height:1.6;color:#334155">Based on your academic profile, you are eligible to apply for this placement drive. Click the button below to view the complete details and register.</p>
        </td></tr>${buttonHtml}
        <tr><td style="padding:20px 28px 24px">
          <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#334155">Please make sure to complete your registration before the deadline.</p>
          <p style="margin:0;font-size:14px;line-height:1.6;color:#0f172a">Best Regards,<br><strong>CareerCore Placement Team</strong></p>
        </td></tr>
      </table>
      <p style="max-width:600px;margin:16px auto 0;font-size:11px;line-height:1.5;color:#94a3b8;text-align:center">
        You are receiving this because you are a registered CareerCore student and meet the eligibility criteria for this drive.<br>${e(institution)}
      </p>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    `Hello ${name},`,
    "",
    "A new placement opportunity is available for you on CareerCore!",
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    ...(facts.description ? ["", "About the role:", facts.description] : []),
    ...(facts.criteria.length ? ["", "Eligibility criteria:", ...facts.criteria.map((c) => `- ${c}`)] : []),
    "",
    "Based on your academic profile, you are eligible to apply for this placement drive.",
    ...(url ? ["View the complete details and register:", url] : []),
    "",
    "Please make sure to complete your registration before the deadline.",
    "",
    "Best Regards,",
    "CareerCore Placement Team",
    "",
    institution,
  ].join("\n");

  return { subject: emailSubject(facts), html, text };
};

/**
 * WhatsApp rejects template parameters containing new lines, tabs or more
 * than four consecutive spaces, and caps their length.
 */
export const whatsappParam = (v, fallback = "Not specified", max = 200) => {
  const t = String(v ?? "").replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim();
  const out = t || fallback;
  return out.length > max ? `${out.slice(0, max - 1)}…` : out;
};

/**
 * Body parameters, in the order the approved template expects:
 *
 *   {{1}} student name   {{2}} company   {{3}} role   {{4}} package
 *   {{5}} location       {{6}} deadline  {{7}} registration URL
 *
 * (See DEPLOYMENT.md, "WhatsApp notifications", for the exact template.)
 */
export const whatsappTemplateParams = ({ studentName, facts }) => [
  whatsappParam(studentName, "Student", 60),
  whatsappParam(facts.companyName),
  whatsappParam(facts.role),
  whatsappParam(facts.packageText),
  whatsappParam(facts.location),
  whatsappParam(facts.deadline),
  whatsappParam(facts.registrationUrl, "", 500),
];

/** The Cloud API "messages" payload for one template message. */
export const buildWhatsAppTemplatePayload = ({ to, templateName, language, params, urlButtonSuffix }) => {
  const components = [
    { type: "body", parameters: params.map((text) => ({ type: "text", text })) },
  ];
  if (urlButtonSuffix) {
    components.push({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: String(urlButtonSuffix) }],
    });
  }
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    // The Cloud API takes the number without the leading "+".
    to: String(to).replace(/^\+/, ""),
    type: "template",
    template: { name: templateName, language: { code: language }, components },
  };
};
