import { ExternalLink, Download, Loader2 } from "lucide-react";
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
  // Determine if we can show it in an iframe or img
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
          <div className="text-center p-12">
            <div className="w-16 h-16 rounded-full bg-ink-100 dark:bg-ink-800 flex items-center justify-center mx-auto mb-4">
              <Loader2 className="w-8 h-8 text-ink-400 animate-spin" />
            </div>
            <p className="text-[14px] text-ink-600 dark:text-ink-400">
              Document preview not available for this file type.
            </p>
            <a
              href={url}
              target="_blank"
              className="text-primary-600 font-bold mt-2 inline-block hover:underline"
            >
              Download to View
            </a>
          </div>
        )}
      </div>
    </Modal>
  );
}
