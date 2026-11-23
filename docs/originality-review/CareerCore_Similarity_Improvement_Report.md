# CareerCore Similarity Improvement Report

**Revised report:** `docs/originality-review/CareerCore_Originality_Review.docx`
**Unchanged original:** `docs/final-report/CareerCore_Phase_II_Report.docx` (SHA-256 starts `a41136c6bc8909fc`, confirmed the same after this work)
**Review date:** 31 October 2026

## 1. Summary

- 56 passages were rewritten (Abstract: 4, Chapter 1: 14, Chapter 2: 14, Chapter 3: 3, Chapter 4: 11, Chapter 5: 3, Chapter 6: 4, Chapter 7: 3).
- Factual errors found during the review were corrected as well (Section 5).
- Body text fell from 8,246 to 7,810 words, and the report from 66 to 64 pages.
- **No similarity percentage is claimed.** No plagiarism checker was run, so progress against the below-5% and below-10% targets is unknown.
- At your request, the reference list was left exactly as it was, and no references were looked up again during this review.

## 2. Passages revised

Each row shows the opening of the original passage. The full text is in the unchanged original report. The concerns are editorial judgements, not checker matches: no passage was found to be copied from an identified source.

| Chapter | Original passage | Similarity concern | Recommended improvement (applied) |
|---|---|---|---|
| Abstract | Campus placement preparation depends on information that is usually scattered: academic records sit with the department, skill development is left to the student, and drive notices, … | Generic opening common to placement-system reports | Opened with the two questions the project answers |
| Abstract | CareerCore is a web-based placement intelligence platform developed to address these problems for the Department of Information Science and Engineering at MITE. It is implemented as … | Boilerplate academic phrasing | Reordered around the data flow of the actual system |
| Abstract | For the placement cell, CareerCore implements a complete managed recruitment workflow: company records, drive creation, versioned eligibility criteria evaluated against the academic record, automatic notification of … | Repeats content stated elsewhere in the report | Condensed the feature list into the order an officer works in |
| Abstract | The implementation was verified with an automated suite of 30 backend tests (all passing, including a 500-student end-to-end recruitment scenario), a successful production build and lint … | Boilerplate academic phrasing | Stated results and their limits directly |
| Chapter 1 | Campus recruitment remains the principal route to employment for engineering graduates in India. A typical placement season involves dozens of drives, each with its own eligibility … | Unsourced general claim about the job market or institute | Removed unsourced job-market claims; described what the system models |
| Chapter 1 | In most colleges the information needed to manage this process is fragmented. Academic records are kept by departments, students maintain their own resumes and skill lists … | Generic opening common to placement-system reports | Tied the problem to the specific checks CareerCore automates |
| Chapter 1 | CareerCore was conceived to bring these activities into a single platform. During Phase I the project proposed an AI-driven placement intelligence system combining career prediction, skill-gap … | Boilerplate academic phrasing | Recorded the project's real design change |
| Chapter 1 | The problem addressed by this project is the absence of an integrated system that (i) gives each student an objective, explainable view of their placement readiness … | Boilerplate academic phrasing | Reduced the problem to the two gaps the system closes |
| Chapter 1 | Formally, given a student's academic record, skill profile, projects, certifications and aptitude performance, the system must compute a bounded readiness score, identify and rank the gaps … | Boilerplate academic phrasing | Rewritten as concrete system inputs and outputs |
| Chapter 1 | Students need personalised and actionable guidance. A generic statement that a student should "improve skills" is not useful; a statement that, for the Software Engineer path, … | Generic opening common to placement-system reports | Used an actual output from the running system (synthetic data) |
| Chapter 1 | The placement cell needs consistency and traceability. Manual eligibility screening is error-prone when hundreds of students and several criteria are involved, and spreadsheets do not prevent … | Generic opening common to placement-system reports | Named the invalid actions the server refuses |
| Chapter 1 | Faculty members need department-level visibility of readiness, recurring skill gaps and placement outcomes in order to plan interventions such as training sessions or certification drives. | Generic opening common to placement-system reports | Listed the actual analytics provided |
| Chapter 1 | The scope of the implemented system covers four user roles. Students maintain their profiles, take the aptitude test, view their PRS, skill gaps and recommendations, build … | Repeats content stated elsewhere in the report | Shortened; role detail is kept in Table 3.3 |
| Chapter 1 | The following are outside the implemented scope: direct recruiter access (the earlier recruiter and job-posting module was retired), automated parsing of uploaded resume documents, integration with … | Repeats content stated elsewhere in the report | Kept as a plain list of exclusions |
| Chapter 1 | CareerCore is significant because it couples readiness assessment with the actual recruitment process. The PRS and skill-gap analysis measure the profile; the drive records measure what … | Boilerplate academic phrasing | Removed promotional framing |
| Chapter 1 | For the institution, the managed workflow replaces repetitive manual work with server-enforced rules: eligibility is computed from the academic record, eligible students are notified once and … | Boilerplate academic phrasing | Listed verifiable rules |
| Chapter 1 | The project is also deliberate about its own limits. Scoring weights, band boundaries and rule thresholds are documented as team-assigned design decisions and are exposed as … | Boilerplate academic phrasing | Pointed to the actual configuration file |
| Chapter 1 | Chapter 2 reviews related work on educational data mining, employability prediction, recommendation and person–job matching. Chapter 3 formulates the problem and presents the proposed system, its … | Boilerplate academic phrasing | Shortened a standard organisation paragraph |
| Chapter 2 | CareerCore draws on several established lines of work: educational data mining for predicting student outcomes, ensemble classifiers for prediction from heterogeneous attributes, vector-space similarity for comparing … | Boilerplate academic phrasing | States how the review is organised and separates sources from project |
| Chapter 2 | Romero and Ventura [1] survey educational data mining and describe how classification, clustering and association techniques have been applied to student data to support decisions by … | Paraphrase follows the order of the source's own summary | Reduced to what is needed; marked the source's role |
| Chapter 2 | Baradwaj and Pal [2] apply decision-tree classification (ID3) to student records such as previous semester marks, class tests, seminar and attendance in order to predict end-semester … | Paraphrase follows the order of the source's own summary | Separated their finding from CareerCore's use |
| Chapter 2 | Kahlik and Saleh [3] predict post-internship employability of university students using ensemble machine-learning methods on institutional records covering internship duration, training performance and prior work experience. … | Paraphrase follows the order of the source's own summary | Restructured around relevance; removed an unconfirmed detail about stacking |
| Chapter 2 | Breiman [4] introduced Random Forests, ensembles of decision trees grown on bootstrap samples with random feature selection at each split, and showed that they achieve low … | Textbook-style explanation of a standard method | Explained through its role in the project; attribution made explicit |
| Chapter 2 | Salton, Wong and Yang [5] proposed the vector space model, in which documents and queries are represented as term vectors and compared by the cosine of … | Textbook-style explanation of a standard method | Moved directly to the project's mapping of the model |
| Chapter 2 | Lops, de Gemmis and Semeraro [6] review content-based recommender systems, which recommend items whose features match a profile of the user's needs or preferences. CareerCore's learning-resource … | Paraphrase follows the order of the source's own summary | Shortened; made the mapping explicit |
| Chapter 2 | Malinowski, Keim, Wendt and Weitzel [7] treat person–job matching as a bilateral recommendation problem in which both the candidate's preferences and the employer's requirements must be … | Paraphrase follows the order of the source's own summary | Led with the argument and its consequence for this design |
| Chapter 2 | Keeney and Raiffa [8] formalised multi-attribute utility theory, in which alternatives described by several attributes are evaluated by combining normalised single-attribute scores, commonly through a weighted … | Textbook-style explanation of a standard method | Separated the borrowed form from the team's own values |
| Chapter 2 | The reviewed work falls into two groups. The first group [1]–[4] predicts outcomes — academic performance, employability or a class label — from student attributes, and … | Boilerplate academic phrasing | Shorter, independent synthesis |
| Chapter 2 | None of the reviewed works, taken individually, combines readiness assessment, skill-gap ranking, resource recommendation and the operational management of recruitment drives. Predictive studies typically stop at … | Boilerplate academic phrasing | Avoided overclaiming against the sources |
| Chapter 2 | The gap addressed by CareerCore is integration and explainability within the campus placement setting. Specifically: (i) a readiness score whose components and weights are visible to … | Boilerplate academic phrasing | Independent statement; scope of the claim limited to the review |
| Chapter 2 | CareerCore does not claim a new learning algorithm. Its contributions are the application and combination of established methods ([4], [5], [6], [8]), the importance-weighted gap-priority formulation, … | Boilerplate academic phrasing | Direct attribution of what is and is not ours |
| Chapter 2 | Educational data mining and employability prediction show that student data can support useful predictions; Random Forests are a robust choice for such classification; cosine similarity, content-based … | Repeats content stated elsewhere in the report | Removed restatement of Section 2.3 |
| Chapter 3 | CareerCore is implemented as a three-tier web application with a separate analytics service. The React client presents role-specific workspaces. The Express API holds all business rules … | Generic opening common to placement-system reports | Named the real folders and the actual failure behaviour |
| Chapter 3 | Two drive models coexist. Recorded drives keep the original four-stage model (aptitude, technical, interview, final) and are used to enter results of drives conducted outside the … | Repeats content stated elsewhere in the report | Rephrased closely worded source-code comment |
| Chapter 3 | Data trust: drive eligibility uses the academic fields of the student record; in the current version students can edit their own CGPA and backlogs, which an … | Repeats content stated elsewhere in the report | Shortened; detail kept in Section 6.10 |
| Chapter 4 | The study aims to design and verify methods that turn student and drive data into (i) an explainable readiness score, (ii) ranked and actionable skill gaps … | Boilerplate academic phrasing | Replaced formula-like objective statement |
| Chapter 4 | Development followed an iterative, module-by-module approach. Each module was implemented as a service with a thin controller and route, exercised through the API, and covered by … | Boilerplate academic phrasing | Removed unverifiable process wording; kept what the code shows |
| Chapter 4 | A Random Forest [4] is an ensemble of T decision trees, each trained on a bootstrap sample of the training data, with a random subset of … | Textbook-style explanation of a standard method | Stated the method through this model's actual parameters |
| Chapter 4 | For a feature vector x, the forest's class-probability estimate is the average of the trees' estimates (Equation [eq.]); the predicted class is the one with the … | Textbook-style explanation of a standard method | Connected the equation to the implementation decision |
| Chapter 4 | The model is implemented with scikit-learn [9]. The configuration used is 300 trees, maximum depth 18, balanced class weights and random state 42, inside a pipeline … | Textbook-style explanation of a standard method | Described the script rather than the general procedure |
| Chapter 4 | The similarity between the student and the career path is the cosine of the angle between the two vectors [5] (Equation [eq.]). If either vector is … | Textbook-style explanation of a standard method | Explained what the measure means for a student's skills |
| Chapter 4 | A single similarity value does not tell the student what to do. For every required skill whose target exceeds the current level, CareerCore computes a deficit … | Boilerplate academic phrasing | Named the functions; clearly marked the project's own decision |
| Chapter 4 | The PRS follows the weighted additive form of multi-attribute utility theory [8]. Each component is first normalised to 0–100 (Equations [eq.]–[eq.]) and the components are combined … | Textbook-style explanation of a standard method | Rewritten around the service and its start-up check |
| Chapter 4 | A managed drive is modelled as a finite-state machine with the states Draft, Open, Registration closed, In progress, Completed and Cancelled. Only the transitions shown in … | Generic opening common to placement-system reports | Named the constant that enforces the workflow |
| Chapter 4 | The client calls the API through a single Axios instance that attaches the stored JWT and redirects to the login page on HTTP 401. Controllers validate … | Generic opening common to placement-system reports | Replaced generic integration prose with the real files |
| Chapter 4 | For the classifier, with TP, FP and FN the true positives, false positives and false negatives of a class, precision, recall and F1-score are computed per … | Textbook-style explanation of a standard method | Standard definitions tied to this evaluation; equations retained |
| Chapter 5 | MongoDB was chosen because student profiles naturally contain nested arrays (skills, projects, certifications, PRS history) and drives contain embedded ordered rounds. Twenty Mongoose models define the … | Generic opening common to placement-system reports | Tied the choice to the actual schema |
| Chapter 5 | Opening the dashboard recomputes the PRS by calling the ML service, stores the score, breakdown, band and a history snapshot (capped at 50), and returns the … | Generic opening common to placement-system reports | Rewritten as a walk through actual functions and files |
| Chapter 5 | Creating a managed drive validates the company, role, dates and criteria, stores the drive in Draft and immediately calculates eligibility for all students. Publishing recalculates eligibility … | Generic opening common to placement-system reports | Rewritten as a walk through actual functions |
| Chapter 6 | Table [table] summarises a manual walk-through of the managed workflow performed against the running API (47 requests). Every request returned the expected status. The two 409 … | Factual error found during review (not a similarity issue) | Corrected the request count from 47 to 49 (from the saved run log) |
| Chapter 6 | The recruitment workflow is the most mature part of the system. Its rules — valid transitions, attendance before results, finalisation only when complete, progression of passes … | Boilerplate academic phrasing | Removed repeated rule list; cited elsewhere in Chapter 5 |
| Chapter 6 | The readiness features are implemented end to end but rest on unvalidated parameters. The sensitivity results show that changing the weights can move a student across … | Repeats content stated elsewhere in the report | Uses the project's measured case |
| Chapter 6 | The original objective of candidate–job matching changed during the project. The recruiter-driven job-posting module was retired because campus recruitment at the institute is run by the … | Repeats content stated elsewhere in the report | Refers back rather than repeating the reason |
| Chapter 7 | CareerCore was implemented as a working placement intelligence platform consisting of a React client, an Express/MongoDB API with 116 route handlers over 20 collections, and a … | Boilerplate academic phrasing | Plainer summary with verified counts |
| Chapter 7 | The platform can be used by a college placement cell to run campus drives and maintain official results, by departments to monitor batch readiness and recurring … | Unsourced general claim about the job market or institute | Added the honest condition on real-world use |
| Chapter 7 | The main limitations, detailed in Section 6.10, are the synthetic training data, the unvalidated scoring parameters, the band-boundary defect, the absence of an approval step for … | Repeats content stated elsewhere in the report | Removed repetition of Section 6.10 |

## 3. Repetitive passages reduced

Rows in Section 2 with the concern "Repeats content stated elsewhere" were shortened or replaced with a cross-reference. The main ones are:

- Scope exclusions in Section 1.5, which overlapped Section 3.7.
- The data-trust constraint in Section 3.7, now a pointer to Section 6.10.
- The retirement of job postings in Section 6.9, now a pointer to Section 1.1.
- The limitations summary in Section 7.5, now a pointer to Section 6.10.
- The closing summary in Section 2.5, which restated Section 2.3.

## 4. Citations

**Reference list:** unchanged at your request. All 15 entries match the original exactly, so no reference was corrected or removed.

**In-text citations:** every reference cited in the original is still cited. [1]–[10], [14] and [15] appear directly, and [11]–[13] are covered by the range "[10]–[14]" in Section 4.15. No citation was removed to lower similarity. Established methods are still attributed to their authors, and Chapter 2 now says plainly which ideas are theirs and which are the project's.

**Changes to what a citation is said to support** (the citations themselves are unchanged):

- The claim that a stacking ensemble performed best was removed from the discussion of [3], in the prose and in Table 2.1. It had been confirmed only from a third-party mirror, not from the journal's own page.
- The list of student attributes attributed to [2] was removed, because it had not been checked against the paper.

## 5. Factual corrections

These are not similarity changes. They are errors in the earlier report that were found during this review.

| Location | Original | Corrected | Reason |
|---|---|---|---|
| Table 6.1 | 26 rule tests, 500-student e2e test, walk-through | 22 rule tests, 500-student e2e test, walk-through | said 26 rule tests; the file has 22 (matches Appendix C) |
| Table 3.2 | About 2 GB for dependencies, dataset and model artefacts (the trained model file is about 35 MB) | About 1 GB for dependencies, dataset and model artefacts (measured; the trained model file is about 35 MB) | said 2 GB; measured about 720 MB |
| Table B.2 | Same, after clearing the reference collections | Runs seed.js with a --fresh flag, which the script does not currently read, so it behaves like npm run seed | described clearing that seed.js does not perform |
| Table B.2 | Lists, then removes demo data | Lists, then removes generated demo students and test-run accounts; keeps the demo roster and admins | imprecise description of cleanDatabase.js |
| Table 2.1 | Ensemble ML (stacking) on internship data | Ensemble ML on internship data | removed a detail not confirmed from the journal page (consistent with the revised prose) |
| Section 6.5 | 47 requests | 49 requests, including sign-ins | Count taken from the saved run log |
| Table 6.2 | 200 (×18) | 200 (×15) | 5 calls × 3 rounds |
| Sections 1.1, 1.3 | General job-market claims with no source | Removed | No source was available |

**The original final report and the technical documentation still contain some of these errors.** Both say 47 requests and ×18, and the original report also has the others listed above. Both were left alone, so please decide whether to submit the revised version or have them corrected.

## 6. Sections that depend on standard terminology

These will probably still match other documents, and that is normal. A checker's settings or a reviewer can usually discount them:

- Names and definitions: Random Forest, Gini impurity, cosine similarity, precision, recall, F1-score, and the equations in Chapter 4.
- Institutional text: the cover page, certificate, declaration and acknowledgement, which keep the MITE template wording. These are the largest overlap with the old report and were deliberately not rewritten.
- The reference list, whose entries are standard bibliographic text.
- Technology names, API paths, the Appendix A endpoint table, the Appendix D setup commands and the short code excerpt in Section 5.6.
- Headings and captions, which were kept the same so the structure is preserved.

## 7. Passages that need manual review

1. **Literature summaries in Chapter 2.** None of these descriptions of [1]–[8] was rechecked against the papers in this review. Check what is attributed to [1], [4], [6] and [8] against the papers, and the [3] findings against the journal page.
2. **Reference list details.** Left as they were at your request. Some entries lack page numbers, for example [2] and [3].
3. **Removed literature entries.** Bahalkar, Ansarey, S. Kumar and R. Sharma from the old report remain out because they could not be verified. Restore them only with full, checked details.
4. **Statements about how recruitment works at your institute** (Sections 1.1 and 6.9). They rest on source-code comments. Please confirm they match actual practice at MITE.
5. **Section 4.2.** It describes how the system is structured. Add your own account of the team's process if your guide expects one.
6. **`[Academic Year]`** on the certificate is still a placeholder.
7. **Your own voice and understanding.** This text was drafted with AI assistance and the declaration is signed by the team. Check your institution's policy on AI assistance, and make sure each member can explain the sections they present.

## 8. What cannot be verified without an external checker

- The similarity percentage, or whether either target is met.
- Matches against journals, theses, earlier student reports or websites in a checker's database. No web comparison was run.
- Matches against your own Phase-I report or any earlier upload. If this report's text was uploaded before, a checker may match it against itself unless that repository is excluded.
- AI-writing detection, which is a separate measure not addressed or targeted here.

**What was measured locally** (this is not a plagiarism score). The table counts runs of seven identical consecutive words in body text.

| Compared against | Original | Revised |
|---|---|---|
| README.md | 6 | 5 |
| `server/config/constants.js` | 5 | 4 |
| Old template report (mostly the declaration and acknowledgement) | 208 | 207 |
| Technical documentation | 39 | 32 |

If the GitHub repository or the technical documentation is public or submitted, these small overlaps could appear in a checker. Separately, runs of six identical words were counted between each original passage and its rewrite: 19 of 56 rewrites share none, and the highest share is 25%, mostly function names and parameter lists.

**Recommended next step:** run the revised DOCX through the checker your institution authorises, with the bibliography excluded if your department allows it. Then review the matches it flags instead of rewriting everything.

## 9. Verification performed

| Check | Result |
|---|---|
| Opens in Microsoft Word (fresh read-only process, repair off) | Pass, 64 pages |
| DOCX schema validation of the generated file before Word's re-save | Pass |
| Headings (89), figure captions (31), table captions (21), equations (18) | Same as original |
| Tables (23), images (31), sections (8) | Same as original |
| Front pages before the Abstract | Text same as original |
| Reference list (15 entries) | Same as original |
| Blank pages | None |
| Key functions and files named in the new text | Checked against the source code |
| Original report | Unchanged (hash matches) |
| Git | Nothing committed or pushed |
