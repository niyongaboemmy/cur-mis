import { useState, useEffect } from "react";
import { X, ChevronLeft, ChevronRight, Loader2, Download, Maximize2 } from "lucide-react";
import { verificationService } from "@/services/admissionService";

interface DocumentPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  documents: any[];
  initialIndex: number;
  applicationId: number;
}

export default function DocumentPreviewModal({
  isOpen,
  onClose,
  documents,
  initialIndex,
  applicationId,
}: DocumentPreviewModalProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex, isOpen]);

  if (!isOpen) return null;

  const currentDoc = documents[currentIndex];
  if (!currentDoc) return null;

  const handlePrev = () => setCurrentIndex((prev) => (prev > 0 ? prev - 1 : documents.length - 1));
  const handleNext = () => setCurrentIndex((prev) => (prev < documents.length - 1 ? prev + 1 : 0));

  const isImage = (mime: string) => mime?.startsWith("image/");
  const isPdf = (mime: string) => mime === "application/pdf";
  const fileUrl = verificationService.downloadUrl(applicationId, currentDoc.id);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-sm animate-in fade-in duration-300">
      {/* Header */}
      <div className="absolute top-0 inset-x-0 p-6 flex items-center justify-between z-10 bg-gradient-to-b from-black/50 to-transparent">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-md">
             <Maximize2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-white font-bold text-[15px]">
              {currentDoc.document_type_name || "Document Preview"}
            </h3>
            <p className="text-white/60 text-[12px]">
              {currentIndex + 1} of {documents.length} • {currentDoc.file_original_name}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={fileUrl}
            target="_blank"
            rel="noreferrer"
            className="p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors backdrop-blur-md"
            title="Download Original"
          >
            <Download className="w-5 h-5" />
          </a>
          <button
            onClick={onClose}
            className="p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors backdrop-blur-md"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="relative w-full h-full flex items-center justify-center p-4 md:p-12 mt-16 mb-20">
        {/* Navigation Buttons */}
        <button
          onClick={handlePrev}
          className="absolute left-4 md:left-8 p-4 rounded-full bg-white/5 hover:bg-white/10 text-white transition-all backdrop-blur-sm border border-white/10"
        >
          <ChevronLeft className="w-8 h-8" />
        </button>

        <button
          onClick={handleNext}
          className="absolute right-4 md:right-8 p-4 rounded-full bg-white/5 hover:bg-white/10 text-white transition-all backdrop-blur-sm border border-white/10"
        >
          <ChevronRight className="w-8 h-8" />
        </button>

        {/* Preview Area */}
        <div className="w-full max-w-5xl h-full flex items-center justify-center relative overflow-hidden rounded-2xl border border-white/10 bg-black/40 shadow-2xl">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center z-20">
              <Loader2 className="w-12 h-12 text-white/20 animate-spin" />
            </div>
          )}

          {isImage(currentDoc.file_mime) ? (
            <img
              src={fileUrl}
              alt={currentDoc.document_type_name}
              className={`max-w-full max-h-full object-contain transition-opacity duration-500 ${loading ? 'opacity-0' : 'opacity-100'}`}
              onLoad={() => setLoading(false)}
            />
          ) : isPdf(currentDoc.file_mime) ? (
            <iframe
              src={`${fileUrl}#toolbar=0`}
              className="w-full h-full border-none bg-white rounded-lg"
              onLoad={() => setLoading(false)}
            />
          ) : (
            <div className="text-center p-12">
               <div className="w-20 h-20 rounded-3xl bg-white/5 flex items-center justify-center mx-auto mb-6">
                 <X className="w-10 h-10 text-white/20" />
               </div>
               <p className="text-white/80 font-medium mb-2">No Preview Available</p>
               <p className="text-white/40 text-sm mb-8 max-w-xs mx-auto">
                 This file format cannot be previewed in the browser.
               </p>
               <a href={fileUrl} target="_blank" rel="noreferrer" className="btn-primary bg-white text-black hover:bg-white/90">
                 Download to View
               </a>
            </div>
          )}
        </div>
      </div>

      {/* Footer / Thumbnails (Optional) */}
      <div className="absolute bottom-0 inset-x-0 p-6 bg-gradient-to-t from-black/50 to-transparent">
         <div className="flex justify-center gap-2 overflow-x-auto max-w-full pb-2 no-scrollbar">
            {documents.map((doc, idx) => (
              <button
                key={doc.id}
                onClick={() => {
                  setLoading(true);
                  setCurrentIndex(idx);
                }}
                className={`w-12 h-12 rounded-lg border-2 transition-all shrink-0 overflow-hidden ${
                  idx === currentIndex ? 'border-white scale-110' : 'border-transparent opacity-40 hover:opacity-100'
                }`}
              >
                {isImage(doc.file_mime) ? (
                  <img src={verificationService.downloadUrl(applicationId, doc.id)} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-white/10 flex items-center justify-center text-[10px] font-bold text-white uppercase">
                    {doc.document_type_name?.substring(0, 3)}
                  </div>
                )}
              </button>
            ))}
         </div>
      </div>
    </div>
  );
}
