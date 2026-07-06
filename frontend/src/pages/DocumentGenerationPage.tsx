import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  FileText,
  Search,
  X,
  Loader2,
  Eye,
  Download,
  User,
  ChevronDown,
  ExternalLink,
} from "lucide-react";
import { studentService } from "@/services/studentService";
import { documentService, type DocumentType } from "@/services/documentService";
import { api } from "@/services/api";
import ModalPortal from "@/components/ui/ModalPortal";
import Modal from "@/components/ui/Modal";
import ExemptionLetterModal from "@/components/documents/ExemptionLetterModal";

// ─── Document type definitions ───────────────────────────────────────────────

interface DocType {
  key: DocumentType;
  label: string;
  description: string;
  comingSoon?: boolean;
}

const DOCUMENT_TYPES: DocType[] = [
  {
    key: "to_whom_visa",
    label: "To Whom For Visa",
    description:
      "Official letter to the Director General of Immigration authorizing the student's stay in Rwanda.",
  },
  {
    key: "admission_letter",
    label: "Admission Letter",
    description:
      "Formal admission confirmation from the Office of the Academic Registrar, including faculty, department, and program details.",
  },
  {
    key: "registration_form",
    label: "Student Registration Form",
    description:
      "Official enrolment record showing student identification, category, contacts, and prior institution.",
  },
  {
    key: "english_proficiency",
    label: "English Proficiency Certificate",
    description:
      "Certificate confirming that the medium of instruction at CUR is English.",
  },
  {
    key: "completed_modules",
    label: "Completed Modules Report",
    description:
      "Official report of all modules with recorded marks, total credits, and level breakdown.",
  },
  {
    key: "exemption_letter",
    label: "Exemption Letter",
    description:
      "Official letter detailing transferred credits from prior institution with exemption status and grading information.",
  },
  {
    key: "degree_bachelor",
    label: "Bachelor's Degree Certificate",
    description:
      "Official Bachelor's Degree certificate with modern blue design, issued by Catholic University of Rwanda.",
  },
  {
    key: "degree_pgde",
    label: "Postgraduate Diploma Certificate",
    description:
      "Official Postgraduate Diploma in Education certificate with cream background and rotated layout.",
  },
  {
    key: "degree_undergraduate",
    label: "Undergraduate Degree Certificate",
    description:
      "Official Undergraduate Degree certificate with cream background and rotated layout.",
  },
];

// ─── Student search widget ────────────────────────────────────────────────────

interface StudentResult {
  id: number;
  fname: string;
  lname: string;
  regnumber: string;
  department?: number | string;
  current_level?: number | string;
}

interface StudentSearchProps {
  onSelect: (student: StudentResult) => void;
}

function StudentSearch({ onSelect }: StudentSearchProps) {
  const [keyword, setKeyword] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const q = useQuery({
    queryKey: ["doc-student-search", keyword],
    queryFn: () => api.get<any>("/api/students", { q: keyword, per_page: 15 }),
    enabled: keyword.trim().length >= 2,
    staleTime: 30_000,
  });

  const results: StudentResult[] = q.data?.data?.data ?? [];

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative max-w-lg">
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          className="input pl-9 w-full"
          placeholder="Search by name or registration number…"
          value={keyword}
          onChange={(e) => {
            setKeyword(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
        {q.isFetching && (
          <Loader2 className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 animate-spin" />
        )}
      </div>

      {open && keyword.trim().length >= 2 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-700 rounded-lg shadow-xl overflow-hidden">
          {results.length === 0 && !q.isFetching ? (
            <p className="px-4 py-3 text-sm text-ink-400">No students found.</p>
          ) : (
            <ul>
              {results.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className="w-full text-left px-4 py-2.5 hover:bg-ink-50 dark:hover:bg-ink-800 flex items-center gap-3"
                    onClick={() => {
                      onSelect(s);
                      setKeyword("");
                      setOpen(false);
                    }}
                  >
                    <User className="w-4 h-4 text-ink-400 shrink-0" />
                    <span className="flex-1 min-w-0">
                      <span className="font-medium text-sm text-ink-900 dark:text-white">
                        {s.fname} {s.lname}
                      </span>
                      <span className="ml-2 text-xs text-ink-400">
                        {s.regnumber}
                      </span>
                    </span>
                    <ChevronDown className="w-3.5 h-3.5 text-ink-300 rotate-[-90deg]" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Document card ────────────────────────────────────────────────────────────

interface DocCardProps {
  doc: DocType;
  studentId: number | null;
  onPreview: (key: DocumentType, label: string) => void;
}

function DocCard({ doc, studentId, onPreview }: DocCardProps) {
  const noStudent       = studentId === null;
  const comingSoon      = doc.comingSoon === true;
  const actionsDisabled = noStudent || comingSoon;

  const downloadUrl = actionsDisabled
    ? null
    : documentService.downloadUrl(studentId!, doc.key);

  return (
    <div
      className={`card card-pad flex flex-col gap-3 transition-opacity ${
        comingSoon ? "opacity-50" : noStudent ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center shrink-0">
          <FileText className="w-5 h-5 text-primary-600 dark:text-primary-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-sm text-ink-900 dark:text-white leading-tight">
              {doc.label}
            </p>
            {comingSoon && (
              <span className="chip-soft text-[10px] px-1.5 py-0.5 leading-none shrink-0">
                Coming soon
              </span>
            )}
          </div>
          <p className="text-xs text-ink-400 mt-0.5">{doc.description}</p>
        </div>
      </div>

      <div className="flex gap-2 mt-auto pt-1">
        <button
          type="button"
          disabled={actionsDisabled}
          className="btn btn-secondary btn-sm flex-1 flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
          onClick={() => !actionsDisabled && onPreview(doc.key, doc.label)}
        >
          <Eye className="w-3.5 h-3.5" />
          Preview
        </button>
        <a
          href={downloadUrl ?? "#"}
          target="_blank"
          rel="noopener noreferrer"
          aria-disabled={actionsDisabled}
          onClick={(e) => actionsDisabled && e.preventDefault()}
          className={`btn btn-primary btn-sm flex-1 flex items-center justify-center gap-1.5 ${
            actionsDisabled ? "opacity-40 cursor-not-allowed pointer-events-none" : ""
          }`}
        >
          <Download className="w-3.5 h-3.5" />
          Generate
        </a>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DocumentGenerationPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedStudent, setSelectedStudent] = useState<StudentResult | null>(
    null,
  );
  const [previewModal, setPreviewModal] = useState<{
    html: string;
    label: string;
    downloadUrl: string;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [exemptionLetterModalOpen, setExemptionLetterModalOpen] = useState(false);
  const [portalOpen, setPortalOpen] = useState(false);

  // Pre-select student from URL param (when navigating from StudentDetailsPage)
  const urlStudentId =
    parseInt(searchParams.get("student_id") ?? "", 10) || null;

  const prefetchQ = useQuery({
    queryKey: ["doc-gen-prefetch", urlStudentId],
    queryFn: () => studentService.show(urlStudentId!),
    enabled: urlStudentId !== null && selectedStudent === null,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (prefetchQ.data?.data && selectedStudent === null) {
      const s = prefetchQ.data.data as any;
      const studentData = {
        id: s.id,
        fname: s.fname,
        lname: s.lname,
        regnumber: s.regnumber,
        department: s.department,
        current_level: s.current_level,
      };
      console.log('Setting selected student:', studentData);
      setSelectedStudent(studentData);
    }
  }, [prefetchQ.data, selectedStudent]);

  const handleSelectStudent = (s: StudentResult) => {
    setSelectedStudent(s);
    setSearchParams({ student_id: String(s.id) }, { replace: true });
  };

  const handleClearStudent = () => {
    setSelectedStudent(null);
    setSearchParams({}, { replace: true });
  };

  const studentId = selectedStudent?.id ?? null;

  const handlePreview = async (key: DocumentType, label: string) => {
    if (!studentId) return;

    // Exemption letter has its own modal builder — open that instead
    if (key === 'exemption_letter') {
      setExemptionLetterModalOpen(true);
      return;
    }

    // All other document types use the standard GET-based preview
    setPreviewLoading(true);
    try {
      const res = await documentService.fetchPreview(studentId, key);
      setPreviewModal({
        html: res.data?.html ?? '',
        label,
        downloadUrl: documentService.downloadUrl(studentId, key),
      });
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink-900 dark:text-white">
            Document Generation
          </h1>
          <p className="text-sm text-ink-400 mt-0.5">
            Select a student, then preview or generate an official document.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPortalOpen(true)}
          className="btn-secondary btn-sm"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Graduation Link
        </button>
      </div>

      {/* Student selector */}
      <div className="card card-pad space-y-3">
        <p className="label">Student</p>

        {selectedStudent ? (
          /* Selected student summary */
          <div className="flex items-center gap-3 p-3 rounded-lg bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700">
            <div className="w-9 h-9 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center shrink-0">
              <User className="w-4.5 h-4.5 text-primary-600 dark:text-primary-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-ink-900 dark:text-white">
                {selectedStudent.fname} {selectedStudent.lname}
              </p>
              <p className="text-xs text-ink-400">
                {selectedStudent.regnumber}
              </p>
            </div>
            <button
              type="button"
              onClick={handleClearStudent}
              className="p-1 rounded hover:bg-ink-200 dark:hover:bg-ink-700 text-ink-400 hover:text-ink-700 dark:hover:text-white transition-colors"
              title="Clear selection"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : prefetchQ.isFetching ? (
          <div className="flex items-center gap-2 text-sm text-ink-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading student…
          </div>
        ) : (
          <StudentSearch onSelect={handleSelectStudent} />
        )}
      </div>

      {/* Document grid */}
      <div>
        <p className="label mb-3">Available Documents</p>
        {!selectedStudent && (
          <p className="text-sm text-ink-400 mb-3">
            Select a student above to enable document generation.
          </p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {DOCUMENT_TYPES.map((doc) => (
            <DocCard
              key={doc.key}
              doc={doc}
              studentId={studentId}
              onPreview={handlePreview}
            />
          ))}
        </div>
      </div>

      {/* Preview modal */}
      {previewModal && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white dark:bg-ink-900 rounded-xl shadow-2xl flex flex-col w-full max-w-3xl max-h-[90vh] overflow-hidden">
              {/* Modal header */}
              <div className="flex items-center gap-3 px-5 py-4 border-b border-ink-100 dark:border-ink-800">
                <p className="font-semibold text-ink-900 dark:text-white text-sm flex-1 min-w-0 truncate">
                  Preview — {previewModal.label}
                </p>
                <a
                  href={previewModal.downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary btn-sm flex items-center gap-1.5 shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download PDF
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewModal(null)}
                  className="p-1 rounded hover:bg-ink-100 dark:hover:bg-ink-800 text-ink-400 hover:text-ink-700 dark:hover:text-white transition-colors shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* iframe preview — HTML injected via srcdoc to avoid cross-origin issues */}
              {previewLoading ? (
                <div className="flex-1 flex items-center justify-center min-h-[60vh]">
                  <Loader2 className="w-6 h-6 animate-spin text-ink-400" />
                </div>
              ) : (
                <iframe
                  srcDoc={previewModal.html}
                  title={`Preview: ${previewModal.label}`}
                  className="flex-1 w-full min-h-[60vh] border-0"
                  sandbox="allow-same-origin"
                />
              )}
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Exemption Letter builder modal */}
      {exemptionLetterModalOpen && selectedStudent && (
        <>
          {console.log('Opening exemption modal with:', { dept: selectedStudent.department, level: selectedStudent.current_level })}
          <ExemptionLetterModal
            studentId={selectedStudent.id}
            studentDepartment={selectedStudent.department}
            studentLevel={selectedStudent.current_level}
            onClose={() => setExemptionLetterModalOpen(false)}
          onPreview={(html) => {
            setPreviewModal({
              html,
              label: "Exemption Letter",
              downloadUrl: "#", // Not used for exemption letter
            });
          }}
          />
        </>
      )}

      {/* CUR Documents Portal iframe modal */}
      <Modal
        open={portalOpen}
        onClose={() => setPortalOpen(false)}
        title="CUR Documents Portal"
        size="full"
        className="w-[80vw] max-w-[80vw] h-[85vh]"
      >
        <iframe
          src="https://cur.ac.rw/umis/documents/"
          title="CUR Documents Portal"
          className="w-full h-full min-h-[70vh] border-0"
        />
      </Modal>
    </div>
  );
}
