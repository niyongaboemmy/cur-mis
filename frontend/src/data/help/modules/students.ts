import type { HelpModule } from "../types";

export const students: HelpModule = {
  id: "students",
  title: "Student Records",
  icon: "GraduationCap",
  accent: "sky",
  summary: "The student registry: find a student, read their file, and generate their documents.",
  intro:
    "Every enrolled student has one file, and everything else in the system points at it — registrations, marks, invoices, attendance, documents. This module covers finding students, reading and correcting the record, and producing official paperwork from it.",
  audience: ["Registry", "Administrator", "Admissions"],
  routes: ["/students", "/students/:id", "/documents/generate", "/admin/international-students"],
  articles: [
    {
      id: "find-student",
      title: "Find a student and read their file",
      kind: "howto",
      summary: "Search the registry and navigate the tabs on a student's record.",
      minutes: 3,
      audience: ["Registry", "Administrator"],
      access: "Needs: View students",
      route: "/students",
      keywords: ["find student", "student search", "registry", "student list", "student profile", "student details"],
      blocks: [
        {
          type: "steps",
          steps: [
            { title: "Open **Students → All students**", route: "/students" },
            { title: "Search by name or [[registration number]]", detail: "The registration number is unique and never ambiguous — prefer it when you have it.", tip: "Ctrl + K from anywhere also reaches students directly." },
            { title: "Filter by [[programme]], [[level]], campus or status if the list is long" },
            { title: "Open the student", detail: "The file is organised in tabs — profile, curriculum and modules, marks, attendance, finance, documents." },
          ],
        },
        {
          type: "callout",
          tone: "info",
          title: "One record, many views",
          text: "Finance, the registry and a lecturer are all looking at the same underlying record. There is no separate finance copy of a student that can disagree with the registry's.",
        },
      ],
    },
    {
      id: "correct-record",
      title: "Correct a student's details",
      kind: "howto",
      summary: "Change a name, contact detail, programme or level — and what to be careful of.",
      minutes: 3,
      audience: ["Registry"],
      access: "Needs: Manage students",
      keywords: ["edit student", "correct name", "change programme", "transfer", "update details", "name change"],
      blocks: [
        {
          type: "steps",
          steps: [
            { title: "Open the student's file and choose edit", route: "/students" },
            { title: "Make the correction", detail: "Contact details are low-risk. Names, programme and level are not — see the warning below." },
            { title: "Save", detail: "The change is written to the [[audit trail]] with your name against it." },
          ],
        },
        {
          type: "callout",
          tone: "warning",
          title: "Three fields with long consequences",
          text: "**Name** appears on the certificate; correct it only against identification. **Programme** changes which modules and fees apply. **Level** changes progression and billing. A student-initiated change to any of these should come through a [[service request]] so the paperwork exists.",
        },
      ],
    },
    {
      id: "generate-documents",
      title: "Generate official student documents",
      kind: "howto",
      summary: "Produce proof-of-enrolment letters, registration forms, ID cards and other paperwork.",
      minutes: 3,
      audience: ["Registry"],
      access: "Needs: Generate documents",
      route: "/documents/generate",
      keywords: ["generate document", "letter", "proof of enrolment", "student id card", "registration form", "print document"],
      blocks: [
        {
          type: "steps",
          steps: [
            { title: "Open **Students → Generate documents**", route: "/documents/generate" },
            { title: "Choose the document type", detail: "The list is drawn from the institution's templates, so wording stays consistent across offices." },
            { title: "Select the student", detail: "Search by name or [[registration number]]." },
            { title: "Check the preview", detail: "Every field is filled from the live record. If something is wrong on the document, it is wrong on the record — fix it there, not in the file." },
            { title: "Generate and download or send", detail: "The issued document is recorded, so you can prove later what was issued and when." },
          ],
        },
        {
          type: "callout",
          tone: "tip",
          text: "Documents can be checked by outsiders on the [[public verification]] page, so an employer never has to call the registry to confirm a letter is genuine.",
        },
      ],
    },
    {
      id: "student-ids",
      title: "Student ID cards",
      kind: "reference",
      summary: "How ID cards are issued and what the gate reads from them.",
      minutes: 2,
      audience: ["Registry", "Security"],
      keywords: ["id card", "student card", "photo", "gate", "reprint card"],
      blocks: [
        {
          type: "list",
          items: [
            "A card is generated from the student record, so the photo and [[registration number]] on the card are the ones the system holds.",
            "Cards are used at the gate for identification — the [[gate log]] records the scan along with whether the student was registered and cleared at that moment.",
            "A lost card is reissued from the same record; the number does not change.",
            "A missing photo on the record produces a card without one. Add the photo first.",
          ],
        },
        { type: "terms", ids: ["reg-number", "gate-log", "clearance"] },
      ],
    },
  ],
};
