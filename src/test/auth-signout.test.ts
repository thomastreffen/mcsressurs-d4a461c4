import { describe, it, expect } from "vitest";
import { HUB_SIGN_OUT_SCOPE } from "@/lib/auth-signout";

describe("Hub sign-out scope", () => {
  it("only signs out this browser so ChatGPT/MCP connections survive", () => {
    expect(HUB_SIGN_OUT_SCOPE).toBe("local");
  });
});
