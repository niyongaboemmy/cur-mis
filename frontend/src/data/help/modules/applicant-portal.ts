import type { HelpModule } from "../types";

export const applicantPortal: HelpModule = {
  id: "applicant-portal",
  title: "Applying to CUR",
  icon: "UserPlus",
  accent: "cyan",
  summary: "For applicants: apply online, upload documents, and track your application.",
  intro:
    "You do not need an account or an office visit to apply. This guide walks you from the public application form to the day your place is confirmed, and explains what each status on your tracking page means.",
  audience: ["Applicant", "Public"],
  routes: ["/apply", "/apply/track", "/applicant", "/applicant/documents"],
  articles: [
    {
      id: "apply-online",
      title: "Apply online",
      kind: "walkthrough",
      summary: "Complete the public application form from start to submission.",
      minutes: 8,
      audience: ["Applicant", "Public"],
      route: "/apply",
      keywords: ["apply", "application form", "how to apply", "admission", "new student", "register to apply"],
      blocks: [
        {
          type: "callout",
          tone: "tip",
          title: "Before you start",
          text: "Have scans or clear photos of your certificates and your identification ready. You can save and come back, but having the files to hand makes this a 15-minute job instead of a two-day one.",
        },
        {
          type: "steps",
          steps: [
            { title: "Open the **Apply** page", detail: "No login is needed to begin.", route: "/apply" },
            { title: "Fill in your personal details", detail: "Use your legal name exactly as it appears on your identification. This name goes on your certificate years later." },
            { title: "Enter your previous education", detail: "Schools attended, qualifications, grades and years. Be accurate — this is checked against the documents you upload." },
            { title: "Choose your programme, campus, study mode and [[intake]]", detail: "The list only offers programmes actually open for that intake." },
            { title: "Upload the required documents", detail: "The system shows exactly what your chosen programme requires. Clear, complete, right way up.", tip: "Photograph documents on a flat surface in daylight. Most returned documents are simply unreadable." },
            { title: "Review everything, then submit", detail: "You receive a [[tracking code]]. Save it — it is how you check progress." },
          ],
        },
        {
          type: "callout",
          tone: "warning",
          text: "An application left in **draft** is not with the university. It has not been submitted and nobody is looking at it.",
        },
      ],
    },
    {
      id: "track",
      title: "Track your application",
      kind: "howto",
      summary: "Check where your application has reached without contacting the office.",
      minutes: 2,
      audience: ["Applicant", "Public"],
      route: "/apply/track",
      keywords: ["track", "status", "progress", "where is my application", "tracking code", "reference"],
      blocks: [
        {
          type: "steps",
          steps: [
            { title: "Open the **Track application** page", route: "/apply/track" },
            { title: "Enter your [[tracking code]]", detail: "It was shown when you submitted and emailed to you." },
            { title: "Read your current status", detail: "See the table below for what each one means." },
          ],
        },
        {
          type: "table",
          head: ["Status", "What it means for you", "What to do"],
          rows: [
            ["draft", "Not submitted yet.", "Go back and submit it."],
            ["submitted", "Received; waiting to be picked up.", "Nothing — wait."],
            ["under review", "An officer is working on it.", "Nothing — wait."],
            ["document returned", "Something you uploaded needs replacing.", "Read the comment, re-upload that document."],
            ["verified", "Your documents were accepted.", "Wait for selection."],
            ["offered", "You have a place. Check your email for the letter.", "Accept the offer."],
            ["accepted", "You have taken up the place.", "Wait for enrolment instructions."],
            ["enrolled", "You are now a student.", "Log in with your student account."],
            ["rejected", "Not successful this time; a reason is shown.", "Read the reason; you may apply to a later [[intake]]."],
          ],
        },
      ],
    },
    {
      id: "fix-documents",
      title: "Replace a returned document",
      kind: "howto",
      summary: "What to do when a document comes back with a comment.",
      minutes: 3,
      audience: ["Applicant"],
      route: "/applicant/documents",
      keywords: ["returned document", "re-upload", "rejected document", "fix document", "upload again"],
      blocks: [
        {
          type: "paragraph",
          text: "A returned document is not a rejection of your application. It means one file could not be accepted as it stands, and the officer has written why.",
        },
        {
          type: "steps",
          steps: [
            { title: "Log in to the applicant portal", detail: "Your account was created when you submitted.", route: "/applicant" },
            { title: "Open **My documents**", route: "/applicant/documents" },
            { title: "Find the document marked as returned and read the comment", detail: "The comment says exactly what is wrong — a missing page, an unreadable scan, the wrong document." },
            { title: "Upload the corrected file against the same requirement", detail: "Do not add it as a new extra document; replace the one that was returned." },
            { title: "Check the status changes back to pending review" },
          ],
        },
        {
          type: "faq",
          items: [
            { q: "How long do I have?", a: "Until the [[intake]] closes. After that your application is assessed as it stands." },
            { q: "I do not have the document being asked for.", a: "Contact the admissions office rather than uploading a substitute — an unexpected file will simply be returned again." },
          ],
        },
      ],
    },
    {
      id: "accept-offer",
      title: "Accept your offer and enrol",
      kind: "walkthrough",
      summary: "From admission letter to registered student.",
      minutes: 3,
      audience: ["Applicant"],
      route: "/applicant",
      keywords: ["offer", "accept", "admission letter", "enrol", "enroll", "become a student", "registration number"],
      blocks: [
        {
          type: "steps",
          steps: [
            { title: "Open the admission letter emailed to you", detail: "It is a PDF. Keep it — it is your official proof of admission." },
            { title: "Log in to the applicant portal and accept the offer", route: "/applicant" },
            { title: "Wait for the registry to complete [[enrolment]]", detail: "Your details are carried across automatically; you do not fill anything in again." },
            { title: "Receive your [[registration number]]", detail: "This is your permanent identifier at CUR — on your card, invoices, transcript and results." },
            { title: "Sign in as a student", detail: "You now have the student portal: modules, marks, fees and service requests." },
          ],
        },
        { type: "terms", ids: ["application", "intake", "tracking-code", "offer", "enrolment", "reg-number"] },
      ],
    },
  ],
};
