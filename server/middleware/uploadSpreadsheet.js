import multer from "multer";

/**
 * Upload handler for results spreadsheets.
 *
 * Memory storage rather than disk: the file is parsed once and discarded,
 * so writing it to disk would only leave copies of student records lying
 * around with nothing reading them. The 8 MB cap is far above any realistic
 * batch sheet while still bounding what one request can hold in memory.
 */

const ALLOWED = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel", // .xls, and what some browsers send for .xlsx
  "application/octet-stream", // what a few clients send for a drag-dropped file
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const looksRight =
      ALLOWED.has(file.mimetype) || /\.xlsx?$/i.test(file.originalname);
    if (!looksRight) {
      return cb(new Error("Upload an Excel file (.xlsx or .xls)"));
    }
    cb(null, true);
  },
}).single("file");

export const handleSpreadsheetUpload = (req, res, next) => {
  upload(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ message: "The spreadsheet must be under 8 MB" });
      }
      return res.status(400).json({ message: err.message });
    }
    if (err) return res.status(400).json({ message: err.message });
    next();
  });
};
