import { createRoot } from "react-dom/client";
import "./index.css";
import { handleFreshResetIfRequested, invalidateLegacyHmsStorage } from "./pwa/freshReset";

async function bootstrap() {
  // Must run before React and before service-worker registration so ?fresh=1
  // cannot mount an old app shell or hydrate stale route chunks.
  if (await handleFreshResetIfRequested()) return;
  invalidateLegacyHmsStorage();

  let modules;
  try {
    modules = await Promise.all([
      import("./App.tsx"),
      import("./components/ErrorBoundary.tsx"),
      import("./pwa/registerSW"),
      import("./pwa/chunkErrorRecovery"),
      import("./pwa/buildVersion"),
      import("react-helmet-async"),
    ]);
  } catch (err) {
    // A failed dynamic import is cached by the browser for this page load, so
    // the only recovery is a fresh navigation. Reload once, then surface error.
    const KEY = "mcs:boot-import-retry";
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last > 30_000) {
      sessionStorage.setItem(KEY, String(Date.now()));
      window.location.reload();
      return;
    }
    console.error("[bootstrap] failed to load app modules", err);
    const root = document.getElementById("root");
    if (root) {
      root.innerHTML =
        '<div style="font-family:system-ui;padding:2rem;text-align:center">Kunne ikke laste MCS Hub. <a href="" onclick="location.reload();return false">Last inn på nytt</a></div>';
    }
    return;
  }
  const [{ default: App }, { ErrorBoundary }, { isStandalone, registerServiceWorker }, { installChunkErrorRecovery }, { APP_VERSION, APP_BUILD_TIME, APP_COMMIT }, { HelmetProvider }] = modules;

  console.info("[app-version]", { version: APP_VERSION, commit: APP_COMMIT, builtAt: APP_BUILD_TIME });

  if (isStandalone()) {
    document.body.classList.add("pwa-standalone");
  }
  installChunkErrorRecovery();
  registerServiceWorker();

  createRoot(document.getElementById("root")!).render(
    <ErrorBoundary>
      <HelmetProvider>
        <App />
      </HelmetProvider>
    </ErrorBoundary>,
  );
}

void bootstrap();
