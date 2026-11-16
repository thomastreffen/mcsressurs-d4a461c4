import { beforeEach, expect, it, vi } from "vitest";
const invoke = vi.hoisted(() => vi.fn());
const warning = vi.hoisted(() => vi.fn());
vi.mock("../lib/invoke-session", () => ({ invokeWithSession: invoke }));
vi.mock("sonner", () => ({ toast: { warning } }));
import { notifyJobAssignment, notifyJobTimeChange } from "../lib/notify-job-assignment";
beforeEach(() => { invoke.mockReset(); warning.mockReset(); invoke.mockResolvedValue({ data: { results: [{ emailSent: true }] }, error: null }); });
it("informational assignment notifies only explicitly assigned recipients without requiring response", async () => {
  expect(await notifyJobAssignment("job", ["a", "b"], false)).toBe(true);
  expect(invoke).toHaveBeenCalledExactlyOnceWith("create-approval", { body: { job_id: "job", technician_ids: ["a", "b"], response_required: false } });
});
it("time changes target only the changed recipient and never resend automatically after failure", async () => {
  invoke.mockResolvedValue({ error: { message: "401" } });
  await notifyJobTimeChange("job", ["a"], new Date("2026-11-19T05:00:00Z"), new Date("2026-11-19T13:00:00Z"));
  expect(invoke).toHaveBeenCalledTimes(1); expect(invoke.mock.calls[0][1].body.technician_ids).toEqual(["a"]); expect(warning).toHaveBeenCalledTimes(1);
});
it("empty recipient scope sends nothing", async () => {
  await notifyJobTimeChange("job", [], new Date(), new Date()); expect(invoke).not.toHaveBeenCalled();
});