/**
 * Registers the service worker in production builds only.
 *
 * Dev servers (Vite HMR) and service workers fight each other: a cached
 * shell hides edits, so we skip registration outside `import.meta.env.PROD`.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (!("serviceWorker" in navigator)) return;

  // BASE_URL is "/" locally and "/umis/" in production, so the worker and its
  // scope follow the sub-folder the app is deployed under.
  const base = import.meta.env.BASE_URL;

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${base}sw.js`, { scope: base })
      .catch((err) => console.warn("Service worker registration failed:", err));
  });
}
