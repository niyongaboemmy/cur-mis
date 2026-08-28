import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig(({ mode }) => {
  // Load ALL env vars (prefix '' = include non-VITE_ ones)
  const env = loadEnv(mode, process.cwd(), "");
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
      port: 5180,
      // Bind to 0.0.0.0 so other devices on the same LAN can reach the dev
      // server (e.g. http://<your-LAN-IP>:5180). The /api proxy below still
      // runs on this machine and forwards to the PHP dev backend server.
      host: true,
      proxy: {
        "/api": {
          // Proxy to PHP dev server running on port 9000
          // Start with: php backend-dev-server.php
          target: `http://localhost:9000`,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path,
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
