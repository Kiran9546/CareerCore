/**
 * CareerCore — student cohort definition
 * ======================================
 *
 * The data the cohort seed builds from, kept apart from the code that
 * writes it so the roll can be reviewed and edited without reading any
 * logic.
 *
 * Every value here is fixed. There is no Math.random() in this file or in
 * the seed that consumes it, so the same cohort comes out every run and the
 * numbers in a report stay true the next time someone re-seeds.
 *
 * ─── WHAT THIS IS FOR ─────────────────────────────────────────────────
 *
 * Two things at once:
 *
 * 1. A believable multi-department roll, so department scoping is visible
 *    rather than merely implemented. An ISE faculty member signing in sees
 *    the ISE students and none of the others, which cannot be demonstrated
 *    when every student in the database is ISE.
 *
 * 2. The project's central claim, carried by the first five ISE students:
 *    similar profiles and similar readiness scores, completely different
 *    placement outcomes. Their outcomes are written below as records, never
 *    as conclusions — the rule engine reads them back and works out what
 *    they mean on its own.
 * ──────────────────────────────────────────────────────────────────────
 */

/**
 * Drives, widened so every department has somewhere to go. A cohort with
 * mechanical and civil students needs core-sector drives or those students
 * have no history at all and look like a data error.
 */
export const DRIVES = [
  {
    seedKey: "drive-infosys",
    companyName: "Infosys",
    role: "Systems Engineer",
    driveDate: new Date("2025-09-12T00:00:00Z"),
    ctc: 4.5,
    location: "Mysuru",
    eligibility: { minCgpa: 6.5, maxBacklogs: 0, branches: ["ISE", "CSE", "ECE"], batches: ["2026"] },
  },
  {
    seedKey: "drive-tcs",
    companyName: "TCS Digital",
    role: "Digital Engineer",
    driveDate: new Date("2025-10-08T00:00:00Z"),
    ctc: 7.0,
    location: "Bengaluru",
    eligibility: { minCgpa: 7.0, maxBacklogs: 0, branches: ["ISE", "CSE", "ECE"], batches: ["2026"] },
  },
  {
    seedKey: "drive-wipro",
    companyName: "Wipro",
    role: "Project Engineer",
    driveDate: new Date("2025-11-04T00:00:00Z"),
    ctc: 3.8,
    location: "Bengaluru",
    eligibility: { minCgpa: 6.0, maxBacklogs: 0, branches: ["ISE", "CSE", "ECE", "EEE"], batches: ["2026"] },
  },
  {
    seedKey: "drive-zoho",
    companyName: "Zoho",
    role: "Member Technical Staff",
    driveDate: new Date("2025-12-02T00:00:00Z"),
    ctc: 9.0,
    location: "Chennai",
    eligibility: { minCgpa: 7.5, maxBacklogs: 0, branches: ["ISE", "CSE"], batches: ["2026"] },
  },
  {
    seedKey: "drive-lnt",
    companyName: "L&T Construction",
    role: "Graduate Engineer Trainee",
    driveDate: new Date("2025-10-21T00:00:00Z"),
    ctc: 5.2,
    location: "Chennai",
    eligibility: { minCgpa: 6.0, maxBacklogs: 1, branches: ["ME", "CV"], batches: ["2026"] },
  },
  {
    seedKey: "drive-bosch",
    companyName: "Bosch",
    role: "Associate Engineer",
    driveDate: new Date("2025-11-18T00:00:00Z"),
    ctc: 6.5,
    location: "Bengaluru",
    eligibility: { minCgpa: 6.5, maxBacklogs: 0, branches: ["ME", "EEE", "ECE"], batches: ["2026"] },
  },
];

// Stage shorthand, so a student's whole journey reads as one line.
//   p passed   f failed   n not reached
//   s selected r rejected            (final stage only)
export const P = "passed";
export const F = "failed";
export const N = "not_reached";
export const SEL = "selected";
export const REJ = "rejected";

/**
 * Skill pools per department. Drawn from deterministically so a student's
 * skills suit their branch and the PRS skill component means something,
 * rather than every student holding the same generic list.
 */
export const SKILLS_BY_DEPT = {
  ISE: ["Java", "Python", "SQL", "Data Structures", "Git", "React", "Node.js", "MongoDB", "HTML", "CSS"],
  CSE: ["C++", "Java", "Python", "Data Structures", "SQL", "Git", "Docker", "Linux", "React", "MongoDB"],
  ECE: ["C", "Python", "MATLAB", "Verilog", "Embedded C", "Git", "SQL", "Linux"],
  EEE: ["MATLAB", "C", "Python", "Embedded C", "SQL", "Git"],
  ME: ["AutoCAD", "SolidWorks", "MATLAB", "Python", "C"],
  CV: ["AutoCAD", "Revit", "MATLAB", "Python"],
};

export const PROJECTS_BY_DEPT = {
  ISE: [
    ["Library Management System", ["Java", "SQL"]],
    ["E-Commerce Web Application", ["React", "Node.js", "MongoDB"]],
    ["Expense Tracker", ["Node.js", "SQL"]],
    ["Student Attendance Portal", ["Java", "SQL"]],
    ["Chat Application", ["Node.js", "React"]],
  ],
  CSE: [
    ["Compiler Design Mini Project", ["C++"]],
    ["Distributed File Store", ["Docker", "Linux"]],
    ["Sentiment Analysis Tool", ["Python"]],
    ["Online Judge Platform", ["React", "MongoDB"]],
    ["Path Finding Visualiser", ["Java", "Data Structures"]],
  ],
  ECE: [
    ["IoT Home Automation", ["Embedded C", "Python"]],
    ["FPGA Traffic Controller", ["Verilog"]],
    ["Signal Denoising Study", ["MATLAB"]],
    ["Line Following Robot", ["Embedded C"]],
  ],
  EEE: [
    ["Solar Inverter Prototype", ["MATLAB", "Embedded C"]],
    ["Smart Energy Meter", ["Embedded C", "Python"]],
    ["Load Flow Analysis", ["MATLAB"]],
  ],
  ME: [
    ["Go-Kart Chassis Design", ["SolidWorks", "AutoCAD"]],
    ["Heat Exchanger Analysis", ["MATLAB"]],
    ["3D Printed Gripper", ["SolidWorks"]],
  ],
  CV: [
    ["Residential Building Plan", ["AutoCAD", "Revit"]],
    ["Concrete Mix Optimisation", ["MATLAB"]],
    ["Bridge Load Study", ["AutoCAD"]],
  ],
};

export const CERTIFICATIONS = [
  ["AWS Cloud Practitioner", "Amazon Web Services"],
  ["Python for Everybody", "Coursera"],
  ["NPTEL DBMS", "NPTEL"],
  ["Azure Fundamentals", "Microsoft"],
  ["Meta Front-End Developer", "Coursera"],
  ["Google Data Analytics", "Google"],
  ["Machine Learning Specialization", "DeepLearning.AI"],
  ["Cisco CCNA", "Cisco"],
  ["NPTEL Design of Machine Elements", "NPTEL"],
  ["AutoCAD Certified User", "Autodesk"],
];

/**
 * The demo roster: ten sign-in accounts in total — one placement officer
 * (`OFFICER`), three faculty and six students, two per department. Every
 * account uses the same password (see seedCohort.js).
 *
 * The students are chosen so their records show different outcomes:
 * strong on paper but stopped at aptitude every time (student1), converting
 * repeatedly (student2), placed (student3, student5), no drive history at
 * all (student4) and struggling (student6).
 */
export const OFFICER = { email: "officer@mite.ac.in", name: "Priya Kulkarni" };

export const STUDENTS = [
  // ── ISE ─────────────────────────────────────────────────────
  {
    usn: "4MT22IS001", name: "Aarav Shetty", dept: "ISE", cgpa: 9.1, backlogs: 0,
    email: "student1@mite.ac.in",
    apt: { quantitative: 74, logical: 78, verbal: 80, technical: 76 },
    skills: 7, projects: 3, certs: 4,
    // Strong on paper, stopped at the first gate every single time.
    drives: [
      ["drive-infosys", F, N, N, N],
      ["drive-tcs", F, N, N, N],
      ["drive-wipro", F, N, N, N],
      ["drive-zoho", F, N, N, N],
    ],
  },
  {
    usn: "4MT22IS033", name: "Divya Nayak", dept: "ISE", cgpa: 8.6, backlogs: 0,
    email: "student2@mite.ac.in",
    apt: { quantitative: 84, logical: 86, verbal: 80, technical: 84 },
    skills: 9, projects: 3, certs: 4,
    drives: [
      ["drive-infosys", P, P, P, SEL],
      ["drive-tcs", P, P, P, SEL],
      ["drive-wipro", P, P, P, REJ],
      ["drive-zoho", P, P, F, N],
    ],
  },

  // ── CSE ─────────────────────────────────────────────────────
  { usn: "4MT22CS004", email: "student3@mite.ac.in", name: "Fathima Banu", dept: "CSE", cgpa: 9.0, backlogs: 0,
    apt: { quantitative: 88, logical: 86, verbal: 82, technical: 88 }, skills: 9, projects: 3, certs: 4,
    drives: [["drive-zoho", P, P, P, SEL], ["drive-infosys", P, P, P, SEL]] },
  // No drive history at all.
  { usn: "4MT22CS029", email: "student4@mite.ac.in", name: "Tejas Kulkarni", dept: "CSE", cgpa: 6.8, backlogs: 2,
    apt: { quantitative: 50, logical: 54, verbal: 52, technical: 48 }, skills: 4, projects: 1, certs: 1,
    drives: [] },

  // ── ECE ─────────────────────────────────────────────────────
  { usn: "4MT22EC003", email: "student5@mite.ac.in", name: "Deepak Hegde", dept: "ECE", cgpa: 8.2, backlogs: 0,
    apt: { quantitative: 72, logical: 70, verbal: 68, technical: 66 }, skills: 6, projects: 3, certs: 3,
    drives: [["drive-bosch", P, P, P, SEL], ["drive-wipro", P, F, N, N]] },
  { usn: "4MT22EC021", email: "student6@mite.ac.in", name: "Nisha Kamath", dept: "ECE", cgpa: 6.6, backlogs: 1,
    apt: { quantitative: 48, logical: 52, verbal: 56, technical: 46 }, skills: 4, projects: 1, certs: 1,
    drives: [["drive-wipro", F, N, N, N]] },
];

/**
 * Faculty, one per department on the roster. Department scoping is
 * enforced from the signed-in faculty member's own department, so each one
 * sees only their two students.
 */
export const FACULTY = [
  { email: "faculty.ise@mite.ac.in", name: "Dr. Suresh Hegde", dept: "ISE" },
  { email: "faculty.cse@mite.ac.in", name: "Dr. Suresh Bhandary", dept: "CSE" },
  { email: "faculty.ece@mite.ac.in", name: "Dr. Latha Rao", dept: "ECE" },
];

/** Offer terms, keyed `<usn>:<driveKey>`, applied where final is selected. */
export const OFFERS = {
  "4MT22IS033:drive-infosys": { ctc: 4.5 },
  "4MT22IS033:drive-tcs": { ctc: 7.0 },
  "4MT22CS004:drive-zoho": { ctc: 9.0 },
  "4MT22CS004:drive-infosys": { ctc: 4.5 },
  "4MT22EC003:drive-bosch": { ctc: 6.5 },
};
