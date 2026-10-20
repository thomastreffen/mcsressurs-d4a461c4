import { describe, expect, it } from "vitest";
import { groupProjectResults, mergeProjectResults, projectMatchRank } from "@/lib/project-picker";

const linked = { event_id: "test1", project_number: "1", title: "Test1", customer: "Kunde", tripletex_project_id: 101 };
const legacy = { event_id: "legacy", project_number: null, internal_number: "JOB-000001", title: "Test 60521", customer: "Kunde", tripletex_project_id: null };
const test2 = { id: 102, number: "2", name: "Test 2", isClosed: false };

describe("Deterministic project picker ranking and identity", () => {
  it("exact 60521 economic number outranks fuzzy JOB matches regardless of input order", () => {
    const rows = mergeProjectResults([legacy], [test2, { id: 103, number: "60521", name: "Tavle", isClosed: false }]);
    const groups = groupProjectResults(rows, "60521");
    expect(groups.flatMap((g) => g.rows).map((r) => r.key)).toEqual(["tt:103", "tt:102", "hub:legacy"]);
  });
  it("exact economic number precedes exact name and prefix", () => {
    const rows = mergeProjectResults([], [{ id: 1, number: "10", name: "1", isClosed: false }, { id: 2, number: "12", name: "Other", isClosed: false }, { id: 3, number: "1", name: "Test1", isClosed: false }]);
    expect(groupProjectResults(rows, "1")[0].rows.map((r) => r.key)).toEqual(["tt:3", "tt:1", "tt:2"]);
  });
  it("economic test group always precedes Hub-only results", () => {
    const groups = groupProjectResults(mergeProjectResults([legacy, linked], [test2]), "test");
    expect(groups.map((g) => g.id)).toEqual(["economic", "hub-only"]);
    expect(groups[0].rows.map((r) => r.key)).toEqual(["hub:test1", "tt:102"]);
  });
  it("active stable ID dedupes linked Hub and Tripletex search hit", () => {
    expect(mergeProjectResults([linked], [{ ...test2, id: 101 }]).map((r) => r.key)).toEqual(["hub:test1"]);
  });
  it("same name and number without stable link stay separate in different groups", () => {
    const rows = mergeProjectResults([{ ...linked, tripletex_project_id: null }], [{ id: 101, number: "1", name: "Test1", isClosed: false }]);
    expect(groupProjectResults(rows, "1").map((g) => g.rows.map((r) => r.key))).toEqual([["tt:101"], ["hub:test1"]]);
  });
  it("linked_event_id reuses a single Hub shell across repeated hits", () => {
    const hit = { ...test2, linked_event_id: "test2" };
    expect(mergeProjectResults([], [hit, hit])).toEqual([expect.objectContaining({ eventId: "test2", linked: true })]);
  });
  it("repeated stable Tripletex ID creates only one import option", () => {
    expect(mergeProjectResults([], [test2, test2])).toHaveLength(1);
  });
  it("customer matches rank after prefixes but before other search matches", () => {
    const rows = mergeProjectResults([], [{ ...test2, customer: { name: "Caverion" } }, { id: 103, number: "3", name: "Caverion tavle" }]);
    expect(rows.map((r) => projectMatchRank(r, "caverion"))).toEqual([3, 2]);
  });
  it("confirmed closed status from matching stable ID is preserved on linked Hub row", () => {
    expect(mergeProjectResults([linked], [{ id: 101, number: "1", name: "Test1", isClosed: true }])[0]).toMatchObject({ linked: true, status: "closed" });
  });
  it("Hub-only company still groups all returned parents without requiring Tripletex", () => {
    expect(groupProjectResults(mergeProjectResults([legacy], []), "1").map((g) => g.id)).toEqual(["hub-only"]);
  });
});