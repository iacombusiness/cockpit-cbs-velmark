// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only), VITE_* env injection, @ path alias, React/TanStack dedupe, error logger
//     plugins, and sandbox detection (port/host/strictPort).
// Demonstração: build estático (SPA) servido por um servidor de arquivos comum (Caddy), sem
// servidor de aplicação. A saída fica em .output/public.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Caminho onde o site fica no ar. Padrão: a raiz. Para publicar num subcaminho (na VPS, /cockpit-cbs/):
//   CAMINHO_BASE=/cockpit-cbs/ bun run build
const base = process.env["CAMINHO_BASE"] ?? "/";

export default defineConfig({
  vite: { base },
  tanstackStart: {
    spa: { enabled: true },
    server: { entry: "server" },
  },
});
