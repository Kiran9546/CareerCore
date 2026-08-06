import { verifyToken } from "../utils/jwt.js";
import User from "../models/User.js";

/**
 * Verifies the JWT from the Authorization header and attaches
 * the user document to req.user.
 */
export const protect = async (req, res, next) => {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Not authorized — no token provided" });
  }

  try {
    const decoded = verifyToken(header.split(" ")[1]);
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({ message: "User no longer exists" });
    }
    if (!user.isActive) {
      return res.status(403).json({ message: "Account has been deactivated" });
    }

    req.user = user;
    next();
  } catch (err) {
    const msg =
      err.name === "TokenExpiredError"
        ? "Session expired — please log in again"
        : "Not authorized — invalid token";
    return res.status(401).json({ message: msg });
  }
};