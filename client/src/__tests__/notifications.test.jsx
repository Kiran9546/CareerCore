import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within, cleanup, act } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useParams } from "react-router-dom";
import { AuthContext } from "../context/useAuth";

/**
 * The student notification centre, the bell, and the officer's delivery
 * report, rendered in jsdom against a mocked API. Every figure on screen
 * must be the figure the API returned.
 */

const api = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn(), post: vi.fn(), put: vi.fn() }));
vi.mock("../api/axios", () => ({ default: api }));
vi.mock("../components/ui/confirm", () => ({ confirmAction: vi.fn(() => Promise.resolve(true)) }));

import Notifications from "../pages/student/Notifications";
import NotificationBell from "../components/NotificationBell";
import NotificationDeliveryPanel from "../components/drive/NotificationDeliveryPanel";
import { announceUnread } from "../utils/notifications";

const DRIVE_ID = "64b000000000000000000001";

const driveNote = (over = {}) => ({
  _id: "n1",
  type: "drive_opportunity",
  title: "Acme Systems: Placement Opportunity",
  body: "You are eligible for the Graduate Engineer placement drive.",
  link: `/student/drives/${DRIVE_ID}`,
  isRead: false,
  createdAt: "2026-11-20T09:30:00.000Z",
  metadata: {
    driveId: DRIVE_ID,
    kind: "opportunity",
    companyName: "Acme Systems",
    role: "Graduate Engineer",
    registrationDeadline: "2026-11-30T17:00:00.000Z",
    ctc: 8.5,
  },
  ...over,
});
const systemNote = { _id: "n2", type: "system", title: "Welcome", body: "Hello there", isRead: true, createdAt: "2026-11-01T09:00:00.000Z" };

function DriveProbe() {
  const { id } = useParams();
  return <p>Drive page {id}</p>;
}

const renderAt = (ui, { user = { role: "student" }, path = "/student/notifications" } = {}) =>
  render(
    <AuthContext.Provider value={{ user }}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/student/notifications" element={ui} />
          <Route path="/student/drives/:id" element={<DriveProbe />} />
          <Route path="*" element={ui} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
});
afterEach(cleanup);

describe("student notification centre", () => {
  test("shows drive notifications with company, role, deadline and date", async () => {
    api.get.mockResolvedValue({ data: { notifications: [driveNote(), systemNote], unread: 1, total: 2, page: 1, limit: 20 } });
    renderAt(<Notifications />);

    const items = await screen.findAllByTestId("notification");
    expect(items).toHaveLength(2);
    const first = within(items[0]);
    expect(first.getByText("Acme Systems")).toBeTruthy();
    expect(first.getByText(/Graduate Engineer · ₹8.5 LPA/)).toBeTruthy();
    expect(first.getByText("Register by")).toBeTruthy();
    expect(first.getByText("Unread")).toBeTruthy();
    expect(items[0].querySelector("time").getAttribute("dateTime")).toBe("2026-11-20T09:30:00.000Z");
    expect(within(items[1]).getByText("Hello there")).toBeTruthy();
    expect(screen.getByText(/1 unread/)).toBeTruthy();
    expect(api.get).toHaveBeenCalledWith("/notifications", { params: { page: 1, limit: 20, status: "all" } });
  });

  test("View drive & register marks it read and opens the correct drive", async () => {
    api.get.mockResolvedValue({ data: { notifications: [driveNote()], unread: 1, total: 1, page: 1, limit: 20 } });
    api.patch.mockResolvedValue({ data: { unread: 0 } });
    const heard = vi.fn();
    window.addEventListener("cc:notifications-changed", heard);
    renderAt(<Notifications />);

    fireEvent.click(await screen.findByRole("button", { name: "View drive & register" }));
    expect(await screen.findByText(`Drive page ${DRIVE_ID}`)).toBeTruthy();
    expect(api.patch).toHaveBeenCalledWith("/notifications/read", { ids: ["n1"] });
    expect(heard).toHaveBeenCalled();
    expect(heard.mock.calls[0][0].detail.unread).toBe(0);
    window.removeEventListener("cc:notifications-changed", heard);
  });

  test("mark as read / unread updates the item and the count from the server's answer", async () => {
    api.get.mockResolvedValue({ data: { notifications: [driveNote()], unread: 1, total: 1, page: 1, limit: 20 } });
    api.patch.mockResolvedValueOnce({ data: { unread: 0 } }).mockResolvedValueOnce({ data: { unread: 1 } });
    renderAt(<Notifications />);

    fireEvent.click(await screen.findByRole("button", { name: "Mark as read" }));
    await screen.findByRole("button", { name: "Mark as unread" });
    expect(api.patch).toHaveBeenLastCalledWith("/notifications/read", { ids: ["n1"] });
    expect(screen.getByText(/all caught up/)).toBeTruthy();
    expect(screen.queryByText("Unread", { selector: "span" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Mark as unread" }));
    await screen.findByRole("button", { name: "Mark as read" });
    expect(api.patch).toHaveBeenLastCalledWith("/notifications/unread", { ids: ["n1"] });
    expect(screen.getByText(/1 unread/)).toBeTruthy();
  });

  test("the unread filter and 'show older' page through the history", async () => {
    api.get
      .mockResolvedValueOnce({ data: { notifications: [driveNote()], unread: 1, total: 2, page: 1, limit: 20 } })
      .mockResolvedValueOnce({ data: { notifications: [systemNote], unread: 1, total: 2, page: 2, limit: 20 } })
      .mockResolvedValueOnce({ data: { notifications: [driveNote()], unread: 1, total: 1, page: 1, limit: 20 } });
    renderAt(<Notifications />);

    fireEvent.click(await screen.findByRole("button", { name: "Show older notifications" }));
    await waitFor(() => expect(screen.getAllByTestId("notification")).toHaveLength(2));
    expect(api.get).toHaveBeenLastCalledWith("/notifications", { params: { page: 2, limit: 20, status: "all" } });
    expect(screen.queryByRole("button", { name: "Show older notifications" })).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Unread" }));
    await waitFor(() => expect(screen.getAllByTestId("notification")).toHaveLength(1));
    expect(api.get).toHaveBeenLastCalledWith("/notifications", { params: { page: 1, limit: 20, status: "unread" } });
  });

  test("layout stacks on small screens and spreads out from the sm breakpoint", async () => {
    api.get.mockResolvedValue({ data: { notifications: [driveNote()], unread: 1, total: 1, page: 1, limit: 20 } });
    renderAt(<Notifications />);
    const item = await screen.findByTestId("notification");
    // One column on phones, three from tablet width; text wraps rather than overflowing.
    expect(item.querySelector("dl").className).toMatch(/grid-cols-1 sm:grid-cols-3/);
    expect(item.querySelector("p").className).toMatch(/break-words/);
  });
});

describe("notification bell", () => {
  test("shows the unread count, follows the centre's changes, and links to the centre", async () => {
    api.get.mockResolvedValue({ data: { notifications: [driveNote()], unread: 1 } });
    renderAt(<NotificationBell />, { path: "/student" });

    const bell = await screen.findByRole("button", { name: "Notifications, 1 unread" });
    act(() => announceUnread(0));
    await screen.findByRole("button", { name: "Notifications" });

    fireEvent.click(bell);
    const link = await screen.findByRole("link", { name: "View all notifications" });
    expect(link.getAttribute("href")).toBe("/student/notifications");
  });

  test("staff accounts get no student notification-centre link", async () => {
    api.get.mockResolvedValue({ data: { notifications: [], unread: 0 } });
    renderAt(<NotificationBell />, { user: { role: "placement_officer" }, path: "/placement-officer" });
    fireEvent.click(await screen.findByRole("button", { name: "Notifications" }));
    await screen.findByText("No notifications yet.");
    expect(screen.queryByRole("link", { name: "View all notifications" })).toBeNull();
  });
});

describe("placement officer delivery report", () => {
  const summary = (over = {}) => ({
    config: { mode: "live", email: { enabled: true, configured: true }, whatsapp: { enabled: true, configured: true } },
    eligible: 120,
    notified: 120,
    inApp: { created: 120, read: 45 },
    email: { total: 120, pending: 3, sent: 110, delivered: 0, read: 0, failed: 7, skipped: 0, simulated: 0, succeeded: 110, skippedBy: {} },
    whatsapp: {
      total: 120, pending: 0, sent: 20, delivered: 30, read: 10, failed: 2, skipped: 58, simulated: 0, succeeded: 60,
      skippedBy: { no_consent: 50, invalid_phone: 8 }, unreachable: 58,
    },
    ...over,
  });
  const deliveries = {
    page: 1, limit: 25, total: 1,
    deliveries: [{
      _id: "d1", channel: "email", status: "failed", attempts: 5, manualRetries: 0, recipientMasked: "ki•••@example.com",
      lastError: { code: "SMTP_550", message: "Mailbox unavailable" }, student: { name: "Asha Rao", usn: "4MT22CS001", branch: "CSE" },
    }],
  };
  const drive = { _id: DRIVE_ID, status: "open" };

  const mockApi = (s) =>
    api.get.mockImplementation((url) =>
      Promise.resolve({ data: url.endsWith("/summary") ? { summary: s } : deliveries }),
    );

  test("shows the backend's figures per channel and the failure detail", async () => {
    mockApi(summary());
    renderAt(<NotificationDeliveryPanel drive={drive} canRetry onError={vi.fn()} onNotice={vi.fn()} />, { user: { role: "placement_officer" } });

    const email = (await screen.findByRole("heading", { name: "Email" })).closest("div.bg-white");
    expect(within(email).getByText("110")).toBeTruthy();
    expect(within(email).getByText("7")).toBeTruthy();
    expect(within(email).getByText("3")).toBeTruthy();
    const wa = screen.getByRole("heading", { name: "WhatsApp" }).closest("div.bg-white");
    expect(within(wa).getByText("60")).toBeTruthy();
    expect(within(wa).getByText("40 delivered · 10 read")).toBeTruthy();
    expect(within(wa).getByText("58 without valid number or consent")).toBeTruthy();
    expect(within(wa).getByText("No WhatsApp consent: 50")).toBeTruthy();
    expect(screen.getByText("Mailbox unavailable")).toBeTruthy();
    expect(screen.getByText("ki•••@example.com")).toBeTruthy();
    // Live and configured: no warning banner.
    expect(screen.queryByText(/Sandbox mode/)).toBeNull();
  });

  test("retry asks the server and reports what it actually queued", async () => {
    mockApi(summary());
    api.post.mockResolvedValue({ data: { retried: 7, backfilled: 0 } });
    const onNotice = vi.fn();
    renderAt(<NotificationDeliveryPanel drive={drive} canRetry onError={vi.fn()} onNotice={onNotice} />, { user: { role: "placement_officer" } });

    fireEvent.click(await screen.findByRole("button", { name: "Retry 7 failed" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(`/placement/drives/${DRIVE_ID}/notifications/retry`, { channel: "email" }));
    await waitFor(() => expect(onNotice).toHaveBeenCalledWith("7 Email message(s) queued to be sent."));
  });

  test("sandbox and unconfigured channels are stated plainly, and closed drives offer no retry", async () => {
    mockApi(summary({
      config: { mode: "sandbox", email: { enabled: true, configured: true }, whatsapp: { enabled: true, configured: false } },
    }));
    renderAt(<NotificationDeliveryPanel drive={{ ...drive, status: "registration_closed" }} canRetry onError={vi.fn()} onNotice={vi.fn()} />);
    expect(await screen.findByText(/Sandbox mode: .* Nothing is sent to students/)).toBeTruthy();
    expect(screen.getByText(/WhatsApp is switched on but its credentials are not configured/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Retry/ })).toBeNull();
  });
});
