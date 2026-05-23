import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST || "localhost";

export default defineConfig(async () => ({
  plugins: [react()],

  clearScreen: false,

  server: {
    strictPort: true,
    host: host || false,
    port: 1420,
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
}));
