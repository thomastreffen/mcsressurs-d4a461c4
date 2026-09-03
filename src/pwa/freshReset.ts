const APP_SW_PATHS = ["/sw.js", "/service-worker.js"];
const HMS_CACHE_SCHEMA_KEY = "mcs-hms-cache-schema";
const HMS_CACHE_SCHEMA_VERSION = "2026-09-hms-package-v1";
const HMS_STORAGE_PREFIXES = ["hms-", "handbook-", "chemical-", "readiness-"];

/**
 * React Query is memory-only in this app, but remove any legacy persisted HMS
 * payloads whenever the HMS package schema changes. Authentication and active
 * company selection are deliberately preserved.
 */
export function invalidateLegacyHmsStorage() {
  if (typeof window === "undefined") return;
  try {
    if (localStorage.getItem(HMS_CACHE_SCHEMA_KEY) === HMS_CACHE_SCHEMA_VERSION) return;
    for (const storage of [localStorage, sessionStorage]) {
      const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(
        (key): key is string => Boolean(key),
      );
      for (const key of keys) {
        if (HMS_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))) storage.removeItem(key);
      }
    }
    localStorage.setItem(HMS_CACHE_SCHEMA_KEY, HMS_CACHE_SCHEMA_VERSION);
  } catch {
    // Storage can be unavailable in restricted/private browser contexts.
  }
}

function cleanUrlWithoutResetParam(): string {
  const params = new URLSearchParams(window.location.search);
  params.delete("fresh");
  params.delete("sw");
  const search = params.toString();
  return window.location.pathname + (search ? `?${search}` : "") + window.location.hash;
}

function registrationScriptPath(registration: ServiceWorkerRegistration): string {
  const scriptURL =
    registration.active?.scriptURL ||
    registration.installing?.scriptURL ||
    registration.waiting?.scriptURL ||
    "";
  try {
    return new URL(scriptURL).pathname;
  } catch {
    return scriptURL;
  }
}

export async function getAppServiceWorkerRegistrations(): Promise<ServiceWorkerRegistration[]> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return [];
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    return registrations.filter((registration) =>
      APP_SW_PATHS.some((path) => registrationScriptPath(registration).endsWith(path)),
    );
  } catch {
    return [];
  }
}

export async function unregisterAppServiceWorkers() {
  const registrations = await getAppServiceWorkerRegistrations();
  await Promise.allSettled(registrations.map((registration) => registration.unregister()));
}

export async function clearAppCachesAndUnregister() {
  if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.allSettled(registrations.map((registration) => registration.unregister()));
  }

  if (typeof caches !== "undefined") {
    const cacheNames = await caches.keys();
    await Promise.allSettled(cacheNames.map((cacheName) => caches.delete(cacheName)));
  }
}

export async function handleFreshResetIfRequested(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  const resetRequested = params.get("fresh") === "1" || params.get("sw") === "off";
  if (!resetRequested) return false;

  await clearAppCachesAndUnregister();
  window.location.replace(cleanUrlWithoutResetParam());
  return true;
}