import { useRef, useState } from "react";
import { CheckCircle2, FileUp, Trash2, AlertCircle } from "lucide-react";
import type { RequiredAttachment } from "@/types/serviceRequest";

interface Props {
  attachment: RequiredAttachment;
  file?: File;
  onChange: (file: File | null) => void;
}

function extOf(name: string) {
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i + 1).toLowerCase();
}

/** Validate a picked file against the attachment's declared mime/size rules before it's ever uploaded. */
function validate(file: File, attachment: RequiredAttachment): string | null {
  const allowed = attachment.mime_types.map((t) => t.toLowerCase());
  if (allowed.length > 0) {
    const ext = extOf(file.name);
    const typeMatches = allowed.some(
      (t) => file.type.toLowerCase() === t || t === ext || t === `.${ext}`,
    );
    if (!typeMatches) {
      return `Unsupported file type. Accepted: ${attachment.mime_types.join(", ")}`;
    }
  }
  if (attachment.max_size_kb && file.size > attachment.max_size_kb * 1024) {
    const maxMb = (attachment.max_size_kb / 1024).toFixed(1);
    return `File is too large. Maximum size is ${maxMb} MB.`;
  }
  return null;
}

export default function FileDropzone({ attachment, file, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const acceptAttr = attachment.mime_types
    .map((t) => (t.startsWith(".") || t.includes("/") ? t : `.${t}`))
    .join(",");

  const handleFile = (picked: File | undefined | null) => {
    if (!picked) {
      onChange(null);
      setError(null);
      return;
    }
    const err = validate(picked, attachment);
    if (err) {
      setError(err);
      onChange(null);
      return;
    }
    setError(null);
    onChange(picked);
  };

  return (
    <div>
      <label className="text-[13px] font-medium text-ink-700 dark:text-ink-200 flex items-center gap-1">
        {attachment.label} {attachment.required && <span className="text-red-500">*</span>}
      </label>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFile(e.dataTransfer.files?.[0]);
        }}
        onClick={() => inputRef.current?.click()}
        className={`mt-1 rounded-xl border-2 border-dashed p-4 cursor-pointer transition-colors ${
          error
            ? "border-red-300 bg-red-50/50 dark:bg-red-900/10"
            : file
            ? "border-emerald-300 bg-emerald-50/50 dark:bg-emerald-900/10"
            : dragOver
            ? "border-brand bg-brand/5"
            : "border-ink-200 dark:border-ink-700 hover:border-brand/50 hover:bg-slate-50 dark:hover:bg-ink-800/40"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={acceptAttr}
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />

        {file ? (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <span className="text-[13px] text-ink-700 dark:text-ink-200 truncate">{file.name}</span>
              <span className="text-[11px] text-ink-400 shrink-0">{(file.size / 1024).toFixed(0)} KB</span>
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleFile(null); if (inputRef.current) inputRef.current.value = ""; }}
              className="text-ink-400 hover:text-red-500 shrink-0"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-ink-400">
            <FileUp className="w-4 h-4 shrink-0" />
            <span className="text-[13px]">
              Drag & drop or <span className="text-brand font-medium">browse</span>
            </span>
          </div>
        )}
      </div>

      <p className="text-[11px] text-ink-400 mt-1">
        {attachment.mime_types.length > 0 && `${attachment.mime_types.join(", ").toUpperCase()} · `}
        Max {(attachment.max_size_kb / 1024).toFixed(1)} MB
      </p>

      {error && (
        <p className="text-[12px] text-red-600 dark:text-red-400 mt-1 flex items-center gap-1">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
        </p>
      )}
    </div>
  );
}
