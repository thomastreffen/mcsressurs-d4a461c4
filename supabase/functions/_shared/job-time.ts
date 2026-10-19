/** Database values are UTC instants; recipient-facing dates always use Oslo. */
export function jobDate(value: string): Date {
  const zoned = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(value);
  return new Date(zoned ? value : `${value}Z`);
}

export function formatJobSchedule(
  start: string | null | undefined,
  end: string | null | undefined,
  assignedStart?: string | null,
  assignedEnd?: string | null,
) {
  const effectiveStart = assignedStart || start;
  const effectiveEnd = assignedEnd || end;
  const time = (value: string | null | undefined) => value
    ? jobDate(value).toLocaleTimeString("nb-NO", { timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit" })
    : "—";
  return {
    startDate: effectiveStart ? jobDate(effectiveStart).toLocaleDateString("nb-NO", {
      timeZone: "Europe/Oslo", weekday: "long", day: "numeric", month: "long", year: "numeric",
    }) : "—",
    startTime: time(effectiveStart),
    endTime: time(effectiveEnd),
  };
}