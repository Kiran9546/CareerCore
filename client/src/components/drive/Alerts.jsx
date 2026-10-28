import { ui } from "../../utils/placement";

/** The error / success banners every placement page already uses. */
export default function Alerts({ error, notice }) {
  return (
    <>
      {error && <div className={ui.error} role="alert">{error}</div>}
      {notice && <div className={ui.notice} role="status">{notice}</div>}
    </>
  );
}
