import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ProjectHeader } from "@/components/project/ProjectHeader";
import { ProjectSubnav } from "@/components/project/ProjectSubnav";
import { MobileProjectHome } from "@/components/project/MobileProjectHome";
import { useIsMobile } from "@/hooks/use-mobile";
import { ProjectDashboard } from "@/components/project/ProjectDashboard";
import { OrderBriefingSection } from "@/components/orders/OrderBriefingSection";
import { ProjectPlanTab } from "@/components/ProjectPlanTab";
import { ThreadList } from "@/components/conversations/ThreadList";
import { DocsFilesRoom } from "@/components/docs/DocsFilesRoom";
import { ProjectFormsTab } from "@/components/forms/ProjectFormsTab";
import { ServiceJournal } from "@/components/project/ServiceJournal";
import { JobRiskPanel } from "@/components/risk/JobRiskPanel";
import { JobEmailTab } from "@/components/project/JobEmailTab";
import { MaterialTab } from "@/components/material/MaterialTab";
import { ProjectScheduleSheet } from "@/components/project/ProjectScheduleSheet";
import { SourceMetadataSection } from "@/components/SourceMetadataBadge";
import { TripletexProjectPanel } from "@/components/project/TripletexProjectPanel";
import { TripletexParticipantsPanel } from "@/components/project/TripletexParticipantsPanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Job, Attachment } from "@/lib/mock-data";
import { type JobStatus } from "@/lib/job-status";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { useActivityLog } from "@/hooks/useActivityLog";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { ImageLightbox } from "@/components/ImageLightbox";
import { ProjectAccessDrawer } from "@/components/project/ProjectAccessDrawer";
import { ChangeOrderTab } from "@/components/change-orders/ChangeOrderTab";
import { Loader2 } from "lucide-react";
import { fetchFinancialProjectNumbers } from "@/lib/project-reference";
import { toast } from "sonner";
import type { OutlookSyncStatus } from "@/lib/mock-data";

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isSuperAdmin } = useAuth();
  const { hasPermission } = usePermissions();
  const { activeCompany } = useCompanyContext();
  const canEditPlan = hasPermission("projects.edit_plan");
  const canDeleteAttachment = hasPermission("projects.delete_attachment");

  const activeTab = searchParams.get("tab") || "home";
  const setActiveTab = (tab: string) => {
    setSearchParams(tab === "home" ? {} : { tab }, { replace: true });
  };

  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [financialProjectNumber, setFinancialProjectNumber] = useState<string | null>(null);
  const [technicianNames, setTechnicianNames] = useState<string[]>([]);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [accessDrawerOpen, setAccessDrawerOpen] = useState(false);
  const [accessDrawerTab, setAccessDrawerTab] = useState<"members" | "spaces">("members");
  const [scheduleSheetOpen, setScheduleSheetOpen] = useState(false);
  const [scheduleRefreshKey, setScheduleRefreshKey] = useState(0);

  // Activity log for home dashboard
  const { activities } = useActivityLog("project", id);

  /* ── Fetch data ── */
  const fetchJob = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("events")
      .select(`
        *,
        event_technicians (
          technician_id,
          technicians ( id, name, color )
        )
      `)
      .eq("id", id)
      .single();

    if (error || !data) {
      setJob(null);
      setLoading(false);
      return;
    }

    const techs = (data.event_technicians ?? [])
      .filter((et: any) => et.technicians)
      .map((et: any) => et.technicians);

    setTechnicianNames(techs.map((t: any) => t.name));

    // TPX-F4.1a: display-only project reference, requires active Tripletex link (server-side)
    const refs = await fetchFinancialProjectNumbers([data.id]);
    setFinancialProjectNumber(refs.get(data.id) ?? null);

    setJob({
      id: data.id,
      microsoftEventId: data.microsoft_event_id ?? "",
      technicianIds: (data.event_technicians ?? []).map((et: any) => et.technician_id),
      attendeeStatuses: [],
      title: data.title,
      customer: data.customer ?? "",
      address: data.address ?? "",
      description: data.description ?? "",
      start: new Date(data.start_time),
      end: new Date(data.end_time),
      status: data.status as JobStatus,
      jobNumber: data.job_number,
      internalNumber: data.internal_number,
      projectNumber: (data as any).project_number ?? null,
      proposedStart: data.proposed_start ? new Date(data.proposed_start) : undefined,
      proposedEnd: data.proposed_end ? new Date(data.proposed_end) : undefined,
      createdAt: data.created_at ? new Date(data.created_at) : undefined,
      updatedAt: data.updated_at ? new Date(data.updated_at) : undefined,
      attachments: Array.isArray(data.attachments) ? (data.attachments as unknown as Attachment[]) : [],
      outlookSyncStatus: (data.outlook_sync_status as OutlookSyncStatus) || "not_synced",
      outlookLastSyncedAt: data.outlook_last_synced_at ? new Date(data.outlook_last_synced_at) : undefined,
      outlookDeletedAt: data.outlook_deleted_at ? new Date(data.outlook_deleted_at) : undefined,
      calendarDirty: data.calendar_dirty || false,
      calendarLastSyncedAt: data.calendar_last_synced_at || null,
      meetingJoinUrl: data.meeting_join_url || null,
      meetingId: data.meeting_id || null,
      meetingCreatedAt: data.meeting_created_at ? new Date(data.meeting_created_at) : null,
    });
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchJob(); }, [fetchJob]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-20">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!job || !id) {
    return (
      <div className="flex items-center justify-center p-20">
        <div className="text-center space-y-3">
          <p className="text-lg font-semibold">Prosjekt ikke funnet</p>
          <Button variant="outline" onClick={() => navigate("/projects")}>Tilbake til prosjekter</Button>
        </div>
      </div>
    );
  }

  const imageAttachments = (job.attachments ?? []).filter((a) => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(a.name));
  const externalTripletexId = (job as any).externalTripletexId || null;

  return (
    <>
      <div className="min-h-dvh bg-background">
        {isMobile ? <MobileProjectHome job={job} financialProjectNumber={financialProjectNumber} technicianNames={technicianNames} activeTab={activeTab} onTabChange={setActiveTab} /> : <>
        {/* Compact Header */}
        <ProjectHeader
          jobNumber={job.jobNumber ?? null}
          internalNumber={job.internalNumber ?? null}
          projectNumber={(job as any).projectNumber ?? null}
          financialProjectNumber={financialProjectNumber}
          title={job.title}
          customer={job.customer}
          address={job.address}
          start={job.start}
          end={job.end}
          status={job.status}
          technicianNames={technicianNames}
          onOpenPlan={() => setActiveTab("plan")}
          onEdit={() => navigate(`/projects/${id}/settings`)}
          onOpenAccess={() => { setAccessDrawerTab("members"); setAccessDrawerOpen(true); }}
          onOpenSpaces={() => { setAccessDrawerTab("spaces"); setAccessDrawerOpen(true); }}
          projectId={id}
          externalTripletexId={externalTripletexId}
          companyName={activeCompany?.name}
        />

        {/* Tab navigation */}
        <ProjectSubnav activeTab={activeTab} onTabChange={setActiveTab} />
        </>}

        {/* Tab content */}
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 pb-28 md:pb-8">
          {activeTab === "home" && isMobile && (
            <div className="mb-4"><OrderBriefingSection eventId={job.id} compact /></div>
          )}
          {activeTab === "home" && !isMobile && (
            <div className="space-y-6">
              <OrderBriefingSection eventId={job.id} />
              <ProjectDashboard
                jobId={job.id}
                technicianNames={technicianNames}
                start={job.start}
                end={job.end}
                logs={activities.map(l => ({
                  id: l.id,
                  action_type: l.action,
                  change_summary: l.description || null,
                  timestamp: l.created_at,
                }))}
                onNavigateTab={setActiveTab}
              />
              {isSuperAdmin && <TripletexProjectPanel eventId={job.id} />}
              {isSuperAdmin && <TripletexParticipantsPanel eventId={job.id} />}
              {/* Source metadata – collapsible section at bottom of home */}
              {(externalTripletexId || activeCompany?.name) && (
                <Card className="rounded-2xl border-border/50">
                  <CardContent className="p-4">
                    <SourceMetadataSection
                      source={externalTripletexId ? "tripletex" : "local"}
                      externalId={externalTripletexId}
                      companyName={activeCompany?.name}
                      lastSynced={job.updatedAt?.toISOString()}
                    />
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {activeTab === "plan" && (
            <ProjectPlanTab
              jobId={job.id}
              jobTitle={job.title}
              jobStart={job.start}
              jobEnd={job.end}
              jobAddress={job.address}
              technicianIds={job.technicianIds}
              technicianNames={technicianNames}
              isAdmin={canEditPlan}
              calendarDirty={job.calendarDirty}
              calendarLastSyncedAt={job.calendarLastSyncedAt}
              onSynced={() => fetchJob()}
              onResourceAssign={() => fetchJob()}
            />
          )}

          {activeTab === "epost" && (
            <div className="space-y-6">
              <ThreadList projectId={id} />
              <JobEmailTab jobId={id} linkField="linked_project_id" />
            </div>
          )}

          {activeTab === "dokumenter" && (
            <DocsFilesRoom projectId={id} jobId={id} />
          )}

          {activeTab === "skjemaer" && (
            <ProjectFormsTab projectId={id} isAdmin={canEditPlan} />
          )}

          {activeTab === "materiell" && (
            <MaterialTab
              jobId={id}
              jobNumber={financialProjectNumber ?? job.jobNumber ?? job.projectNumber ?? job.internalNumber}
              customer={job.customer}
              address={job.address}
              plannedAt={job.start}
              technicianNames={technicianNames}
              description={job.description}
            />
          )}

          {activeTab === "servicearbeid" && (
            <ServiceJournal
              projectId={id}
              projectTitle={job.title}
              customer={job.customer}
              address={job.address}
              technicianNames={technicianNames}
              internalNumber={job.internalNumber || undefined}
            />
          )}

          {activeTab === "risiko" && (
            <div className="space-y-6">
              <JobRiskPanel jobId={id} />
              <ChangeOrderTab jobId={id} customer={job.customer} baseAmount={null} currency="NOK" />
            </div>
          )}

          {activeTab === "okonomi" && (
            <div className="space-y-6">
              <Card className="rounded-2xl border-border/50">
                <CardContent className="p-6">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Økonomi & Tripletex</h3>
                  <div className="space-y-3 text-sm">
                    {externalTripletexId ? (
                      <>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Tripletex prosjekt-ID</span>
                          <span className="font-mono">{externalTripletexId}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Selskap</span>
                          <span>{activeCompany?.name || "—"}</span>
                        </div>
                        <p className="text-xs text-muted-foreground/60 pt-2 border-t border-border/30">
                          Økonomidetaljer som faktura, timer og kostnader styres i Tripletex.
                          Denne seksjonen vil bli utvidet med synkronisert økonomidata.
                        </p>
                      </>
                    ) : (
                      <p className="text-muted-foreground/60">
                        Ingen Tripletex-kobling. Prosjektet ble opprettet lokalt.
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* Lightbox */}
      <ImageLightbox
        images={imageAttachments}
        initialIndex={lightboxIndex}
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        canDelete={canDeleteAttachment}
        onDelete={async (name) => {
          if (!job || !canDeleteAttachment) return;
          const updated = (job.attachments ?? []).filter((a) => a.name !== name);
          const { error } = await supabase.from("events").update({ attachments: updated as any }).eq("id", job.id);
          if (!error) { setJob((p) => p ? { ...p, attachments: updated } : null); toast.success("Vedlegg slettet"); }
        }}
      />

      {/* Access drawer */}
      {accessDrawerOpen && id && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" onClick={() => setAccessDrawerOpen(false)} />
          <div className="relative w-full max-w-md bg-background border-l border-border shadow-xl overflow-y-auto p-6">
            <ProjectAccessDrawer projectId={id} onClose={() => setAccessDrawerOpen(false)} initialTab={accessDrawerTab} />
          </div>
        </div>
      )}

      {/* Schedule sheet */}
      {job && (
        <ProjectScheduleSheet
          open={scheduleSheetOpen}
          onOpenChange={setScheduleSheetOpen}
          projectId={job.id}
          projectTitle={job.title}
          customer={job.customer}
          address={job.address}
          suggestedDate={job.start}
          onCreated={() => setScheduleRefreshKey((k) => k + 1)}
        />
      )}
    </>
  );
}
