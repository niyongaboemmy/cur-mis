import type { HelpModule } from "../types";

export const academics: HelpModule = {
  id: "academics",
  title: "Academic Structure",
  icon: "Layers",
  accent: "teal",
  summary: "Faculties, departments, programmes, degrees, levels, campuses, years and terms.",
  intro:
    "This is the skeleton everything else hangs off. A module belongs to a [[programme]], a programme to a [[department]], a department to a [[school]]. Marks, fees and registrations are all stamped with an [[academic year]] and [[term]]. Get this right once and the rest of the system behaves; get it wrong and every downstream list looks strange.",
  audience: ["Registry", "Administrator"],
  routes: ["/academic/settings", "/academic/management", "/academic/system-documents", "/academic/grading-scale"],
  articles: [
    {
      id: "hierarchy",
      title: "How the academic structure fits together",
      kind: "concept",
      summary: "The order things must be created in, and why.",
      minutes: 4,
      audience: ["Registry", "Administrator"],
      keywords: ["structure", "hierarchy", "faculty", "department", "programme", "degree", "level", "setup order"],
      blocks: [
        {
          type: "paragraph",
          text: "Each layer depends on the one above it, so they must be created top-down. You cannot attach a programme to a department that does not exist yet.",
        },
        {
          type: "list",
          ordered: true,
          title: "Create in this order",
          items: [
            "**Campus** — the physical sites. Also governs who sees what, through [[campus scope]].",
            "**[[School]] / faculty** — the largest academic grouping.",
            "**[[Department]]** — the teaching unit inside a faculty.",
            "**[[Degree]]** — the qualification level: Certificate, Diploma, Bachelor, Master.",
            "**[[Programme]]** (called *Options* on some screens) — the named course of study.",
            "**[[Level]]** — years of study within a programme.",
            "**[[Module]]** — the individual taught subjects, attached to programmes and levels.",
          ],
        },
        {
          type: "callout",
          tone: "warning",
          title: "Deleting is not the tool you want",
          text: "Anything with history attached — a programme with students, a term with marks — should be deactivated, not deleted. Deleting breaks the records that point at it.",
        },
      ],
    },
    {
      id: "years-and-terms",
      title: "Open an academic year and its terms",
      kind: "howto",
      summary: "Roll the institution into a new year and make the right term current.",
      minutes: 4,
      audience: ["Registry", "Administrator"],
      access: "Needs: Manage academic years / terms",
      route: "/academic/settings",
      keywords: ["academic year", "term", "semester", "new year", "roll over", "current term", "activate term"],
      blocks: [
        {
          type: "callout",
          tone: "info",
          title: "Why this screen matters more than it looks",
          text: "The active [[academic year]] and [[term]] decide what almost every other screen shows. A mark sheet that looks empty is usually a term-selection problem, not a data problem.",
        },
        {
          type: "steps",
          steps: [
            { title: "Open **Settings → Academics → Years & terms**", route: "/academic/settings?tab=years-terms" },
            { title: "Create the new academic year with its start and end dates" },
            { title: "Add its terms in order", detail: "Give each term realistic dates — registration windows and reporting periods are measured against them." },
            { title: "Activate the current term", detail: "Do this at the point the term actually starts, not weeks ahead." },
            { title: "Tell the offices it has changed", detail: "Registry, finance and lecturers all key their work off it." },
          ],
        },
      ],
    },
    {
      id: "manage-structure",
      title: "Add or change a faculty, department or programme",
      kind: "howto",
      summary: "Day-to-day maintenance of the academic tree.",
      minutes: 4,
      audience: ["Registry", "Administrator"],
      access: "Needs: Manage academics and related rights",
      route: "/academic/management",
      keywords: ["add faculty", "add department", "add programme", "options", "degrees", "levels", "campuses", "edit structure"],
      blocks: [
        {
          type: "steps",
          steps: [
            { title: "Open **Settings** (Academics management)", detail: "Each part of the structure has its own tab: schools, degrees, facilities, departments, programmes, levels, campuses.", route: "/academic/management" },
            { title: "Choose the tab for the thing you are creating" },
            { title: "Create the parent first if it is missing", detail: "Following the order in *How the academic structure fits together* saves rework." },
            { title: "Fill in the name and code carefully", detail: "Codes appear on transcripts and reports for years. Agree them with the registry before typing." },
            { title: "Save and check it appears where it should", detail: "A new programme should immediately be selectable when creating a module or a [[fee structure]]." },
          ],
        },
        {
          type: "faq",
          items: [
            { q: "What is the difference between a Programme and an Option?", a: "Nothing — they are the same thing. Older screens label it *Options*; it is the named course of study a student is admitted into." },
            { q: "A new programme does not appear in the fee structures screen.", a: "Fee structures are per programme, level, campus and category. Check you are filtering on the same campus the programme was created under." },
          ],
        },
      ],
    },
    {
      id: "grading-scale",
      title: "Configure the grading scale",
      kind: "howto",
      summary: "Set the percentage bands, letter grades and grade points used institution-wide.",
      minutes: 4,
      audience: ["Registry", "Exams", "Administrator"],
      access: "Needs: Manage grading scales",
      route: "/academic/grading-scale",
      keywords: ["grading scale", "grade bands", "gpa", "grade points", "pass mark", "letter grade", "marks conversion"],
      blocks: [
        {
          type: "paragraph",
          text: "The [[grading scale]] is what turns a raw percentage into a letter and a grade point. Because it lives in one place, the same score produces the same grade in every faculty.",
        },
        {
          type: "steps",
          steps: [
            { title: "Open **Academic Records → Grading scale & GPA**", route: "/academic/grading-scale" },
            { title: "Check the bands are continuous and do not overlap", detail: "A gap means a score that maps to no grade; an overlap means a score with two grades." },
            { title: "Set the grade point for each band", detail: "These points, weighted by [[credit]]s, are what produce a [[GPA]]." },
            { title: "Mark the pass threshold", detail: "It drives progression, resit lists and the [[graduation audit]]." },
            { title: "Save" },
          ],
        },
        {
          type: "callout",
          tone: "warning",
          title: "Changing a scale mid-year",
          text: "Marks already recorded were graded under the old bands. Change a live scale only with a deliberate decision from the academic board, and tell exams staff before you do.",
        },
      ],
    },
    {
      id: "system-documents",
      title: "Publish system documents",
      kind: "howto",
      summary: "Put fee structures, policies and templates where everyone reads the same version.",
      minutes: 2,
      audience: ["Registry", "Administrator"],
      route: "/academic/system-documents",
      keywords: ["system documents", "policy", "upload policy", "fee structure pdf", "templates", "official documents"],
      blocks: [
        {
          type: "steps",
          steps: [
            { title: "Open **Academic → System documents**", route: "/academic/system-documents" },
            { title: "Upload the file with a clear title and its effective date", detail: "“Fee structure 2026–2027” beats “fees final v3 (2)”." },
            { title: "Replace rather than duplicate when a new version is issued", tip: "Two live versions of a policy is how two offices end up enforcing different rules." },
          ],
        },
        { type: "terms", ids: ["school", "department", "programme", "degree", "level", "academic-year", "academic-term", "grading-scale", "system-document"] },
      ],
    },
  ],
};
