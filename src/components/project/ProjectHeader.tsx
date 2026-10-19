import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { JobStatusBadge } from "@/components/JobStatusBadge";
import { getExecutionStatus, getAcceptanceFromLegacy, BILLING_STATUSES } from "@/lib/job-status";
import { SourceMetadataBadge } from "@/components/SourceMetadataBadge";
import {
  ArrowLeft,
  Users,
  MoreHorizontal,
  Pencil,
  Eye,
  Settings2,
  Shield,
  Copy,
  Trash2,
  BookOpen,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import type { JobStatus } from "@/lib/job-status";
import { formatHubId } from "@/lib/project-reference";

interface ProjectHeaderProps {
  jobNumber: string | null;
  internalNumber: string | null;
  projectNumber?: string | null;
  /** TPX-F4.1: resolved Tripletex project number (own or financial parent). */
  financialProjectNumber?: string | null;
  title: string;
  customer: string;
  address: string;
  start: Date;
  end: Date;
  status: JobStatus;
  technicianNames: string[];
  onOpenPlan?: () => void;
  onOpenAccess?: () => void;
  onOpenSpaces?: () => void;
  onEdit?: () => void;
  projectId?: string;
  externalTripletexId?: string | null;
  companyName?: string | null;
}

export function ProjectHeader({
  jobNumber,
  internalNumber,
  projectNumber,
  financialProjectNumber,
  title,
  customer,
  start,
  end,
  status,
  technicianNames,
  onOpenAccess,
  onOpenSpaces,
  onEdit,
  projectId,
  externalTripletexId,
  companyName,
}: ProjectHeaderProps) {
  const navigate = useNavigate();
  const period = `${format(start, "d. MMM", { locale: nb })} – ${format(end, "d. MMM yyyy", { locale: nb })}`;

  return (
    <div className="bg-card border-b border-border/30">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-3 sm:py-6">
        {/* Top row: back + menu */}
        <div className="flex items-center justify-between mb-2 sm:mb-4">
          <button
            onClick={() => navigate("/projects")}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Prosjekter
          </button>

          {/* Three-dot menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-10 w-10 sm:h-8 sm:w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {onEdit && (
                <DropdownMenuItem onClick={onEdit} className="gap-2.5 min-h-[44px]">
                  <Pencil className="h-4 w-4 text-muted-foreground" />
                  Rediger prosjekt
                </DropdownMenuItem>
              )}
              {onOpenAccess && (
                <DropdownMenuItem onClick={onOpenAccess} className="gap-2.5 min-h-[44px]">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  Administrer tilgang
                </DropdownMenuItem>
              )}
              {onOpenSpaces && (
                <DropdownMenuItem onClick={onOpenSpaces} className="gap-2.5 min-h-[44px]">
                  <Settings2 className="h-4 w-4 text-muted-foreground" />
                  Administrer rom
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="gap-2.5 text-destructive focus:text-destructive min-h-[44px]">
                <Trash2 className="h-4 w-4" />
                Slett prosjekt
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Title + meta — compact on mobile */}
        <div className="text-center">
          <h1 className="text-xl sm:text-3xl font-extrabold text-foreground tracking-tight">
            {title}
          </h1>
          <div className="flex items-center justify-center gap-2 mt-1 flex-wrap">
            {financialProjectNumber ? (
              <>
                <span data-testid="primary-project-ref" className="inline-block font-mono text-sm font-semibold bg-primary/10 text-primary rounded-md px-2 py-0.5">
                  Prosjektnr. {financialProjectNumber}
                </span>
                {formatHubId(internalNumber, jobNumber) && (
                  <span data-testid="hub-id" className="inline-block font-mono text-[11px] text-muted-foreground/70">
                    Hub-ID {formatHubId(internalNumber, jobNumber)}
                  </span>
                )}
              </>
            ) : (
              <>
                {projectNumber && (
                  <span className="inline-block font-mono text-xs font-semibold bg-primary/10 text-primary rounded-md px-2 py-0.5">
                    {projectNumber}
                  </span>
                )}
                {formatHubId(internalNumber, jobNumber) && (
                  <span className={`inline-block font-mono text-xs rounded-md px-2 py-0.5 ${projectNumber ? 'text-muted-foreground bg-muted/50' : 'font-semibold bg-primary/10 text-primary'}`}>
                    {formatHubId(internalNumber, jobNumber)}
                  </span>
                )}
              </>
            )}
          </div>

          {/* Source badge */}
          {(externalTripletexId || companyName) && (
            <div className="mt-1">
              <SourceMetadataBadge
                source={externalTripletexId ? "tripletex" : "local"}
                externalId={externalTripletexId}
                companyName={companyName}
              />
            </div>
          )}
          {projectId && (
            <div className="mt-2 sm:mt-3">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => navigate(`/fag?project=${projectId}`)}
              >
                <BookOpen className="h-3.5 w-3.5" />
                Still fagspørsmål
              </Button>
            </div>
          )}

          {/* Meta row – single line on mobile */}
          <div className="flex items-center justify-center gap-2 sm:gap-3 mt-1.5 sm:mt-3 flex-wrap">
            <JobStatusBadge status={getExecutionStatus(status)} size="sm" />
            {getAcceptanceFromLegacy(status) && (
              <JobStatusBadge status={getAcceptanceFromLegacy(status)!} size="sm" />
            )}
            {BILLING_STATUSES.includes(status) && (
              <JobStatusBadge status={status} size="sm" />
            )}
            {customer && (
              <span className="text-xs sm:text-sm text-muted-foreground">{customer}</span>
            )}
            <span className="text-xs sm:text-sm text-muted-foreground">{period}</span>
            {technicianNames.length > 0 && (
              <span className="text-xs text-muted-foreground/70 hidden sm:inline">
                <Users className="h-3 w-3 inline mr-1" />
                {technicianNames.join(", ")}
              </span>
            )}
          </div>

          {/* Participants – mobile only, collapsed into meta */}
          {technicianNames.length > 0 && (
            <div className="flex items-center justify-center gap-1.5 mt-1 sm:hidden">
              <Users className="h-3 w-3 text-muted-foreground/60" />
              <span className="text-[11px] text-muted-foreground/70">{technicianNames.join(", ")}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
