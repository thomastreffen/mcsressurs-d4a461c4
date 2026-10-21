import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithSession } from "@/lib/invoke-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { TechnicianMultiSelect } from "@/components/TechnicianMultiSelect";
import { toast } from "sonner";
import { format } from "date-fns";
import { ArrowLeft, AlertTriangle, Bell, BellOff, Loader2, Save } from "lucide-react";
import { ProjectSecurityPanel } from "@/components/security/ProjectSecurityPanel";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";

interface ConflictInfo {
  technicianName: string;
  jobTitle: string;
  start: string;
  end: string;
}

export default function ProjectSettingsPage() {
  const { id: jobId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isSuperAdmin } = useAuth();
  const { hasPermission } = usePermissions();
  const canViewSecurity = isSuperAdmin || hasPermission("security.view") || hasPermission("security.manage");

  const [title, setTitle] = useState("");
  const [customer, setCustomer] = useState("");
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [jobNumber, setJobNumber] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("08:00");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("16:00");
  const [techIds, setTechIds] = useState<string[]>([]);
  const [aliases, setAliases] = useState<string[]>([]);
  const [aliasInput, setAliasInput] = useState("");
  const [notifyParticipants, setNotifyParticipants] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [conflicts, setConflicts] = useState<ConflictInfo[]>([]);

  useEffect(() => {
    if (!jobId) return;
    setLoading(true);

    (async () => {
      const { data, error } = await supabase
        .from("events")
        .select(`*, event_technicians ( technician_id )`)
        .eq("id", jobId)
        .single();

      if (error || !data) {
        toast.error("Kunne ikke laste prosjektdata");
        navigate(`/projects/${jobId}`);
        return;
      }

      const rawTitle = data.title.replace("SERVICE – ", "");
      setTitle(rawTitle);
      setCustomer(data.customer ?? "");
      setAddress(data.address ?? "");
      setDescription(data.description ?? "");
      setJobNumber(data.job_number ?? "");

      const start = new Date(data.start_time);
      const end = new Date(data.end_time);
      setStartDate(format(start, "yyyy-MM-dd"));
      setStartTime(format(start, "HH:mm"));
      setEndDate(format(end, "yyyy-MM-dd"));
      setEndTime(format(end, "HH:mm"));

      setTechIds((data.event_technicians ?? []).map((et: any) => et.technician_id));
      setAliases((data as any).project_aliases ?? []);
      setLoading(false);
    })();
  }, [jobId, navigate]);

  const checkConflicts = useCallback(async () => {
    if (!startDate || !startTime || !endDate || !endTime || techIds.length === 0) {
      setConflicts([]);
      return;
    }

    const startISO = new Date(`${startDate}T${startTime}`).toISOString();
    const endISO = new Date(`${endDate}T${endTime}`).toISOString();

    const { data: overlapping } = await supabase
      .from("event_technicians")
      .select(`
        technician_id,
        technicians ( name ),
        events:event_id ( id, title, start_time, end_time )
      `)
      .in("technician_id", techIds);

    if (!overlapping) { setConflicts([]); return; }

    const found: ConflictInfo[] = [];
    for (const row of overlapping as any[]) {
      const ev = row.events;
      if (!ev || ev.id === jobId) continue;
      if (ev.start_time < endISO && ev.end_time > startISO) {
        found.push({
          technicianName: row.technicians?.name ?? "Ukjent",
          jobTitle: ev.title?.replace("SERVICE – ", "") ?? "",
          start: format(new Date(ev.start_time), "HH:mm"),
          end: format(new Date(ev.end_time), "HH:mm"),
        });
      }
    }
    setConflicts(found);
  }, [startDate, startTime, endDate, endTime, techIds, jobId]);

  useEffect(() => {
    if (!loading) checkConflicts();
  }, [loading, checkConflicts]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (techIds.length === 0) return;
    setSubmitting(true);

    try {
      const startISO = new Date(`${startDate}T${startTime}`).toISOString();
      const endISO = new Date(`${endDate}T${endTime}`).toISOString();
      const { data: session } = await supabase.auth.getSession();
      const userId = session?.session?.user?.id;

      const { error: updateError } = await supabase
        .from("events")
        .update({
          title: `SERVICE – ${title}`,
          customer,
          address,
          description,
          job_number: jobNumber || null,
          start_time: startISO,
          end_time: endISO,
          updated_by: userId || null,
          project_aliases: aliases,
        } as any)
        .eq("id", jobId);

      if (updateError) {
        toast.error("Kunne ikke oppdatere prosjekt", { description: updateError.message });
        setSubmitting(false);
        return;
      }

      await supabase.from("event_technicians").delete().eq("event_id", jobId);
      const techInserts = techIds.map((techId) => ({
        event_id: jobId,
        technician_id: techId,
      }));
      await supabase.from("event_technicians").insert(techInserts);

      await supabase.from("event_logs").insert({
        event_id: jobId,
        action_type: "updated",
        performed_by: userId || null,
        change_summary: `Prosjekt oppdatert${notifyParticipants ? " (deltakere varslet)" : " (uten varsling)"}`,
      });

      if (notifyParticipants) {
        await invokeWithSession("create-approval", { body: { job_id: jobId } }).catch(() => {});
      }

      toast.success("Prosjekt oppdatert");
      navigate(`/projects/${jobId}`);
    } catch (err: any) {
      toast.error("Noe gikk galt", { description: err?.message });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-20">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 sm:px-6 py-8">
        {/* Back link */}
        <button
          onClick={() => navigate(`/projects/${jobId}`)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Tilbake til prosjektet
        </button>

        <h1 className="text-2xl font-extrabold text-foreground tracking-tight mb-8">
          Prosjektinnstillinger
        </h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Title & Job number */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="edit-title">Tittel</Label>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-sm text-muted-foreground whitespace-nowrap">SERVICE –</span>
                <Input id="edit-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
              </div>
            </div>
            <div>
              <Label htmlFor="edit-jobNumber">Jobbnummer</Label>
              <Input id="edit-jobNumber" value={jobNumber} onChange={(e) => setJobNumber(e.target.value)} className="mt-1.5" />
            </div>
          </div>

          {/* Customer & Technicians */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Kunde</Label>
              <Input value={customer} onChange={(e) => setCustomer(e.target.value)} required className="mt-1.5" />
            </div>
            <TechnicianMultiSelect selectedIds={techIds} onChange={setTechIds} />
          </div>

          {/* Address */}
          <div>
            <Label>Adresse</Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} required className="mt-1.5" />
          </div>

          {/* Project Aliases */}
          <div>
            <Label>Kallenavn / Aliases</Label>
            <p className="text-xs text-muted-foreground mb-1.5">Montørene bruker ofte kallenavn i Outlook. Legg til her for bedre automatisk matching.</p>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {aliases.map((alias, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 text-xs font-medium bg-primary/10 text-primary rounded-full px-2.5 py-1"
                >
                  {alias}
                  <button
                    type="button"
                    onClick={() => setAliases(prev => prev.filter((_, idx) => idx !== i))}
                    className="hover:text-destructive"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="F.eks. DC Odin, Kirkeveien..."
                value={aliasInput}
                onChange={(e) => setAliasInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && aliasInput.trim()) {
                    e.preventDefault();
                    setAliases(prev => [...prev, aliasInput.trim()]);
                    setAliasInput("");
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  if (aliasInput.trim()) {
                    setAliases(prev => [...prev, aliasInput.trim()]);
                    setAliasInput("");
                  }
                }}
              >
                Legg til
              </Button>
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Start</Label>
              <div className="flex gap-2 mt-1.5">
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
                <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required className="w-28" />
              </div>
            </div>
            <div>
              <Label>Slutt</Label>
              <div className="flex gap-2 mt-1.5">
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
                <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required className="w-28" />
              </div>
            </div>
          </div>

          {/* Conflict warning */}
          {conflicts.length > 0 && (
            <div className="rounded-lg border-2 border-destructive/30 bg-destructive/5 p-4 space-y-2">
              <div className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-4 w-4" />
                <p className="text-sm font-medium">Overlappende jobber</p>
              </div>
              <div className="space-y-1">
                {conflicts.map((c, i) => (
                  <p key={i} className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{c.technicianName}</span> har allerede{" "}
                    <span className="font-medium">"{c.jobTitle}"</span> {c.start}–{c.end}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Description */}
          <div>
            <Label>Beskrivelse</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className="mt-1.5" />
          </div>

          {/* Security panel (own save) */}
          {canViewSecurity && jobId && (
            <ProjectSecurityPanel projectId={jobId} selectedPersonIds={techIds} />
          )}

          {/* Notify toggle */}
          <div className="flex items-center justify-between rounded-lg border border-border/60 bg-card p-4">
            <div className="flex items-center gap-2.5">
              {notifyParticipants ? (
                <Bell className="h-4 w-4 text-primary" />
              ) : (
                <BellOff className="h-4 w-4 text-muted-foreground" />
              )}
              <div>
                <p className="text-sm font-medium">Varsle deltakere</p>
                <p className="text-xs text-muted-foreground">
                  {notifyParticipants ? "E-post og kalenderhendelse oppdateres" : "Kun databasen oppdateres"}
                </p>
              </div>
            </div>
            <Switch checked={notifyParticipants} onCheckedChange={setNotifyParticipants} />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => navigate(`/projects/${jobId}`)}>
              Avbryt
            </Button>
            <Button type="submit" disabled={techIds.length === 0 || submitting} className="gap-2">
              <Save className="h-4 w-4" />
              {submitting ? "Lagrer..." : "Lagre endringer"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
