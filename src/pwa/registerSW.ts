// Guarded service worker registration via vite-plugin-pwa's virtual module.
// Provides:
//   - safe refusal in dev / Lovable preview / iframes / ?sw=off
//   - ?fresh=1 hard-reset (unregister SW + delete caches + reload clean)
//   - update-available pub/sub for the UpdateNotifier UI
//   - manual "check for update" and "clear all caches" helpers
//   - one-shot stale-chunk reload (handled in chunkErrorRecovery)

import {
  getAppServiceWorkerRegistrations,
  handleFreshResetIfRequested,
  unregisterAppServiceWorkers,
} from "./freshReset";
export { clearAppCachesAndUnregister } from "./freshReset";

type UpdateListener = (state: { needRefresh: boolean; offlineReady: boolean }) => void;
let needRefresh = false;
let offlineReady = false;
const updateListeners = new Set<UpdateListener>();
let updateSW: ((reloadPage?: boolean) => Promise<void>) | null = null;
let currentRegistration: ServiceWorkerRegistration | undefined;

function emit() {
  const state = { needRefresh, offlineReady };
  updateListeners.forEach((l) => {
    try {
      l(state);
    } catch {
      /* noop */
    }
  });
}

export function onUpdateState(l: UpdateListener): () => void {
  updateListeners.add(l);
  // Replay current state.
  l({ needRefresh, offlineReady });
  return () => {
    updateListeners.delete(l);
  };
}

export function getUpdateState() {
  return { needRefresh, offlineReady };
}

function shouldRefuse(): boolean {
  if (typeof window === "undefined") return true;
  if (!import.meta.env.PROD) return true;
  try {
    if (window.self !== window.top) return true;
  } catch {
    return true;
  }
  const host = window.location.hostname;
  if (
    host.startsWith("id-preview--") ||
    host.startsWith("preview--") ||
    host === "lovableproject.com" ||
    host.endsWith(".lovableproject.com") ||
    host === "lovableproject-dev.com" ||
    host.endsWith(".lovableproject-dev.com") ||
    host === "beta.lovable.dev" ||
    host.endsWith(".beta.lovable.dev")
  ) {
    return true;
  }
  const params = new URLSearchParams(window.location.search);
  if (params.get("sw") === "off") return true;
  return false;
}

async function handleFreshQuery(): Promise<boolean> {
  return handleFreshResetIfRequested();
}

export function registerServiceWorker() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  // ?fresh=1 — emergency reset, then reload clean.
  void handleFreshQuery().then((handled) => {
    if (handled) return;

    if (shouldRefuse()) {
      void unregisterAppServiceWorkers();
      return;
    }

    // Manifest-only home-screen support. Existing app-shell workers receive
    // the same-path kill switch; never register a new app-shell worker.
    void getAppServiceWorkerRegistrations().then(registrations => {
      void Promise.allSettled(registrations.map(registration => registration.update()));
    });
  });
}

export async function checkForUpdate(): Promise<boolean> {
  if (!currentRegistration) {
    const regs = await getAppServiceWorkerRegistrations();
    currentRegistration = regs[0];
  }
  if (!currentRegistration) return false;
  try {
    await currentRegistration.update();
    return true;
  } catch {
    return false;
  }
}

export async function applyUpdateAndReload() {
  if (updateSW) {
    try {
      await updateSW(true);
      return;
    } catch {
      /* fall through */
    }
  }
  window.location.reload();
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const mq = window.matchMedia?.("(display-mode: standalone)").matches;
  const iosStandalone =
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  return Boolean(mq || iosStandalone);
}

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;
}
