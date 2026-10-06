import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useAuth } from "@/hooks/useAuth";
import {
  uniqueParticipants,
  useEligibleParticipants,
  usePlanningLookups,
  usePlanningMutations,
} from "@/hooks/usePlanning";
import { supabase } from "@/integrations/supabase/client";
import { ParticipantPicker } from "@/components/planning/ParticipantPicker";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";

const NONE = "__none__";

/** Egen side for nytt planleggingsprosjekt (/planlegging/ny) – ingen modal. */
export default function PlanningNewProjectPage() {
  const open = true;
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeCompanyId } = useCompanyContext();
  const { data: lookups } = usePlanningLookups();
  const { createProject } = usePlanningMutations();

  const [name, setName] = useState("");
  const [customerId, setCustomerId] = useState(NONE);
  const [companyId, setCompanyId] = useState(activeCompanyId ?? NONE);
  const [departmentId, setDepartmentId] = useState(NONE);
  const [ownerUserId, setOwnerUserId] = useState(user?.id ?? NONE);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [description, setDescription] = useState("");
  const [participants, setParticipants] = useState<string[]>([]);
  const { data: eligible } = useEligibleParticipants();
  const ownerOptions = uniqueParticipants(eligible);

  // Aktivt firma og innlogget bruker lastes asynkront – sett standardverdier når dialogen åpnes
  useEffect(() => {
    if (!open) return;
    if (companyId === NONE && activeCompanyId) setCompanyId(activeCompanyId);
    if (ownerUserId === NONE && user?.id) setOwnerUserId(user.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeCompanyId, user?.id]);


  const departments = (lookups?.departments ?? []).filter(
    (d) => companyId === NONE || d.company_id === companyId,
  );

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Prosjektnavn må fylles ut");
      return;
    }
    try {
      const id = await createProject.mutateAsync({
        name: name.trim(),
        customer_id: customerId === NONE ? null : customerId,
        company_id: companyId === NONE ? null : companyId,
        department_id: departmentId === NONE ? null : departmentId,
        owner_user_id: ownerUserId === NONE ? null : ownerUserId,
        expected_start: start || null,
        expected_end: end || null,
        description: description.trim() || null,
        status: "early_planning",
      });
      toast.success("Planleggingsprosjekt opprettet");
      // Overordnet ansvarlig legges inn automatisk (rolle «owner») av databasen
      const extra = participants.filter((p) => p !== (ownerUserId === NONE ? null : ownerUserId));
      if (extra.length > 0) {
        const byId = new Map(ownerOptions.map((o) => [o.user_id, o]));
        const { error: mErr } = await (supabase as any).from("planning_members").insert(
          extra.map((uid) => ({
            planning_project_id: id, user_id: uid, company_id: byId.get(uid)?.company_id ?? null,
            role: "member", member_type: "internal",
          })),
        );
        if (mErr) toast.error(`Prosjektet ble opprettet, men deltakere kunne ikke legges til: ${mErr.message}`);
      }
      navigate(`/planlegging/${id}`, { replace: true });
    } catch (e: any) {
      toast.error(e.message ?? "Kunne ikke opprette prosjekt");
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => navigate("/planlegging")}>
        <ArrowLeft className="h-4 w-4" /> Planlegging
      </Button>
      <header>
        <h1 className="text-2xl font-bold text-foreground">Nytt planleggingsprosjekt</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Bare prosjektnavn er påkrevd. Resten kan fylles ut inne i prosjektrommet.
        </p>
      </header>
      <Card className="p-4 sm:p-6">
        <form
          onSubmit={(e) => { e.preventDefault(); submit(); }}
          className="space-y-6"
        >

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="planning-project-name">Prosjektnavn *</Label>
            <Input id="planning-project-name" data-testid="planning-project-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="F.eks. AQ Odin" autoFocus />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Kunde</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger><SelectValue placeholder="Velg kunde" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Ikke valgt</SelectItem>
                  {(lookups?.customers ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Overordnet ansvarlig</Label>
              <Select value={ownerUserId} onValueChange={setOwnerUserId}>
                <SelectTrigger><SelectValue placeholder="Velg person" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Ikke valgt</SelectItem>
                  {ownerOptions.map((u) => (
                    <SelectItem key={u.user_id} value={u.user_id}>{u.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Ansvarlig selskap</Label>
              <Select value={companyId} onValueChange={(v) => { setCompanyId(v); setDepartmentId(NONE); }}>
                <SelectTrigger><SelectValue placeholder="Velg selskap" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Ikke valgt</SelectItem>
                  {(lookups?.companies ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Ansvarlig avdeling</Label>
              <Select value={departmentId} onValueChange={setDepartmentId}>
                <SelectTrigger><SelectValue placeholder="Velg avdeling" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Ikke valgt</SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="planning-project-start">Forventet start</Label>
              <Input id="planning-project-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="planning-project-end">Forventet slutt</Label>
              <Input id="planning-project-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Deltakere</Label>
            <ParticipantPicker
              value={participants}
              onChange={(ids) => setParticipants(ids)}
              exclude={ownerUserId === NONE ? [] : [ownerUserId]}
              label="Velg interne deltakere (valgfritt)"
            />
            <p className="text-xs text-muted-foreground">
              Interne brukere som skal følge prosjektet. Kunde og kundekontakter legges til separat og gir ikke tilgang.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="planning-project-description">Kort beskrivelse</Label>
            <Textarea
              id="planning-project-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Hva gjelder prosjektet?"
            />
          </div>
        </div>

          <div className="flex justify-end gap-2 border-t border-border/40 pt-4">
            <Button type="button" variant="ghost" onClick={() => navigate("/planlegging")}>Avbryt</Button>
            <Button type="submit" data-testid="planning-project-submit" disabled={createProject.isPending}>
              {createProject.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Opprett prosjekt
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
