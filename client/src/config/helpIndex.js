/**
 * Help content the search dialog can find. Anchors match the section ids on
 * the Privacy and Terms pages; keep them in step when those pages change.
 */
const privacy = [
  ["collect", "Information we collect", "data stored profile resume usn cgpa"],
  ["use", "How we use it", "readiness score skill gap notifications"],
  ["access", "Who can see your information", "faculty placement officer export photo"],
  ["third-parties", "Services we rely on", "email hosting database"],
  ["storage", "Cookies and browser storage", "cookies keep me signed in local storage"],
  ["retention", "How long we keep it", "delete deactivate retention"],
  ["rights", "Your choices and rights", "correct erase request dpdp"],
];

const terms = [
  ["accounts", "Accounts", "register role password"],
  ["responsibilities", "Your responsibilities", "aptitude rules conduct"],
  ["records", "Placement records and scores", "results correction readiness"],
  ["drives", "Drives, companies and offers", "offer company ctc"],
  ["availability", "Availability and changes", "downtime maintenance"],
];

export const HELP_INDEX = [
  { to: "/contact", page: "Contact", title: "Contact the placement cell", keywords: "help support message question problem", icon: "mail" },
  ...privacy.map(([id, title, keywords]) => ({ to: `/privacy#${id}`, page: "Privacy Policy", title, keywords, icon: "shield" })),
  ...terms.map(([id, title, keywords]) => ({ to: `/terms#${id}`, page: "Terms and Conditions", title, keywords, icon: "file" })),
];
