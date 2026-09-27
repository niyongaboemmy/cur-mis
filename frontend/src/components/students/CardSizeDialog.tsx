import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer, Download, Loader2, X, CreditCard } from "lucide-react";
import { studentIdService, type CardSize } from "@/services/studentIdService";

/**
 * Asks which size to print at before the PDF is built.
 *
 * The card is issued at whatever size the registry is printing onto that day —
 * a plastic CR80 blank, or a sheet that gets guillotined — and the renderer
 * scales the whole layout to match. Choosing after the PDF exists is too late,
 * so this sits in front of every print and download.
 *
 * The options come from the server (`/card-sizes`) rather than a list kept
 * here, so the dropdown cannot offer a size the renderer would silently
 * substitute.
 */
export default function CardSizeDialog({
  open,
  count,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  /** How many cards this run covers — shown so a bulk run is unmistakable. */
  count: number;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (size: string, action: "print" | "download") => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["student-ids", "card-sizes"],
    queryFn: ({ signal }) => studentIdService.cardSizes(signal),
    enabled: open,
    staleTime: 60 * 60 * 1000, // presets change with a deploy, not a session
  });

  const sizes: CardSize[] = data?.data?.sizes ?? [];
  const [picked, setPicked] = useState<string>("");

  // Default to whichever preset the server marks as default, once they arrive.
  useEffect(() => {
    if (!picked && sizes.length) {
      setPicked((sizes.find((s) => s.default) ?? sizes[0]).key);
    }
  }, [sizes, picked]);

  if (!open) return null;

  const chosen = sizes.find((s) => s.key === picked);
  const ready = !!picked && !busy && !isLoading;

  return (
    <div className="fixed inset-0 z-50 bg-ink-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="card w-full max-w-md overflow-hidden">
        <div className="px-5 py-3 border-b border-ink-100 dark:border-ink-700 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-brand" />
            <h2 className="text-[15px] font-bold text-ink-900 dark:text-ink-50">
              Print size
            </h2>
          </div>
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={onCancel}
            disabled={busy}
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <p className="text-[12.5px] text-ink-500">
            {count === 1
              ? "Choose the size this card prints at."
              : `Choose the size these ${count} cards print at.`}{" "}
            The whole layout scales to fit, so the text stays in proportion.
          </p>

          {isLoading ? (
            <div className="flex items-center gap-2 text-[13px] text-ink-500 py-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading sizes…
            </div>
          ) : sizes.length === 0 ? (
            <p className="text-[13px] text-rose-600">
              Could not load the print sizes. Close and try again.
            </p>
          ) : (
            <div className="space-y-1.5">
              {sizes.map((s) => (
                <label
                  key={s.key}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                    picked === s.key
                      ? "border-brand bg-brand/5"
                      : "border-ink-200 dark:border-ink-700 hover:bg-ink-50 dark:hover:bg-ink-800"
                  }`}
                >
                  <input
                    type="radio"
                    name="card-size"
                    className="accent-brand"
                    checked={picked === s.key}
                    disabled={busy}
                    onChange={() => setPicked(s.key)}
                  />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-semibold text-ink-800 dark:text-ink-100">
                      {s.label}
                    </span>
                    <span className="block text-[11.5px] text-ink-400">
                      {s.width_mm} × {s.height_mm} mm
                      {s.default ? " · default" : ""}
                    </span>
                  </span>
                  {/* A to-scale sliver, so the relative sizes read at a glance. */}
                  <span
                    aria-hidden
                    className="shrink-0 border border-ink-300 dark:border-ink-600 rounded-[2px]"
                    style={{
                      width: `${(s.width_mm / 165) * 44}px`,
                      height: `${(s.height_mm / 165) * 44}px`,
                    }}
                  />
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-ink-100 dark:border-ink-700 flex items-center gap-2 bg-ink-50/40 dark:bg-ink-700/20">
          <button type="button" className="btn-ghost btn-sm" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              className="btn-ghost btn-sm"
              disabled={!ready}
              onClick={() => onConfirm(picked, "download")}
              title={chosen ? `Save as PDF at ${chosen.label}` : undefined}
            >
              <Download className="w-3.5 h-3.5" /> Download
            </button>
            <button
              type="button"
              className="btn-primary btn-sm"
              disabled={!ready}
              onClick={() => onConfirm(picked, "print")}
              title={chosen ? `Print at ${chosen.label}` : undefined}
            >
              {busy ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Printer className="w-3.5 h-3.5" />
              )}
              {busy ? "Building…" : "Print"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
