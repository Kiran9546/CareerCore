import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { AuthContext } from "../context/useAuth";

/**
 * Sign-up with contact details, the contact & alerts section (email link,
 * WhatsApp code), the email-verification page and the dashboard reminder —
 * rendered in jsdom against a mocked API.
 */

const api = vi.hoisted(() => {
  // jsdom has no matchMedia; the sign-in frame's theme toggle reads it on import.
  if (!window.matchMedia) {
    window.matchMedia = (query) => ({
      matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
    });
  }
  return { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn() };
});
vi.mock("../api/axios", () => ({ default: api }));

import NotificationPreferences from "../components/NotificationPreferences";
import Register from "../pages/auth/Register";
import VerifyEmail from "../pages/auth/VerifyEmail";
import ContactBanner from "../components/ContactBanner";

const contact = (over = {}) => ({
  email: { address: "asha@gmail.com", verified: false, verifiedAt: null, enabled: true },
  phone: { number: "+919876543210", verified: false, verifiedAt: null },
  whatsapp: {
    available: true, sandbox: false, optIn: false, active: false, consentAt: null, optOutAt: null,
    consentText: "I agree to receive placement drive alerts … replying STOP.", consentVersion: "v3",
  },
  ...over,
});
const verifiedContact = (active = true) =>
  contact({
    phone: { number: "+919876543210", verified: true, verifiedAt: "2026-11-25T09:00:00.000Z" },
    whatsapp: { ...contact().whatsapp, optIn: active, active, consentAt: "2026-11-25T09:00:00.000Z" },
  });

function Where() {
  const loc = useLocation();
  return <p data-testid="where">{loc.pathname}|{JSON.stringify(loc.state)}</p>;
}

const renderWith = (ui, { auth = {}, path = "/" } = {}) =>
  render(
    <AuthContext.Provider value={{ user: null, refreshUser: vi.fn(() => Promise.resolve()), ...auth }}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/student/profile" element={<Where />} />
          <Route path="*" element={ui} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
});
afterEach(cleanup);

describe("contact & alerts section", () => {
  test("unverified number: consent shown, code sent, entered, and WhatsApp alerts become active", async () => {
    const refreshUser = vi.fn(() => Promise.resolve());
    api.get.mockResolvedValue({ data: contact() });
    api.post.mockImplementation((url) =>
      Promise.resolve({
        data: url === "/auth/phone/send-code"
          ? { sentTo: "+91••••••3210", simulated: false }
          : { ...verifiedContact(), catchUp: { queued: 2, drives: 2 } },
      }),
    );
    renderWith(<NotificationPreferences />, { auth: { refreshUser } });

    expect(await screen.findByText("asha@gmail.com")).toBeTruthy();
    expect(screen.getByText("Not verified")).toBeTruthy();
    expect(screen.getByText(/no WhatsApp messages until you enter the code/)).toBeTruthy();
    expect(screen.getByLabelText("WhatsApp number").value).toBe("+919876543210");
    expect(screen.getByText(/I agree to receive placement drive alerts/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Send verification code" }));
    const codeInput = await screen.findByLabelText("Verification code");
    expect(api.post).toHaveBeenCalledWith("/auth/phone/send-code", { phone: "+919876543210", consent: true });
    expect(screen.getByText(/sent on WhatsApp to \+91••••••3210/)).toBeTruthy();

    const verifyBtn = screen.getByRole("button", { name: "Verify" });
    expect(verifyBtn.disabled).toBe(true);
    fireEvent.change(codeInput, { target: { value: "12a34 56" } });
    expect(codeInput.value).toBe("123456");
    fireEvent.click(verifyBtn);
    await screen.findByText(/Verified · alerts on/);
    expect(api.post).toHaveBeenLastCalledWith("/auth/phone/verify", { code: "123456" });
    expect(refreshUser).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Stop WhatsApp alerts" })).toBeTruthy();
  });

  test("after sign-up the code step is open; sandbox codes are labelled as simulated", async () => {
    api.get.mockResolvedValue({ data: contact({ whatsapp: { ...contact().whatsapp, sandbox: true } }) });
    renderWith(<NotificationPreferences pending={{ whatsapp: { sentTo: "+91••••••3210", simulated: true, devCode: "482913" } }} />);
    expect(await screen.findByLabelText("Verification code")).toBeTruthy();
    expect(screen.getByText(/Sandbox mode: no WhatsApp was sent/)).toBeTruthy();
    expect(screen.getByText("482913")).toBeTruthy();
    expect(screen.getByText(/this server simulates email and WhatsApp/)).toBeTruthy();
  });

  test("a wrong code shows the server's message; stop and resume alerts on a verified number", async () => {
    api.get.mockResolvedValue({ data: contact() });
    api.post.mockImplementation((url) =>
      url === "/auth/phone/send-code"
        ? Promise.resolve({ data: { sentTo: "+91••••••3210" } })
        : Promise.reject({ response: { data: { message: "That code is not right. 4 attempts left" } } }),
    );
    renderWith(<NotificationPreferences />);
    fireEvent.click(await screen.findByRole("button", { name: "Send verification code" }));
    fireEvent.change(await screen.findByLabelText("Verification code"), { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    expect(await screen.findByText("That code is not right. 4 attempts left")).toBeTruthy();
    cleanup();

    api.get.mockResolvedValue({ data: verifiedContact(true) });
    api.put.mockResolvedValueOnce({ data: verifiedContact(false) }).mockResolvedValueOnce({ data: verifiedContact(true) });
    renderWith(<NotificationPreferences />);
    fireEvent.click(await screen.findByRole("button", { name: "Stop WhatsApp alerts" }));
    await screen.findByText(/Verified · alerts off/);
    expect(api.put).toHaveBeenLastCalledWith("/auth/contact/whatsapp", { optIn: false });
    fireEvent.click(screen.getByRole("button", { name: "Turn on WhatsApp alerts" }));
    await screen.findByText(/Verified · alerts on/);
    expect(api.put).toHaveBeenLastCalledWith("/auth/contact/whatsapp", { optIn: true });
  });

  test("email-only server: no WhatsApp anywhere; placement emails can be turned off and on; the mobile number can be changed", async () => {
    const emailOnly = (over = {}) =>
      contact({
        sandbox: false,
        email: { address: "asha@gmail.com", verified: true, verifiedAt: "2026-11-25T09:00:00.000Z", enabled: true, optIn: true, ...over },
        whatsapp: { ...contact().whatsapp, available: false },
      });
    api.get.mockResolvedValue({ data: emailOnly() });
    api.put.mockImplementation((url, body) =>
      Promise.resolve({
        data:
          url === "/auth/contact/email"
            ? { ...emailOnly({ optIn: body.optIn }), catchUp: { queued: body.optIn ? 1 : 0, drives: 1 } }
            : { ...emailOnly(), phone: { number: "+919123456789", verified: false, verifiedAt: null } },
      }),
    );
    renderWith(<NotificationPreferences />);

    expect(await screen.findByText("asha@gmail.com")).toBeTruthy();
    expect(screen.getByText(/announced here in CareerCore and by email\./)).toBeTruthy();
    expect(screen.queryByText(/WhatsApp/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Send verification code" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Turn off placement emails" }));
    await screen.findByText(/Off: alerts appear in CareerCore only/);
    expect(api.put).toHaveBeenLastCalledWith("/auth/contact/email", { optIn: false });
    fireEvent.click(screen.getByRole("button", { name: "Turn on placement emails" }));
    await screen.findByRole("button", { name: "Turn off placement emails" });
    expect(api.put).toHaveBeenLastCalledWith("/auth/contact/email", { optIn: true });

    expect(screen.getByText("+919876543210")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Change number" }));
    fireEvent.change(screen.getByLabelText("Mobile number"), { target: { value: "+91 91234 56789" } });
    fireEvent.click(screen.getByRole("button", { name: "Save number" }));
    expect(await screen.findByText("+919123456789")).toBeTruthy();
    expect(api.put).toHaveBeenLastCalledWith("/auth/contact/phone", { phone: "+91 91234 56789" });
    expect(api.post).not.toHaveBeenCalled();
  });

  test("live server: no sandbox banner; a real send is confirmed and a failed one shows the server's reason", async () => {
    api.get.mockResolvedValue({ data: contact({ sandbox: false, whatsapp: { ...contact().whatsapp, available: false } }) });
    api.post
      .mockResolvedValueOnce({ data: { sent: false, code: "EAUTH", reason: "The placement cell's email account refused to log in, so no email was sent. Please contact the placement cell" } })
      .mockResolvedValueOnce({ data: { sent: true, simulated: false } });
    renderWith(<NotificationPreferences />);
    expect(await screen.findByText("asha@gmail.com")).toBeTruthy();
    expect(screen.queryByText(/Sandbox mode/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Send verification email" }));
    expect(await screen.findByText(/refused to log in, so no email was sent/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Open the verification link" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Send verification email" }));
    expect(await screen.findByText(/Verification email sent to asha@gmail.com at .*Check your inbox and the Spam folder/)).toBeTruthy();
    expect(screen.queryByText(/refused to log in/)).toBeNull();
    expect(screen.queryByRole("link", { name: "Open the verification link" })).toBeNull();
  });

  test("resend verification email", async () => {
    api.get.mockResolvedValue({ data: contact() });
    api.post.mockResolvedValue({ data: { sent: false, simulated: true, devLink: "http://localhost:5173/verify-email?token=abc" } });
    renderWith(<NotificationPreferences />);
    fireEvent.click(await screen.findByRole("button", { name: "Send verification email" }));
    const link = await screen.findByRole("link", { name: "Open the verification link" });
    expect(link.getAttribute("href")).toContain("/verify-email?token=abc");
    expect(api.post).toHaveBeenCalledWith("/auth/email/resend");
  });
});

/** GET mock: the public channel list, departments, anything else. */
const getRoutes = ({ whatsapp = false, contactData } = {}) =>
  api.get.mockImplementation((url) =>
    Promise.resolve({
      data:
        url === "/auth/alert-channels"
          ? { inApp: true, email: true, whatsapp }
          : url === "/auth/contact"
            ? contactData
            : { departments: [] },
    }),
  );

describe("sign-up", () => {
  test("email-only server: no WhatsApp consent box; the mobile number is still collected", async () => {
    getRoutes({ whatsapp: false });
    const register = vi.fn(() => Promise.resolve({ role: "student", verification: { email: { sent: true }, whatsapp: null } }));
    renderWith(<Register />, { auth: { register }, path: "/register" });
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/auth/alert-channels"));
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByText(/WhatsApp/)).toBeNull();

    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Asha Rao" } });
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "asha@gmail.com" } });
    fireEvent.change(screen.getByLabelText("Mobile number"), { target: { value: "+91 98765 43210" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Password123!" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "Password123!" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(register).toHaveBeenCalled());
    expect(register.mock.calls[0][0]).toMatchObject({ phone: "+91 98765 43210", whatsappConsent: false });
  });

  test("students must give a mobile number; consent is optional and sent; they land on code entry", async () => {
    getRoutes({ whatsapp: true });
    const register = vi.fn(() =>
      Promise.resolve({ role: "student", verification: { whatsapp: { sentTo: "+91••••••3210" } } }),
    );
    renderWith(<Register />, { auth: { register }, path: "/register" });

    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Asha Rao" } });
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "asha@gmail.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Password123!" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "Password123!" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText("Enter your mobile number.")).toBeTruthy();
    expect(register).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Mobile number"), { target: { value: "12345" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText(/valid mobile number/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Mobile number"), { target: { value: "+91 98765 43210" } });
    fireEvent.click(await screen.findByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(register).toHaveBeenCalled());
    expect(register.mock.calls[0][0]).toMatchObject({ role: "student", phone: "+91 98765 43210", whatsappConsent: true });
    const where = await screen.findByTestId("where");
    expect(where.textContent).toContain("/student/profile");
    expect(where.textContent).toContain("+91••••••3210");
  });

  test("staff sign-up does not ask for a mobile number", async () => {
    api.get.mockResolvedValue({ data: { departments: [] } });
    renderWith(<Register />, { auth: { register: vi.fn() }, path: "/register" });
    fireEvent.click(screen.getByLabelText(/Placement Officer/));
    expect(screen.queryByLabelText("Mobile number")).toBeNull();
  });
});

describe("email verification page and dashboard reminder", () => {
  test("a valid link confirms the address; an invalid one explains what to do", async () => {
    api.post.mockResolvedValueOnce({ data: { verified: true, email: "asha@gmail.com" } });
    renderWith(<VerifyEmail />, { path: "/verify-email?token=" + "a".repeat(64) });
    expect(await screen.findByText("Email verified")).toBeTruthy();
    expect(api.post).toHaveBeenCalledWith("/auth/email/verify", { token: "a".repeat(64) });
    cleanup();

    api.post.mockRejectedValueOnce({ response: { data: { message: "This verification link has expired. Sign in and ask for a new one" } } });
    renderWith(<VerifyEmail />, { path: "/verify-email?token=bad" });
    expect(await screen.findByText("Link not valid")).toBeTruthy();
    expect(screen.getByText(/has expired/)).toBeTruthy();
  });

  test("email-only server: the reminder is about email alone, and goes once the email is verified", async () => {
    getRoutes({ whatsapp: false });
    renderWith(<ContactBanner />, { auth: { user: { role: "student", emailVerifiedAt: null, phoneVerifiedAt: null, whatsapp: { optIn: true } } } });
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/auth/alert-channels"));
    expect(screen.getByText(/reach you outside CareerCore, verify your email\./)).toBeTruthy();
    expect(screen.queryByText(/WhatsApp/)).toBeNull();
    cleanup();
    renderWith(<ContactBanner />, { auth: { user: { role: "student", emailVerifiedAt: "x", phoneVerifiedAt: null } } });
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("status")).toBeNull();
  });

  test("the dashboard reminds a student until both are verified", async () => {
    getRoutes({ whatsapp: true });
    renderWith(<ContactBanner />, { auth: { user: { role: "student", emailVerifiedAt: null, phoneVerifiedAt: null, whatsapp: { optIn: true } } } });
    expect(await screen.findByText(/verify your email and verify your WhatsApp number/)).toBeTruthy();
    cleanup();
    renderWith(<ContactBanner />, { auth: { user: { role: "student", emailVerifiedAt: "x", phoneVerifiedAt: "y", whatsapp: { optIn: true } } } });
    expect(screen.queryByRole("status")).toBeNull();
    cleanup();
    renderWith(<ContactBanner />, { auth: { user: { role: "placement_officer" } } });
    expect(screen.queryByRole("status")).toBeNull();
  });
});
