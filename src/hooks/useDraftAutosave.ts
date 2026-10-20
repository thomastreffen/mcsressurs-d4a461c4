import { useCallback, useEffect, useRef, useState } from "react";

const PREFIX = "mcs-draft";

function buildKey(scopeParts: (string | null | undefined)[]) {
  return [PREFIX, ...scopeParts.map((p) => p ?? "none")].join(":");
}

/** Read a draft without mounting the hook — use before opening an editor to decide whether to offer a restore. */
export function peekDraft<T>(scopeParts: (string | null | undefined)[]): T | null {
  try {
    const raw = sessionStorage.getItem(buildKey(scopeParts));
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Remove a draft by scope without mounting the hook — use right after a successful save. */
export function clearDraftByScope(scopeParts: (string | null | undefined)[]) {
  try {
    sessionStorage.removeItem(buildKey(scopeParts));
  } catch {
    // ignore
  }
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
  const pendingWrite = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelPendingWrite = useCallback(() => {
    if (pendingWrite.current !== null) clearTimeout(pendingWrite.current);
    pendingWrite.current = null;
  }, []);

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
    pendingWrite.current = setTimeout(() => {
      pendingWrite.current = null;
      try {
        sessionStorage.setItem(key, JSON.stringify(value));
        setHasDraft(true);
      } catch {
        // sessionStorage unavailable (private mode / quota) — fail silently, no autosave
      }
    }, debounceMs);
    return cancelPendingWrite;
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

  const persistDraft = useCallback((remaining: T | null) => {
    cancelPendingWrite();
    try {
      if (remaining === null) sessionStorage.removeItem(key);
      else sessionStorage.setItem(key, JSON.stringify(remaining));
    } catch {
      // ignore
    }
    setHasDraft(remaining !== null);
  }, [key, cancelPendingWrite]);

  const clearDraft = useCallback(() => persistDraft(null), [persistDraft]);

  return { hasDraft, restoreDraft, clearDraft, persistDraft };
}
