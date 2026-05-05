import { ExternalLink, Download } from "lucide-react";
import Modal from "./Modal";

interface DocumentPreviewModalProps {
  open: boolean;
  onClose: () => void;
  url: string;
  title: string;
  mimeType?: string;
}

export default function DocumentPreviewModal({
  open,
  onClose,
  url,
  title,
  mimeType,
}: DocumentPreviewModalProps) {
  // Determine if we can show it as an image or a PDF directly. Anything
  // else falls back to a generic iframe — modern browsers render both PDFs
  // and images inline as long as the server responds with the matching
  // Content-Type and `Content-Disposition: inline`, which our backend does
  // for payment slips and uploaded documents.
  const isImage =
    mimeType?.startsWith("image/") || url.match(/\.(jpg|jpeg|png|webp|gif)$/i);
  const isPDF = mimeType === "application/pdf" || url.match(/\.pdf$/i);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="xl"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="text-[11px] text-ink-400">Preview Mode</div>
          <div className="flex gap-2">
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary btn-sm"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Open Original
            </a>
            <a href={url} download className="btn-primary btn-sm">
              <Download className="w-3.5 h-3.5" /> Download
            </a>
          </div>
        </div>
      }
    >
      <div className="relative min-h-[400px] max-h-[70vh] flex items-center justify-center bg-ink-50 dark:bg-ink-950 rounded-xl overflow-hidden">
        {isImage ? (
          <img
            src={url}
            alt={title}
            className="max-w-full max-h-full object-contain shadow-2xl"
          />
        ) : isPDF ? (
          <iframe
            src={`${url}#toolbar=0`}
            className="w-full h-[600px] border-0"
            title={title}
          />
        ) : (
          <iframe
            src={url}
            className="w-full h-[600px] border-0 bg-white"
            title={title}
          />
        )}
      </div>
    </Modal>
  );
}
