import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.join(__dirname, "..", "uploads", "resume-photos");

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED = ["image/jpeg", "image/jpg", "image/png"];
const MAX_BYTES = 2 * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    cb(null, `${req.user._id}${ext}`);
  },
});

const photoUpload = multer({
  storage,
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED.includes(file.mimetype)) {
      return cb(new Error("Only JPG, JPEG and PNG files are allowed"));
    }
    cb(null, true);
  },
}).single("photo");

export const handlePhotoUpload = (req, res, next) => {
  photoUpload(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ message: "Photo must be under 2 MB" });
      }
      return res.status(400).json({ message: err.message });
    }
    if (err) return res.status(400).json({ message: err.message });
    next();
  });
};

export { UPLOAD_DIR };