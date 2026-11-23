import Student from "../models/Student.js";
import User from "../models/User.js";
import Drive from "../models/Drive.js";
import { ROLES, PLACEMENT_VIEWER_ROLES } from "../config/constants.js";
import { escapeRegex } from "../utils/escapeRegex.js";

const LIMIT = 8;
const MIN_QUERY = 2;

/**
 * GET /api/search?q=  Quick search for staff, used by the search dialog.
 *
 * Results respect the same scope as the pages they link to:
 *   - placement officers and administrators: students in every department,
 *     and placement drives;
 *   - faculty: students of their own department only (none if the account
 *     has no department), and no drives;
 *   - students get nothing here; their search runs over their own drive list.
 */
export const search = async (req, res, next) => {
  try {
    const q = String(req.query.q || "").trim().slice(0, 80);
    const empty = { students: [], drives: [] };
    if (q.length < MIN_QUERY) return res.json(empty);

    const { role, department } = req.user;
    const seesAll = PLACEMENT_VIEWER_ROLES.includes(role);
    const isFaculty = role === ROLES.FACULTY;
    if (!seesAll && !isFaculty) return res.json(empty);
    if (isFaculty && !department) return res.json(empty);

    const rx = new RegExp(escapeRegex(q), "i");

    const users = await User.find({ role: ROLES.STUDENT, name: rx }).select("_id").limit(50).lean();
    const studentFilter = { $or: [{ usn: rx }, { userId: { $in: users.map((u) => u._id) } }] };
    if (isFaculty) studentFilter.branch = department;

    const [students, drives] = await Promise.all([
      Student.find(studentFilter)
        .populate("userId", "name")
        .select("usn branch batch userId")
        .sort("usn")
        .limit(LIMIT)
        .lean(),
      seesAll
        ? Drive.find({ $or: [{ companyName: rx }, { role: rx }] })
            .select("companyName role driveDate status updatedAt")
            .sort({ driveDate: -1 })
            .limit(LIMIT)
            .lean()
        : [],
    ]);

    res.json({
      students: students.map((s) => ({
        _id: s._id,
        name: s.userId?.name || "",
        usn: s.usn,
        branch: s.branch,
        batch: s.batch,
      })),
      drives: drives.map((d) => ({
        _id: d._id,
        companyName: d.companyName,
        role: d.role,
        driveDate: d.driveDate,
        status: d.status,
      })),
    });
  } catch (err) {
    next(err);
  }
};
