import { useState } from "react";
import Modal from "@/components/ui/Modal";

export default function DocumentGenerationPage() {
  const [open, setOpen] = useState(false);

  return (
    <div className="p-6 max-w-7xl mx-auto flex items-center justify-center min-h-[calc(100vh-200px)]">
      <div className="card card-pad w-full max-w-md text-center space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-ink-900 dark:text-white">
            Official Documents
          </h1>
          <p className="text-sm text-ink-400">
            Generate and download official CUR documents.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="btn btn-primary w-full py-3 text-base font-semibold flex items-center justify-center gap-2"
        >
          Generate Official Documents
        </button>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Generate Official Documents"
        size="full"
        className="w-[95vw] left-[2.5%] right-[2.5%] h-[100vh]"
      >
        <div className="w-full h-full flex flex-col">
          <iframe
            src="https://cur.ac.rw/umis/documents/"
            title="CUR Documents Portal"
            className="w-full h-full flex-1 border-0"
            style={{ minHeight: "calc(100vh - 200px)" }}
          />
        </div>
      </Modal>
    </div>
  );
}
