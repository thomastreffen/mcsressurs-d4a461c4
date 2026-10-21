import { describe, it, expect } from "vitest";
import { homePathForRole } from "@/lib/home-route";

describe("homePathForRole", () => {
  it("sends montør to Min dag", () => expect(homePathForRole("montør")).toBe("/my-day"));
  it("keeps admin on overview", () => expect(homePathForRole("admin")).toBe("/overview"));
  it("keeps super_admin on overview", () => expect(homePathForRole("super_admin")).toBe("/overview"));
});
