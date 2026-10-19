import { describe, expect, it } from "vitest";
import { formatJobSchedule, jobDate } from "../../supabase/functions/_shared/job-time";

describe("Montørens klokkeslett i Europe/Oslo", () => {
  it("viser 06:00–14:00 fra 04:00–12:00 UTC på sommertid", () => {
    const schedule = formatJobSchedule("2026-10-19T04:00:00Z", "2026-10-19T12:00:00Z");
    expect([schedule.startTime, schedule.endTime]).toEqual(["06:00", "14:00"]);
  });
  it("viser 06:00–14:00 fra 05:00–13:00 UTC på vintertid", () => {
    const schedule = formatJobSchedule("2026-12-01T05:00:00+00:00", "2026-12-01T13:00:00+00:00");
    expect([schedule.startTime, schedule.endTime]).toEqual(["06:00", "14:00"]);
  });
  it("prioriterer montørens overstyringer", () => {
    const schedule = formatJobSchedule("2026-10-19T06:00:00Z", "2026-10-19T14:00:00Z", "2026-10-19T04:00:00Z", "2026-10-19T12:00:00Z");
    expect([schedule.startTime, schedule.endTime]).toEqual(["06:00", "14:00"]);
  });
  it("tolker databasestrenger uten tidssone som UTC", () => {
    expect(jobDate("2026-10-19T04:00:00").toISOString()).toBe("2026-10-19T04:00:00.000Z");
    expect(formatJobSchedule("2026-10-19T04:00:00", "2026-10-19T12:00:00").startTime).toBe("06:00");
  });
  it("skifter automatisk ved overgang til vintertid", () => {
    expect(formatJobSchedule("2026-10-24T04:00:00Z", null).startTime).toBe("06:00");
    expect(formatJobSchedule("2026-10-25T05:00:00Z", null).startTime).toBe("06:00");
  });
  it("skifter automatisk ved overgang til sommertid", () => {
    expect(formatJobSchedule("2026-03-28T05:00:00Z", null).startTime).toBe("06:00");
    expect(formatJobSchedule("2026-03-29T04:00:00Z", null).startTime).toBe("06:00");
  });
  it("bruker Oslo-dato når UTC-dagen er en annen", () => {
    expect(formatJobSchedule("2026-10-18T22:30:00Z", null).startDate).toBe("mandag 19. oktober 2026");
  });
});