import type { HelpModule } from "../types";

export const communication: HelpModule = {
  id: "communication",
  title: "Communication",
  icon: "MessagesSquare",
  accent: "cyan",
  summary: "Announcements, direct messages, forums and notifications — and which to use when.",
  intro:
    "There are four ways to reach people in CUR-MIS and they are not interchangeable. Choosing the right one is most of the skill: an announcement that should have been a message annoys a thousand people, and a message that should have been an announcement reaches nobody.",
  audience: ["Everyone"],
  routes: ["/announcements", "/messages", "/forums", "/notifications"],
  articles: [
    {
      id: "which-channel",
      title: "Which channel should I use?",
      kind: "concept",
      summary: "Announcement, message, forum or notification — pick correctly.",
      minutes: 2,
      audience: ["Everyone"],
      keywords: ["announcement", "message", "forum", "notification", "communicate", "which channel", "broadcast"],
      blocks: [
        {
          type: "table",
          head: ["Channel", "Direction", "Use when"],
          rows: [
            ["[[Announcement]]", "One → many, official", "Exam timetable published, campus closed, deadline changed"],
            ["Message", "One → one or a few", "A conversation with a named person"],
            ["Forum", "Many ↔ many", "Open discussion where the answer helps everybody"],
            ["[[Notification]]", "System → you", "Something needs your action — raised automatically, not written by hand"],
          ],
        },
        {
          type: "callout",
          tone: "tip",
          text: "If the answer would help the next person who asks, put it in a forum rather than a message. If it is binding, make it an announcement so there is one authoritative version.",
        },
      ],
    },
    {
      id: "announcements",
      title: "Publish an announcement",
      kind: "howto",
      summary: "Reach a chosen audience with an official notice.",
      minutes: 3,
      audience: ["Administrator", "Registry"],
      access: "Needs: Manage announcements",
      route: "/announcements",
      keywords: ["publish announcement", "notice", "broadcast", "circular", "inform students", "announcement audience"],
      blocks: [
        {
          type: "steps",
          steps: [
            { title: "Open **Announcements**", route: "/announcements" },
            { title: "Write a title that stands alone", detail: "Many people read only the title. “Exam timetable published” is useful; “Important notice” is not." },
            { title: "Choose the audience", detail: "A campus, a [[programme]], a year group, staff only. Sending everything to everyone trains people to ignore announcements." },
            { title: "Publish", detail: "It appears in recipients' announcement list and raises a [[notification]]." },
          ],
        },
      ],
    },
    {
      id: "messages",
      title: "Send a direct message",
      kind: "howto",
      summary: "Have a private conversation inside the platform.",
      minutes: 2,
      audience: ["Everyone"],
      access: "Needs: Send messages",
      route: "/messages",
      keywords: ["message", "chat", "dm", "contact staff", "send message", "inbox"],
      blocks: [
        {
          type: "steps",
          steps: [
            { title: "Open **Messages**", route: "/messages" },
            { title: "Start a conversation and choose the recipient" },
            { title: "Write and send", detail: "They see it in their inbox and in the message bell." },
          ],
        },
        {
          type: "callout",
          tone: "warning",
          text: "Messages are internal records, not private property. Anything you would not want read back to you later does not belong here.",
        },
      ],
    },
    {
      id: "forums",
      title: "Use the discussion forums",
      kind: "howto",
      summary: "Ask, answer and moderate in threaded discussions.",
      minutes: 3,
      audience: ["Everyone"],
      access: "Needs: View forums (moderation needs: Moderate forums)",
      route: "/forums",
      keywords: ["forum", "thread", "discussion", "post", "reply", "moderate", "community"],
      blocks: [
        {
          type: "steps",
          steps: [
            { title: "Open **Forums** and pick the category", route: "/forums" },
            { title: "Search before posting", detail: "Most questions have been asked. The search saves you and everyone else time." },
            { title: "Start a thread with a specific title", detail: "“Cannot register for CS201 — prerequisite warning” gets answered; “Help!!” does not." },
            { title: "Reply in the thread, not in a new one", detail: "Threads keep the answer with the question." },
          ],
        },
        {
          type: "list",
          title: "For moderators",
          items: [
            "Keep categories few and meaningful — a category nobody posts in is worse than no category.",
            "Answer once, well, and let the thread stand as the reference.",
            "Move a discussion to an [[announcement]] when it becomes official.",
          ],
        },
      ],
    },
    {
      id: "notifications",
      title: "Manage your notifications",
      kind: "howto",
      summary: "Read the bell, clear what is done, and find what you missed.",
      minutes: 2,
      audience: ["Everyone"],
      route: "/notifications",
      keywords: ["notification", "bell", "alerts", "unread", "missed notification", "notification history"],
      blocks: [
        {
          type: "steps",
          steps: [
            { title: "Watch the bell in the top bar", detail: "It carries the unread count." },
            { title: "Open a [[notification]] to go straight to what raised it", detail: "A request in your queue, a decision on yours, a published result." },
            { title: "Open **Notifications** for the full history", route: "/notifications" },
          ],
        },
        {
          type: "callout",
          tone: "info",
          text: "Notifications are raised by the system when something needs you — they are not written by a person. If one seems wrong, the underlying record is what to check.",
        },
        { type: "terms", ids: ["announcement", "notification"] },
      ],
    },
  ],
};
