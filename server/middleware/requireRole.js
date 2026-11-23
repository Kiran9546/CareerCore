/**
 * Role guard. Use AFTER protect().
 *
 *   router.get("/analytics", protect, requireRole("faculty", "admin"), handler);
 */
export const requireRole = (...allowed) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  if (!allowed.includes(req.user.role)) {
    return res.status(403).json({
      message: `Access denied. Requires role: ${allowed.join(" or ")}`,
    });
  }
  next();
};