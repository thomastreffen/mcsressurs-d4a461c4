import { useEffect, useCallback } from "react";

const DEFAULT_MESSAGE = "Du har endringer som ikke er lagret. Vil du forlate siden?";

/**
 * Warns the user before unsaved form work is lost — but ONLY on an actual
 * attempt to leave: closing the tab, reloading, typing a new URL, or an
 * explicit in-app navigation wrapped with `confirmNavigation`.
 *
 * This must never fire just because the browser tab loses focus or the user
 * switches to another tab — `beforeunload` already only fires on real unload,
 * and `confirmNavigation` is only called from explicit navigation actions
 * (back/cancel buttons, breadcrumbs), never from focus/visibility events.
 */
export function useUnsavedChangesGuard(isDirty: boolean, message: string = DEFAULT_MESSAGE) {
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = message;
      return message;
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty, message]);

  /** Wrap an explicit navigation action (e.g. navigate(-1)) with this. */
  const confirmNavigation = useCallback(
    (action: () => void) => {
      if (!isDirty || window.confirm(message)) {
        action();
      }
    },
    [isDirty, message]
  );

  return { confirmNavigation };
}
