import { useEffect, useRef, useState, useMemo } from "react";
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
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  // Position the portal dropdown relative to the trigger button
  const updatePosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const dropdownH = 260; // approx max height of dropdown
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const spaceAbove = rect.top - 8;
    const openUpward = spaceBelow < dropdownH && spaceAbove > spaceBelow;

    setDropdownStyle({
      position: "fixed",
      left: rect.left,
      width: rect.width,
      minWidth: 220,
      zIndex: 9999,
      ...(openUpward
        ? { bottom: window.innerHeight - rect.top + 4 }
        : { top: rect.bottom + 4 }),
    });
  };

  const handleOpen = () => {
    if (disabled) return;
    if (!open) {
      updatePosition();
      setSearch("");
    }
    setOpen((v) => !v);
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        dropdownRef.current?.contains(target)
      )
        return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Reposition on scroll/resize while open
  useEffect(() => {
    if (!open) return;
    const reposition = () => updatePosition();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  // Autofocus search on open
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  return (
    <div className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        className={`input input-sm w-full text-left flex items-center justify-between gap-1.5 ${disabled ? "opacity-50 cursor-not-allowed bg-ink-50 dark:bg-ink-800" : ""}`}
        onClick={handleOpen}
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

      {open &&
        createPortal(
          <div
            ref={dropdownRef}
            style={dropdownStyle}
            className="bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-700 rounded-lg shadow-xl overflow-hidden"
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
          document.body,
        )}
    </div>
  );
}
