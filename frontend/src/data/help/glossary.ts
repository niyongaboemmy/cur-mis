import type { GlossaryTerm } from "./types";

/**
 * Plain-English definitions of the words CUR-MIS uses on screen.
 *
 * Rule for writing an entry: a first-week employee must understand it without
 * having to look up a second term. Where a second term is unavoidable, link it
 * through `related` rather than assuming it.
 */
export const GLOSSARY: GlossaryTerm[] = [
  /* ── Access & accounts ────────────────────────────────────────────── */
  {
    id: "role",
    term: "Role",
    definition:
      "The job label attached to an account — registrar, finance officer, lecturer, student, applicant. A role is a bundle of permissions, so giving somebody a role grants everything that job needs in one move.",
    seenIn: "Administration → Roles",
    related: ["permission", "superadmin"],
  },
  {
    id: "permission",
    term: "Permission",
    aliases: ["permissions", "permission slug"],
    definition:
      "One single right, such as “record marks” or “approve payments”. Permissions are the smallest unit of access; you never give a permission to a person directly, you give it to a role and give the role to the person.",
    seenIn: "Administration → Permissions",
    related: ["role"],
  },
  {
    id: "superadmin",
    term: "Superadmin",
    definition:
      "An account that bypasses every permission check. Reserved for system owners. Superadmins are deliberately excluded from routine notification fan-out so their inbox is not flooded.",
    related: ["role", "permission"],
  },
  {
    id: "otp",
    term: "OTP (one-time code)",
    aliases: ["one-time code", "one time password", "2fa"],
    definition:
      "A short numeric code sent to you at login, in addition to your password. It proves the person signing in also controls the registered email or phone. The code expires after a few minutes.",
    seenIn: "Login → Verify code",
  },
  {
    id: "campus-scope",
    term: "Campus scope",
    aliases: ["campus filter"],
    definition:
      "The campus your account is tied to. When a campus is selected in the top bar, every list, report and total on screen is limited to that campus. Change it to see another site — you will only be offered the campuses you are allowed to see.",
    seenIn: "Top bar → campus selector",
  },
  {
    id: "audit-trail",
    term: "Audit trail",
    aliases: ["system logs", "audit log"],
    definition:
      "The permanent record of who did what and when. Used to settle disputes, trace mistakes back to their source, and show auditors that records are controlled.",
    seenIn: "Administration → System logs",
  },

  /* ── Academic structure ───────────────────────────────────────────── */
  {
    id: "school",
    term: "School / Faculty",
    aliases: ["faculty", "faculties", "schools"],
    definition:
      "The largest academic grouping in the university — for example a School of Business. Faculties contain departments, departments contain programmes.",
    seenIn: "Settings → Academics",
    related: ["department", "programme"],
  },
  {
    id: "department",
    term: "Department",
    definition:
      "A teaching unit inside a faculty. Departments own programmes and are the usual level at which budgets, staff and workload are managed.",
    related: ["school", "programme"],
  },
  {
    id: "programme",
    term: "Programme (Option)",
    aliases: ["program", "option", "options", "programmes"],
    definition:
      "The named course of study a student is admitted into — for example BSc Computer Science. The system calls these “Options” in some settings screens. A programme sets which modules a student takes and which fee structure applies.",
    related: ["department", "degree", "module"],
  },
  {
    id: "degree",
    term: "Degree",
    definition:
      "The qualification level awarded — Certificate, Diploma, Bachelor, Master. A programme belongs to exactly one degree, and the degree drives how the final result is classified.",
    related: ["programme", "classification"],
  },
  {
    id: "level",
    term: "Level (Year of study)",
    aliases: ["year of study", "levels"],
    definition:
      "How far through a programme a student is — Level 1, 2, 3 and so on. Levels drive which modules are offered, which fee rate applies, and progression rules.",
  },
  {
    id: "academic-year",
    term: "Academic year",
    definition:
      "The yearly cycle the institution runs on, for example 2026–2027. Almost every record — registrations, invoices, marks — is stamped with the academic year it belongs to.",
    related: ["academic-term", "intake"],
  },
  {
    id: "academic-term",
    term: "Term / Semester",
    aliases: ["term", "terms", "semester", "semesters"],
    definition:
      "A subdivision of the academic year. Marks, registrations and timetables are recorded per term, so the active term at the top of the screen decides what you are looking at.",
    related: ["academic-year"],
  },
  {
    id: "module",
    term: "Module (Course)",
    aliases: ["course", "modules", "courses", "unit"],
    definition:
      "One taught subject, with a code, a credit value, a level, and the programmes it belongs to. Students register for modules; lecturers are assigned to them; marks are recorded against them.",
    related: ["credit", "module-offering", "prerequisite"],
  },
  {
    id: "credit",
    term: "Credit",
    aliases: ["credits", "credit hours"],
    definition:
      "A number expressing how much study a module represents. Credits decide GPA weighting, whether a student has a full load, and — where per-credit charging is used — how much the module costs.",
    related: ["gpa", "per-credit-rate"],
  },
  {
    id: "module-offering",
    term: "Module offering",
    aliases: ["offering", "offerings"],
    definition:
      "A module made available for a specific academic year and term. A module exists permanently in the catalogue; an offering is that module actually being run this term.",
    related: ["module", "module-schedule"],
  },
  {
    id: "module-schedule",
    term: "Scheduling",
    aliases: ["timetable", "schedule"],
    definition:
      "Placing a module offering into a room and time slot. The system flags clashes — the same room, lecturer or student group booked twice at once.",
    related: ["module-offering"],
  },
  {
    id: "module-assignment",
    term: "Module assignment",
    aliases: ["assignment", "lecturer assignment"],
    definition:
      "Attaching a lecturer to a module offering. The assignment — not the person's role — is what opens the teaching workspace, the register and the mark sheet for that class.",
    related: ["module-offering", "lecturer-scope"],
  },
  {
    id: "lecturer-scope",
    term: "Lecturer scoping",
    definition:
      "The rule that a lecturer only ever sees the students, registers and mark sheets of the modules they are assigned to. It is applied on the server, so it holds no matter how the page is reached.",
    related: ["module-assignment"],
  },
  {
    id: "prerequisite",
    term: "Prerequisite",
    definition:
      "A module a student must already have passed before registering for another. The system checks prerequisites at registration and warns when they are not met.",
    related: ["module", "registration"],
  },
  {
    id: "registration",
    term: "Module registration",
    aliases: ["registrations", "register modules"],
    definition:
      "A student formally taking a module this term. Registration is what puts a student on the class register and on the mark sheet — an unregistered student is invisible to both.",
    related: ["module-offering", "prerequisite"],
  },

  /* ── Admissions ───────────────────────────────────────────────────── */
  {
    id: "applicant",
    term: "Applicant",
    definition:
      "Someone who has applied but is not yet a student. Applicants get their own limited portal to upload documents and track progress, and become students only when an offer is accepted and enrolment completes.",
    related: ["application", "enrolment"],
  },
  {
    id: "application",
    term: "Application",
    definition:
      "One person's request to join one programme for one intake. It carries their details, education history, uploaded documents, and a status that moves from draft to enrolled.",
    related: ["intake", "verification", "merit-list"],
  },
  {
    id: "intake",
    term: "Intake",
    aliases: ["intakes", "cohort"],
    definition:
      "An admission window — the period during which applications for a given start date are accepted. Closing an intake stops new applications without touching the ones already in flight.",
    related: ["application"],
  },
  {
    id: "verification",
    term: "Document verification",
    aliases: ["verify documents", "verifications"],
    definition:
      "An officer checking each uploaded document one at a time and either approving it or returning it with a comment saying what is wrong. An application cannot progress on unverified documents.",
    related: ["application", "document-type"],
  },
  {
    id: "document-type",
    term: "Document type",
    definition:
      "A named category of paperwork the university accepts — national ID, secondary school transcript, birth certificate. Requirements are built out of document types.",
    related: ["admission-requirement"],
  },
  {
    id: "admission-requirement",
    term: "Admission requirement",
    aliases: ["requirements"],
    definition:
      "The checklist of documents a particular faculty or programme demands for a given year. It is what the applicant's upload screen is generated from.",
    related: ["document-type"],
  },
  {
    id: "merit-list",
    term: "Merit list",
    aliases: ["merit", "merit ranking", "shortlist"],
    definition:
      "Applicants scored against published criteria and ordered best-first. It makes selection visible and defensible: everybody can see why one applicant ranked above another.",
    related: ["application", "offer"],
  },
  {
    id: "offer",
    term: "Admission offer",
    aliases: ["offers", "admission letter"],
    definition:
      "The formal invitation to join a programme, issued as a PDF admission letter and emailed to the applicant. An offer is not yet enrolment — the applicant must accept it.",
    related: ["merit-list", "enrolment"],
  },
  {
    id: "enrolment",
    term: "Enrolment",
    aliases: ["enrollment", "enroll", "enrol"],
    definition:
      "Turning an accepted applicant into a registered student. Their details carry across unchanged — nothing is re-typed — and a registration number is issued.",
    related: ["offer", "reg-number"],
  },
  {
    id: "reg-number",
    term: "Registration number",
    aliases: ["regnumber", "student number", "student id"],
    definition:
      "The permanent identifier printed on a student's card and quoted on every invoice, transcript and receipt. It is how staff find a student fastest in search or at the gate.",
  },

  /* ── Assessment ───────────────────────────────────────────────────── */
  {
    id: "mark-sheet",
    term: "Mark sheet",
    definition:
      "The grid where a lecturer enters scores for one module, one term. It lists exactly the students registered for that module and applies the institution's grading scale as you type.",
    related: ["grading-scale", "confirm-marks"],
  },
  {
    id: "grading-scale",
    term: "Grading scale",
    definition:
      "The published table that converts a raw percentage into a letter grade and a grade point. Because it is configured centrally, the same score always produces the same grade everywhere.",
    related: ["gpa", "mark-sheet"],
  },
  {
    id: "gpa",
    term: "GPA",
    aliases: ["grade point average", "cgpa"],
    definition:
      "Grade Point Average — each module's grade point weighted by its credits, averaged. A cumulative GPA (CGPA) does the same across everything studied so far.",
    related: ["grading-scale", "credit", "classification"],
  },
  {
    id: "confirm-marks",
    term: "Confirming a mark sheet",
    aliases: ["lock marks", "mark confirmation"],
    definition:
      "Signing a mark sheet off so it can no longer be edited. Deliberately a separate right from recording marks: whoever enters the scores must not be able to seal and re-open them alone.",
    related: ["mark-sheet", "deliberation"],
  },
  {
    id: "deliberation",
    term: "Deliberation",
    definition:
      "The formal meeting where a board reviews a cohort's results and decides outcomes — pass, resit, repeat, progress. The system provides the on-screen mark sheets the board works from and records the decision.",
    related: ["confirm-marks", "revaluation"],
  },
  {
    id: "revaluation",
    term: "Revaluation",
    aliases: ["remark", "re-mark", "appeal"],
    definition:
      "A student's formal request to have a mark reviewed. It is tracked from request through to decision, so the outcome is documented rather than agreed verbally.",
    related: ["deliberation"],
  },
  {
    id: "superseded-mark",
    term: "Superseded mark",
    definition:
      "An old mark that has been replaced by a correction or a resit. The original is kept but clearly flagged as replaced, so the history stays honest and auditable.",
  },
  {
    id: "exam-sitting",
    term: "Exam sitting",
    aliases: ["exam schedule", "exam session"],
    definition:
      "A scheduled examination for a module — date, time, room, invigilation. Attendance is taken at the sitting itself, which is what evidences that a candidate was present.",
  },

  /* ── Graduation ───────────────────────────────────────────────────── */
  {
    id: "graduation-audit",
    term: "Graduation audit",
    aliases: ["completion check", "eligibility"],
    definition:
      "An automatic check of one candidate against every requirement of their programme — credits earned, modules passed, clearance obtained. It flags exactly what is missing rather than a plain pass/fail.",
    related: ["clearance", "graduand"],
  },
  {
    id: "graduand",
    term: "Graduand",
    definition:
      "A student confirmed as eligible to graduate and placed on the list for a ceremony. A graduand becomes a graduate once the ceremony is recorded.",
    related: ["graduation-audit", "classification"],
  },
  {
    id: "classification",
    term: "Degree classification",
    aliases: ["class of degree", "honours"],
    definition:
      "The band the final result falls into — for example First Class or Second Class Upper. It is derived from the accumulated GPA using rules set for the degree.",
    related: ["gpa", "degree"],
  },
  {
    id: "clearance",
    term: "Clearance",
    definition:
      "Confirmation that a student owes nothing outstanding — fees, library, equipment — before graduating or collecting documents. Each clearing office signs its own part.",
    related: ["graduation-audit", "balance"],
  },
  {
    id: "transcript",
    term: "Transcript",
    definition:
      "The official statement of everything a student studied and the marks they earned. Generated from live records, so it cannot drift out of date.",
    related: ["mark-sheet", "verification-page"],
  },
  {
    id: "verification-page",
    term: "Public verification",
    definition:
      "A public page where an employer or another institution can confirm that a student record or issued document is genuine, without phoning the registry.",
    related: ["transcript"],
  },

  /* ── Finance ──────────────────────────────────────────────────────── */
  {
    id: "fee-structure",
    term: "Fee structure",
    aliases: ["fee rates", "fee structures"],
    definition:
      "The rule that says what a given programme, level, campus and student category costs. Invoices are generated from the structure, so correcting a structure corrects future bills at source.",
    related: ["fee-type", "invoice", "per-credit-rate"],
  },
  {
    id: "fee-type",
    term: "Fee type",
    definition:
      "A named charge line — tuition, registration, accommodation, examination. Fee structures are built from fee types, and reports break revenue down by them.",
    related: ["fee-structure"],
  },
  {
    id: "per-credit-rate",
    term: "Per-credit rate",
    definition:
      "A charging model where the bill follows the number of credits registered rather than a flat programme price. Used mostly for postgraduate and part-time study.",
    related: ["credit", "fee-structure"],
  },
  {
    id: "invoice",
    term: "Invoice",
    aliases: ["bill", "invoices"],
    definition:
      "A statement of what one student owes for one period. Invoices can be generated in bulk at the start of a term or raised individually.",
    related: ["fee-structure", "payment", "balance"],
  },
  {
    id: "payment",
    term: "Payment",
    definition:
      "Money received against a student's account, whether paid online, at a bank, or recorded manually by finance staff. Every payment produces a receipt.",
    related: ["payment-approval", "receipt", "balance"],
  },
  {
    id: "payment-approval",
    term: "Payment approval",
    definition:
      "The review step a manually-recorded payment passes through before it counts against a balance. It stops an unverified bank slip from silently clearing a student's debt.",
    related: ["payment"],
  },
  {
    id: "receipt",
    term: "Receipt",
    definition:
      "The printable proof of a payment, generated from the payment record itself and therefore always consistent with the ledger.",
    related: ["payment"],
  },
  {
    id: "balance",
    term: "Balance",
    aliases: ["outstanding", "arrears"],
    definition:
      "Invoiced amount minus everything credited — payments, bursaries, sponsor cover, waivers. A negative balance means the student is in credit.",
    related: ["invoice", "payment", "bursary"],
  },
  {
    id: "bursary",
    term: "Bursary",
    aliases: ["scholarship", "financial aid", "waiver"],
    definition:
      "Money the institution or a donor puts towards a student's fees, reducing what the student personally owes. Bursaries are confirmed before they take effect on a balance.",
    related: ["sponsor", "balance"],
  },
  {
    id: "sponsor",
    term: "Sponsor",
    definition:
      "An organisation paying part or all of a student's fees — a government body, employer, or church. Sponsors are records in their own right so their students can be billed and reported on together.",
    related: ["bursary"],
  },
  {
    id: "fine",
    term: "Fine",
    definition:
      "A penalty charge added to a student's account — late payment, a broken regulation, damaged property. Fines behave like any other charge on the balance.",
    related: ["balance"],
  },
  {
    id: "payment-calendar",
    term: "Payment calendar",
    definition:
      "The published schedule of instalment deadlines. It is what overdue alerts measure against, so a student is only “late” relative to a date the institution actually published.",
    related: ["overdue-alert"],
  },
  {
    id: "overdue-alert",
    term: "Overdue alert",
    definition:
      "A notice raised for students who have missed a published payment deadline, so finance can chase early instead of at year end.",
    related: ["payment-calendar", "balance"],
  },
  {
    id: "reconciliation",
    term: "Reconciliation",
    definition:
      "Comparing what the system believes was paid against what the payment provider and bank actually report. Differences surface immediately rather than at audit.",
    related: ["payment"],
  },
  {
    id: "refund",
    term: "Refund",
    definition:
      "Money returned to a student — an overpayment or a returnable deposit such as caution money.",
    related: ["payment"],
  },
  {
    id: "budget-plan",
    term: "Budget plan",
    definition:
      "What a department expects to spend over a period, entered ahead of time so actual spending can be measured against an agreed figure.",
    related: ["budget-execution", "expense"],
  },
  {
    id: "budget-execution",
    term: "Budget execution",
    definition:
      "Planned versus actual spending as the year progresses — the view that answers “how much of our budget is left?”.",
    related: ["budget-plan"],
  },
  {
    id: "expense",
    term: "Expense",
    definition:
      "Money the institution has spent, recorded against a category and, where relevant, against a budget line.",
    related: ["budget-plan"],
  },

  /* ── HR ───────────────────────────────────────────────────────────── */
  {
    id: "payroll-run",
    term: "Payroll run",
    aliases: ["payroll", "payroll period"],
    definition:
      "One month's salary calculation for all staff — gross pay, allowances, deductions, net pay. A run is generated, reviewed, then paid.",
    related: ["payslip", "deduction"],
  },
  {
    id: "payslip",
    term: "Payslip",
    definition:
      "One employee's copy of one payroll run, itemising what they earned and what was taken off. Staff can open their own payslips without asking HR.",
    related: ["payroll-run"],
  },
  {
    id: "deduction",
    term: "Deduction",
    definition:
      "An amount subtracted from gross pay — statutory contributions, tax, loan repayments, or an amount specific to one employee. Rates are configured rather than hard-coded.",
    related: ["payroll-run"],
  },
  {
    id: "leave-type",
    term: "Leave type",
    definition:
      "A category of absence — annual, sick, maternity, study. Each type carries its own yearly entitlement and its own approval chain.",
    related: ["leave-chain", "leave-balance"],
  },
  {
    id: "leave-chain",
    term: "Approval chain",
    aliases: ["approval stages", "stage chain"],
    definition:
      "The ordered list of offices that must sign a request before it is final — for example head of department, then HR, then the finance director. Each stage names the permission its approver must hold, so who signs at which level is configuration, not code.",
    related: ["leave-type", "approval-queue"],
  },
  {
    id: "leave-balance",
    term: "Leave balance",
    definition:
      "How many days of a given leave type an employee has left this year: entitlement minus what has been approved and taken.",
    related: ["leave-type"],
  },
  {
    id: "approval-queue",
    term: "Approval queue",
    definition:
      "The list of requests currently parked at *your* stage, waiting for your decision. You only see what is yours to decide — not the whole register.",
    related: ["leave-chain", "service-request"],
  },
  {
    id: "appraisal",
    term: "Appraisal",
    definition:
      "A structured performance review of an employee over a period, recorded against agreed criteria rather than as free-form notes.",
  },

  /* ── Operations ───────────────────────────────────────────────────── */
  {
    id: "service-catalogue",
    term: "Service catalogue",
    aliases: ["service catalog", "services"],
    definition:
      "The published list of services the university offers — a transcript, a proof-of-enrolment letter, a name correction. Each entry defines who may ask, what must be attached, what it costs, and which offices approve it in what order.",
    related: ["service-request", "leave-chain"],
  },
  {
    id: "service-request",
    term: "Service request",
    definition:
      "One person asking for one service. It moves through the approval stages defined for that service, and both the requester and staff can see exactly where it is sitting.",
    related: ["service-catalogue", "tracking-code"],
  },
  {
    id: "tracking-code",
    term: "Tracking code",
    aliases: ["reference number", "tracking reference"],
    definition:
      "The reference given when a request or application is submitted. It lets somebody without an account check progress on the public tracking page.",
    related: ["service-request", "application"],
  },
  {
    id: "gate-log",
    term: "Gate log",
    definition:
      "The record of an entry or exit scan at a campus gate, including whether the student was registered and financially cleared at that moment.",
    related: ["clearance"],
  },
  {
    id: "announcement",
    term: "Announcement",
    definition:
      "An official notice published to a chosen audience — a whole campus, a programme, a year group. One-way: for a conversation, use messages or forums.",
  },
  {
    id: "notification",
    term: "Notification",
    definition:
      "An in-app alert raised when something needs your attention — a request landed in your queue, a decision was made on yours. The bell in the top bar carries the unread count.",
  },
  {
    id: "system-document",
    term: "System document",
    definition:
      "An official file the institution publishes inside the platform — a fee-structure PDF, a policy, a template — so everyone reads the same version.",
  },
];

/** id → term, plus alias resolution, built once. */
export const GLOSSARY_BY_ID: Record<string, GlossaryTerm> = Object.fromEntries(
  GLOSSARY.map((t) => [t.id, t]),
);

const ALIAS_INDEX: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const t of GLOSSARY) {
    map[t.term.toLowerCase()] = t.id;
    map[t.id] = t.id;
    for (const a of t.aliases ?? []) map[a.toLowerCase()] = t.id;
  }
  return map;
})();

/** Resolve whatever the writer typed inside [[…]] to a glossary entry. */
export function lookupTerm(raw: string): GlossaryTerm | undefined {
  const key = raw.trim().toLowerCase();
  const id = ALIAS_INDEX[key] ?? ALIAS_INDEX[key.replace(/s$/, "")];
  return id ? GLOSSARY_BY_ID[id] : undefined;
}
