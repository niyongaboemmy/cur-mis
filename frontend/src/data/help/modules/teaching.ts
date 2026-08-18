import type { HelpModule } from "../types";

export const teaching: HelpModule = {
  id: "teaching",
  title: "Teaching (Lecturers)",
  icon: "Presentation",
  accent: "orange",
  summary: "The lecturer's workspace: your courses, calendar, registers, exams and mark sheets.",
  intro:
    "**My Teaching** is scoped to you. It shows the modules you are assigned to this term and nothing else — see [[lecturer scoping]]. Everything you need for a class is reachable from the class itself: the student list, the register, and the mark sheet.",
  audience: ["Lecturer"],
  routes: [
    "/teacher",
    "/teacher/courses",
    "/teacher/students",
    "/teacher/calendar",
    "/teacher/exams",
  ],
  articles: [
    {
      id: "workspace",
      title: "Your teaching workspace",
      kind: "walkthrough",
      summary: "What each screen in My Teaching is for, and where to start each week.",
      minutes: 4,
      audience: ["Lecturer"],
      access: "Needs: Teacher portal access, plus a module assignment",
      route: "/teacher",
      keywords: ["my teaching", "lecturer portal", "teacher dashboard", "my courses", "my classes", "workspace"],
      blocks: [
        {
          type: "table",
          head: ["Screen", "Use it for"],
          rows: [
            ["**Dashboard**", "This week at a glance — your next sessions and anything waiting on you.", ],
            ["**My courses**", "Every module you are assigned this [[term]]; the way into a class.", ],
            ["**My students**", "Everyone registered across your modules, in one list.", ],
            ["**My calendar**", "Your teaching timetable as scheduled by the registry.", ],
            ["**My exams**", "Your upcoming [[exam sitting]]s and their attendance.", ],
          ],
        },
        {
          type: "callout",
          tone: "info",
          title: "A class is missing",
          text: "You only see modules you have been assigned for the current term. If one is missing, the registry has not created the [[module assignment]] yet — assignments do not carry over from last term.",
        },
      ],
    },
    {
      id: "class-register",
      title: "Take a class register",
      kind: "howto",
      summary: "Record attendance for a session, and lock the register when it is final.",
      minutes: 3,
      audience: ["Lecturer"],
      access: "Needs: Record attendance",
      route: "/teacher/courses",
      keywords: ["attendance", "register", "mark attendance", "present", "absent", "roll call", "lock register"],
      blocks: [
        {
          type: "steps",
          steps: [
            { title: "Open **My Teaching → My courses** and choose the module", route: "/teacher/courses" },
            { title: "Open the attendance tab and select the session date" },
            { title: "Mark each student present, absent or excused", detail: "The list is exactly the students [[registration|registered]] for the module — if someone is missing, they are not registered." },
            { title: "Save the register" },
            { title: "Lock it once you are sure", detail: "A locked register cannot be quietly changed afterwards, which is what makes it usable as evidence.", tip: "Take the register during the session, not from memory afterwards." },
          ],
        },
        {
          type: "faq",
          items: [
            { q: "A student attended but is not on the list.", a: "They are not registered for the module. Send them to the registry — attending without registering means no mark at the end of term either." },
            { q: "I locked a register with a mistake in it.", a: "Ask an attendance manager to re-open it. The re-open and the correction are both recorded." },
          ],
        },
      ],
    },
    {
      id: "enter-marks",
      title: "Enter marks on a mark sheet",
      kind: "walkthrough",
      summary: "Fill in scores for your module, check the grades, and submit for confirmation.",
      minutes: 5,
      audience: ["Lecturer"],
      access: "Needs: Record module marks",
      route: "/modules/marks",
      keywords: ["enter marks", "mark sheet", "record marks", "grades", "scores", "cat", "exam marks", "submit marks"],
      blocks: [
        {
          type: "paragraph",
          text: "A [[mark sheet]] is one module, one term. It lists exactly the registered students and applies the [[grading scale]] as you type, so you see the letter grade forming next to the score.",
        },
        {
          type: "steps",
          steps: [
            { title: "Open the module and its mark sheet", detail: "Reachable from **My courses**, or from **Modules → Record marks**.", route: "/modules/marks" },
            { title: "Check the year and [[term]] at the top", detail: "The commonest cause of “my marks disappeared” is entering them against the wrong term." },
            { title: "Enter the component scores for each student", detail: "Continuous assessment and examination components are separate columns; the total and grade compute themselves." },
            { title: "Save as you go", detail: "Do not enter a hundred students in one sitting without saving." },
            { title: "Review the distribution before submitting", detail: "An unusual spread is worth a second look — a shifted column or a mis-keyed maximum shows up here.", tip: "Export the sheet before submitting if you want your own copy." },
            { title: "Submit for confirmation", detail: "The registry then reviews and confirms it — see the note below." },
          ],
        },
        {
          type: "callout",
          tone: "warning",
          title: "You cannot confirm your own marks",
          text: "[[Confirming a mark sheet]] is a separate right held by the registry, on purpose: whoever records the scores must not also be able to seal them and re-open them alone.",
        },
      ],
    },
    {
      id: "exams",
      title: "Run an exam sitting",
      kind: "howto",
      summary: "See your scheduled exams and take attendance at the sitting.",
      minutes: 3,
      audience: ["Lecturer", "Exams"],
      route: "/teacher/exams",
      keywords: ["exam", "sitting", "invigilation", "exam attendance", "candidates", "exam register"],
      blocks: [
        {
          type: "steps",
          steps: [
            { title: "Open **My Teaching → My exams**", detail: "Your scheduled [[exam sitting]]s with date, time and room.", route: "/teacher/exams" },
            { title: "Open the sitting on the day" },
            { title: "Mark each candidate present or absent", detail: "This is the record that a candidate sat the paper — it matters when a mark is later disputed." },
            { title: "Save before leaving the hall" },
          ],
        },
        { type: "terms", ids: ["module-assignment", "lecturer-scope", "mark-sheet", "grading-scale", "confirm-marks", "exam-sitting"] },
      ],
    },
  ],
};
