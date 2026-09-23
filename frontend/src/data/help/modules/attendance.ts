import type { HelpModule } from "../types";

export const attendance: HelpModule = {
  id: "attendance",
  title: "Attendance",
  icon: "ClipboardCheck",
  accent: "amber",
  summary: "Record class attendance, review it across modules, and correct a locked register.",
  intro:
    "Attendance is recorded per class session against the students registered for that module. Lecturers record it from their own class; attendance managers review it across the institution and are the only ones who can re-open a locked register.",
  audience: ["Lecturer", "Registry", "Administrator", "Student"],
  routes: ["/attendance", "/teacher/courses", "/me/profile?tab=attendance"],
  articles: [
    {
      id: "record",
      title: "Record attendance for a session",
      kind: "howto",
      summary: "The daily task: open the session, mark the students, save.",
      minutes: 2,
      audience: ["Lecturer", "Registry"],
      access: "Needs: Record attendance",
      route: "/attendance",
      keywords: ["record attendance", "take register", "present absent", "session", "class attendance"],
      blocks: [
        {
          type: "steps",
          steps: [
            { title: "Open **Attendance**", detail: "Lecturers usually reach the same register from their own course page instead.", route: "/attendance" },
            { title: "Choose the module and the session date" },
            { title: "Mark each student", detail: "Present, absent, or excused where the institution allows it." },
            { title: "Save, then lock when the register is final" },
          ],
        },
        {
          type: "callout",
          tone: "tip",
          text: "The register lists exactly the [[module registration|registered]] students. A name that is missing is a registration problem, not an attendance one.",
        },
      ],
    },
    {
      id: "review",
      title: "Review and report on attendance",
      kind: "howto",
      summary: "Look across modules to find students at risk.",
      minutes: 3,
      audience: ["Registry", "Administrator"],
      access: "Needs: View attendance",
      route: "/attendance",
      keywords: ["attendance report", "absentee", "at risk", "attendance percentage", "review attendance"],
      blocks: [
        {
          type: "steps",
          steps: [
            { title: "Open **Attendance** and filter by programme, level, module or date range", route: "/attendance" },
            { title: "Sort by attendance percentage to surface the lowest first" },
            { title: "Open a student to see the pattern", detail: "One bad week reads very differently from a steady decline." },
            { title: "Act early", detail: "Attendance is the earliest visible signal that a student is in trouble — earlier than marks, and much earlier than a fee arrear." },
          ],
        },
      ],
    },
    {
      id: "correct",
      title: "Correct a locked register",
      kind: "howto",
      summary: "Re-open, fix and re-lock — with a trail of why.",
      minutes: 2,
      audience: ["Registry", "Administrator"],
      access: "Needs: Manage attendance",
      keywords: ["unlock register", "correct attendance", "reopen", "fix attendance", "attendance mistake"],
      blocks: [
        {
          type: "steps",
          steps: [
            { title: "Locate the session in **Attendance**", route: "/attendance" },
            { title: "Re-open the locked register", detail: "Only an attendance manager can do this — that separation is what makes a locked register meaningful." },
            { title: "Make the correction" },
            { title: "Lock it again", detail: "Both the re-open and the change are written to the [[audit trail]] against your name." },
          ],
        },
        {
          type: "callout",
          tone: "warning",
          text: "Corrections after the fact attract questions later. Note the reason somewhere durable — an email to the head of department is usually enough.",
        },
      ],
    },
    {
      id: "student-view",
      title: "Students: check your own attendance",
      kind: "howto",
      summary: "See your per-module attendance figures.",
      minutes: 1,
      audience: ["Student"],
      route: "/me/profile?tab=attendance",
      keywords: ["my attendance", "student attendance", "how many classes", "attendance percentage"],
      blocks: [
        {
          type: "steps",
          steps: [
            { title: "Open **Attendance** from the sidebar", detail: "It opens your profile's attendance tab.", route: "/me/profile?tab=attendance" },
            { title: "Read the figure per module for the current [[term]]" },
            { title: "Query anything that looks wrong with the lecturer for that module", detail: "They took the register, so they can correct it — or ask an attendance manager to re-open it." },
          ],
        },
      ],
    },
  ],
};
