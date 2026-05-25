import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST || "localhost";

export default defineConfig(async () => ({
  plugins: [react()],
  define: {
    'import.meta.env.E2E': JSON.stringify(process.env.E2E === '1'),
  },

  clearScreen: false,

  server: {
    strictPort: true,
    host: host || false,
    port: 1420,
    proxy: {
      "/api/core": {
        target: "http://127.0.0.1:8741",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/core/, ""),
      },
    },
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  preview: process.env.E2E
    ? {}
    : {
        proxy: {
          "/api/core": {
            target: "http://127.0.0.1:8741",
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/api\/core/, ""),
          },
        },
      },
}));
