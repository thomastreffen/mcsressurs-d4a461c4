import { describe, expect, it, vi } from "vitest";
import { matchesProjectSearch, rankProjectSearch } from "../../supabase/functions/_shared/project-search";
import { searchTripletexProjects } from "../../supabase/functions/_shared/tripletex-project-search";
import { groupProjectResults, mergeProjectResults } from "@/lib/project-picker";

describe("Discovery normalization never changes project identity", () => {
  it.each([
    ["Test1", "test 1"], ["Test 1", "test1"], ["Test1", "test-1"],
    ["Test1", "TEST 1"], ["Test.1", "test1"], ["Test/1", "Test 1"],
  ])("finds stored %s with query %s", (name, query) => {
    expect(matchesProjectSearch([name], query)).toBe(true);
    expect(rankProjectSearch("60488", name, null, query)).toBe(1);
  });
  it("requires every token but lets them match across number, name, customer and org", () => {
    const fields = ["60521", "Tavle", "MCS Service", "123 456 789"];
    expect(matchesProjectSearch(fields, "service 60521 tavle 123456789")).toBe(true);
    expect(matchesProjectSearch(fields, "service 60521 ukjent")).toBe(false);
  });
  it("exact economic project number remains first", () => {
    const rows = mergeProjectResults([], [{ id: 1, number: "99", name: "60521" }, { id: 2, number: "60521", name: "Tavle" }]);
    expect(groupProjectResults(rows, "60521")[0].rows.map((r) => r.key)).toEqual(["tt:2", "tt:1"]);
  });
  it("normalized same number/name never merges or links Hub-only projects", () => {
    const hub = { event_id: "legacy", project_number: "1", title: "Test1", customer: null, tripletex_project_id: null };
    const hits = [{ id: 101, number: "1", name: "Test 1", isClosed: false }];
    expect(matchesProjectSearch([hub.title], "test 1")).toBe(true);
    expect(mergeProjectResults([hub], hits)).toMatchObject([{ key: "hub:legacy", linked: false }, { key: "tt:101", tripletexId: 101 }]);
  });
  it("Test1 linked and Test 2 Tripletex-only stay identified by distinct stable IDs", () => {
    const rows = mergeProjectResults([{ event_id: "test1", project_number: "1", title: "Test1", customer: null, tripletex_project_id: 101 }],
      [{ id: 101, number: "1", name: "Test 1", isClosed: false, linked_event_id: "test1" }, { id: 102, number: "2", name: "Test 2", isClosed: false }]);
    expect(rows).toMatchObject([{ key: "hub:test1", eventId: "test1", linked: true }, { key: "tt:102", tripletexId: 102 }]);
    expect(groupProjectResults(rows, "test")[0].rows).toHaveLength(2);
  });
});

describe("Tripletex search retrieves candidates before local filtering", () => {
  const projects = [{ id: 101, number: "1", name: "Test 1", isClosed: false, customer: { id: 5, name: "MCS", organizationNumber: "123456789" } }, { id: 102, number: "2", name: "Test 2", isClosed: false }];
  it.each(["test1", "test 1", "test-1", "TEST 1", "MCS 1 123-456-789"])("finds API project for %s without literal name filter or business-write", async (query) => {
    const call = vi.fn().mockResolvedValue({ r: { ok: true }, b: { values: projects } });
    expect((await searchTripletexProjects(call, query, false, "id,number,name")).map((p) => p.id)).toEqual([101]);
    expect(call).toHaveBeenCalledExactlyOnceWith("GET", "/project?from=0&count=1000&isClosed=false&fields=id,number,name");
  });
  it("pages before matching so hits beyond the first page are not lost", async () => {
    const call = vi.fn().mockResolvedValueOnce({ r: { ok: true }, b: { values: Array.from({ length: 1000 }, (_, id) => ({ id, number: "99", name: "Other" })) } })
      .mockResolvedValueOnce({ r: { ok: true }, b: { values: projects } });
    expect((await searchTripletexProjects(call, "test1", true, "id")).map((p) => p.id)).toEqual([101]);
    expect(call).toHaveBeenLastCalledWith("GET", "/project?from=1000&count=1000&fields=id");
  });
  it("read failure cannot return unverified candidates", async () => {
    const call = vi.fn().mockResolvedValue({ r: { ok: false, status: 500 }, b: {} });
    await expect(searchTripletexProjects(call, "test1", false, "id")).rejects.toThrow("search 500");
  });
});