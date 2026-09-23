import type { HelpModule } from "../types";

export const graduation: HelpModule = {
  id: "graduation",
  title: "Graduation & Certificates",
  icon: "Award",
  accent: "violet",
  summary: "Eligibility audits, clearance, degree classification, graduand lists, transcripts and certificates.",
  intro:
    "The end of the student journey has to be exactly right, because the documents it produces outlive everything else. This module covers auditing candidates against their programme, clearing them, classifying the degree, managing the ceremony list, and issuing transcripts and certificates.",
  audience: ["Registry", "Administrator", "Student"],
  routes: [
    "/academic/graduands",
    "/academic/certificates",
    "/academic/transcript-requests",
    "/finance/clearance",
    "/verify/student",
  ],
  articles: [
    {
      id: "audit",
      title: "Audit candidates for graduation",
      kind: "walkthrough",
      summary: "Run the completion check, read what is missing, and build the eligible list.",
      minutes: 5,
      audience: ["Registry"],
      access: "Needs: View / manage graduands",
      route: "/academic/graduands",
      keywords: ["graduation audit", "eligibility", "completion", "who can graduate", "missing credits", "completion list"],
      blocks: [
        {
          type: "paragraph",
          text: "A [[graduation audit]] compares one candidate against every requirement of their [[programme]]. It does not answer yes/no — it lists precisely what is outstanding, which is what makes it actionable.",
        },
        {
          type: "steps",
          steps: [
            { title: "Open **Academic Records → Graduand list**", route: "/academic/graduands" },
            { title: "Filter to the programme, level and academic year" },
            { title: "Rebuild the completion list", detail: "This re-runs the audit against current marks. Do it after the last [[deliberation]], not before." },
            { title: "Read the exceptions", detail: "Missing [[credit]]s, unpassed compulsory modules, unresolved resits, outstanding [[clearance]]." },
            { title: "Work the exceptions with the departments", tip: "Most exceptions at this stage are unconfirmed mark sheets rather than genuinely incomplete students." },
            { title: "Confirm the eligible candidates as [[graduand]]s" },
          ],
        },
        {
          type: "callout",
          tone: "warning",
          text: "Do not approve a graduand with outstanding [[clearance]]. Clearance is the point at which finance, library and other offices each confirm nothing is owed.",
        },
      ],
    },
    {
      id: "classification",
      title: "Degree classification",
      kind: "concept",
      summary: "How the final class is derived, and what to check before it is published.",
      minutes: 3,
      audience: ["Registry"],
      keywords: ["classification", "first class", "second class", "honours", "final gpa", "degree class"],
      blocks: [
        {
          type: "paragraph",
          text: "[[Degree classification]] is calculated from accumulated results using the rules set for the [[degree]] — not entered by hand. That is what makes two students with the same profile get the same class.",
        },
        {
          type: "list",
          title: "Check before publishing a class",
          items: [
            "Every contributing mark sheet is confirmed — an unconfirmed mark can still move.",
            "[[Superseded mark]]s resolve to the correct current value.",
            "Resits and [[revaluation]]s are all closed.",
            "The [[grading scale]] in force is the one the cohort was assessed under.",
          ],
        },
      ],
    },
    {
      id: "ceremony",
      title: "Manage the graduand list and ceremony",
      kind: "howto",
      summary: "Approve, defer and graduate candidates; produce the booklet.",
      minutes: 4,
      audience: ["Registry", "Administrator"],
      access: "Needs: Manage graduands",
      route: "/academic/graduands",
      keywords: ["graduand", "ceremony", "booklet", "defer", "graduate", "graduation list", "export graduands"],
      blocks: [
        {
          type: "steps",
          steps: [
            { title: "Open **Academic Records → Graduand list**", route: "/academic/graduands" },
            { title: "Approve the audited candidates onto the list" },
            { title: "Defer anyone who is not ready", detail: "Deferring keeps them for the next ceremony rather than removing their record." },
            { title: "Export the list for the booklet", detail: "Check name spellings against identification — this is the version that gets printed." },
            { title: "After the ceremony, mark the cohort as graduated", detail: "They become alumni; their record closes cleanly." },
          ],
        },
        {
          type: "callout",
          tone: "tip",
          title: "Names are the classic failure",
          text: "Almost every graduation complaint is a misspelt name on a printed certificate. Verify spellings against identification while the list is still on screen.",
        },
      ],
    },
    {
      id: "transcripts",
      title: "Issue transcripts",
      kind: "howto",
      summary: "Handle transcript requests and dispatch the document.",
      minutes: 3,
      audience: ["Registry"],
      access: "Needs: Manage transcript requests",
      route: "/academic/transcript-requests",
      keywords: ["transcript", "transcript request", "academic record", "issue transcript", "official transcript"],
      blocks: [
        {
          type: "steps",
          steps: [
            { title: "Open **Academic Records → Transcripts**", route: "/academic/transcript-requests" },
            { title: "Open the request and check [[clearance]]", detail: "A student with outstanding obligations is normally not issued an official [[transcript]]." },
            { title: "Generate the transcript", detail: "It is built from live marks, so it always matches the record." },
            { title: "Review it before dispatch", detail: "Confirm the programme, classification and every term is present." },
            { title: "Dispatch and record the issue", detail: "The issue is logged, so you can prove later what was sent and when." },
          ],
        },
      ],
    },
    {
      id: "certificates",
      title: "Issue academic certificates",
      kind: "howto",
      summary: "Produce, track and dispatch degrees, diplomas and certificates.",
      minutes: 3,
      audience: ["Registry"],
      access: "Needs: Manage academic certificates",
      route: "/academic/certificates",
      keywords: ["certificate", "degree certificate", "diploma", "issue certificate", "reprint certificate"],
      blocks: [
        {
          type: "steps",
          steps: [
            { title: "Open **Academic Records → Certificates**", route: "/academic/certificates" },
            { title: "Select the graduated cohort" },
            { title: "Generate the certificates", detail: "Name, [[programme]], [[degree]] and [[classification]] come from the record." },
            { title: "Track collection", detail: "The screen records issued, collected and outstanding, so an uncollected certificate is not simply lost track of." },
          ],
        },
        {
          type: "callout",
          tone: "info",
          title: "Outsiders can verify without calling you",
          text: "An employer can confirm a document or a student on the [[public verification]] page. Point them there rather than confirming by phone.",
        },
        { type: "terms", ids: ["graduation-audit", "graduand", "classification", "clearance", "transcript", "verification-page"] },
      ],
    },
  ],
};
