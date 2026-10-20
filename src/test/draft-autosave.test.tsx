import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { peekDraft, useDraftAutosave } from "@/hooks/useDraftAutosave";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";

const scope = ["handbook", "user", "company", "book"];
beforeEach(() => { sessionStorage.clear(); vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("Draft lifecycle", () => {
  it("clearing a saved draft cancels a pending write while still mounted", () => {
    const { result } = renderHook(() => useDraftAutosave({ scopeParts: scope, value: { heading: "old" }, enabled: true }));
    act(() => result.current.clearDraft());
    act(() => vi.advanceTimersByTime(1000));
    expect(peekDraft(scope)).toBeNull();
  });
  it("saving the last handbook chapter removes its browser draft", () => {
    const { result, rerender } = renderHook(({ value }) => useDraftAutosave({ scopeParts: scope, value, enabled: Object.keys(value).length > 0 }), { initialProps: { value: { a: "edited" } as Record<string, string> } });
    act(() => vi.advanceTimersByTime(800));
    expect(peekDraft(scope)).toEqual({ a: "edited" });
    act(() => { result.current.persistDraft(null); rerender({ value: {} }); });
    act(() => vi.advanceTimersByTime(1000));
    expect(peekDraft(scope)).toBeNull();
  });
  it("partial save/reset immediately preserves only other unsaved chapters", () => {
    const { result } = renderHook(() => useDraftAutosave({ scopeParts: scope, value: { a: "saved", b: "unsaved" }, enabled: true }));
    act(() => result.current.persistDraft({ b: "unsaved" }));
    expect(peekDraft(scope)).toEqual({ b: "unsaved" });
    act(() => vi.advanceTimersByTime(1000));
    expect(peekDraft(scope)).toEqual({ b: "unsaved" });
  });
  it("disabled initial render retains a draft for restoration", () => {
    sessionStorage.setItem("mcs-draft:" + scope.join(":"), JSON.stringify({ a: "recover" }));
    const { result } = renderHook(() => useDraftAutosave({ scopeParts: scope, value: {}, enabled: false }));
    expect(result.current.restoreDraft()).toEqual({ a: "recover" });
  });
  it("declined cancel preserves draft; confirmed discard deletes it", () => {
    const navigate = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { result } = renderHook(() => {
      const draft = useDraftAutosave({ scopeParts: scope, value: { name: "discard" }, enabled: true });
      const guard = useUnsavedChangesGuard(true);
      return { ...draft, cancel: () => guard.confirmNavigation(() => { draft.clearDraft(); navigate(); }) };
    });
    act(() => vi.advanceTimersByTime(800));
    act(() => result.current.cancel());
    expect(peekDraft(scope)).toEqual({ name: "discard" });
    expect(navigate).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    act(() => result.current.cancel());
    expect(peekDraft(scope)).toBeNull();
    expect(navigate).toHaveBeenCalledOnce();
  });
  it("clearing one scope leaves another user's draft untouched", () => {
    sessionStorage.setItem("mcs-draft:other:user:company", '{"name":"keep"}');
    const { result } = renderHook(() => useDraftAutosave({ scopeParts: scope, value: {}, enabled: false }));
    act(() => result.current.clearDraft());
    expect(peekDraft(["other", "user", "company"])).toEqual({ name: "keep" });
  });
});