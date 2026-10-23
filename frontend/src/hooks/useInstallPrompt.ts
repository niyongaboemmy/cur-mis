import { useCallback, useEffect, useState } from "react";

/** Chromium-only event fired when the browser considers the app installable. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isRunningInstalled(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari exposes this flag instead of the media query
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Tracks whether the browser can offer to install this app.
 *
 * `canInstall` is true only when the browser has fired `beforeinstallprompt`
 * and the app is not already running as an installed app. `install()` must be
 * called from a user click, because browsers block the prompt otherwise.
 */
export function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState<boolean>(() => isRunningInstalled());

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault(); // stop the browser's own mini-infobar; we show our button
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      setInstalled(true);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return "unavailable" as const;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null); // the event can only be used once
    return outcome;
  }, [deferred]);

  return { canInstall: !!deferred && !installed, install };
}
