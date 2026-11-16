import { useQuery } from "@tanstack/react-query";
import { invokeWithSession } from "@/lib/invoke-session";
import type { CalendarCapability } from "@/lib/job-calendar-presentation";

/** Metadata only: no token refresh, Graph calls, queue claims or stored writes. */
export function useJobCalendarCapability(eventId?: string) {
  return useQuery({
    queryKey: ["job-calendar-capability", eventId],
    enabled: !!eventId,
    retry: false,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await invokeWithSession<{ technicians: CalendarCapability[] }>("calendar-write-sync", {
        body: { action: "read_capability", event_id: eventId },
      });
      if (error) throw error;
      return data?.technicians ?? [];
    },
  });
}