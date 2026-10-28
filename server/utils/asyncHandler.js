/**
 * Wrap an async route handler so a thrown error (including an httpError from
 * the services) reaches the global error handler in app.js.
 *
 *   export const list = asyncHandler(async (req, res) => { ... });
 */
export const asyncHandler = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (err) {
    next(err);
  }
};
