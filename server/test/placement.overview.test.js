import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { setup, teardown, reset, createUser, createStudent, api, days } from "./helpers.js";

/**
 * GET /placement/statistics as the Overview dashboard reads it: active
 * drives carry their CTC and registration deadline (for the drives table),
 * drafts and cancelled drives are not active, and the existing figures are
 * unchanged.
 */

before(setup);
after(teardown);
beforeEach(reset);

const makeDrive = async (O, companyName, extra = {}) => {
  const company = await O.post("/placement/companies", { name: companyName });
  assert.equal(company.status, 201, JSON.stringify(company.body));
  const r = await O.post("/placement/drives", {
    workflow: "managed",
    companyId: company.body.company._id,
    role: "Graduate Engineer Trainee – Cloud Infrastructure and Site Reliability",
    driveDate: days(14).toISOString(),
    registrationDeadline: days(7).toISOString(),
    minCgpa: 6,
    maxBacklogs: 0,
    branches: ["CSE", "ISE"],
    ...extra,
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.drive;
};

test("statistics: active drives include CTC and registration deadline; drafts are excluded; other figures unchanged", async () => {
  const officer = await createUser("placement_officer");
  const O = api(officer.token);
  await createStudent({ branch: "CSE", cgpa: 8 });
  await createStudent({ branch: "ISE", cgpa: 7.2 });

  const withCtc = await makeDrive(O, "Tata Consultancy Services Limited", { ctc: 7.25 });
  const noCtc = await makeDrive(O, "Infosys");
  await makeDrive(O, "Draft Only Corp", { ctc: 12 });
  for (const d of [withCtc, noCtc]) {
    assert.equal((await O.patch(`/placement/drives/${d._id}/status`, { status: "open" })).status, 200);
  }

  const res = await O.get("/placement/statistics");
  assert.equal(res.status, 200);
  const s = res.body;
  assert.equal(s.activeDrives.length, 2, "the draft is not active");
  const a = s.activeDrives.find((d) => d.companyName === "Tata Consultancy Services Limited");
  assert.equal(a.ctc, 7.25);
  assert.equal(a.status, "open");
  assert.equal(a.role, "Graduate Engineer Trainee – Cloud Infrastructure and Site Reliability");
  assert.equal(new Date(a.registrationDeadline).toDateString(), days(7).toDateString());
  assert.ok(a.driveDate && a.workflow === "managed");
  const b = s.activeDrives.find((d) => d.companyName === "Infosys");
  assert.equal(b.ctc, null, "no CTC recorded: null, not 0");

  assert.equal(s.totals.totalStudents, 2);
  assert.equal(s.totals.activeDrives, 2);
  assert.equal(s.totals.totalDrives, 2);
  assert.equal(s.totals.companiesVisited, 2);
  assert.equal(s.totals.placementPercentage, 0);
  assert.equal(s.offers.total, 0);
  assert.equal(s.offers.averageCtc, null);
  assert.deepEqual(s.branchWise.map((x) => [x.branch, x.total, x.placed, x.percentage]), [["CSE", 1, 0, 0], ["ISE", 1, 0, 0]]);

  // Students cannot read the dashboard.
  const student = await createStudent({});
  assert.equal((await api(student.token).get("/placement/statistics")).status, 403);
});
