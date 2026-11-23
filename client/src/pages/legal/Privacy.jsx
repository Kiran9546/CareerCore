import LegalPage, { Bullets, ContactLine, InlineLink } from "./LegalPage";
import { operatorName } from "../../config/site";

export default function Privacy() {
  const operator = operatorName();

  const sections = [
    {
      id: "who",
      title: "Who is responsible for your data",
      body: (
        <>
          <p>
            CareerCore is software that a college uses to run campus placements. This installation is operated by{" "}
            {operator}, which decides what the system is used for and who can access it. In this policy, "we" means
            that operator.
          </p>
          <p>
            This policy covers the CareerCore website and its server. It does not cover the websites of recruiting
            companies, or any use the placement cell makes of information after exporting it from CareerCore.
          </p>
        </>
      ),
    },
    {
      id: "collect",
      title: "Information we collect",
      body: (
        <>
          <p>When you create an account, we store:</p>
          <Bullets
            items={[
              "your name, email address and the role you register as (student, faculty or placement officer);",
              "your department, if you register as faculty;",
              "your password, stored only as a one-way bcrypt hash. Nobody, including administrators, can read it back;",
              "the time of your most recent sign-in, and whether your account is active.",
            ]}
          />
          <p>If you are a student, CareerCore also stores what you or your placement cell enter about you:</p>
          <Bullets
            items={[
              "academic details: USN, batch, branch, CGPA and number of backlogs;",
              "contact and profile links: phone number, GitHub username, LinkedIn and portfolio addresses;",
              "skills and proficiency levels, projects, certifications and your chosen career path;",
              "resume content, including education history, internships, achievements, an address if you add one, and an optional photo;",
              "aptitude test attempts: the questions you were given, your answers, scores and timings;",
              "placement records: drives you registered for or withdrew from, attendance and results for each interview round, offers (role, CTC, location, date) and results you submit for review;",
              "scores CareerCore calculates from the above, such as your placement readiness score and its history.",
            ]}
          />
          <p>
            Records can also be created by staff. Placement officers and faculty can import result sheets received from
            companies. If a sheet names a student who has no account yet, CareerCore can create a record holding their
            USN, name and department so that results can be attached. The student takes over that record when they
            register.
          </p>
          <p>For every user, the system also keeps:</p>
          <Bullets
            items={[
              "notifications sent to you inside CareerCore, and whether each was also emailed;",
              "an audit log of recruitment decisions, recording who changed a drive, round result or selection, and when;",
              "server request logs, which include your IP address, the page or API address requested, the time and your browser's user agent string.",
            ]}
          />
          <p>
            Anyone can write to us through the <InlineLink to="/contact">contact form</InlineLink>. We store the name,
            email address, topic and message you send, the time it arrived, and a link to your account if you were
            signed in. Administrators see these messages in CareerCore, and if the operator has set up an inbox for
            them, a copy is emailed there so someone can reply to you.
          </p>
        </>
      ),
    },
    {
      id: "use",
      title: "How we use it",
      body: (
        <>
          <p>We use this information only to run placements at the institution:</p>
          <Bullets
            items={[
              "to sign you in and show you the workspace for your role;",
              "to check which students are eligible for a drive, take registrations and record each round;",
              "to calculate readiness scores, skill gaps and learning suggestions for students;",
              "to notify you about drives, deadlines, interview rounds and results;",
              "to produce placement statistics and reports for the placement cell and the institution;",
              "to protect the service, for example by limiting repeated failed sign-in attempts from one address.",
            ]}
          />
          <p>
            Skill-gap analysis and career-path suggestions are calculated by a separate model service that is part of
            this installation. It receives your skills, CGPA, backlogs, aptitude section scores and the number of projects
            and certifications on your profile, but not your name or contact details. Its output
            is advisory and is not used to make placement decisions automatically.
          </p>
          <p>We do not sell personal information, show advertising, or use your data for marketing.</p>
        </>
      ),
    },
    {
      id: "access",
      title: "Who can see your information",
      body: (
        <>
          <p>Access depends on role:</p>
          <Bullets
            items={[
              "Students see only their own records.",
              "Faculty see the students of their own department.",
              "Placement officers see student records across departments, manage drives and can export placement records as spreadsheets.",
              "Administrators manage accounts and the skill and question banks, and can open the other workspaces.",
            ]}
          />
          <p>
            CareerCore does not give recruiting companies accounts or send them data. The placement cell may share
            student information with a company as part of a drive, for example a list of registered candidates. That
            sharing happens outside CareerCore and is governed by the institution's own policies.
          </p>
          <p>
            Your resume photo is stored as a file and served from a web address that is not protected by sign-in.
            Anyone who has that exact address can open the image. Only upload a photo you would be comfortable putting
            on a printed resume.
          </p>
        </>
      ),
    },
    {
      id: "third-parties",
      title: "Services we rely on",
      body: (
        <>
          <p>Depending on how this installation is set up, the following services are involved:</p>
          <Bullets
            items={[
              "Hosting and database: the website, server and MongoDB database run on infrastructure chosen by the operator, which may be the institution's own servers or a cloud provider.",
              "Email: if the operator configures an email server, copies of notifications are sent to your email address through it, and contact-form messages can be forwarded to the operator's inbox. Otherwise both stay inside CareerCore.",
            ]}
          />
          <p>
            Fonts and every other file the pages need are served by CareerCore itself, so loading a page does not
            contact any other company. Resume PDFs are generated in your own browser; the PDF file is not uploaded to
            the server.
          </p>
        </>
      ),
    },
    {
      id: "storage",
      title: "Cookies and browser storage",
      body: (
        <>
          <p>CareerCore does not set cookies and does not use analytics or advertising trackers.</p>
          <p>
            When you sign in, a sign-in token and basic account details (your name, email, role and department) are
            kept in your browser's session storage for that tab, and removed when you sign out or close the tab. If you
            tick "Keep me signed in", a copy is also kept in local storage so that new tabs and later visits stay
            signed in, until you sign out or the token expires. Do not use that option on a shared computer.
          </p>
          <p>Two other things are kept in your browser, never sent to the server:</p>
          <Bullets
            items={[
              "your choice of light or dark theme, in local storage, so the site looks the same on your next visit;",
              "while you take an aptitude test, the answers you have selected, in that tab's session storage, so leaving the page or reloading it does not lose them. They are removed when you submit the test or close the tab.",
            ]}
          />
        </>
      ),
    },
    {
      id: "security",
      title: "Security",
      body: (
        <p>
          Passwords are hashed, every request to the server is checked against your role, and repeated failed
          sign-in attempts are rate-limited. No system is completely secure, so please use a password you do not use
          anywhere else and tell your placement cell if you think your account has been misused.
        </p>
      ),
    },
    {
      id: "retention",
      title: "How long we keep it",
      body: (
        <p>
          CareerCore does not delete records automatically. Placement records are kept for as long as the institution
          needs them for placement statistics, reports and audits. An administrator can deactivate an account, which
          stops it signing in but keeps its records. Server request logs are kept according to the operator's hosting
          setup. If you want records removed, make a request using the details in section 9.
        </p>
      ),
    },
    {
      id: "rights",
      title: "Your choices and rights",
      body: (
        <>
          <p>
            You can view and update most of your own profile and resume in CareerCore at any time, and remove your
            resume photo. Official placement results are recorded by the placement cell. If one looks wrong, contact
            the placement cell to have it corrected.
          </p>
          <p>
            Depending on the law that applies to you, including India's Digital Personal Data Protection Act, 2023, you
            may have the right to ask for a summary of the personal data held about you, to have it corrected or
            erased, and to raise a grievance. To make a request: <ContactLine />
          </p>
        </>
      ),
    },
    {
      id: "changes",
      title: "Changes to this policy",
      body: (
        <p>
          If the way CareerCore handles personal data changes, this page will be updated and the date at the top
          revised. Please also read the <InlineLink to="/terms">Terms and Conditions</InlineLink>.
        </p>
      ),
    },
  ];

  return (
    <LegalPage
      title="Privacy Policy"
      intro={
        <p>
          This policy explains what personal information CareerCore stores, why it is needed to run campus
          placements, who can see it, and what you can do about it. It describes how the software actually works,
          so some details depend on how {operator} has set up this installation.
        </p>
      }
      sections={sections}
    />
  );
}
