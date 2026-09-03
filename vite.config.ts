import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

const APP_BUILD_TIME = new Date().toISOString();
const APP_COMMIT =
  process.env.LOVABLE_GIT_COMMIT_SHA?.slice(0, 7) ||
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ||
  process.env.GITHUB_SHA?.slice(0, 7) ||
  process.env.COMMIT_SHA?.slice(0, 7) ||
  "not-available";
const APP_VERSION =
  process.env.VITE_APP_VERSION ||
  process.env.LOVABLE_BUILD_ID ||
  APP_COMMIT !== "not-available" ? APP_COMMIT :
  APP_BUILD_TIME;

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __APP_BUILD_TIME__: JSON.stringify(APP_BUILD_TIME),
    __APP_COMMIT__: JSON.stringify(APP_COMMIT),
  },
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      // Temporarily retire offline frontend caching. Preview never registered
      // the worker, while production did, which allowed old app shells to
      // survive deployments. The generated worker unregisters itself, clears
      // its caches and reloads every controlled tab once.
      selfDestroying: true,
      injectRegister: null,
      filename: "sw.js",
      devOptions: { enabled: false },
      manifest: false,
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
