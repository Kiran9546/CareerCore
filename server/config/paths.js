import path from "path";
import { fileURLToPath } from "url";

const serverRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Where uploaded files live. Defaults to server/uploads; set UPLOAD_DIR to a
 * shared volume (NFS, EFS, a Docker volume) when running more than one API
 * instance, so a photo uploaded through one instance is served by all.
 */
export const UPLOAD_ROOT = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(serverRoot, "uploads");
