import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import HubHome from "../pages/public/HubHome";
const mock = vi.hoisted(() => ({ session: null as null | { user: { id: string } }, oauth: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ session: mock.session, loading: false }) }));
vi.mock("@/integrations/lovable", () => ({ lovable: { auth: { signInWithOAuth: mock.oauth } } }));
const job = "/job-info/11111111-1111-4111-8111-111111111111";
function Destination() { return <output>{useLocation().pathname}</output>; }
function open() { render(<MemoryRouter initialEntries={[`/login?next=${encodeURIComponent(job)}`]}><Routes><Route path="/login" element={<HubHome />} /><Route path="/job-info/:id" element={<Destination />} /></Routes></MemoryRouter>); }
beforeEach(() => { mock.session = null; mock.oauth.mockReset(); mock.oauth.mockResolvedValue({ error: null }); sessionStorage.clear(); });
afterEach(cleanup);
it("OAuth redirect retains exact job on a public same-origin page even without shared PWA storage", async () => {
  open(); fireEvent.click(screen.getByRole("button", { name: /Microsoft/i }));
  await waitFor(() => expect(mock.oauth).toHaveBeenCalledWith("microsoft", { redirect_uri: `${window.location.origin}/login?next=${encodeURIComponent(job)}` }));
  expect(sessionStorage.getItem("mcs:hub-post-login-next")).toBe(job);
});
it("fresh standalone session follows URL job destination without stored return path", async () => {
  mock.session = { user: { id: "isolated" } }; open();
  expect(await screen.findByText(job)).toBeTruthy();
});