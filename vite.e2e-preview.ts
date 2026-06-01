import type { Plugin } from "vite";

/** Stub /api/core/health during Playwright preview so Vite never proxies to :8741. */
export function e2ePreviewCoreStub(): Plugin {
  return {
    name: "bright-vision-e2e-preview-stub",
    configurePreviewServer(server) {
      if (process.env.E2E !== "1" || process.env.E2E_LLM === "1" || process.env.E2E_INTEGRATION === "1") return;
      server.middlewares.use((req, res, next) => {
        const raw = req.url ?? "";
        if (!raw.startsWith("/api/core")) return next();
        const path = raw.replace(/^\/api\/core/, "").split("?")[0];
        if (path !== "/health") return next();
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            status: "ok",
            auth_required: false,
            versions: { bright_vision_core: "e2e", cecli: "e2e" },
          })
        );
      });
    },
  };
}
