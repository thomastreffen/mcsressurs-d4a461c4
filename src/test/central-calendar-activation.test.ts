import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { ALL_PHRASE, singlePhrase } from "@/components/admin/CentralCalendarActivation";
const sql = readFileSync("drizzle/migrations/0123_central_calendar_mailbox_activation.sql", "utf8");
it("single activation phrase names the exact mailbox", () => expect(singlePhrase(" Rune@MCS.no ")).toBe("AKTIVER KALENDER rune@mcs.no"));
it("all-active phrase is fixed", () => expect(ALL_PHRASE).toBe("AKTIVER KALENDER FOR ALLE AKTIVE MONTØRER"));
it("former employees Ståle and Andre can never be activated", () => { expect(sql).toContain("ebc15ac7-fd4c-461d-a61c-06b97d705cc0"); expect(sql).toContain("ba707f5e-0a7d-40b8-95f2-896d1c4c01c2"); });
it("all-active requires a verified pilot copy and single requires a fresh mailbox test", () => { expect(sql).toContain("pilot_copy_not_verified"); expect(sql).toContain("fresh_mailbox_probe_required"); });
it("no backfill: only days planned or changed after activation", () => expect(sql).toMatch(/_changed >= a\.effective_from/));
