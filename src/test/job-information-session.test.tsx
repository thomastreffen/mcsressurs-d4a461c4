import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { JobInformation } from "../pages/JobInformationPage";
const mocks = vi.hoisted(() => ({ session: null as null | { user: { id: string } }, invoke: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ session: mocks.session, loading: false }) }));
vi.mock("@/lib/invoke-session", () => ({ invokeWithSession: mocks.invoke }));
const id = "0ecc7c59-c231-4102-8f0c-91d2091172e8";
const open = () => render(<MemoryRouter><JobInformation eventId={id} /></MemoryRouter>);
beforeEach(() => { mocks.session = null; mocks.invoke.mockReset(); });
afterEach(cleanup);
describe("Job deep-link session flow", () => {
  it("signed out opens same job after login, without invoking authenticated read", () => {
    open();
    const links = screen.getAllByRole("link");
    expect(links.some(link => link.getAttribute("href") === `/login?next=${encodeURIComponent(`/job-info/${id}`)}`)).toBe(true);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
  it("expired standalone bearer preserves exact job on login", async () => {
    mocks.session = { user: { id: "isolated" } };
    mocks.invoke.mockResolvedValue({ data: null, error: { context: new Response("{}", { status: 401 }) } });
    open();
    await screen.findByRole("alert");
    expect(screen.getAllByRole("link").some(link => link.getAttribute("href") === `/login?next=${encodeURIComponent(`/job-info/${id}`)}`)).toBe(true);
  });
  it("transport exception settles and retry only re-reads same job", async () => {
    mocks.session = { user: { id: "isolated" } };
    mocks.invoke.mockRejectedValueOnce(new Error("Failed to fetch"));
    mocks.invoke.mockResolvedValueOnce({ data: { brief: { jobNumber: "60570", title: "Isolated" }, status: "rejected", start: "2026-11-19T07:00:00Z", end: "2026-11-19T15:00:00Z", files: [] }, error: null });
    open(); await screen.findByRole("alert");
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(2));
    for (const call of mocks.invoke.mock.calls) expect(call).toEqual(["job-access", { body: { action: "read", event_id: id } }]);
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });
});