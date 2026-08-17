import React, { useState, useRef, useMemo, useEffect } from "react";
import {
  Users,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  ArrowLeft,
  Mail,
  User as UserIcon,
  Hash,
  Search,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  ShieldCheck,
} from "lucide-react";
import userService from "@/services/userService";
import { toast } from "react-hot-toast";
import ModalPortal from "@/components/ui/ModalPortal";

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface PreviewItem {
  id: number;
  username: string;
  full_name: string;
  email: string;
}

interface BulkResult {
  total_processed: number;
  created_count: number;
  skipped_count: number;
}

type Step = "select" | "preview" | "done";

const TABLE_OPTIONS = [
  { value: "student", label: "Students", description: "Active enrolled students" },
  // The HR staff directory (/hr/staff). This is where staff added through
  // "Add new staff" live; the two options below read different, much smaller
  // legacy tables, so neither could give those staff a login.
  { value: "employees", label: "HR Staff Directory", description: "Staff with an email but no login account — created as Guest, raise the role afterwards" },
  { value: "staff", label: "Staff / Lecturers", description: "Active staff members" },
  { value: "hr_employees", label: "HR Employees", description: "Active employees with staff link" },
];

const PAGE_SIZE = 20;

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export default function BulkAccountCreationModal({ open, onClose, onSuccess }: Props) {
  const [step, setStep]                   = useState<Step>("select");
  const [targetTable, setTargetTable]     = useState("student");
  const [previewItems, setPreviewItems]   = useState<PreviewItem[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [search, setSearch]               = useState("");
  const [currentPage, setCurrentPage]     = useState(1);
  const [defaultPassword, setDefaultPassword] = useState("");
  const [showPassword, setShowPassword]   = useState(false);
  const [creating, setCreating]           = useState(false);
  const [result, setResult]               = useState<BulkResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep("select");
    setTargetTable("student");
    setPreviewItems([]);
    setSearch("");
    setCurrentPage(1);
    setDefaultPassword("");
    setShowPassword(false);
    setResult(null);
  };

  const handleClose = () => {
    if (loadingPreview || creating) return;
    abortRef.current?.abort();
    reset();
    onClose();
  };

  const handleLoadPreview = async () => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoadingPreview(true);
    setSearch("");
    setCurrentPage(1);
    try {
      const res = await userService.bulkPreview(targetTable, abortRef.current.signal);
      setPreviewItems(res.data?.items ?? []);
      setStep("preview");
      // Auto-focus password field after items load
      setTimeout(() => passwordRef.current?.focus(), 100);
    } catch (err: any) {
      if (err.name === "CanceledError" || err.name === "AbortError") return;
      toast.error(err.response?.data?.message || "Failed to load preview.");
    } finally {
      setLoadingPreview(false);
    }
  };

  // Reset to page 1 whenever search changes
  useEffect(() => { setCurrentPage(1); }, [search]);

  const filteredItems = useMemo(() => {
    if (!search.trim()) return previewItems;
    const q = search.toLowerCase();
    return previewItems.filter(
      (item) =>
        item.full_name.toLowerCase().includes(q) ||
        item.username.toLowerCase().includes(q) ||
        item.email.toLowerCase().includes(q)
    );
  }, [previewItems, search]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const pageItems  = filteredItems.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (defaultPassword.length < 6) {
      toast.error("Password must be at least 6 characters.");
      passwordRef.current?.focus();
      return;
    }
    setCreating(true);
    try {
      const res = await userService.bulkCreateAccounts({
        target_table: targetTable,
        default_password: defaultPassword,
      });
      const data = res.data!;
      setResult(data);
      setStep("done");
      toast.success(`Done: ${data.created_count} created, ${data.skipped_count} skipped.`);
      onSuccess();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Bulk account creation failed.");
    } finally {
      setCreating(false);
    }
  };

  if (!open) return null;

  const tableOption  = TABLE_OPTIONS.find((o) => o.value === targetTable)!;
  const tableLabel   = tableOption.label;

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-in fade-in">
        <div className="absolute inset-0 bg-ink-900/70 backdrop-blur-sm" onClick={handleClose} />

        <div
          className={`relative flex flex-col w-full card overflow-hidden animate-in transition-all duration-300 ${
            step === "preview" ? "max-w-7xl" : step === "done" ? "max-w-xl" : "max-w-md"
          }`}
          style={{ maxHeight: "90vh" }}
        >
          {/* ── Header ── */}
          <div className="px-5 py-3.5 border-b hairline flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              {step === "preview" && (
                <button
                  onClick={() => setStep("select")}
                  className="icon-btn shrink-0"
                  aria-label="Back"
                  disabled={creating}
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                </button>
              )}
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 text-[14px] font-semibold text-ink-900 dark:text-white truncate">
                  <Users className="w-4 h-4 text-primary-600 shrink-0" />
                  {step === "select" && "Bulk Account Creation"}
                  {step === "preview" && (
                    <>
                      Preview — {tableLabel}
                      <span className="ml-1 chip-primary font-mono text-[11px]">
                        {previewItems.length.toLocaleString()}
                      </span>
                    </>
                  )}
                  {step === "done" && "Creation Complete"}
                </h2>
                <p className="section-sub mt-0.5">
                  {step === "select" && "Select a source table to preview records missing portal access."}
                  {step === "preview" && "Active records without an account. Set a password to create them."}
                  {step === "done"   && "The bulk operation finished. Check the summary below."}
                </p>
              </div>
            </div>
            <button onClick={handleClose} className="icon-btn shrink-0 ml-3" aria-label="Close" disabled={creating}>
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* ── Step 1: Select ── */}
          {step === "select" && (
            <div className="p-6 space-y-5">
              <div className="space-y-2">
                {TABLE_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex items-center gap-3.5 p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                      targetTable === opt.value
                        ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20"
                        : "border-ink-200 dark:border-ink-700 hover:border-ink-300 dark:hover:border-ink-600"
                    }`}
                  >
                    <input
                      type="radio"
                      name="target_table"
                      value={opt.value}
                      checked={targetTable === opt.value}
                      onChange={() => setTargetTable(opt.value)}
                      className="accent-primary-600"
                    />
                    <div>
                      <div className={`text-[13px] font-semibold ${targetTable === opt.value ? "text-primary-700 dark:text-primary-300" : "text-ink-800 dark:text-ink-200"}`}>
                        {opt.label}
                      </div>
                      <div className="text-[11.5px] text-ink-500 mt-0.5">{opt.description}</div>
                    </div>
                  </label>
                ))}
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={handleClose} className="btn-secondary" disabled={loadingPreview}>
                  Cancel
                </button>
                <button type="button" onClick={handleLoadPreview} className="btn-primary" disabled={loadingPreview}>
                  {loadingPreview ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading preview…</>
                  ) : (
                    <><Users className="w-3.5 h-3.5" /> Load preview</>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 2: Preview (two-column) ── */}
          {step === "preview" && (
            <div className="flex flex-1 min-h-0">
              {/* LEFT — list */}
              <div className="flex flex-col flex-1 min-w-0 border-r hairline">
                {/* Search bar */}
                <div className="px-4 py-2.5 border-b hairline shrink-0">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-400" />
                    <input
                      type="text"
                      placeholder="Search by name, username, or email…"
                      className="input pl-8 text-[12.5px]"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    {search && (
                      <button
                        onClick={() => setSearch("")}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 icon-btn p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  {search && (
                    <p className="text-[11px] text-ink-500 mt-1.5">
                      {filteredItems.length.toLocaleString()} match{filteredItems.length !== 1 ? "es" : ""} for "{search}"
                    </p>
                  )}
                </div>

                {/* Table */}
                <div className="flex-1 overflow-y-auto">
                  {filteredItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full py-16 text-ink-400 gap-3">
                      {search ? (
                        <>
                          <Search className="w-8 h-8 opacity-40" />
                          <p className="text-[13px] font-medium text-ink-600 dark:text-ink-300">No matches</p>
                          <p className="text-[11.5px]">Try a different search term.</p>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                          <p className="text-[13px] font-medium text-ink-600 dark:text-ink-300">
                            All {tableLabel.toLowerCase()} already have accounts
                          </p>
                        </>
                      )}
                    </div>
                  ) : (
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th className="w-10 text-center">#</th>
                          <th>Full name</th>
                          <th>Username</th>
                          <th>Email</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pageItems.map((item, idx) => {
                          const rowNum = (currentPage - 1) * PAGE_SIZE + idx + 1;
                          const abbr   = initials(item.full_name);
                          return (
                            <tr key={item.id} className="group">
                              <td className="text-center text-ink-400 text-[11px] font-mono">
                                {rowNum}
                              </td>
                              <td>
                                <div className="flex items-center gap-2.5">
                                  <div className="w-7 h-7 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center text-primary-700 dark:text-primary-300 text-[10px] font-bold shrink-0">
                                    {abbr || <UserIcon className="w-3.5 h-3.5" />}
                                  </div>
                                  <span className="text-[12.5px] font-medium text-ink-900 dark:text-white">
                                    {item.full_name || "—"}
                                  </span>
                                </div>
                              </td>
                              <td>
                                <div className="flex items-center gap-1.5">
                                  <Hash className="w-3 h-3 text-ink-300 shrink-0" />
                                  <span className="text-[11.5px] font-mono text-primary-700 dark:text-primary-300">
                                    {item.username}
                                  </span>
                                </div>
                              </td>
                              <td>
                                <div className="flex items-center gap-1.5">
                                  <Mail className="w-3 h-3 text-ink-300 shrink-0" />
                                  <span className="text-[11.5px] text-ink-500 truncate max-w-[220px]">
                                    {item.email}
                                  </span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="px-4 py-2.5 border-t hairline flex items-center justify-between gap-3 shrink-0 bg-ink-50/50 dark:bg-ink-800/30">
                    <p className="text-[11px] text-ink-500">
                      Showing{" "}
                      <span className="font-semibold text-ink-700 dark:text-ink-300">
                        {((currentPage - 1) * PAGE_SIZE + 1).toLocaleString()}–
                        {Math.min(currentPage * PAGE_SIZE, filteredItems.length).toLocaleString()}
                      </span>{" "}
                      of{" "}
                      <span className="font-semibold text-ink-700 dark:text-ink-300">
                        {filteredItems.length.toLocaleString()}
                      </span>
                    </p>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="icon-btn disabled:opacity-30"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-[11.5px] font-medium text-ink-600 dark:text-ink-300 px-1 tabular-nums">
                        {currentPage} / {totalPages}
                      </span>
                      <button
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="icon-btn disabled:opacity-30"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* RIGHT — confirm panel */}
              <form
                onSubmit={handleCreate}
                className="flex flex-col w-80 shrink-0 overflow-y-auto"
              >
                <div className="flex-1 p-5 space-y-4">
                  {/* Summary card */}
                  <div className="rounded-xl bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800 p-4 space-y-2">
                    <div className="flex items-center gap-2 text-primary-700 dark:text-primary-300 font-semibold text-[12.5px]">
                      <ShieldCheck className="w-4 h-4 shrink-0" />
                      Ready to create
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-[28px] font-bold text-primary-700 dark:text-primary-200 tabular-nums leading-none">
                        {previewItems.length.toLocaleString()}
                      </span>
                      <span className="text-[12px] text-primary-600 dark:text-primary-400">
                        {tableLabel.toLowerCase()}
                      </span>
                    </div>
                    <p className="text-[11px] text-primary-600/80 dark:text-primary-400/80">
                      Active records with no portal login.
                    </p>
                  </div>

                  {/* Password */}
                  <div>
                    <label className="label">Default password</label>
                    <div className="relative">
                      <input
                        ref={passwordRef}
                        required
                        type={showPassword ? "text" : "password"}
                        className="input pr-9"
                        placeholder="Min. 6 characters"
                        value={defaultPassword}
                        onChange={(e) => setDefaultPassword(e.target.value)}
                        disabled={creating}
                        minLength={6}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 icon-btn p-0.5 text-ink-400"
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <p className="text-[11px] text-ink-500 mt-1">
                      All accounts will use this password and must change it on first login.
                    </p>
                  </div>

                  {/* Warning */}
                  {previewItems.length > 0 && (
                    <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3 flex gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                      <p className="text-[11.5px] text-amber-700 dark:text-amber-300">
                        This creates{" "}
                        <strong>{previewItems.length.toLocaleString()}</strong> accounts and cannot
                        be reversed in bulk.
                      </p>
                    </div>
                  )}
                </div>

                {/* Sticky footer buttons */}
                <div className="px-5 py-4 border-t hairline space-y-2 shrink-0">
                  <button
                    type="submit"
                    className="btn-primary w-full"
                    disabled={creating || previewItems.length === 0}
                  >
                    {creating ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Creating accounts…</>
                    ) : (
                      <><CheckCircle2 className="w-3.5 h-3.5" /> Create {previewItems.length.toLocaleString()} accounts</>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep("select")}
                    className="btn-secondary w-full"
                    disabled={creating}
                  >
                    Back
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ── Step 3: Done ── */}
          {step === "done" && result && (
            <div className="flex flex-col">
              {/* Hero banner */}
              <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 dark:from-emerald-600 dark:to-emerald-700 px-8 py-10 flex flex-col items-center gap-3 text-white text-center">
                <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mb-1">
                  <CheckCircle2 className="w-9 h-9 text-white" strokeWidth={2} />
                </div>
                <div>
                  <p className="text-[28px] font-bold tabular-nums leading-none">
                    {result.created_count.toLocaleString()}
                  </p>
                  <p className="text-emerald-100 text-[13px] mt-1.5">
                    account{result.created_count !== 1 ? "s" : ""} created successfully
                  </p>
                </div>
                <p className="text-emerald-100/80 text-[12px]">
                  {tableOption.label} · Active records without portal access
                </p>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 divide-x hairline border-b hairline">
                {[
                  { label: "Created", value: result.created_count, color: "text-emerald-600 dark:text-emerald-400" },
                  { label: "Skipped", value: result.skipped_count, color: "text-amber-500 dark:text-amber-400" },
                  { label: "Processed", value: result.total_processed, color: "text-ink-700 dark:text-ink-200" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="flex flex-col items-center py-5 px-4">
                    <span className={`text-[30px] font-bold tabular-nums leading-none ${color}`}>
                      {value.toLocaleString()}
                    </span>
                    <span className="text-[11.5px] text-ink-500 mt-1.5 font-medium">{label}</span>
                  </div>
                ))}
              </div>

              {/* Notes + actions */}
              <div className="p-6 space-y-4">
                <div className="rounded-lg bg-ink-50 dark:bg-ink-800/60 border hairline p-3.5 space-y-1.5">
                  <p className="text-[12px] font-medium text-ink-700 dark:text-ink-200">What happens next?</p>
                  <ul className="text-[11.5px] text-ink-500 space-y-1 list-disc list-inside">
                    <li>All new users must change their password on first login.</li>
                    {result.skipped_count > 0 && (
                      <li>{result.skipped_count.toLocaleString()} record{result.skipped_count !== 1 ? "s were" : " was"} skipped — duplicate username or email in the users table.</li>
                    )}
                    <li>Share the default password with affected users securely.</li>
                  </ul>
                </div>

                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => { reset(); }}
                    className="btn-secondary"
                  >
                    Create more
                  </button>
                  <button onClick={handleClose} className="btn-primary">
                    Done
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </ModalPortal>
  );
}
