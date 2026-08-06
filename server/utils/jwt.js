import jwt from "jsonwebtoken";

/** Sign a token carrying the user's id and role */
export const signToken = (user) =>
  jwt.sign(
    { id: user._id, role: user.role, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );

/** Verify and decode a token. Throws if invalid or expired. */
export const verifyToken = (token) =>
  jwt.verify(token, process.env.JWT_SECRET);