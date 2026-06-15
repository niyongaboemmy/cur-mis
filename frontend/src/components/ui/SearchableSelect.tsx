import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { Search, ChevronDown } from "lucide-react";

export interface SelectOption {
  value: number | string;
  label: string;
  sub?: string;
}

interface Props {
  options: SelectOption[];
  value: number | string;
  onChange: (value: number | string) => void;
  placeholder?: string;
  allLabel?: string;
  className?: string;
  disabled?: boolean;
}

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Select…",
  allLabel,
  className = "",
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Panel is rendered in a portal with fixed positioning so it is never clipped
  // by a parent with overflow:hidden/auto (e.g. inside a scrollable modal).
  const [coords, setCoords] = useState<{ top?: number; bottom?: number; left: number; width: number } | null>(null);

  const positionPanel = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const panelH = 300; // approx (search + max-h list)
    const spaceBelow = window.innerHeight - r.bottom;
    // Flip up only when there isn't room below; anchor to the field edge
    // (top/bottom) directly so the panel always hugs the input — no estimate gap.
    const openUp = spaceBelow < panelH && r.top > spaceBelow;
    setCoords(
      openUp
        ? { bottom: Math.max(8, window.innerHeight - r.top + 6), left: r.left, width: r.width }
        : { top: r.bottom + 6, left: r.left, width: r.width },
    );
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.sub ?? "").toLowerCase().includes(q),
    );
  }, [options, search]);

  const selected = options.find((o) => String(o.value) === String(value));

  // Close on outside click (account for the portaled panel living outside `ref`)
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Keep the portaled panel anchored to the field while open (scroll/resize).
  useEffect(() => {
    if (!open) return;
    positionPanel();
    const onMove = () => positionPanel();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open, positionPanel]);

  // Autofocus search on open
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        className={`input input-sm w-full text-left flex items-center justify-between gap-1.5 ${disabled ? 'opacity-50 cursor-not-allowed bg-ink-50 dark:bg-ink-800' : ''}`}
        onClick={() => {
          if (disabled) return;
          if (!open) positionPanel();
          setOpen(!open);
          setSearch("");
        }}
        disabled={disabled}
      >
        <span
          className={
            selected
              ? "text-ink-900 dark:text-white truncate"
              : "text-ink-400 truncate"
          }
        >
          {selected ? selected.label : (allLabel ?? placeholder)}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-ink-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && coords && createPortal(
        <div
          ref={panelRef}
          style={{
            position: "fixed",
            left: coords.left,
            width: Math.max(coords.width, 220),
            ...(coords.top != null ? { top: coords.top } : { bottom: coords.bottom }),
          }}
          className="z-[80] bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-700 rounded-lg shadow-xl overflow-hidden"
        >
          {/* Search */}
          <div className="p-1.5 border-b border-ink-100 dark:border-ink-700">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
              <input
                ref={inputRef}
                type="text"
                className="input input-xs pl-7 w-full"
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="max-h-52 overflow-y-auto">
            {/* "All" option */}
            {allLabel && (
              <button
                type="button"
                className={`w-full text-left px-3 py-1.5 text-[12px] transition-colors ${
                  !value || value === 0 || value === ""
                    ? "bg-brand/10 text-brand font-semibold"
                    : "hover:bg-ink-50 dark:hover:bg-ink-700/30 text-ink-600 dark:text-ink-300"
                }`}
                onClick={() => {
                  onChange(0);
                  setOpen(false);
                }}
              >
                {allLabel}
              </button>
            )}
            {filtered.length === 0 ? (
              <p className="p-3 text-center text-ink-400 text-[12px]">
                No results.
              </p>
            ) : (
              filtered.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className={`w-full text-left px-3 py-1.5 text-[12px] flex items-center gap-2 transition-colors ${
                    String(o.value) === String(value)
                      ? "bg-brand/10 text-brand font-semibold"
                      : "hover:bg-ink-50 dark:hover:bg-ink-700/30"
                  }`}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  <span className="truncate">{o.label}</span>
                  {o.sub && (
                    <span className="ml-auto text-[10px] text-ink-400 whitespace-nowrap">
                      {o.sub}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
