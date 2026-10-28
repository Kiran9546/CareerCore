/**
 * Escape a user-typed string for use inside a RegExp, so a search for
 * "C++" or "a.b" matches literally and cannot inject a pattern.
 */
export const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
