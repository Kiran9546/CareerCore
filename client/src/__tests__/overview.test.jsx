import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * The placement officer Overview against a mocked GET /placement/statistics:
 * every figure on screen is the API's value, formatted, never invented.
 */

const api = vi.hoisted(() => {
  // Reduced motion: numbers show their final value at once.
  window.matchMedia = (query) => ({
    matches: query.includes("reduce"), media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
  });
  return { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn() };
});
vi.mock("../api/axios", () => ({ default: api }));

import Overview from "../pages/placement/Overview";

const LONG_COMPANY = "Tata Consultancy Services Limited – Digital Engineering Division";
const LONG_ROLE = "Graduate Engineer Trainee – Cloud Infrastructure and Site Reliability";

const stats = (over = {}) => ({
  filters: {},
  definitions: {
    population: "Students matching the batch (graduation year) and branch filters",
    placed: "Unique students with at least one final selection; a student with two offers counts once",
    placementPercentage: "Placed students ÷ total students in the population",
    companiesVisited: "Distinct companies with a published, non-cancelled drive in the filter",
    inRecruitment: "Unique students registered in an active drive and not yet eliminated or finished",
  },
  totals: {
    totalStudents: 140, placedStudents: 12, placementPercentage: 8.6, companiesVisited: 11,
    totalDrives: 13, activeDrives: 10, studentsInRecruitment: 1, finalSelections: 15,
  },
  offers: { total: 15, accepted: 4, averageCtc: 6.83, medianCtc: 6.5, highestCtc: 12 },
  branchWise: [
    { branch: "CSE", total: 60, placed: 9, percentage: 15 },
    { branch: "ISE", total: 80, placed: 3, percentage: 3.8 },
  ],
  companyWise: Array.from({ length: 11 }, (_, i) => ({
    company: i === 0 ? LONG_COMPANY : `Company ${String(i).padStart(2, "0")}`,
    companyId: `c${i}`,
    drives: i === 0 ? 2 : 1,
    selections: 11 - i,
    highestCtc: i === 1 ? null : 4 + i,
  })),
  activeDrives: [
    { _id: "d-closed", companyName: "Closed Co", role: "Analyst", status: "registration_closed", driveDate: "2026-12-10T04:30:00Z", workflow: "managed", ctc: 5, registrationDeadline: "2026-11-20T10:00:00Z" },
    { _id: "d-late", companyName: "Late Open", role: "Engineer", status: "open", driveDate: "2026-12-20T04:30:00Z", workflow: "managed", ctc: null, registrationDeadline: "2026-12-15T10:00:00Z" },
    { _id: "d-long", companyName: LONG_COMPANY, role: LONG_ROLE, status: "open", driveDate: "2026-12-05T04:30:00Z", workflow: "managed", ctc: 7.25, registrationDeadline: "2026-12-01T10:00:00Z" },
    ...Array.from({ length: 7 }, (_, i) => ({
      _id: `d-prog-${i}`, companyName: `Running ${i}`, role: "SDE", status: "in_progress", driveDate: "2026-11-30T04:30:00Z", workflow: "managed", ctc: 6, registrationDeadline: null,
    })),
  ],
  ...over,
});

const routes = (statistics) =>
  api.get.mockImplementation((url) => {
    if (url.startsWith("/placement/statistics")) return Promise.resolve({ data: statistics });
    if (url.startsWith("/placement/companies")) return Promise.resolve({ data: { companies: [{ _id: "c0", name: LONG_COMPANY }] } });
    if (url.startsWith("/placement/students")) return Promise.resolve({ data: { students: [{ batch: "2026", branch: "CSE" }, { batch: "2027", branch: "ISE" }] } });
    if (url.startsWith("/placement/policy")) return Promise.resolve({ data: { policy: "allow", options: { allow: "Allow" } } });
    return Promise.resolve({ data: {} });
  });

const renderOverview = () => render(<MemoryRouter><Overview /></MemoryRouter>);
const section = (name) => screen.getByRole("heading", { name }).closest("section");

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
});
afterEach(cleanup);

describe("placement officer overview", () => {
  test("headline and offer figures are the API's values, with units and consistent formatting", async () => {
    routes(stats());
    renderOverview();
    const perf = (await screen.findByRole("heading", { name: "Placement performance" })).closest("section");
    expect(within(perf).getByText("140")).toBeTruthy();
    expect(within(perf).getByText("12")).toBeTruthy();
    expect(within(perf).getByText("8.6%")).toBeTruthy();
    expect(within(perf).getByText("11")).toBeTruthy();
    expect(within(perf).getByText("13 drives published")).toBeTruthy();
    expect(within(perf).getByText("10")).toBeTruthy();
    expect(within(perf).getByText("1 student in recruitment now")).toBeTruthy();

    const offers = section("Offers and compensation");
    expect(within(offers).getByText("15")).toBeTruthy();
    expect(within(offers).getByText("4")).toBeTruthy();
    expect(within(offers).getByText("of 15 offers")).toBeTruthy();
    const card = (label) => within(offers).getByText(label).parentElement.textContent;
    expect(card("Average CTC")).toContain("₹6.83 LPA");
    expect(card("Median CTC")).toContain("₹6.5 LPA");
    expect(card("Highest CTC")).toContain("₹12 LPA");
    // Offers and active drives are separate sections.
    expect(within(offers).queryByText("Closed Co")).toBeNull();
  });

  test("branch table: separate, labelled columns and one-decimal percentages", async () => {
    routes(stats());
    renderOverview();
    await screen.findByRole("heading", { name: "Branch-wise placement" });
    const table = within(section("Branch-wise placement")).getByRole("table");
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Branch", "Students", "Placed", "Placement rate"]);
    const rows = within(table).getAllByRole("row").slice(1).map((r) => r.textContent);
    expect(rows[0]).toContain("CSE");
    expect(rows[0]).toContain("15.0%");
    expect(rows[1]).toContain("3.8%");
  });

  test("company table: full names, missing CTC shown as –, long lists expand", async () => {
    routes(stats());
    renderOverview();
    await screen.findByRole("heading", { name: "Company-wise selections" });
    const sec = section("Company-wise selections");
    expect(within(sec).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Company", "Drives", "Students selected", "Highest CTC"]);
    expect(within(sec).getByRole("rowheader", { name: LONG_COMPANY })).toBeTruthy();
    expect(within(sec).getAllByRole("row")).toHaveLength(1 + 8);
    expect(within(sec).getByText("Showing 8 of 11 companies")).toBeTruthy();
    const company01 = within(sec).getByRole("rowheader", { name: "Company 01" }).closest("tr");
    expect(company01.textContent).toContain("–");

    fireEvent.click(within(sec).getByRole("button", { name: "Show all 11" }));
    expect(within(sec).getAllByRole("row")).toHaveLength(1 + 11);
    expect(within(sec).getByRole("button", { name: "Show fewer" })).toBeTruthy();
  });

  test("active drives: full company and role, CTC, status, deadline, a view link; open drives first; capped with View all", async () => {
    routes(stats());
    renderOverview();
    await screen.findByRole("heading", { name: "Active placement drives" });
    const sec = section("Active placement drives");
    const table = within(sec).getByRole("table");
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Company", "Role", "CTC", "Status", "Registration deadline", "Action"]);
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(8);
    // Open drives first, soonest deadline first; then closed; then in progress.
    expect(rows[0].textContent).toContain(LONG_COMPANY);
    expect(rows[0].textContent).toContain(LONG_ROLE);
    expect(rows[0].textContent).toContain("₹7.25 LPA");
    expect(rows[0].textContent).toContain("Open for registration");
    expect(rows[1].textContent).toContain("Late Open");
    expect(rows[1].textContent).toContain("–");
    expect(rows[2].textContent).toContain("Registration closed");
    expect(within(rows[0]).getByRole("link", { name: `View ${LONG_COMPANY} ${LONG_ROLE} drive` }).getAttribute("href")).toBe("/placement-officer/drives/d-long");
    expect(within(sec).getByText("Showing 8 of 10 active drives")).toBeTruthy();
    expect(within(sec).getByRole("link", { name: "View all drives" }).getAttribute("href")).toBe("/placement-officer/drives");
  });

  test("missing data and empty states: no figures invented", async () => {
    routes(
      stats({
        totals: { totalStudents: 0, placedStudents: 0, placementPercentage: null, companiesVisited: 0, totalDrives: 0, activeDrives: 0, studentsInRecruitment: 0, finalSelections: 0 },
        offers: { total: 0, accepted: 0, averageCtc: null, medianCtc: null, highestCtc: null },
        branchWise: [],
        companyWise: [],
        activeDrives: [],
      }),
    );
    renderOverview();
    const perf = (await screen.findByRole("heading", { name: "Placement performance" })).closest("section");
    expect(within(perf).getByText("0 drives published")).toBeTruthy();
    expect(within(perf).getByText("0 students in recruitment now")).toBeTruthy();
    expect(within(section("Offers and compensation")).getAllByText("–")).toHaveLength(3);
    expect(screen.getByText("No students match these filters.")).toBeTruthy();
    // Table (tablet and up) and list (phones) both say so; CSS picks one.
    expect(screen.getAllByText("No published drives yet.").length).toBeGreaterThan(0);
    expect(screen.getByText("No active drives right now.")).toBeTruthy();
  });

  test("filters go to the real statistics endpoint", async () => {
    routes(stats());
    renderOverview();
    await screen.findByRole("heading", { name: "Placement performance" });
    await waitFor(() => expect(screen.getByRole("option", { name: "2026" })).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Batch"), { target: { value: "2026" } });
    fireEvent.change(screen.getByLabelText("Branch"), { target: { value: "CSE" } });
    await waitFor(() => expect(screen.getByRole("option", { name: LONG_COMPANY })).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Company"), { target: { value: "c0" } });
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith("/placement/statistics?batch=2026&branch=CSE&companyId=c0"),
    );
    expect(screen.getByRole("link", { name: "Manage drives" }).getAttribute("href")).toBe("/placement-officer/drives");
  });

  test("an API error is shown with a retry, not empty figures", async () => {
    api.get.mockImplementation((url) =>
      url.startsWith("/placement/statistics")
        ? Promise.reject({ response: { data: { message: "Could not load placement statistics" } } })
        : Promise.resolve({ data: { students: [], companies: [] } }),
    );
    renderOverview();
    expect(await screen.findByText("Could not load placement statistics")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Placement performance" })).toBeNull();
  });
});
