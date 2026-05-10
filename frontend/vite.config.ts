import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig(({ mode }) => {
  // Load ALL env vars (prefix '' = include non-VITE_ ones like MAMP_PORT)
  const env = loadEnv(mode, process.cwd(), "");
  const mampPort = env.MAMP_PORT ?? "8888";
  // In production set VITE_BASE_PATH=/umis/ so all assets are rooted there.
  // In dev, leave blank or set to / — Vite defaults to /.
  const basePath = env.VITE_BASE_PATH
    ? env.VITE_BASE_PATH.replace(/\/?$/, "/")
    : "/";

  return {
    base: basePath,
    plugins: [react()],

    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },

    server: {
      port: 5173,
      proxy: {
        "/api": {
          // In dev, Vite proxies /api/* to the local PHP backend.
          // MAMP default port is 8888. If your MAMP runs on port 80, set MAMP_PORT=80 in .env
          target: `http://localhost:${mampPort}/cur-mis/backend/public`,
          changeOrigin: true,
          secure: false,
        },
      },
    },

    build: {
      outDir: "dist",
      emptyOutDir: true,
      // No manualChunks — bundle everything into one JS file.
      // Eliminates "Failed to fetch dynamically imported module" errors on
      // servers (cPanel) that cannot reliably serve many small chunk files.
    },
  };
});
