import { renderHook, waitFor, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ filters: [] as unknown[][], user: { id: "login-id" } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
  const q: any = { select: () => q, eq: () => q, in: (key: string, ids: string[]) => { mocks.filters.push([table,key,ids]); return q; }, is: () => q, gte: () => q, lte: () => q, order: () => q,
    maybeSingle: async () => ({ data: { person_id: "person-id" }, error: null }),
    then: (resolve: any) => Promise.resolve({ data: table === "technicians" ? [{ id: "different-technician-id" }] : [], error: null }).then(resolve) };
  return q;
} } }));
import { useMyDay } from "../hooks/useMyDay";
afterEach(() => { cleanup(); mocks.filters.length=0; });
it("own day queries real technician identity for today and upcoming, never assumes person UUID", async () => {
  const { result } = renderHook(() => useMyDay());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.error).toBeNull();
  expect(mocks.filters).toEqual([["schedule_blocks","technician_id",["different-technician-id"]],["schedule_blocks","technician_id",["different-technician-id"]]]);
});