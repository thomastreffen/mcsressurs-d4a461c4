import { useEffect } from "react";

/**
 * Dev-only mount/unmount tracer used to verify that the app shell does not
 * remount when the browser tab regains focus. No-op in production builds.
 */
export function useMountLog(mountLabel: string, unmountLabel?: string) {
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.info(`[mount] ${mountLabel}`);
    return () => {
      if (unmountLabel) console.info(`[mount] ${unmountLabel}`);
    };
  }, [mountLabel, unmountLabel]);
}

export function MountProbe({ mount, unmount }: { mount: string; unmount?: string }) {
  useMountLog(mount, unmount);
  return null;
}
