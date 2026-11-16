// @vitest-environment node
import { describe, expect, it } from "vitest";
import { jobInfoFailure } from "../lib/job-info-error";
describe("Job read errors preserve their category", () => {
  it("expired standalone session needs login", async () => {
    expect((await jobInfoFailure({ context: new Response("{}", { status: 401 }) })).login).toBe(true);
    expect((await jobInfoFailure(new Error("Innloggingen er utløpt. Logg inn på nytt."))).login).toBe(true);
  });
  it("server unavailability is not an authorization denial", async () => {
    expect((await jobInfoFailure({ context: new Response("{}", { status: 500 }) })).login).toBe(false);
    expect((await jobInfoFailure({ context: new Response("{}", { status: 500 }) })).message).toContain("Dette betyr ikke");
  });
  it("network failure is not an authorization denial", async () => {
    expect((await jobInfoFailure(new Error("Failed to fetch"))).message).toContain("Dette betyr ikke");
  });
  it("only explicit denied response is classified unavailable", async () => {
    expect((await jobInfoFailure({ context: new Response(JSON.stringify({ code: "job_unavailable" }), { status: 403 }) })).message).toContain("denne kontoen");
  });
});