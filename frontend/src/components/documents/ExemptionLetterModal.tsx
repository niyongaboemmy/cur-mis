import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { moduleCatalogService } from "@/services/modulesService";
import { documentService } from "@/services/documentService";
import { toast } from "react-hot-toast";

export interface ExemptionLetterRow {
  cur_module_id?: number;
  cur_module_label: string;
  other_module_title: string;
  level: string;
  credits: number;
  marks: string;
}

export interface ExemptionLetterPayload {
  student_id: number;
  source_institution: string;
  source_faculty?: string;
  target_level: string;
  academic_year: string;
  issue_location: string;
  dean_name: string;
  dean_title: string;
  rows: ExemptionLetterRow[];
}

interface ExemptionLetterModalProps {
  studentId: number;
  studentName?: string;
  studentRegNumber?: string;
  studentFaculty?: string;
  studentDepartment?: string;
  studentProgram?: string;
  studentCurrentLevel?: number | string;
  onClose: () => void;
  onPreview?: (html: string) => void;
}

export default function ExemptionLetterModal({
  studentId,
  studentName,
  studentRegNumber,
  studentFaculty,
  studentDepartment,
  studentProgram,
  studentCurrentLevel,
  onClose,
  onPreview,
}: ExemptionLetterModalProps) {
  const [sourceInstitution, setSourceInstitution] = useState("");
  const [sourceFaculty, setSourceFaculty] = useState("");
  const [targetLevel, setTargetLevel] = useState("");
  const [academicYear, setAcademicYear] = useState(new Date().getFullYear().toString());
  const [issueLocation, setIssueLocation] = useState("TABA");
  const [deanName, setDeanName] = useState("");
  const [deanTitle, setDeanTitle] = useState("");
  const [rows, setRows] = useState<ExemptionLetterRow[]>([
    {
      cur_module_label: "",
      other_module_title: "",
      level: "",
      credits: 0,
      marks: "",
    },
  ]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);

  const modulesQ = useQuery({
    queryKey: ["modules-list-exemption"],
    queryFn: async () => {
      try {
        console.log('Fetching modules for exemption letter...');

        // Load all modules - no filters, just get everything
        const result = await moduleCatalogService.list({
          per_page: 1000
        });

        const modules = result?.data?.data ?? [];
        console.log('✓ Successfully loaded', modules.length, 'modules');

        if (modules.length === 0) {
          console.warn('⚠ No modules returned from API');
        }

        return result;
      } catch (error) {
        console.error('✗ Failed to load modules:', {
          message: error instanceof Error ? error.message : String(error),
          error
        });
        throw error;
      }
    },
    staleTime: 60_000,
    retry: 3, // Retry up to 3 times on failure
  });

  // Extract modules from the nested response structure
  // API response: ApiResponse<PaginatedResponse<Module[]>>
  // So: result.data = PaginatedResponse, result.data.data = Module[]
  const modules = useMemo(() => {
    if (!modulesQ.data) return [];

    // Handle different possible response structures
    const paginatedResponse = modulesQ.data.data;
    if (!paginatedResponse) return [];

    if (Array.isArray(paginatedResponse.data)) {
      return paginatedResponse.data;
    }
    if (Array.isArray(paginatedResponse)) {
      return paginatedResponse;
    }

    return [];
  }, [modulesQ.data]);

  if (modulesQ.error) {
    console.error('Failed to load modules:', modulesQ.error);
  }

  const totalCredits = rows.reduce((sum, r) => sum + (r.credits || 0), 0);

  const canPreview =
    sourceInstitution.trim() !== "" &&
    targetLevel.trim() !== "" &&
    deanName.trim() !== "" &&
    deanTitle.trim() !== "" &&
    rows.some((r) => r.cur_module_label.trim() !== "");

  const handleAddRow = () => {
    setRows([
      ...rows,
      {
        cur_module_label: "",
        other_module_title: "",
        level: "",
        credits: 0,
        marks: "",
      },
    ]);
  };

  const handleRemoveRow = (index: number) => {
    if (rows.length > 1) {
      setRows(rows.filter((_, i) => i !== index));
    }
  };

  const handleRowChange = (index: number, field: keyof ExemptionLetterRow, value: any) => {
    const newRows = [...rows];
    if (field === "cur_module_label") {
      // When a module is selected, auto-fill the level from the module's level field
      const selectedModule = modules.find(
        (m: any) => `${m.module_code} — ${m.module_name}` === value
      );
      if (selectedModule) {
        newRows[index].level = selectedModule.level?.toString() || "";
      }
    }
    (newRows[index] as any)[field] = value;
    setRows(newRows);
  };

  const buildPayload = (): ExemptionLetterPayload => ({
    student_id: studentId,
    source_institution: sourceInstitution.trim(),
    source_faculty: sourceFaculty.trim() || undefined,
    target_level: targetLevel.trim(),
    academic_year: academicYear.trim(),
    issue_location: issueLocation.trim() || "TABA",
    dean_name: deanName.trim(),
    dean_title: deanTitle.trim(),
    rows: rows.filter((r) => r.cur_module_label.trim() !== ""),
  });

  const handlePreview = async () => {
    if (!canPreview) {
      toast.error("Please fill in all required fields and add at least one module.");
      return;
    }

    setPreviewLoading(true);
    try {
      const payload = buildPayload();
      const res = await documentService.previewExemptionLetter(payload);
      if (onPreview) {
        onPreview(res.data?.html ?? "");
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Failed to generate preview");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!canPreview) {
      toast.error("Please fill in all required fields and add at least one module.");
      return;
    }

    setDownloadLoading(true);
    try {
      const payload = buildPayload();
      await documentService.downloadExemptionLetter(payload);
      toast.success("PDF downloaded successfully");
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Failed to download PDF");
    } finally {
      setDownloadLoading(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-start justify-center bg-black/60 backdrop-blur-sm p-4 pt-20 overflow-y-auto">
      <div className="bg-white dark:bg-ink-900 rounded-xl shadow-2xl w-full max-w-4xl">
        <div className="p-5 border-b border-ink-100 dark:border-ink-800 sticky top-0 bg-blue-50 dark:bg-blue-500/10">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-ink-900 dark:text-white">
                Build Exemption Letter
              </h2>
              <p className="text-[12px] text-ink-500 mt-0.5">
                Enter student transfer details, source/target institution info, and exempted modules
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-ink-400 hover:bg-ink-100 dark:hover:bg-ink-800"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6 max-h-[calc(100vh-300px)] overflow-y-auto">
          {/* Student Information Display */}
          {(studentName || studentRegNumber || studentFaculty || studentDepartment || studentProgram) && (
            <div className="p-4 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-lg">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-2.5 block">
                Student Information
              </p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {studentName && (
                  <div>
                    <p className="text-ink-500 text-[11px]">Name</p>
                    <p className="font-medium text-ink-900 dark:text-white">{studentName}</p>
                  </div>
                )}
                {studentRegNumber && (
                  <div>
                    <p className="text-ink-500 text-[11px]">Registration Number</p>
                    <p className="font-medium text-ink-900 dark:text-white">{studentRegNumber}</p>
                  </div>
                )}
                {studentFaculty && (
                  <div>
                    <p className="text-ink-500 text-[11px]">Faculty</p>
                    <p className="font-medium text-ink-900 dark:text-white text-sm">{studentFaculty}</p>
                  </div>
                )}
                {studentDepartment && (
                  <div>
                    <p className="text-ink-500 text-[11px]">Department</p>
                    <p className="font-medium text-ink-900 dark:text-white text-sm">{studentDepartment}</p>
                  </div>
                )}
                {studentProgram && (
                  <div className="col-span-2">
                    <p className="text-ink-500 text-[11px]">Program</p>
                    <p className="font-medium text-ink-900 dark:text-white text-sm">{studentProgram}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Letter Metadata */}
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-1.5 block">
                Prior Institution <span className="text-red-500">*</span>
              </span>
              <input
                type="text"
                value={sourceInstitution}
                onChange={(e) => setSourceInstitution(e.target.value)}
                placeholder="e.g. UNILAK"
                className="input w-full"
              />
            </label>

            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-1.5 block">
                Source Faculty (optional)
              </span>
              <input
                type="text"
                value={sourceFaculty}
                onChange={(e) => setSourceFaculty(e.target.value)}
                placeholder="e.g. Faculty of Business Studies"
                className="input w-full"
              />
            </label>

            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-1.5 block">
                Target Level <span className="text-red-500">*</span>
              </span>
              <input
                type="text"
                value={targetLevel}
                onChange={(e) => setTargetLevel(e.target.value)}
                placeholder="e.g. Level 8 S1&S2"
                className="input w-full"
              />
            </label>

            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-1.5 block">
                Academic Year
              </span>
              <input
                type="text"
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                placeholder="e.g. 2025-2026"
                className="input w-full"
              />
            </label>

            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-1.5 block">
                Issue Location
              </span>
              <input
                type="text"
                value={issueLocation}
                onChange={(e) => setIssueLocation(e.target.value)}
                placeholder="e.g. TABA"
                className="input w-full"
              />
            </label>
          </div>

          {/* Signature Block */}
          <div className="grid grid-cols-2 gap-4 p-4 bg-ink-50 dark:bg-ink-800/30 rounded-lg">
            <label className="block col-span-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-1.5 block">
                Dean Name <span className="text-red-500">*</span>
              </span>
              <input
                type="text"
                value={deanName}
                onChange={(e) => setDeanName(e.target.value)}
                placeholder="e.g. Dr. Rachel BAYISENGE"
                className="input w-full"
              />
            </label>

            <label className="block col-span-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-1.5 block">
                Dean Title <span className="text-red-500">*</span>
              </span>
              <input
                type="text"
                value={deanTitle}
                onChange={(e) => setDeanTitle(e.target.value)}
                placeholder="e.g. Dean, Faculty of Commerce"
                className="input w-full"
              />
            </label>
          </div>

          {/* Module Rows */}
          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-ink-700 dark:text-ink-100">
                Exempted Modules
                {rows.length > 0 && (
                  <span className="text-sm font-normal text-ink-500 ml-2">
                    ({rows.length} module{rows.length !== 1 ? "s" : ""} · {totalCredits} credits)
                  </span>
                )}
              </h3>
              <button
                type="button"
                onClick={handleAddRow}
                className="btn btn-primary btn-sm flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Row
              </button>
            </div>

            <div className="space-y-3 overflow-x-auto">
              {modulesQ.isLoading ? (
                <p className="text-sm text-ink-400 p-4">Loading modules…</p>
              ) : (
                rows.map((row, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-12 gap-2 p-3 bg-ink-50 dark:bg-ink-800/20 rounded-lg items-start"
                  >
                    <div className="col-span-3">
                      <label className="text-[10px] font-semibold uppercase text-ink-500 mb-1 block">
                        CUR Module <span className="text-red-500">*</span>
                      </label>
                      {modulesQ.isLoading ? (
                        <div className="flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-500/10 rounded text-xs text-blue-700 dark:text-blue-400">
                          <span className="inline-block w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
                          Loading modules...
                        </div>
                      ) : modulesQ.error ? (
                        <div className="flex items-center gap-2 p-2 bg-red-50 dark:bg-red-500/10 rounded text-xs text-red-700 dark:text-red-400">
                          <span>⚠ Failed to load modules</span>
                        </div>
                      ) : modules.length === 0 ? (
                        <div className="flex items-center gap-2 p-2 bg-yellow-50 dark:bg-yellow-500/10 rounded text-xs text-yellow-700 dark:text-yellow-400">
                          <span>No modules found</span>
                        </div>
                      ) : (
                        <select
                          value={row.cur_module_label}
                          onChange={(e) =>
                            handleRowChange(idx, "cur_module_label", e.target.value)
                          }
                          disabled={false}
                          className="input input-sm w-full text-xs bg-white dark:bg-ink-900"
                        >
                          <option value="" disabled>
                            Select a module ({modules.length} available)
                          </option>
                          {modules.map((m: any) => (
                            <option
                              key={m.module_id}
                              value={`${m.module_code} — ${m.module_name}`}
                            >
                              {m.module_code} — {m.module_name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    <div className="col-span-3">
                      <label className="text-[10px] font-semibold uppercase text-ink-500 mb-1 block">
                        Other Univ. Module
                      </label>
                      <input
                        type="text"
                        value={row.other_module_title}
                        onChange={(e) =>
                          handleRowChange(idx, "other_module_title", e.target.value)
                        }
                        placeholder="Module title"
                        className="input input-sm w-full text-xs"
                      />
                    </div>

                    <div className="col-span-1">
                      <label className="text-[10px] font-semibold uppercase text-ink-500 mb-1 block">
                        Level
                      </label>
                      <input
                        type="text"
                        value={row.level}
                        readOnly
                        placeholder="Auto-filled"
                        className="input input-sm w-full text-xs bg-ink-50 dark:bg-ink-800 text-ink-600 dark:text-ink-400"
                      />
                    </div>

                    <div className="col-span-1">
                      <label className="text-[10px] font-semibold uppercase text-ink-500 mb-1 block">
                        Credits
                      </label>
                      <input
                        type="number"
                        value={row.credits}
                        onChange={(e) =>
                          handleRowChange(idx, "credits", Number(e.target.value))
                        }
                        min="0"
                        className="input input-sm w-full text-xs"
                      />
                    </div>

                    <div className="col-span-2">
                      <label className="text-[10px] font-semibold uppercase text-ink-500 mb-1 block">
                        Marks
                      </label>
                      <input
                        type="text"
                        value={row.marks}
                        onChange={(e) => handleRowChange(idx, "marks", e.target.value)}
                        placeholder="75% or 50.79%"
                        className="input input-sm w-full text-xs"
                      />
                    </div>

                    <div className="col-span-1 flex items-end">
                      <button
                        type="button"
                        onClick={() => handleRemoveRow(idx)}
                        disabled={rows.length === 1}
                        className="btn btn-secondary btn-xs w-full"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-ink-100 dark:border-ink-800 p-4 bg-ink-50 dark:bg-ink-900/50 flex justify-end gap-2 sticky bottom-0">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary btn-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handlePreview}
            disabled={!canPreview || previewLoading}
            className="btn btn-secondary btn-sm"
          >
            {previewLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              "Preview"
            )}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={!canPreview || downloadLoading}
            className="btn btn-primary btn-sm"
          >
            {downloadLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              "Generate PDF"
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
