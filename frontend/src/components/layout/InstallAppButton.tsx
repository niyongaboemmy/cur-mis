import { Download } from "lucide-react";
import toast from "react-hot-toast";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";

/**
 * "Install app" pill for the top bar. Renders nothing unless the browser has
 * said the app is installable and it is not already installed.
 */
export default function InstallAppButton() {
  const { canInstall, install } = useInstallPrompt();

  if (!canInstall) return null;

  const handleClick = async () => {
    const outcome = await install();
    if (outcome === "accepted") toast.success("CUR-MIS is being installed");
  };

  return (
    <button
      onClick={handleClick}
      className="hidden sm:inline-flex items-center gap-1.5 h-9 rounded-xl px-3 text-[13px] font-semibold transition-colors active:scale-95 bg-brand/10 text-brand hover:bg-brand/15 dark:bg-brand/25 dark:text-gold-400 dark:hover:bg-brand/35"
      title="Install CUR-MIS as an app on this device"
    >
      <Download className="h-4 w-4" />
      Install app
    </button>
  );
}
