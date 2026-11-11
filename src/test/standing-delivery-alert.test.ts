import { describe, it, expect } from "vitest";
import {
  isStandingDeliveryReason,
  hasRecentStandingAlert,
  failureLine,
  STANDING_ALERT_WINDOW_MS,
} from "../../supabase/functions/_shared/recipient-delivery";

const NOW = new Date("2026-11-11T14:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 60 * 60 * 1000).toISOString();

describe("standing delivery alert dedupe", () => {
  it("treats missing Microsoft connection, login link and e-mail as standing conditions", () => {
    expect(isStandingDeliveryReason("no_ms_connection")).toBe(true);
    expect(isStandingDeliveryReason("no_login_link")).toBe(true);
    expect(isStandingDeliveryReason("no_email")).toBe(true);
  });

  it("does not treat Graph conflicts or send errors as standing – they alert per job", () => {
    expect(isStandingDeliveryReason("graph_conflict")).toBe(false);
    expect(isStandingDeliveryReason("graph_error")).toBe(false);
    expect(isStandingDeliveryReason(null)).toBe(false);
    expect(isStandingDeliveryReason(undefined)).toBe(false);
  });

  it("suppresses a repeat alert for the same person+reason within 24h, even for another job", () => {
    const line = failureLine("Mats Lien Hansen", "calendar", "no_ms_connection");
    const alerts = [{ message: `Jobb A er lagret.\n${line}`, created_at: hoursAgo(2) }];
    expect(hasRecentStandingAlert(alerts, line, NOW)).toBe(true);
  });

  it("alerts again when the previous alert is older than 24h", () => {
    const line = failureLine("Mats Lien Hansen", "calendar", "no_ms_connection");
    const alerts = [{ message: line, created_at: hoursAgo(30) }];
    expect(hasRecentStandingAlert(alerts, line, NOW)).toBe(false);
  });

  it("does not suppress when the recent alert names a different person", () => {
    const matsLine = failureLine("Mats Lien Hansen", "calendar", "no_ms_connection");
    const emilLine = failureLine("Emil Strid", "calendar", "no_ms_connection");
    const alerts = [{ message: emilLine, created_at: hoursAgo(1) }];
    expect(hasRecentStandingAlert(alerts, matsLine, NOW)).toBe(false);
  });

  it("window is 24 hours", () => {
    expect(STANDING_ALERT_WINDOW_MS).toBe(24 * 60 * 60 * 1000);
  });
});
