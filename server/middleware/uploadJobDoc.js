import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { JD_MAX_SIZE_MB, JD_MAX_FILES } from "../config/constants.js";

/**
 * Upload handler for job documents — the JD and any other material a
 * company sends the placement cell.
 *
 * Follows the same shape as handlePhotoUpload in upload.js (disk storage
 * under server/uploads, served by the static mount in index.js), with three
 * differences the use case forces:
 *
 *   - Several files per posting, not one. A company often sends a JD plus a
 *     company deck plus an eligibility sheet.
 *   - Documents as well as images, since JDs arrive as PDF or Word.
 *   - Random filenames rather than the uploader's id. Photos are one per
 *     user so the id is a natural key; job documents are many per posting,
 *     and reusing an uploaded name would let one posting overwrite another's
 *     file — or let a crafted name escape the directory.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JOB_DOC_DIR = path.join(__dirname, "..", "uploads", "job-documents");

fs.mkdirSync(JOB_DOC_DIR, { recursive: true });

const ALLOWED = {
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "text/plain": ".txt",
};

const MAX_BYTES = JD_MAX_SIZE_MB * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, JOB_DOC_DIR),
  filename: (req, file, cb) => {
    // Extension comes from the vetted mime map, never from the client's
    // filename — that string is attacker-controlled and is only ever kept
    // as `originalName` metadata for display.
    const ext = ALLOWED[file.mimetype] || ".bin";
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const jobDocUpload = multer({
  storage,
  limits: { fileSize: MAX_BYTES, files: JD_MAX_FILES },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED[file.mimetype]) {
      return cb(
        new Error(
          "Only PDF, Word, Excel, image and text files are allowed",
        ),
      );
    }
    cb(null, true);
  },
}).array("documents", JD_MAX_FILES);

export const handleJobDocUpload = (req, res, next) => {
  jobDocUpload(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res
          .status(400)
          .json({ message: `Each file must be under ${JD_MAX_SIZE_MB} MB` });
      }
      if (err.code === "LIMIT_FILE_COUNT") {
        return res
          .status(400)
          .json({ message: `At most ${JD_MAX_FILES} files per posting` });
      }
      return res.status(400).json({ message: err.message });
    }
    if (err) return res.status(400).json({ message: err.message });
    next();
  });
};

/** Map multer's files onto the Job.attachments sub-document shape. */
export const toAttachments = (files = []) =>
  files.map((f) => ({
    filename: f.filename,
    originalName: f.originalname,
    url: `/uploads/job-documents/${f.filename}`,
    mimeType: f.mimetype,
    sizeBytes: f.size,
    uploadedAt: new Date(),
  }));

/** Delete a stored document. Silent on failure — a missing file is fine. */
export const removeJobDoc = (filename) => {
  if (!filename) return;
  // Guard against a stored name that could climb out of the directory.
  const safe = path.basename(filename);
  const target = path.join(JOB_DOC_DIR, safe);
  if (fs.existsSync(target)) {
    try {
      fs.unlinkSync(target);
    } catch {
      /* ignore */
    }
  }
};

export { JOB_DOC_DIR };
