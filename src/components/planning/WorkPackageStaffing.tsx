import { Badge } from "@/components/ui/badge";
import { staffingLabel, type WpStaffing } from "@/hooks/usePlanning";
import { assignmentStateLabel } from "@/lib/planning";

/** Bemanningsstatus og konkrete personer hentet tilbake fra Ressursplan. */
export function WorkPackageStaffing({
  assignmentState,
  staffing,
  assignees,
  compact,
}: {
  assignmentState: string;
  staffing: WpStaffing | undefined;
  assignees: { id: string; name: string }[] | undefined;
  compact?: boolean;
}) {
  const sl = staffingLabel(staffing);
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {sl ? (
          <Badge
            variant="outline"
            className={
              sl.tone === "warn" ? "border-warning/40 text-warning"
              : sl.tone === "partial" ? "border-primary/40 text-primary"
              : "border-success/40 text-success"
            }
          >
            {sl.label}
          </Badge>
        ) : (
          <Badge variant="outline" className={assignmentState === "not_assigned" ? "border-warning/40 text-warning" : ""}>
            {assignmentStateLabel(assignmentState)}
          </Badge>
        )}
        {staffing?.date_mismatch && (
          <Badge variant="outline" className="border-destructive/40 text-destructive">
            Avvik: datoen i Ressursplan er ikke justert
          </Badge>
        )}
        {staffing?.event_missing && (
          <Badge variant="outline" className="border-destructive/40 text-destructive">
            Oppdraget er fjernet fra Ressursplan
          </Badge>
        )}
      </div>
      {assignees && assignees.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {compact ? "Tildelt: " : <span className="font-medium text-foreground">Tildelt: </span>}
          {assignees.map((a) => a.name).join(", ")}
        </p>
      )}
    </div>
  );
}
