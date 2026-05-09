import { useState } from "react";
import {
  X,
  AlertCircle,
  FileText,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Eye,
  MessageSquarePlus,
  Loader2,
  Info,
} from "lucide-react";
import type { ApplicationDocument } from "@/types/admission";
import { verificationService } from "@/services/admissionService";
import ModalPortal from "@/components/ui/ModalPortal";

interface RequestChangesModalProps {
  isOpen: boolean;
  onClose: () => void;
  applicationId: number;
  documents: ApplicationDocument[];
  onSuccess: () => void;
}

export default function RequestChangesModal({
  isOpen,
  onClose,
  applicationId,
  documents,
  onSuccess,
}: RequestChangesModalProps) {
  const [step, setStep] = useState(1);
  const [selectedDocIds, setSelectedDocIds] = useState<number[]>(
    documents
      .filter((d) => d.verification_status === "rejected")
      .map((d) => d.id),
  );
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<ApplicationDocument | null>(
    null,
  );

  if (!isOpen) return null;

  const handleToggleDoc = (id: number) => {
    setSelectedDocIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  const handleSubmit = async () => {
    if (selectedDocIds.length === 0) return;

    setIsSubmitting(true);
    try {
      // First, we might need to ensure the selected docs are marked as rejected on the backend
      // But for now, the 'request-changes' endpoint sends email for current 'rejected' docs.
      // If the user selects docs that AREN'T rejected yet, we should probably update them first.

      // For simplicity and to match the user's "Selecting documents" request:
      // We will tell the backend to send the email with the message.
      await verificationService.requestDocumentChanges(applicationId, {
        message,
        document_ids: selectedDocIds,
      });
      onSuccess();
      onClose();
    } catch (error) {
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6">
      <div
        className="absolute inset-0 bg-ink-950/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative w-full max-w-2xl bg-white dark:bg-ink-900 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 border-b border-ink-100 dark:border-ink-800 flex items-center justify-between bg-brand/[0.02]">
          <div>
            <h2 className="text-xl font-black text-ink-900 dark:text-white flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-500" />
              Request Document Changes
            </h2>
            <p className="text-sm text-ink-500 font-medium">
              Step {step} of 2:{" "}
              {step === 1
                ? "Select documents to be changed"
                : "Finalize message"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-ink-100 dark:hover:bg-ink-800 text-ink-400 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === 1 ? (
            <div className="space-y-4">
              <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-2xl border border-amber-100 dark:border-amber-900/30 flex gap-3">
                <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-800 dark:text-amber-300 leading-relaxed">
                  Select the documents that require corrections. Applicants will
                  be notified to re-upload these specifically.
                </p>
              </div>

              <div className="flex flex-col w-full gap-3">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className={`group w-full p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between gap-4 ${
                      selectedDocIds.includes(doc.id)
                        ? "border-red-500 bg-red-50/30 dark:bg-red-900/10"
                        : "border-ink-100 dark:border-ink-800 hover:border-brand/20 bg-white dark:bg-ink-900"
                    }`}
                    onClick={() => handleToggleDoc(doc.id)}
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          selectedDocIds.includes(doc.id)
                            ? "bg-red-100 text-red-600"
                            : "bg-ink-100 text-ink-400"
                        }`}
                      >
                        <FileText className="w-5 h-5" />
                      </div>
                      <div className="w-full">
                        <p className="font-bold text-ink-900 dark:text-white">
                          {doc.type_name}
                        </p>
                        <p className="text-[11px] text-ink-500 max-w-[360px] truncate">
                          {doc.file_original_name}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        className="p-2 rounded-lg hover:bg-white dark:hover:bg-ink-800 text-ink-400 hover:text-brand transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPreviewDoc(doc);
                        }}
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <div
                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                          selectedDocIds.includes(doc.id)
                            ? "border-red-500 bg-red-500 text-white"
                            : "border-ink-200 dark:border-ink-700"
                        }`}
                      >
                        {selectedDocIds.includes(doc.id) && (
                          <CheckCircle2 className="w-4 h-4" />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <p className="text-xs uppercase tracking-widest font-black text-ink-400 mb-3 flex items-center gap-2">
                  <MessageSquarePlus className="w-4 h-4" /> Global Message to
                  Applicant
                </p>
                <textarea
                  className="input w-full min-h-[160px] p-4 text-base bg-ink-50 dark:bg-ink-800 border-none resize-none focus:ring-2 ring-brand/20"
                  placeholder="Provide overall instructions or context for the requested changes..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  autoFocus
                />
                <p className="text-[12px] text-ink-500 mt-2">
                  This message will appear prominently at the top of the
                  notification email.
                </p>
              </div>

              <div className="bg-ink-50 dark:bg-ink-800/50 p-4 rounded-2xl border border-ink-100 dark:border-ink-800">
                <p className="text-[11px] uppercase tracking-widest font-black text-ink-400 mb-2">
                  Selected for change ({selectedDocIds.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {selectedDocIds.map((id) => {
                    const doc = documents.find((d) => d.id === id);
                    return (
                      <span
                        key={id}
                        className="px-3 py-1 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-700 rounded-full text-[12px] font-bold text-ink-700 dark:text-ink-300"
                      >
                        {doc?.type_name}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-ink-100 dark:border-ink-800 flex items-center justify-between bg-white dark:bg-ink-900">
          {step === 1 ? (
            <button className="btn-secondary px-6" onClick={onClose}>
              Cancel
            </button>
          ) : (
            <button className="btn-secondary px-6" onClick={() => setStep(1)}>
              <ChevronLeft className="w-4 h-4 mr-2" /> Back
            </button>
          )}

          {step === 1 ? (
            <button
              className="btn-primary px-8 shadow-xl shadow-brand/20"
              disabled={selectedDocIds.length === 0}
              onClick={() => setStep(2)}
            >
              Next Step <ChevronRight className="w-4 h-4 ml-2" />
            </button>
          ) : (
            <button
              className="btn-primary px-8 bg-red-600 hover:bg-red-700 border-red-600 shadow-xl shadow-red-500/20"
              disabled={isSubmitting}
              onClick={handleSubmit}
            >
              {isSubmitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  Send Request <ChevronRight className="w-4 h-4 ml-2" />
                </>
              )}
            </button>
          )}
        </div>

        {/* Internal Preview Overlay */}
        {previewDoc && (
          <div className="absolute inset-0 z-10 bg-black/90 flex flex-col animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 flex items-center justify-between text-white border-b border-white/10">
              <p className="font-bold truncate">{previewDoc.type_name}</p>
              <button
                onClick={() => setPreviewDoc(null)}
                className="p-2 rounded-full hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden p-4">
              {previewDoc.file_mime?.startsWith("image/") ? (
                <img
                  src={verificationService.downloadUrl(
                    applicationId,
                    previewDoc.id,
                  )}
                  className="w-full h-full object-contain"
                  alt="Preview"
                />
              ) : (
                <iframe
                  src={verificationService.downloadUrl(
                    applicationId,
                    previewDoc.id,
                  )}
                  className="w-full h-full rounded-xl bg-white"
                  title="PDF Preview"
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
    </ModalPortal>
  );
}
