import {
  useState,
  useRef,
  useEffect,
  useCallback,
  memo,
  type KeyboardEvent,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bot,
  X,
  Send,
  Loader2,
  RotateCcw,
  ChevronDown,
  Sparkles,
} from "lucide-react";
import { api } from "@/services/api";
import toast from "react-hot-toast";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ChatResponse {
  reply: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Very small markdown-ish renderer — handles **bold**, *italic*, `code`, newlines. */
function renderMarkdown(text: string) {
  const html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, '<code class="ai-inline-code">$1</code>')
    .replace(/\n/g, "<br />");
  return { __html: html };
}

// ── Suggestion chips ───────────────────────────────────────────────────────────

const SUGGESTIONS = [
  "How do I apply for admission?",
  "How can I view my grades?",
  "How do I pay my fees?",
  "How do I request a transcript?",
];

// ── Sub-components ─────────────────────────────────────────────────────────────

const UserBubble = memo(({ text }: { text: string }) => (
  <div className="flex justify-end">
    <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-brand px-4 py-2.5 text-[13px] text-white shadow-sm">
      {text}
    </div>
  </div>
));

const AiBubble = memo(({ text }: { text: string }) => (
  <div className="flex items-start gap-2">
    <div className="shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-brand flex items-center justify-center shadow">
      <Bot className="w-3.5 h-3.5 text-white" />
    </div>
    <div
      className="max-w-[85%] rounded-2xl rounded-tl-sm bg-ink-50 dark:bg-ink-700/60 border border-ink-100 dark:border-ink-600 px-4 py-2.5 text-[13px] text-ink-800 dark:text-ink-100 shadow-sm leading-relaxed"
      dangerouslySetInnerHTML={renderMarkdown(text)}
    />
  </div>
));

const TypingIndicator = memo(() => (
  <div className="flex items-start gap-2">
    <div className="shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-brand flex items-center justify-center shadow">
      <Bot className="w-3.5 h-3.5 text-white" />
    </div>
    <div className="rounded-2xl rounded-tl-sm bg-ink-50 dark:bg-ink-700/60 border border-ink-100 dark:border-ink-600 px-4 py-3 shadow-sm">
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-ink-400 dark:bg-ink-400 animate-bounce"
            style={{ animationDelay: `${i * 120}ms` }}
          />
        ))}
      </span>
    </div>
  </div>
));

// ── Main widget ────────────────────────────────────────────────────────────────

export default function AiChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom whenever messages change or loading starts/stops.
  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, open]);

  // Focus input when panel opens.
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 120);
  }, [open]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      const userMsg: Message = { role: "user", content: trimmed };
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setLoading(true);

      try {
        // Send full history so Claude has context.
        const history = messages.slice(-18); // keep last 18 turns + new = 19 total
        const data = await api.post<ChatResponse>("/ai/chat", {
          message: trimmed,
          history,
        });
        const reply = data.data?.reply ?? "Sorry, I couldn't get a response.";
        setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      } catch {
        toast.error("AI assistant unavailable. Please try again.");
        // Remove the user message we optimistically added.
        setMessages((prev) => prev.slice(0, -1));
      } finally {
        setLoading(false);
      }
    },
    [loading, messages],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage(input);
      }
    },
    [input, sendMessage],
  );

  const clearChat = useCallback(() => setMessages([]), []);

  const isEmpty = messages.length === 0;

  return (
    <>
      {/* ── Floating action button ───────────────────────────────────── */}
      <AnimatePresence>
        {!open && (
          <motion.button
            key="fab"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 22 }}
            onClick={() => setOpen(true)}
            aria-label="Open AI assistant"
            className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-lg bg-gradient-to-br from-violet-500 to-brand text-white flex items-center justify-center hover:scale-105 active:scale-95 transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            <Sparkles className="w-6 h-6" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── Chat panel ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="panel"
            initial={{ opacity: 0, y: 24, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.95 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed bottom-6 right-6 z-50 w-[360px] max-w-[calc(100vw-24px)] h-[540px] max-h-[calc(100vh-48px)] flex flex-col rounded-2xl shadow-2xl border border-ink-100 dark:border-ink-700 bg-white dark:bg-ink-900 overflow-hidden"
          >
            {/* Header */}
            <div className="shrink-0 h-14 flex items-center justify-between px-4 bg-gradient-to-r from-violet-600 to-brand">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-white leading-none">Ask AI</p>
                  <p className="text-[10px] text-white/70 leading-none mt-0.5">CUR-MIS Assistant</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {!isEmpty && (
                  <button
                    onClick={clearChat}
                    title="Clear chat"
                    className="w-8 h-8 rounded-full hover:bg-white/20 flex items-center justify-center text-white/80 hover:text-white transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  title="Minimise"
                  className="w-8 h-8 rounded-full hover:bg-white/20 flex items-center justify-center text-white/80 hover:text-white transition-colors"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setOpen(false)}
                  title="Close"
                  className="w-8 h-8 rounded-full hover:bg-white/20 flex items-center justify-center text-white/80 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Messages area */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 scrollbar-thin scrollbar-thumb-ink-200 dark:scrollbar-thumb-ink-600">
              {isEmpty ? (
                <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-violet-100 to-blue-100 dark:from-violet-900/40 dark:to-blue-900/40 flex items-center justify-center">
                    <Sparkles className="w-6 h-6 text-violet-500" />
                  </div>
                  <div>
                    <p className="text-[14px] font-semibold text-ink-800 dark:text-ink-100">
                      How can I help you?
                    </p>
                    <p className="text-[12px] text-ink-400 mt-1 leading-relaxed">
                      Ask me anything about the CUR-MIS platform.
                    </p>
                  </div>
                  {/* Suggestion chips */}
                  <div className="flex flex-col gap-1.5 w-full max-w-[260px]">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        onClick={() => sendMessage(s)}
                        className="text-left text-[12px] px-3 py-2 rounded-xl border border-ink-100 dark:border-ink-700 bg-ink-50 dark:bg-ink-800 text-ink-600 dark:text-ink-300 hover:border-brand hover:text-brand dark:hover:text-brand hover:bg-brand/5 transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {messages.map((m, i) =>
                    m.role === "user" ? (
                      <UserBubble key={i} text={m.content} />
                    ) : (
                      <AiBubble key={i} text={m.content} />
                    ),
                  )}
                  {loading && <TypingIndicator />}
                </>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input bar */}
            <div className="shrink-0 border-t border-ink-100 dark:border-ink-700 px-3 py-3 bg-white dark:bg-ink-900">
              <div className="flex items-end gap-2 bg-ink-50 dark:bg-ink-800 rounded-xl border border-ink-200 dark:border-ink-600 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20 transition-all px-3 py-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a question… (Enter to send)"
                  rows={1}
                  disabled={loading}
                  className="flex-1 bg-transparent resize-none text-[13px] text-ink-800 dark:text-ink-100 placeholder:text-ink-400 focus:outline-none max-h-24 leading-relaxed disabled:opacity-50"
                  style={{ scrollbarWidth: "none" }}
                />
                <button
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim() || loading}
                  className="shrink-0 w-8 h-8 rounded-lg bg-brand text-white flex items-center justify-center hover:bg-brand/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  aria-label="Send"
                >
                  {loading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
              <p className="text-[10px] text-ink-400 text-center mt-1.5">
                AI can make mistakes — verify important info.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Inline style for the inline code elements rendered from markdown */}
      <style>{`
        .ai-inline-code {
          font-size: 11px;
          background: rgb(var(--ink-100, 241 245 249));
          border-radius: 3px;
          padding: 1px 4px;
          font-family: ui-monospace, monospace;
        }
        .dark .ai-inline-code {
          background: rgba(255,255,255,0.08);
        }
      `}</style>
    </>
  );
}
