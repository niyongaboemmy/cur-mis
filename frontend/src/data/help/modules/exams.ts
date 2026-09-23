import type { HelpModule } from "../types";

export const exams: HelpModule = {
  id: "exams",
  title: "Exams & Results",
  icon: "ClipboardList",
  accent: "rose",
  summary: "Exam scheduling, mark confirmation, deliberation, revaluation and results publication.",
  intro:
    "This module covers the assessment cycle after teaching: scheduling the papers, sealing the marks, deliberating on the outcome, and handling appeals. The separation of duties here is deliberate — recording, confirming and deciding are three different rights held by three different offices.",
  audience: ["Exams", "Registry", "Lecturer", "Student"],
  routes: [
    "/exams",
    "/exams/results",
    "/exams/deliberation",
    "/exams/revaluations",
    "/exams/grading-scale",
    "/my-modules?tab=exams",
  ],
  articles: [
    {
      id: "cycle",
      title: "The assessment cycle",
      kind: "concept",
      summary: "Who records, who confirms, who decides — and why they are different people.",
      minutes: 4,
      audience: ["Exams", "Registry"],
      keywords: ["assessment cycle", "process", "separation of duties", "who confirms marks", "results process"],
      blocks: [
        {
          type: "table",
          head: ["Step", "Owner", "Right needed", "Output"],
          rows: [
            ["Schedule the paper", "Exams office", "Manage exams", "An [[exam sitting]] with room and time"],
            ["Sit the exam", "Invigilator / lecturer", "Manage exams", "Exam attendance recorded"],
            ["Record marks", "Lecturer", "Record module marks", "A filled [[mark sheet]]"],
            ["Confirm marks", "Registry", "Confirm module marks", "A sealed mark sheet"],
            ["Deliberate", "Board", "Manage deliberations", "Decisions: pass, resit, repeat, progress"],
            ["Publish", "Registry", "Manage module marks", "Results visible to students"],
            ["Appeal", "Student → registry", "Manage revaluations", "A [[revaluation]] decision"],
          ],
        },
        {
          type: "callout",
          tone: "info",
          title: "Why the split matters",
          text: "If the person who enters a mark can also seal it and re-open it, there is no independent point at which the number becomes final. Splitting the rights is what makes a confirmed result trustworthy.",
        },
      ],
    },
    {
      id: "schedule-exams",
      title: "Schedule exam sittings",
      kind: "howto",
      summary: "Timetable papers into rooms and sessions.",
      minutes: 3,
      audience: ["Exams"],
      access: "Needs: Manage exams",
      route: "/exams",
      keywords: ["exam schedule", "exam timetable", "sitting", "exam room", "invigilation", "plan exams"],
      blocks: [
        {
          type: "steps",
          steps: [
            { title: "Open **Exam → Exam schedules**", route: "/exams" },
            { title: "Filter to the year, term and campus" },
            { title: "Create a sitting for each module offering being examined", detail: "Date, time, room, and expected candidate numbers." },
            { title: "Check for clashes", detail: "A student cannot sit two papers at once; look hardest at cohorts taking many shared modules." },
            { title: "Publish the timetable", detail: "Students see it under **My exams**; lecturers under **My Teaching → My exams**." },
          ],
        },
      ],
    },
    {
      id: "confirm-marks",
      title: "Confirm and publish results",
      kind: "howto",
      summary: "Review a submitted mark sheet, seal it, and release results.",
      minutes: 4,
      audience: ["Registry", "Exams"],
      access: "Needs: Confirm module marks",
      route: "/exams/results",
      keywords: ["confirm marks", "lock marks", "publish results", "release results", "seal mark sheet", "approve marks"],
      blocks: [
        {
          type: "steps",
          steps: [
            { title: "Open **Academic Records → All marks**", route: "/exams/results" },
            { title: "Filter to the module and [[term]] you are confirming" },
            { title: "Check completeness first", detail: "Every registered student should have a mark or an explicit absent. A blank is not a zero." },
            { title: "Check the grade distribution against the [[grading scale]]", detail: "A cohort where everybody scores in one band usually means a data-entry issue, not a teaching miracle." },
            { title: "Confirm the sheet", detail: "It is now sealed — see [[confirming a mark sheet]]. Re-opening is possible but recorded." },
            { title: "Publish when the board has agreed", detail: "Students then see the result under **My results**." },
          ],
        },
        {
          type: "callout",
          tone: "warning",
          title: "Corrections after confirmation",
          text: "A corrected mark does not erase the old one — the original is kept as a [[superseded mark]]. That is what lets you answer an audit question years later.",
        },
      ],
    },
    {
      id: "deliberation",
      title: "Run a deliberation",
      kind: "walkthrough",
      summary: "Prepare the board's mark sheets, record the decisions, and act on them.",
      minutes: 5,
      audience: ["Exams", "Registry"],
      access: "Needs: Manage deliberations",
      route: "/exams/deliberation",
      keywords: ["deliberation", "board", "results meeting", "pass list", "resit", "repeat", "progression"],
      blocks: [
        {
          type: "paragraph",
          text: "[[Deliberation]] is the formal meeting where results become decisions. The system's job is to put the same numbers in front of everybody in the room and to record what was decided.",
        },
        {
          type: "steps",
          steps: [
            { title: "Open **Academic Records → Deliberation**", route: "/exams/deliberation" },
            { title: "Select the programme, level and term being deliberated" },
            { title: "Check every mark sheet is confirmed first", detail: "Deliberating on unconfirmed marks means deciding on numbers that can still change." },
            { title: "Work through the cohort on screen", detail: "The board sees per-student totals, [[GPA]], and anything failing the pass threshold." },
            { title: "Record each decision", detail: "Pass, resit, repeat, progress, or refer. The decision is stored against the student." },
            { title: "Release the outcomes", detail: "Resit lists and progression follow from what was recorded here." },
          ],
        },
      ],
    },
    {
      id: "revaluations",
      title: "Handle a revaluation request",
      kind: "howto",
      summary: "Process a student's request to have a mark reviewed.",
      minutes: 3,
      audience: ["Exams", "Registry"],
      access: "Needs: Manage revaluations",
      route: "/exams/revaluations",
      keywords: ["revaluation", "remark", "appeal", "recheck", "dispute mark", "re-mark request"],
      blocks: [
        {
          type: "steps",
          steps: [
            { title: "Open **Academic Records → Revaluations**", route: "/exams/revaluations" },
            { title: "Open the request and read the grounds given" },
            { title: "Route it to a reviewer", detail: "Normally someone other than the original marker." },
            { title: "Record the outcome", detail: "Upheld with a new mark, or not upheld with a reason. Either way the student sees a documented decision." },
            { title: "If the mark changes, the old one is kept as a [[superseded mark]]", detail: "The transcript reflects the new mark; the history keeps both." },
          ],
        },
      ],
    },
    {
      id: "student-results",
      title: "Students: see your exams and results",
      kind: "howto",
      summary: "Find your exam timetable and your published marks.",
      minutes: 2,
      audience: ["Student"],
      route: "/my-modules?tab=exams",
      keywords: ["my results", "my exams", "my marks", "grades", "exam timetable", "see results"],
      blocks: [
        {
          type: "steps",
          steps: [
            { title: "Open **Exam → My exams** for your timetable", route: "/my-modules?tab=exams" },
            { title: "Open **Exam → My results** for published marks", route: "/my-modules?tab=marks" },
            { title: "Check you are looking at the right [[term]]" },
          ],
        },
        {
          type: "faq",
          items: [
            { q: "My result is not showing.", a: "Marks appear only once confirmed and published. If a whole module is missing, check you were [[module registration|registered]] for it." },
            { q: "I think my mark is wrong.", a: "Submit a [[revaluation]] request through the registry rather than approaching the lecturer informally — a formal request produces a documented decision." },
          ],
        },
        { type: "terms", ids: ["exam-sitting", "mark-sheet", "confirm-marks", "deliberation", "revaluation", "superseded-mark", "gpa"] },
      ],
    },
  ],
};
