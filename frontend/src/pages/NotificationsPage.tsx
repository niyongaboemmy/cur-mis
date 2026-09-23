import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Info,
  Loader2,
  XCircle,
} from "lucide-react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import {
  notificationService,
  type AppNotification,
  type NotificationSeverity,
} from "@/services/notificationService";

const SEVERITY: Record<
  NotificationSeverity,
  { icon: typeof Info; tint: string; edge: string }
> = {
  info: {
    icon: Info,
    tint: "text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30",
    edge: "border-l-primary-400",
  },
  success: {
    icon: CheckCircle2,
    tint: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30",
    edge: "border-l-emerald-400",
  },
  warning: {
    icon: AlertTriangle,
    tint: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30",
    edge: "border-l-amber-400",
  },
  danger: {
    icon: XCircle,
    tint: "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30",
    edge: "border-l-red-400",
  },
};

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

/** The full history behind the bell — every notification, read or not. */
export default function NotificationsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [confirmingAll, setConfirmingAll] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["notifications", "list", { page, unreadOnly }],
    queryFn: ({ signal }) =>
      notificationService.list(
        { page, per_page: 20, ...(unreadOnly ? { unread: 1 as const } : {}) },
        signal,
      ),
    placeholderData: (prev) => prev,
  });

  const rows = data?.data?.data ?? [];
  const total = data?.data?.total ?? 0;
  const unread = data?.data?.unread_total ?? 0;
  const lastPage = data?.data?.last_page ?? 1;

  const refresh = () => qc.invalidateQueries({ queryKey: ["notifications"] });

  const markRead = useMutation({
    mutationFn: (id: number) => notificationService.markRead(id),
    onSuccess: refresh,
  });
  const markAll = useMutation({
    mutationFn: () => notificationService.markAllRead(),
    onSuccess: () => {
      setConfirmingAll(false);
      refresh();
    },
  });

  function open(item: AppNotification) {
    if (!item.is_read) markRead.mutate(item.id);
    if (item.link) navigate(item.link);
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-ink-900 dark:text-white flex items-center gap-2">
            <Bell className="w-5 h-5 text-brand" /> Notifications
          </h2>
          <p className="text-[13px] text-ink-500">
            Approval outcomes, action-required prompts and system alerts
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className={`text-[12px] font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
              unreadOnly
                ? "bg-brand text-white border-brand"
                : "bg-white dark:bg-ink-800 text-ink-600 dark:text-ink-300 border-ink-200 dark:border-ink-700 hover:bg-ink-50"
            }`}
            onClick={() => {
              setUnreadOnly((v) => !v);
              setPage(1);
            }}
          >
            {unreadOnly ? "Showing unread" : "Show unread only"}
          </button>
          <button
            className="btn-secondary text-[12px] flex items-center gap-1.5 disabled:opacity-50"
            disabled={unread === 0 || markAll.isPending}
            onClick={() => setConfirmingAll(true)}
          >
            {markAll.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <CheckCheck className="w-3.5 h-3.5" />
            )}
            Mark all read
          </button>
        </div>
      </div>

      {/* List */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-ink-100 dark:border-ink-700">
          <h3 className="text-[13px] font-bold text-ink-700 dark:text-ink-200">
            {unreadOnly ? "Unread" : "All notifications"}
          </h3>
          <span className="text-[12px] text-ink-400">
            {unread} unread of {total} shown
          </span>
        </div>

        {isLoading ? (
          <div className="py-16 text-center">
            <Loader2 className="w-6 h-6 animate-spin mx-auto text-brand" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center">
            <div className="flex flex-col items-center gap-2 text-ink-400">
              <Bell className="w-10 h-10 opacity-30" />
              <p className="text-[13px]">
                {unreadOnly ? "Nothing unread" : "No notifications yet"}
              </p>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-ink-100 dark:divide-ink-700">
            {rows.map((n) => {
              const look = SEVERITY[n.severity] ?? SEVERITY.info;
              const Icon = look.icon;
              const isUnread = !n.is_read;
              return (
                <li key={n.id}>
                  <button
                    onClick={() => open(n)}
                    className={`w-full text-left flex items-start gap-3 px-4 py-3 border-l-4 transition-colors hover:bg-ink-50/60 dark:hover:bg-ink-700/30 ${
                      isUnread
                        ? `${look.edge} bg-ink-50/40 dark:bg-ink-700/20`
                        : "border-l-transparent"
                    }`}
                  >
                    <span
                      className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${look.tint}`}
                    >
                      <Icon className="w-4 h-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3 flex-wrap">
                        <span
                          className={`text-[13px] truncate ${
                            isUnread
                              ? "font-bold text-ink-900 dark:text-white"
                              : "font-semibold text-ink-600 dark:text-ink-300"
                          }`}
                        >
                          {n.title ?? "Notification"}
                        </span>
                        <span className="text-[11px] text-ink-400 tabular-nums shrink-0">
                          {fmtWhen(n.created_at)}
                        </span>
                      </div>
                      <p className="text-[12px] text-ink-500 dark:text-ink-400 mt-0.5">
                        {n.message}
                      </p>
                      {n.link && (
                        <span className="text-[11px] text-primary-600 dark:text-primary-400 font-semibold mt-1 inline-block">
                          Open →
                        </span>
                      )}
                    </div>
                    {isUnread && (
                      <span className="mt-1.5 shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400">
                        New
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {lastPage > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-ink-100 dark:border-ink-700">
            <span className="text-[12px] text-ink-400">
              Page {page} of {lastPage}
            </span>
            <div className="flex items-center gap-1">
              <button
                className="icon-btn"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                className="icon-btn"
                onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
                disabled={page === lastPage}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {confirmingAll && (
        <ConfirmDialog
          open
          variant="warning"
          onClose={() => setConfirmingAll(false)}
          onConfirm={() => markAll.mutate()}
          loading={markAll.isPending}
          title="Mark everything as read?"
          confirmLabel="Yes, mark all read"
          message={`This clears all ${unread} unread notification${unread === 1 ? "" : "s"}.`}
          details={
            <p className="text-[12px] text-ink-500 dark:text-ink-400 rounded-lg bg-ink-50 dark:bg-ink-900/30 px-3 py-2">
              Anything asking for a decision stops being flagged — the requests
              themselves stay in your approval queue.
            </p>
          }
        />
      )}
    </div>
  );
}
