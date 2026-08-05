// This config is provided by the vite-tanstack-config package. It already wires
// up TanStack Start devtools (dev-only), the TanStack plugin, React, Tailwind,
// tsconfig paths, Nitro (build-only, Cloudflare as default target), VITE_* env
// injection, the @ path alias, React/TanStack dedupe and error logger plugins.
// Do NOT add those plugins manually or the app will break with duplicates.
// Extra Vite config can be passed via defineConfig({ vite: { ... }, ... }).
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    server: {
      // Pinned so WEBAUTHN_ORIGIN on the backend (http://localhost:5173) always matches.
      port: 5173,
      strictPort: true,
    },
  },
});
