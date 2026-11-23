import LegalPage, { Bullets, ContactLine, InlineLink } from "./LegalPage";
import { SITE, operatorName } from "../../config/site";

export default function Terms() {
  const operator = operatorName();

  const sections = [
    {
      id: "service",
      title: "The service",
      body: (
        <>
          <p>
            CareerCore is a campus placement management system operated by {operator}. It lets students keep a
            placement profile and resume, take aptitude tests and register for placement drives; lets faculty follow
            the students of their department; and lets the placement cell run drives, record interview rounds and
            offers, and produce reports.
          </p>
          <p>
            CareerCore is provided to members of the institution for placement purposes. It is free to use for
            students and staff, and no payments are taken through it.
          </p>
        </>
      ),
    },
    {
      id: "accounts",
      title: "Accounts",
      body: (
        <>
          <p>
            Students, faculty and placement officers can create their own accounts. Administrator accounts are created
            by the institution. By creating an account you confirm that:
          </p>
          <Bullets
            items={[
              "you are a student or staff member of the institution and you register under the role that matches your position;",
              "the name, email address and department you give are your own and correct;",
              "you will keep your password private and not let anyone else use your account.",
            ]}
          />
          <p>
            The institution may deactivate an account that was registered under the wrong role, belongs to someone who
            has left, or has been misused.
          </p>
        </>
      ),
    },
    {
      id: "responsibilities",
      title: "Your responsibilities",
      body: (
        <>
          <p>When you use CareerCore you agree:</p>
          <Bullets
            items={[
              "to enter accurate information. Academic details, skills, projects and certifications are used to decide eligibility for drives, so false entries can cost you, or another student, an opportunity;",
              "to complete aptitude tests yourself, without outside help, within the time limit;",
              "to use other people's information only for placement work, if your role gives you access to it, and not to copy or share it for any other purpose;",
              "not to try to reach data or functions outside your role, interfere with the service, or upload files that are not your own or contain harmful content.",
            ]}
          />
          <p>
            Breaking these terms may lead to your account being deactivated, and may also be handled under the
            institution's own academic and conduct rules.
          </p>
        </>
      ),
    },
    {
      id: "records",
      title: "Placement records and scores",
      body: (
        <>
          <p>
            Official results for drives, rounds and offers are recorded by the placement cell, and changes to them are
            kept in an audit log. Students cannot change their official record directly. If you think a result is
            wrong, contact the placement cell so it can be reviewed and corrected.
          </p>
          <p>
            The placement readiness score, skill-gap analysis, career-path suggestions and learning recommendations are
            calculated estimates intended to help you prepare. They are not a prediction or guarantee of any outcome,
            and CareerCore does not send them to companies. The readiness score is included in the placement records
            that the placement cell can export.
          </p>
        </>
      ),
    },
    {
      id: "drives",
      title: "Drives, companies and offers",
      body: (
        <p>
          Drive details such as role, CTC, location, eligibility and dates are entered by the placement cell from
          information provided by companies. CareerCore does not guarantee that a company will hold a drive as
          announced, interview any student, or make or keep an offer. Selection decisions and offers are made by the
          companies, and employment terms are between you and the company.
        </p>
      ),
    },
    {
      id: "content",
      title: "Your content",
      body: (
        <p>
          You keep ownership of what you enter, such as your resume and project descriptions. You allow the
          institution to store it and to use it within CareerCore and for its placement work, as described in the{" "}
          <InlineLink to="/privacy">Privacy Policy</InlineLink>. Resumes you download as PDFs are yours to use.
        </p>
      ),
    },
    {
      id: "availability",
      title: "Availability and changes",
      body: (
        <p>
          The institution aims to keep CareerCore available, but it may be interrupted for maintenance or by problems
          outside its control, and some features, such as skill analysis, depend on a separate service that may be
          unavailable at times. Features may change. Keep your own copy of anything important, such as your resume,
          and do not rely on CareerCore as the only notice of a deadline.
        </p>
      ),
    },
    {
      id: "liability",
      title: "Limitation of liability",
      body: (
        <p>
          CareerCore is provided as it is, to support the institution's placement process. To the extent the law
          allows, the institution is not liable for indirect losses, such as a missed opportunity, arising from use
          of the service, from interruptions, or from errors in information supplied by users or companies. Nothing in
          these terms limits any liability that cannot be limited by law.
        </p>
      ),
    },
    {
      id: "law",
      title: "Governing law",
      body: (
        <p>
          These terms are governed by the laws of {SITE.jurisdiction}. Disputes will first be raised with the
          placement cell, and any that remain are subject to the courts that have jurisdiction over the institution.
        </p>
      ),
    },
    {
      id: "contact",
      title: "Changes and contact",
      body: (
        <p>
          These terms may be updated, and the date at the top of this page will show when. Continuing to use
          CareerCore after a change means you accept the updated terms. For questions about these terms:{" "}
          <ContactLine />
        </p>
      ),
    },
  ];

  return (
    <LegalPage
      title="Terms and Conditions"
      intro={
        <p>
          These terms set out the rules for using CareerCore. Please read them together with the{" "}
          <InlineLink to="/privacy">Privacy Policy</InlineLink>. By creating an account or signing in, you agree to
          them.
        </p>
      }
      sections={sections}
    />
  );
}
