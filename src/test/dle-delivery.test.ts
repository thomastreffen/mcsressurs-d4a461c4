import { describe, expect, it } from "vitest";
import { parseDleRecipients, dleDeliveryMode, DLE_LINK_SECONDS } from "@/lib/dle/delivery";
describe("DLE email delivery", () => {
  it("supports multiple To and CC addresses", () => {
    expect(parseDleRecipients("thomas.treffen@mcsservice.no; rune.orbeck@mcsservice.no")).toEqual(["thomas.treffen@mcsservice.no", "rune.orbeck@mcsservice.no"]);
  });
  it("rejects invalid recipients", () => { expect(() => parseDleRecipients("invalid")).toThrow(); });
  it("uses links at the existing 3MB boundary", () => {
    expect(dleDeliveryMode(3 * 1024 * 1024 - 1)).toBe("attachment");
    expect(dleDeliveryMode(3 * 1024 * 1024)).toBe("link");
  });
  it("expires links after seven days", () => { expect(DLE_LINK_SECONDS).toBe(604800); });
});