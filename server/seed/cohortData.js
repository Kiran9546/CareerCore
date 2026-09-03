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
 * The cohort.
 *
 * Sign-in emails run `student.a` … `student.l` in roster order, so an
 * account can be read straight off the roll without decoding a USN.
 *
 * `keepAccount` marks the one student whose sign-in must survive untouched:
 * their email and password stay exactly as they are — it already holds
 * `student.a@mite.ac.in` — and only the USN is brought in line with the
 * rest. Every other entry carries its email in `email`.
 *
 * The first five ISE entries carry the contrast the project is built to
 * show. Read down their `drives` column and the difference is in the
 * records themselves — one never clears an aptitude round, one clears every
 * aptitude round and never a technical one, one converts, one converts
 * repeatedly, one has barely any history at all.
 */
export const STUDENTS = [
  // ── ISE: the contrast group ─────────────────────────────────
  {
    usn: "4MT22IS001", name: "Aarav Shetty", dept: "ISE", cgpa: 9.1, backlogs: 0,
    keepAccount: "student.a@mite.ac.in",
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
    usn: "4MT22IS014", name: "Bhavya Kamath", dept: "ISE", cgpa: 8.2, backlogs: 0,
    email: "student.b@mite.ac.in",
    apt: { quantitative: 72, logical: 74, verbal: 70, technical: 66 },
    skills: 8, projects: 3, certs: 4,
    // Clears the first gate every time, never the second.
    drives: [
      ["drive-infosys", P, F, N, N],
      ["drive-tcs", P, F, N, N],
      ["drive-wipro", P, F, N, N],
      ["drive-zoho", P, F, N, N],
    ],
  },
  {
    usn: "4MT22IS022", name: "Chetan Rao", dept: "ISE", cgpa: 8.0, backlogs: 0,
    email: "student.c@mite.ac.in",
    apt: { quantitative: 70, logical: 72, verbal: 74, technical: 72 },
    skills: 8, projects: 3, certs: 4,
    drives: [
      ["drive-infosys", P, P, P, SEL],
      ["drive-tcs", P, P, F, N],
      ["drive-wipro", P, F, N, N],
    ],
  },
  {
    usn: "4MT22IS033", name: "Divya Nayak", dept: "ISE", cgpa: 8.6, backlogs: 0,
    email: "student.d@mite.ac.in",
    apt: { quantitative: 84, logical: 86, verbal: 80, technical: 84 },
    skills: 9, projects: 3, certs: 4,
    drives: [
      ["drive-infosys", P, P, P, SEL],
      ["drive-tcs", P, P, P, SEL],
      ["drive-wipro", P, P, P, REJ],
      ["drive-zoho", P, P, F, N],
    ],
  },
  {
    usn: "4MT22IS041", name: "Eshan Prabhu", dept: "ISE", cgpa: 8.3, backlogs: 0,
    email: "student.e@mite.ac.in",
    apt: { quantitative: 72, logical: 76, verbal: 72, technical: 74 },
    skills: 6, projects: 3, certs: 4,
    // One drive, one result. Not enough for the engine to conclude anything.
    drives: [["drive-wipro", F, N, N, N]],
  },

  // ── CSE ─────────────────────────────────────────────────────
  { usn: "4MT22CS004", email: "student.f@mite.ac.in", name: "Fathima Banu", dept: "CSE", cgpa: 9.0, backlogs: 0,
    apt: { quantitative: 88, logical: 86, verbal: 82, technical: 88 }, skills: 9, projects: 3, certs: 4,
    drives: [["drive-zoho", P, P, P, SEL], ["drive-infosys", P, P, P, SEL]] },
  { usn: "4MT22CS018", email: "student.g@mite.ac.in", name: "Suhas Acharya", dept: "CSE", cgpa: 7.6, backlogs: 0,
    apt: { quantitative: 66, logical: 68, verbal: 64, technical: 70 }, skills: 6, projects: 2, certs: 2,
    drives: [["drive-infosys", P, F, N, N], ["drive-wipro", P, F, N, N]] },
  // No drive history at all — the roster's fourth band needs someone in it.
  { usn: "4MT22CS029", email: "student.h@mite.ac.in", name: "Tejas Kulkarni", dept: "CSE", cgpa: 6.8, backlogs: 2,
    apt: { quantitative: 50, logical: 54, verbal: 52, technical: 48 }, skills: 4, projects: 1, certs: 1,
    drives: [] },

  // ── ECE ─────────────────────────────────────────────────────
  { usn: "4MT22EC003", email: "student.i@mite.ac.in", name: "Deepak Hegde", dept: "ECE", cgpa: 8.2, backlogs: 0,
    apt: { quantitative: 72, logical: 70, verbal: 68, technical: 66 }, skills: 6, projects: 3, certs: 3,
    drives: [["drive-bosch", P, P, P, SEL], ["drive-wipro", P, F, N, N]] },
  { usn: "4MT22EC021", email: "student.j@mite.ac.in", name: "Nisha Kamath", dept: "ECE", cgpa: 6.6, backlogs: 1,
    apt: { quantitative: 48, logical: 52, verbal: 56, technical: 46 }, skills: 4, projects: 1, certs: 1,
    drives: [["drive-wipro", F, N, N, N]] },

  // ── ME ──────────────────────────────────────────────────────
  { usn: "4MT22ME005", email: "student.k@mite.ac.in", name: "Eshwar Pai", dept: "ME", cgpa: 7.7, backlogs: 0,
    apt: { quantitative: 64, logical: 62, verbal: 60, technical: 58 }, skills: 4, projects: 3, certs: 2,
    drives: [["drive-lnt", P, P, P, SEL], ["drive-bosch", P, F, N, N]] },

  // ── EEE ─────────────────────────────────────────────────────
  { usn: "4MT22EE013", email: "student.l@mite.ac.in", name: "Sanjana Rao", dept: "EEE", cgpa: 8.5, backlogs: 0,
    apt: { quantitative: 78, logical: 76, verbal: 74, technical: 72 }, skills: 6, projects: 3, certs: 3,
    drives: [["drive-bosch", P, P, P, SEL]] },
];

/**
 * Faculty, one per department that has students on the roll.
 *
 * Department scoping is enforced from the signed-in user's own department,
 * so it can only be shown with more than one faculty account to sign in as.
 * Five is enough to make the point and few enough to keep straight.
 *
 * The ISE entry is the original demo account and is marked `keepAccount`:
 * the seed leaves its email, name and password exactly as they are. The
 * other four are created by the seed on the same password as everything
 * else, so there is only ever one password to remember.
 */
export const FACULTY = [
  { email: "faculty.demo@mite.ac.in", name: "Dr. Suresh Hegde", dept: "ISE", keepAccount: true },
  { email: "faculty.cse@mite.ac.in", name: "Dr. Suresh Bhandary", dept: "CSE" },
  { email: "faculty.ece@mite.ac.in", name: "Dr. Latha Rao", dept: "ECE" },
  { email: "faculty.me@mite.ac.in", name: "Dr. Ganesh Kamath", dept: "ME" },
  { email: "faculty.eee@mite.ac.in", name: "Dr. Vidya Shenoy", dept: "EEE" },
];

/** Offer terms, keyed `<usn>:<driveKey>`, applied where final is selected. */
export const OFFERS = {
  "4MT22IS022:drive-infosys": { ctc: 4.5 },
  "4MT22IS033:drive-infosys": { ctc: 4.5 },
  "4MT22IS033:drive-tcs": { ctc: 7.0 },
  "4MT22CS004:drive-zoho": { ctc: 9.0 },
  "4MT22CS004:drive-infosys": { ctc: 4.5 },
  "4MT22EC003:drive-bosch": { ctc: 6.5 },
  "4MT22ME005:drive-lnt": { ctc: 5.2 },
  "4MT22EE013:drive-bosch": { ctc: 6.5 },
};
