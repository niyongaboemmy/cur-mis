import { useState, useEffect } from "react";
import { useParams, useNavigate, Link, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { verificationService } from "@/services/admissionService";
import { VerificationStatus, ApplicationStatus } from "@/types/admission";
import RequestChangesModal from "./RequestChangesModal";
import toast from "react-hot-toast";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  FileText,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  MessageSquare,
  FileCheck2,
} from "lucide-react";

export default function DocumentValidationCarousel() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [searchParams] = useSearchParams();
  const initialIndex = Number(searchParams.get("index") || 0);

  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [status, setStatus] = useState<VerificationStatus | null>(null);
  const [comment, setComment] = useState("");
  const [isRequestChangesOpen, setIsRequestChangesOpen] = useState(false);

  // Fetch application documents
  const appQ = useQuery({
    queryKey: ["admin", "verifications", Number(id)],
    queryFn: () => verificationService.getApplicationDocuments(Number(id)),
    enabled: !!id,
  });

  const app = appQ.data?.data?.application;
  const docs = appQ.data?.data?.documents ?? [];

  const currentDoc = docs[currentIndex];
  const isLast = currentIndex === docs.length - 1;
  const isFirst = currentIndex === 0;

  // Initialize form when document changes
  const canEdit =
    app?.status !== ApplicationStatus.ENROLLED &&
    app?.status !== ApplicationStatus.WITHDRAWN;

  useEffect(() => {
    if (currentDoc) {
      setStatus(currentDoc.verification_status !== VerificationStatus.PENDING ? currentDoc.verification_status : null);
      setComment(currentDoc.verification_comment || "");
    }
  }, [currentDoc, currentIndex]);

  const verifyDoc = useMutation({
    mutationFn: (data: { documentId: number; status: VerificationStatus.VERIFIED | VerificationStatus.REJECTED; comment?: string }) =>
      verificationService.verifyDocument(Number(id), data.documentId, {
        verification_status: data.status,
        comment: data.comment,
      }),
    onSuccess: () => {
      toast.success("Document validation saved!");
      queryClient.invalidateQueries({ queryKey: ["admin", "verifications", Number(id)] });
      queryClient.invalidateQueries({ queryKey: ["admin", "verifications"] });
      
      if (isLast) {
        navigate(`/admin/admissions/applications/${id}`);
      } else {
        setCurrentIndex((prev) => prev + 1);
      }
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? "Failed to validate document"),
  });

  const requestChangesSuccess = () => {
    toast.success("Changes requested and applicant notified.");
    queryClient.invalidateQueries({ queryKey: ["admin", "verifications", Number(id)] });
    queryClient.invalidateQueries({ queryKey: ["admin", "verifications"] });
    navigate(`/admin/admissions/applications/${id}`);
  };

  const handleSave = () => {
    if (!status || status === VerificationStatus.PENDING) {
      toast.error("Please select a status (Approve or Reject)");
      return;
    }
    if (status === VerificationStatus.REJECTED && !comment.trim()) {
      toast.error("Please provide a reason for rejection");
      return;
    }
    
    if (currentDoc) {
      verifyDoc.mutate({
        documentId: currentDoc.id,
        status: status as VerificationStatus.VERIFIED | VerificationStatus.REJECTED,
        comment: comment.trim(),
      });
    }
  };

  if (appQ.isLoading) {
    return (
      <div className="fixed inset-0 z-50 bg-white dark:bg-ink-950 flex flex-col items-center justify-center">
        <Loader2 className="w-12 h-12 text-brand animate-spin mb-4" />
        <p className="text-ink-500 font-medium">Loading documents...</p>
      </div>
    );
  }

  if (!app || docs.length === 0) {
    return (
      <div className="fixed inset-0 z-50 bg-white dark:bg-ink-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 rounded-3xl bg-ink-100 dark:bg-ink-900 flex items-center justify-center mb-6 text-ink-300">
           <FileText className="w-10 h-10" />
        </div>
        <h2 className="text-xl font-black text-ink-900 dark:text-white mb-2">No Documents Found</h2>
        <p className="text-ink-500 max-w-sm mb-8">This application does not have any documents uploaded for verification yet.</p>
        <Link to={`/admin/admissions/applications/${id}`} className="btn-primary">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Application
        </Link>
      </div>
    );
  }

  const docUrl = currentDoc ? verificationService.downloadUrl(Number(id), currentDoc.id) : "";

  return (
    <div className="fixed inset-0 z-50 bg-[rgb(var(--bg-app))] dark:bg-ink-950 flex flex-col overflow-hidden animate-in fade-in duration-300">
      {/* Top Header */}
      <header className="h-16 shrink-0 bg-white dark:bg-ink-900 border-b border-ink-200 dark:border-ink-800 flex items-center justify-between px-6 shadow-sm z-10">
        <div className="flex items-center gap-4">
          <Link
            to={`/admin/admissions/applications/${id}`}
            className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-ink-100 dark:hover:bg-ink-800 transition-colors text-ink-500"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-lg font-black text-ink-900 dark:text-white leading-tight">
              Document Validation
            </h1>
            <p className="text-xs font-medium text-ink-500 uppercase tracking-widest">
              {app?.application_number} • {app?.first_name} {app?.last_name}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-xs text-ink-500">Document {currentIndex + 1} of {docs.length}</p>
            <div className="flex items-center gap-1 mt-1">
              {docs.map((d: any, idx: number) => (
                <div 
                  key={idx}
                  className={`h-1.5 w-6 rounded-full transition-all ${
                    idx === currentIndex 
                      ? "bg-brand w-10" 
                      : d.verification_status === "verified" 
                        ? "bg-emerald-400" 
                        : d.verification_status === "rejected"
                          ? "bg-red-400"
                          : "bg-ink-200 dark:bg-ink-700"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Pane - Document Preview */}
        <div className="flex-1 bg-ink-50 dark:bg-ink-950 p-6 flex flex-col relative">
          <div className="flex-1 bg-white dark:bg-ink-900 rounded-2xl border border-ink-200 dark:border-ink-800 shadow-sm overflow-hidden relative group">
            {currentDoc.file_mime?.startsWith("image/") ? (
              <img
                src={docUrl}
                alt={currentDoc.type_name}
                className="w-full h-full object-contain"
              />
            ) : currentDoc.file_mime === "application/pdf" ? (
              <iframe
                src={`${docUrl}#toolbar=0`}
                className="w-full h-full border-none"
                title={currentDoc.type_name}
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-ink-500">
                <FileText className="w-16 h-16 mb-4 text-ink-300" />
                <p>Preview not available for this file type.</p>
                <a href={docUrl} className="btn-secondary mt-4" target="_blank" rel="noreferrer">
                  Download File
                </a>
              </div>
            )}
            
            {/* Navigation Overlay Controls */}
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
              <button 
                className="w-10 h-10 rounded-full bg-white/90 dark:bg-ink-900/90 text-ink-700 dark:text-white shadow-lg pointer-events-auto flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-0 hover:scale-105 active:scale-95"
                onClick={() => setCurrentIndex(prev => prev - 1)}
                disabled={isFirst}
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            </div>
            <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none">
              <button 
                className="w-10 h-10 rounded-full bg-white/90 dark:bg-ink-900/90 text-ink-700 dark:text-white shadow-lg pointer-events-auto flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-0 hover:scale-105 active:scale-95"
                onClick={() => setCurrentIndex(prev => prev + 1)}
                disabled={isLast}
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </div>
          </div>
        </div>

        {/* Right Pane - Validation Controls */}
        <div className="w-96 shrink-0 bg-white dark:bg-ink-900 border-l border-ink-200 dark:border-ink-800 flex flex-col shadow-xl z-10">
          <div className="p-6 border-b border-ink-100 dark:border-ink-800 bg-brand/[0.02]">
            <h2 className="text-xl font-black text-ink-900 dark:text-white mb-2 leading-tight">
              {currentDoc.type_name}
            </h2>
            <p className="text-sm text-ink-500 font-medium">
              Filename: {currentDoc.file_original_name}
            </p>
            <p className="text-xs text-ink-400 mt-1 uppercase tracking-widest font-bold">
              Size: {Math.ceil((currentDoc.file_size || 0) / 1024)} KB
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-8">
            
            {/* Status Selection */}
            <div>
              <p className="text-xs uppercase tracking-widest font-bold text-ink-400 mb-3 flex items-center gap-2">
                <FileCheck2 className="w-4 h-4" /> Validation Status
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  className={`py-4 rounded-xl border-2 flex flex-col items-center justify-center gap-2 transition-all ${
                    status === VerificationStatus.VERIFIED
                      ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 shadow-md shadow-emerald-500/10"
                      : "border-ink-200 dark:border-ink-800 hover:border-emerald-200 text-ink-500 hover:text-emerald-600 bg-white dark:bg-ink-900"
                  } ${!canEdit ? "opacity-50 cursor-not-allowed" : ""}`}
                  onClick={() => canEdit && setStatus(VerificationStatus.VERIFIED)}
                  disabled={!canEdit}
                >
                  <CheckCircle2 className={`w-8 h-8 ${status === VerificationStatus.VERIFIED ? "text-emerald-500" : ""}`} />
                  <span className="font-bold">Approve</span>
                </button>
                <button
                  className={`py-4 rounded-xl border-2 flex flex-col items-center justify-center gap-2 transition-all ${
                    status === VerificationStatus.REJECTED
                      ? "border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 shadow-md shadow-red-500/10"
                      : "border-ink-200 dark:border-ink-800 hover:border-red-200 text-ink-500 hover:text-red-600 bg-white dark:bg-ink-900"
                  } ${!canEdit ? "opacity-50 cursor-not-allowed" : ""}`}
                  onClick={() => canEdit && setStatus(VerificationStatus.REJECTED)}
                  disabled={!canEdit}
                >
                  <XCircle className={`w-8 h-8 ${status === VerificationStatus.REJECTED ? "text-red-500" : ""}`} />
                  <span className="font-bold">Reject</span>
                </button>
              </div>
            </div>

            {/* Comment Section */}
            <div className={`transition-all duration-300 ${status ? "opacity-100" : "opacity-50 pointer-events-none"}`}>
              <p className="text-xs uppercase tracking-widest font-bold text-ink-400 mb-3 flex items-center gap-2">
                <MessageSquare className="w-4 h-4" /> 
                {status === VerificationStatus.REJECTED ? "Rejection Reason (Required)" : "Comment (Optional)"}
              </p>
              <textarea
                className={`input min-h-[120px] resize-none text-sm p-4 ${
                  status === VerificationStatus.REJECTED ? "border-red-200 focus:border-red-500 focus:ring-red-50" : ""
                } ${!canEdit ? "bg-ink-50 dark:bg-ink-800/50 cursor-not-allowed" : ""}`}
                placeholder={
                  status === VerificationStatus.REJECTED 
                    ? "Explain why this document is rejected..." 
                    : "Add any internal notes..."
                }
                value={comment}
                onChange={(e) => canEdit && setComment(e.target.value)}
                disabled={!canEdit}
              />
            </div>
            
            {/* History Info */}
            {currentDoc.verified_at && (
              <div className="bg-ink-50 dark:bg-ink-800/40 rounded-xl p-4 text-xs text-ink-500">
                <p className="font-bold text-ink-700 dark:text-ink-300 mb-1 flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Previous Validation
                </p>
                <p>
                  By: {currentDoc.verifier_name}
                </p>
                <p>
                  On: {new Date(currentDoc.verified_at).toLocaleString()}
                </p>
              </div>
            )}
            
          </div>

          <div className="p-6 border-t border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900">
            <button
              className="btn-primary w-full py-4 text-base shadow-xl shadow-brand/20 relative overflow-hidden group"
              onClick={handleSave}
              disabled={verifyDoc.isPending}
            >
              <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
              {verifyDoc.isPending ? (
                <Loader2 className="w-5 h-5 animate-spin mx-auto" />
              ) : (
                <div className="flex items-center justify-center gap-2 relative z-10">
                  {isLast ? "Save & Finish" : "Save & Next"}
                  <ChevronRight className="w-5 h-5" />
                </div>
              )}
            </button>
            
            {docs.some((d: any) => d.verification_status === VerificationStatus.REJECTED) && (
              <button
                className="btn-secondary w-full py-4 mt-3 border-red-200 text-red-600 hover:bg-red-50 flex items-center justify-center gap-2"
                onClick={() => setIsRequestChangesOpen(true)}
              >
                <AlertCircle className="w-5 h-5" />
                Request Changes
              </button>
            )}
            <div className="mt-4 text-center">
              <button 
                className="text-xs font-bold uppercase tracking-widest text-ink-400 hover:text-ink-700 transition-colors"
                onClick={() => {
                  if (isLast) navigate(`/admin/admissions/applications/${id}`);
                  else setCurrentIndex(prev => prev + 1);
                }}
              >
                {isLast ? "Skip to Finish" : "Skip Document"}
              </button>
            </div>
          </div>
        </div>
      </div>
      <RequestChangesModal 
        isOpen={isRequestChangesOpen}
        onClose={() => setIsRequestChangesOpen(false)}
        applicationId={Number(id)}
        documents={docs}
        onSuccess={requestChangesSuccess}
      />
    </div>
  );
}
