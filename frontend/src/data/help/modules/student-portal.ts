import type { HelpModule } from "../types";

export const studentPortal: HelpModule = {
  id: "student-portal",
  title: "Student Portal",
  icon: "User",
  accent: "sky",
  summary: "For students: your profile, modules, results, fees, attendance and requests.",
  intro:
    "Everything you need as a student is in one place and available whenever you are. This guide covers the four things students do most: registering for modules, checking results, paying fees, and requesting documents.",
  audience: ["Student"],
  routes: ["/me/profile", "/my-modules", "/my-finance", "/my/service-requests"],
  articles: [
    {
      id: "your-year",
      title: "Your year, step by step",
      kind: "walkthrough",
      summary: "What to do and when, from the start of term to results.",
      minutes: 5,
      audience: ["Student"],
      keywords: ["student guide", "what do i do", "start of term", "checklist", "student year"],
      blocks: [
        {
          type: "steps",
          title: "Start of term",
          steps: [
            { title: "Check your [[invoice]] under **My finance**", detail: "Know what you owe and when instalments fall due.", route: "/my-finance" },
            { title: "Register for your modules", detail: "This is what puts you on the register, the timetable and the mark sheet.", route: "/my-modules" },
            { title: "Check your timetable and exam dates", route: "/my-modules?tab=exams" },
          ],
        },
        {
          type: "steps",
          title: "During term",
          steps: [
            { title: "Attend and check your attendance figures", route: "/me/profile?tab=attendance" },
            { title: "Pay against the published [[payment calendar]]", detail: "Late payment can attract a [[fine]] and can block services." },
            { title: "Read announcements and notifications", route: "/announcements" },
          ],
        },
        {
          type: "steps",
          title: "End of term",
          steps: [
            { title: "Check your published results", route: "/my-modules?tab=marks" },
            { title: "Clear any outstanding [[balance]]", detail: "An outstanding balance blocks [[clearance]], documents and graduation." },
            { title: "Request any documents you need", route: "/my/service-requests" },
          ],
        },
      ],
    },
    {
      id: "my-finance",
      title: "Check and pay your fees",
      kind: "howto",
      summary: "Read your invoice, understand your balance, pay online, get your receipt.",
      minutes: 3,
      audience: ["Student"],
      route: "/my-finance",
      keywords: ["my fees", "pay fees", "my invoice", "balance", "receipt", "how much do i owe", "online payment", "mobile money"],
      blocks: [
        {
          type: "steps",
          steps: [
            { title: "Open **My finance**", route: "/my-finance" },
            { title: "Read your [[invoice]]", detail: "It itemises each [[fee type]] for the period." },
            { title: "Read your [[balance]]", detail: "Invoiced minus everything credited — payments, [[bursary|bursaries]] and [[sponsor]] cover. A negative balance means you are in credit." },
            { title: "Pay online", detail: "Mobile money or bank through the integrated gateway. Online payments record themselves, usually within minutes." },
            { title: "Download your [[receipt]]", detail: "Keep it. It is your proof of payment." },
          ],
        },
        {
          type: "faq",
          items: [
            { q: "I paid at the bank but my balance has not changed.", a: "Bank and manual payments must be recorded and then approved by finance before they count. Take your slip to the finance office if it has been more than a couple of working days." },
            { q: "My bursary is not showing.", a: "A [[bursary]] only affects your balance once it has been confirmed. Ask the finance office whether it has been confirmed." },
            { q: "I think my invoice is wrong.", a: "Query it with the finance office and quote your [[registration number]] and the invoice period. The invoice is generated from a [[fee structure]] — if it is wrong, the structure or your programme/level on record is wrong." },
          ],
        },
      ],
    },
    {
      id: "documents",
      title: "Request a document or a service",
      kind: "howto",
      summary: "Ask for a transcript, a letter or a correction, and track the request.",
      minutes: 3,
      audience: ["Student"],
      route: "/my/service-requests",
      keywords: ["request transcript", "proof of enrolment", "letter", "service request", "apply for document", "track request"],
      blocks: [
        {
          type: "steps",
          steps: [
            { title: "Open **My service requests**", route: "/my/service-requests" },
            { title: "Choose the service from the catalogue", detail: "Each entry says what must be attached, what it costs, and which offices approve it." },
            { title: "Attach whatever is required and submit" },
            { title: "Pay the fee if there is one", detail: "Some requests wait at **awaiting payment** until the fee is paid." },
            { title: "Track it", detail: "You can see which stage it is sitting at and who has it." },
            { title: "Download the result", detail: "Once complete, the document is available from the same screen." },
          ],
        },
        {
          type: "callout",
          tone: "info",
          text: "Requests that depend on your account being settled — transcripts especially — will not complete while you have an outstanding [[balance]].",
        },
      ],
    },
    {
      id: "profile",
      title: "Your profile and record",
      kind: "reference",
      summary: "What each tab of your student record shows.",
      minutes: 2,
      audience: ["Student"],
      route: "/me/profile",
      keywords: ["my profile", "my record", "my details", "curriculum", "my modules", "change my details"],
      blocks: [
        {
          type: "table",
          head: ["Tab", "Shows"],
          rows: [
            ["Profile", "Your personal and contact details"],
            ["Curriculum", "Your [[programme]], [[level]] and the modules it requires"],
            ["Attendance", "Your per-module attendance for the current [[term]]"],
            ["Marks", "Your published results"],
            ["Finance", "Your invoices, payments and [[balance]]"],
            ["Documents", "Documents issued to you"],
          ],
        },
        {
          type: "callout",
          tone: "warning",
          title: "Some details you cannot change yourself",
          text: "Your name, [[programme]] and [[level]] are changed by the registry, not by you — they appear on official documents. Raise a [[service request]] and provide the evidence.",
        },
        { type: "terms", ids: ["registration", "invoice", "balance", "receipt", "service-request", "clearance"] },
      ],
    },
  ],
};
