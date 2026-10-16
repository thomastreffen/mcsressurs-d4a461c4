import { useCallback, useEffect, useRef, useState } from "react";

const PREFIX = "mcs-draft";

function buildKey(scopeParts: (string | null | undefined)[]) {
  return [PREFIX, ...scopeParts.map((p) => p ?? "none")].join(":");
}

interface Options<T> {
  /**
   * Parts that scope the draft so it never leaks between users, companies or
   * entities — always include the active user id and company id, plus the
   * entity id (or "new" for a not-yet-created record).
   */
  scopeParts: (string | null | undefined)[];
  value: T;
  /** Only autosave while this is true (e.g. once the form is actually dirty). */
  enabled: boolean;
  debounceMs?: number;
}

/**
 * Lightweight per-tab draft autosave for long forms (roles, HMS handbook,
 * incident reports, planning project/work-package data). Saves to
 * sessionStorage so a draft never survives past the browser session and
 * never mixes between companies or users, as required.
 */
export function useDraftAutosave<T>({ scopeParts, value, enabled, debounceMs = 800 }: Options<T>) {
  const key = buildKey(scopeParts);
  const [hasDraft, setHasDraft] = useState(false);

  useEffect(() => {
    try {
      setHasDraft(sessionStorage.getItem(key) != null);
    } catch {
      setHasDraft(false);
    }
    // Re-check whenever the scope (key) changes, e.g. navigating to a different entity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!enabled) return;
    const t = setTimeout(() => {
      try {
        sessionStorage.setItem(key, JSON.stringify(value));
        setHasDraft(true);
      } catch {
        // sessionStorage unavailable (private mode / quota) — fail silently, no autosave
      }
    }, debounceMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, value, enabled, debounceMs]);

  const restoreDraft = useCallback((): T | null => {
    try {
      const raw = sessionStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }, [key]);

  const clearDraft = useCallback(() => {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // ignore
    }
    setHasDraft(false);
  }, [key]);

  return { hasDraft, restoreDraft, clearDraft };
}
