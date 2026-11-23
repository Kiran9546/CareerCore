/**
 * Details about the organization that runs this CareerCore installation.
 * They appear on the Privacy Policy and Terms pages.
 *
 * Fill these in before launch. Leave a field empty rather than guess: the
 * legal pages fall back to wording that refers users to their placement
 * cell, which is accurate for any installation.
 */
export const SITE = {
  /** Legal name of the institution operating this installation. */
  operator: "",
  /** Address users can write to about privacy or these terms. */
  contactEmail: "",
  /** Postal address of the operator, shown on the legal pages. */
  postalAddress: "",
  /** Country whose law governs the Terms. */
  jurisdiction: "India",
  /** Date the legal pages were last revised (ISO yyyy-mm-dd). */
  legalUpdated: "2026-11-15",
};

/** "the institution" when no operator name has been configured. */
export const operatorName = () => SITE.operator || "the institution that runs this CareerCore installation";

/** Links every public footer carries. */
export const LEGAL_LINKS = [
  { to: "/privacy", label: "Privacy Policy" },
  { to: "/terms", label: "Terms and Conditions" },
];
