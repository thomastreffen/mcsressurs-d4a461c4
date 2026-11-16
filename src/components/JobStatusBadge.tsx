import { cn } from "@/lib/utils";
import { approvalResponseStatus } from "@/lib/approval-response-status";
import { JOB_STATUS_CONFIG, type JobStatus, type StatusAxis } from "@/lib/job-status";

interface JobStatusBadgeProps {
  status: JobStatus;
  /** Optional: show axis label prefix */
  showAxis?: boolean;
  /** Size variant */
  size?: "sm" | "default";
}

export function JobStatusBadge({ status, showAxis, size = "default" }: JobStatusBadgeProps) {
  const config = JOB_STATUS_CONFIG[status];
  if (!config) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-medium",
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-0.5 text-xs",
        config.className
      )}
    >
      {config.label}
    </span>
  );
}

/** Grouped status display showing execution + acceptance + billing as separate badges */
export function JobStatusGroup({
  executionStatus,
  acceptanceStatuses,
  billingStatus,
  className,
}: {
  executionStatus: JobStatus;
  acceptanceStatuses?: Array<{ techName: string; status: string }>;
  billingStatus?: JobStatus | null;
  className?: string;
}) {
  // Map approval status strings to display config
  const approvalDisplayMap: Record<string, { label: string; className: string }> = {
    pending: { label: "Forespurt", className: "bg-status-requested text-status-requested-foreground" },
    approved: { label: "Godkjent", className: "bg-status-approved text-status-approved-foreground" },
    declined: { label: "Avslått", className: "bg-status-rejected text-status-rejected-foreground" },
    change_request: { label: "Tidsendring", className: "bg-status-time-change-proposed text-status-time-change-proposed-foreground" },
  };

  // Sort order: declined > change_request > pending > approved
  const statusPriority: Record<string, number> = { declined: 0, change_request: 1, pending: 2, approved: 3 };
  const sorted = acceptanceStatuses
    ? acceptanceStatuses.map(a => ({ ...a, status: approvalResponseStatus(a.status) })).sort((a, b) => (statusPriority[a.status] ?? 2) - (statusPriority[b.status] ?? 2))
    : [];

  const isSingleTech = sorted.length <= 1;
  const allSameStatus = sorted.length > 0 && sorted.every((a) => a.status === sorted[0].status);

  // Build summary badge for acceptance
  const buildSummaryBadge = () => {
    if (sorted.length === 0) return null;
    const approvedCount = sorted.filter((a) => a.status === "approved").length;
    const hasDeclined = sorted.some((a) => a.status === "declined");
    const hasChangeRequest = sorted.some((a) => a.status === "change_request");

    if (isSingleTech) {
      const display = approvalDisplayMap[sorted[0].status];
      return (
        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium", display?.className || "bg-muted text-muted-foreground")}>
          {display?.label || sorted[0].status}
        </span>
      );
    }

    if (allSameStatus && sorted[0].status === "approved") {
      return (
        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium", approvalDisplayMap.approved.className)}>
          Alle godkjent
        </span>
      );
    }

    if (hasDeclined) {
      const declinedCount = sorted.filter((a) => a.status === "declined").length;
      return (
        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium", approvalDisplayMap.declined.className)}>
          Avslått av {declinedCount} montør{declinedCount > 1 ? "er" : ""}
        </span>
      );
    }

    if (hasChangeRequest) {
      return (
        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium", approvalDisplayMap.change_request.className)}>
          Tidsendring foreslått
        </span>
      );
    }

    // Some pending, some approved
    return (
      <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium", approvalDisplayMap.pending.className)}>
        Venter på svar ({approvedCount}/{sorted.length} godkjent)
      </span>
    );
  };

  return (
    <div className={cn("space-y-2", className)}>
      {/* Execution */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground w-16 shrink-0">Utførelse</span>
        <JobStatusBadge status={executionStatus} size="sm" />
      </div>

      {/* Acceptance – summary */}
      {sorted.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground w-16 shrink-0">Svar</span>
          {buildSummaryBadge()}
        </div>
      )}

      {/* Acceptance – per-tech breakdown (multi-tech only, when not all same) */}
      {!isSingleTech && !allSameStatus && (
        <div className="flex items-start gap-2 pl-[calc(4rem+0.5rem)]">
          <div className="flex flex-col gap-1">
            {sorted.map((a, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span className="text-[11px] text-foreground font-medium">{a.techName}:</span>
                <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium", approvalDisplayMap[a.status]?.className || "bg-muted text-muted-foreground")}>
                  {approvalDisplayMap[a.status]?.label || a.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Billing */}
      {billingStatus && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground w-16 shrink-0">Økonomi</span>
          <JobStatusBadge status={billingStatus} size="sm" />
        </div>
      )}
    </div>
  );
}
