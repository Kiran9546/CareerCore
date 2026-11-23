import Company, { companyNameKey } from "../models/Company.js";

/**
 * The company record for a company name, created by the placement cell if
 * there is none yet. Names are matched by companyNameKey (case, punctuation
 * and "&"/"and" insensitive), the same key the unique index and the
 * placement-workflow migration use, so "TCS Digital" and "tcs digital" are
 * one company.
 *
 * Recorded drives only ever stored the company as text, so they were missing
 * from everything that works by company record: the company filter on the
 * placement statistics, the company list in the drive form, and company
 * history. Linking them here keeps those complete. Returns undefined for an
 * empty name.
 */
export const companyIdForName = async (name, createdBy) => {
  const key = companyNameKey(name);
  if (!key) return undefined;
  const existing = await Company.findOne({ nameKey: key }).select("_id").lean();
  if (existing) return existing._id;
  try {
    const created = await Company.create({ name: String(name).trim(), source: "placement_cell", createdBy });
    return created._id;
  } catch (err) {
    // Another request created it at the same moment: use that one.
    if (err?.code === 11000) {
      const again = await Company.findOne({ nameKey: key }).select("_id").lean();
      if (again) return again._id;
    }
    throw err;
  }
};
