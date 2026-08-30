import api from "../api/axios";

/**
 * Download the placement workbook.
 *
 * The endpoint is authenticated, so the file cannot be fetched with a plain
 * <a href> — the browser would send no Authorization header and get a 401.
 * It is pulled as a blob through the same axios instance every other call
 * uses, then handed to the browser via a temporary object URL.
 */
export const downloadPlacementExport = async ({ batch, branch } = {}) => {
  const q = new URLSearchParams();
  if (batch) q.set("batch", batch);
  if (branch) q.set("branch", branch);

  let res;
  try {
    res = await api.get(`/placement/export${q.toString() ? `?${q}` : ""}`, {
      responseType: "blob",
    });
  } catch (err) {
    // An error response to a blob request arrives as a Blob too, so the
    // server's JSON message has to be read back out of it — otherwise the
    // user sees "[object Blob]".
    const body = err.response?.data;
    if (body instanceof Blob) {
      const text = await body.text().catch(() => "");
      let message = "";
      try {
        message = JSON.parse(text)?.message ?? "";
      } catch {
        // Not JSON — an HTML error page or an empty body. Fall through to
        // the generic message rather than surfacing the raw markup.
      }
      throw new Error(message || "Export failed", { cause: err });
    }
    throw new Error(err.response?.data?.message || "Export failed", { cause: err });
  }

  // Prefer the filename the server chose; fall back to a dated default.
  const disposition = res.headers["content-disposition"] || "";
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename =
    match?.[1] || `careercore-placement-${new Date().toISOString().slice(0, 10)}.xlsx`;

  const url = URL.createObjectURL(new Blob([res.data]));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  return filename;
};
