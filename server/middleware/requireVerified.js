/**
 * Blocks accounts that are still awaiting admin approval (`isVerified`).
 * Use AFTER protect().
 *
 * Not mounted on any route at present: it gated the recruiter area, which
 * was removed with the job-postings module. It is kept because the proposed
 * approval step for self-registered staff (docs/CLEANUP_PLAN.md, H1) would
 * use it:
 *
 *   router.use(protect, requireRole(...), requireVerified);
 */
export const requireVerified = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  if (!req.user.isVerified) {
    return res.status(403).json({
      message: "Your account is awaiting approval from the placement cell.",
      needsVerification: true,
    });
  }
  next();
};
