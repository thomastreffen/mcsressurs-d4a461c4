import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AddressAutocomplete } from "@/components/ui/address-autocomplete";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Hammer, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTechnicians } from "@/hooks/useTechnicians";
import { notifyJobAssignment } from "@/lib/notify-job-assignment";

interface PlanJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseId: string;
  caseTitle: string;
  companyId: string;
  existingProjectId: string | null;
  onPlanned: (projectId: string, serviceJobId: string) => void;
}

const DURATION_OPTIONS = [
  { value: "60", label: "1 time" },
  { value: "120", label: "2 timer" },
  { value: "180", label: "3 timer" },
  { value: "240", label: "4 timer" },
  { value: "480", label: "Hel dag" },
];

export function PlanJobDialog({
  open,
  onOpenChange,
  caseId,
  caseTitle,
  companyId,
  existingProjectId,
  onPlanned,
}: PlanJobDialogProps) {
  const { technicians } = useTechnicians(companyId);
  const [techId, setTechId] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("08:00");
  const [duration, setDuration] = useState("60");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [clientRequestId, setClientRequestId] = useState(() => crypto.randomUUID());

  const handleSave = async () => {
    if (saving || submitted) return;
    if (!techId || !date) {
      toast.error("Velg montør og dato");
      return;
    }

    setSaving(true);
    try {
      const startsAt = new Date(`${date}T${startTime}:00`);
      const endsAt = new Date(startsAt.getTime() + Number(duration) * 60000);

      const { data: session } = await supabase.auth.getSession();
      const userId = session?.session?.user?.id;

      let projectId = existingProjectId;

      if (!projectId) {
        const { data: proj, error: projErr } = await supabase
          .from("events")
          .insert({
            title: caseTitle,
            technician_id: techId,
            start_time: startsAt.toISOString(),
            end_time: endsAt.toISOString(),
            status: "planned",
            project_type: "service",
            company_id: companyId,
            created_by: userId,
            address: address || null,
            description: note || `Fra henvendelse: ${caseTitle}`,
            client_request_id: clientRequestId,
          } as any)
          .select("id")
          .single();

        if (projErr) throw projErr;
        projectId = proj.id;

        await supabase.from("event_technicians").insert({
          event_id: projectId,
          technician_id: techId,
        } as any);
      }

      if (!projectId) throw new Error("Mangler prosjekt for arbeidsoppdraget");
      const { data: assigned } = await supabase.from("event_technicians").select("id").eq("event_id", projectId).eq("technician_id", techId).maybeSingle();
      if (!assigned) {
        const { error: assignmentError } = await supabase.from("event_technicians").insert({ event_id: projectId, technician_id: techId });
        if (assignmentError) throw assignmentError;
      }

      const { data: sj, error: sjErr } = await supabase
        .from("service_jobs")
        .insert({
          company_id: companyId,
          project_id: projectId,
          case_id: caseId,
          title: caseTitle,
          description: note || null,
          address: address || null,
          status: "planned",
          technician_id: techId,
          starts_at: startsAt.toISOString(),
          ends_at: endsAt.toISOString(),
          created_by: userId,
        } as any)
        .select("id")
        .single();

      if (sjErr) throw sjErr;
      await notifyJobAssignment(projectId, [techId]);

      await supabase.from("cases").update({
        project_id: projectId,
        service_job_id: sj.id,
        status: "converted",
      } as any).eq("id", caseId);

      const techName = technicians.find((t) => t.id === techId)?.name || "montør";
      await supabase.from("case_items").insert({
        case_id: caseId,
        company_id: companyId,
        type: "system",
        subject: "Planlagt",
        body_preview: `${techName} – ${date} kl. ${startTime} (${duration} min)${address ? `, ${address}` : ""}`,
        created_by: userId,
      } as any);

      toast.success("Planlagt i Hub – se e-poststatus per montør");
      setSubmitted(true);
      if (!projectId) throw new Error("Mangler prosjekt for arbeidsoppdraget");
      onPlanned(projectId, sj.id);
      onOpenChange(false);

      // Reset
      setTechId("");
      setDate("");
      setStartTime("08:00");
      setDuration("60");
      setAddress("");
      setNote("");
      setSubmitted(false);
      setShowMore(false);
      setClientRequestId(crypto.randomUUID());
    } catch (err: any) {
      console.error("PlanJob error:", err);
      toast.error("Kunne ikke planlegge: " + (err.message || "Ukjent feil"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Hammer className="h-5 w-5 text-primary" />
            Planlegg arbeid
          </DialogTitle>
          <DialogDescription>Velg montør og tidspunkt – resten er valgfritt</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label className="text-xs text-muted-foreground">Henvendelse</Label>
            <p className="text-sm font-medium mt-0.5 truncate">{caseTitle}</p>
          </div>

          <div className="space-y-1.5">
            <Label>Hvem skal utføre? *</Label>
            <Select value={techId} onValueChange={setTechId}>
              <SelectTrigger>
                <SelectValue placeholder="Velg montør" />
              </SelectTrigger>
              <SelectContent>
                {technicians.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    <div className="flex items-center gap-2">
                      <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.color || "#6366f1" }} />
                      {t.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1 space-y-1.5">
              <Label>Dato *</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Klokkeslett</Label>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Varighet</Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATION_OPTIONS.map((d) => (
                    <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Show more */}
          <Button
            type="button"
            variant="ghost"
            className="w-full gap-1.5 text-xs text-muted-foreground h-7"
            onClick={() => setShowMore(!showMore)}
          >
            {showMore ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {showMore ? "Skjul detaljer" : "Adresse, notat…"}
          </Button>

          {showMore && (
            <div className="space-y-3 border-t border-border/50 pt-3">
              <div className="space-y-1.5">
                <Label>Adresse</Label>
                <AddressAutocomplete value={address} onChange={setAddress} placeholder="Søk adresse…" />
              </div>
              <div className="space-y-1.5">
                <Label>Notat til montør</Label>
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Instrukser, tilgang, kontaktperson…" rows={2} />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Avbryt
          </Button>
          <Button onClick={handleSave} disabled={saving || submitted || !techId || !date} className="gap-1.5">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? "Planlegger…" : "Planlegg"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
