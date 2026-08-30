/**
 * Blocks accounts that are still awaiting admin approval.
 *
 * Registration already sets `isVerified: false` for recruiters, but nothing
 * read that flag — so an unapproved recruiter could post jobs and pull the
 * full student roster (names, emails, USNs, CGPA, PRS) the moment they signed
 * up. Use AFTER protect(), on every route that exposes student data.
 *
 *   router.use(protect, requireRole(ROLES.RECRUITER));
 *   router.get("/jobs", requireVerified, listJobs);
 */
export const requireVerified = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  if (!req.user.isVerified) {
    return res.status(403).json({
      message:
        "Your account is awaiting approval from the placement cell. " +
        "You can set up your company profile in the meantime.",
      needsVerification: true,
    });
  }
  next();
};
