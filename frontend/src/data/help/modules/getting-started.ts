import type { HelpModule } from "../types";

export const gettingStarted: HelpModule = {
  id: "getting-started",
  title: "Getting Started",
  icon: "Compass",
  accent: "indigo",
  summary: "Sign in, find your way around, and understand what your role lets you do.",
  intro:
    "Everything in CUR-MIS is reached through a browser — there is nothing to install. This module covers the handful of things every user needs on day one: signing in, reading the screen, searching, and understanding why your menu looks different from your colleague's.",
  audience: ["Everyone"],
  routes: ["/", "/welcome", "/home", "/profile", "/login"],
  articles: [
    {
      id: "first-login",
      title: "Sign in for the first time",
      kind: "walkthrough",
      summary: "From the login page to your dashboard, including the one-time code step.",
      minutes: 3,
      audience: ["Everyone"],
      route: "/login",
      keywords: ["login", "sign in", "password", "otp", "verify", "two factor", "cannot log in", "locked out"],
      blocks: [
        {
          type: "paragraph",
          text: "Logging in takes two steps: your password, then a [[OTP]] sent to you. The second step means a stolen password on its own is not enough to reach university records.",
        },
        {
          type: "steps",
          steps: [
            { title: "Open the CUR-MIS web address in your browser", detail: "Use the link your department gave you. Bookmark it — there is no app to download.", route: "/login" },
            { title: "Enter your email address and password", detail: "Use the email the university holds for you. If you have never set a password, use **Forgot password** instead of guessing." },
            { title: "Click **Sign in**", detail: "If the details are right, you are taken to a code-entry screen rather than straight in." },
            { title: "Open your email and copy the one-time code", detail: "The code is short and expires after a few minutes. Ask for a new one if it lapses.", tip: "Check the spam folder the first time — after that, mark the sender as safe." },
            { title: "Enter the code and confirm", detail: "You land on your home screen. What you see there depends on your [[role]]." },
          ],
        },
        {
          type: "callout",
          tone: "warning",
          title: "Never share your login",
          text: "Every action is written to the [[audit trail]] against the account that performed it. If you share your account, its record becomes your responsibility.",
        },
        {
          type: "faq",
          items: [
            { q: "I did not receive the code.", a: "Wait a minute, check spam, then request a new code. If nothing arrives, your registered email may be wrong — contact the administrator who created your account." },
            { q: "I forgot my password.", a: "Use **Forgot password** on the login screen. A reset link goes to your registered email; the link expires, so use it straight away." },
            { q: "It says I do not have permission after logging in.", a: "You are signed in correctly but your role does not carry the right for that page. Ask an administrator to review your role — see Administration → Roles and permissions." },
          ],
        },
      ],
    },
    {
      id: "tour",
      title: "A tour of the screen",
      kind: "walkthrough",
      summary: "Sidebar, top bar, campus scope, notifications — what each part is for.",
      minutes: 4,
      audience: ["Everyone"],
      keywords: ["sidebar", "menu", "navigation", "top bar", "layout", "where is", "dark mode", "theme"],
      blocks: [
        {
          type: "list",
          title: "The four regions of every page",
          items: [
            "**Sidebar (left)** — the modules you are allowed to open. Groups expand when clicked. Collapse it with the panel icon to gain screen width.",
            "**Top bar** — global search, [[campus scope]], notifications, messages, and your account menu.",
            "**Page header** — the name of the screen you are on and a one-line description of what it is for.",
            "**Content** — the working area: lists, forms, dashboards.",
          ],
        },
        {
          type: "callout",
          tone: "info",
          title: "Your menu is not everyone's menu",
          text: "The sidebar is built from your [[permission]]s. If a colleague can see something you cannot, it is a difference in [[role]], not a fault.",
        },
        {
          type: "steps",
          title: "Set yourself up comfortably",
          steps: [
            { title: "Choose your campus in the top bar", detail: "Every list and total on screen is then limited to that campus. Change it any time; you are only offered campuses you may see." },
            { title: "Switch light or dark mode", detail: "The theme toggle is in your account menu. The choice is remembered on this browser." },
            { title: "Open your profile and check your details", detail: "Wrong email means missed one-time codes and missed notifications.", route: "/profile" },
            { title: "Look at the bell", detail: "Unread [[notification]]s appear here — requests waiting on you, decisions made on yours." },
          ],
        },
      ],
    },
    {
      id: "search",
      title: "Find anything fast",
      kind: "howto",
      summary: "Use global search for records and pages, and the Help Centre for how-to guidance.",
      minutes: 2,
      audience: ["Everyone"],
      keywords: ["search", "find", "cmd k", "ctrl k", "shortcut", "lookup", "help search"],
      blocks: [
        {
          type: "paragraph",
          text: "There are two searches and they answer different questions. **Global search** in the top bar finds *things* — a student, a member of staff, an application, a screen. The **Help Centre search** finds *instructions* — how to do something.",
        },
        {
          type: "steps",
          steps: [
            { title: "Press **Ctrl + K** (or **⌘ + K**)", detail: "The top-bar search takes focus from anywhere in the app." },
            { title: "Type a name, a [[registration number]], or a screen name", detail: "Results are grouped: pages you can open, then live records — students, staff, applications, announcements, forum threads." },
            { title: "Move with ↑ ↓ and press ↵ to open", detail: "Esc closes the panel without navigating." },
            { title: "Not a record you are after? Use the last row", detail: "Every result list ends with **Search the Help Centre** — it carries what you typed straight into this guide." },
          ],
        },
        {
          type: "callout",
          tone: "tip",
          text: "Global search only returns records you are allowed to see. An empty result may mean “nothing matches” or “nothing you may open matches”.",
        },
      ],
    },
    {
      id: "roles-explained",
      title: "Why you see what you see",
      kind: "concept",
      summary: "Roles, permissions and campus scope, in plain language.",
      minutes: 3,
      audience: ["Everyone"],
      keywords: ["role", "permission", "access denied", "cannot see", "rights", "scope"],
      blocks: [
        {
          type: "paragraph",
          text: "Access in CUR-MIS is not all-or-nothing. It is built from three layers, and understanding them explains almost every “why can't I…?” question.",
        },
        {
          type: "table",
          head: ["Layer", "What it does", "Example"],
          rows: [
            ["[[Permission]]", "One single right", "“Record marks”"],
            ["[[Role]]", "A bundle of permissions matching a job", "*Lecturer* = record marks + view my modules + take attendance"],
            ["[[Campus scope]]", "Limits which records the rights apply to", "A Huye finance officer sees Huye balances"],
          ],
        },
        {
          type: "callout",
          tone: "info",
          title: "Assignment can beat role",
          text: "Some access follows the work rather than the job title. A registrar who picks up a class gets the teaching workspace for that class through the [[module assignment]], without changing their role.",
        },
        { type: "terms", title: "Terms used here", ids: ["role", "permission", "campus-scope", "superadmin"] },
      ],
    },
    {
      id: "account",
      title: "Manage your own account",
      kind: "howto",
      summary: "Change your password, fix your contact details, control notifications.",
      minutes: 2,
      audience: ["Everyone"],
      route: "/profile",
      keywords: ["profile", "change password", "email", "phone", "photo", "account settings"],
      blocks: [
        {
          type: "steps",
          steps: [
            { title: "Open your account menu and choose **Profile**", route: "/profile" },
            { title: "Correct your email and phone", detail: "These are where one-time codes and official notices go. Keep them current." },
            { title: "Change your password", detail: "You will be asked for the current one. Choose something you do not use elsewhere." },
            { title: "Review your notifications", detail: "The bell lists everything raised for you; the notifications page holds the full history.", route: "/notifications" },
          ],
        },
        {
          type: "callout",
          tone: "warning",
          text: "You cannot change your own [[role]] or [[permission]]s — that is deliberate. Ask an administrator.",
        },
      ],
    },
  ],
};
