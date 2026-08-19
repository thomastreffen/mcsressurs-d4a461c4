import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ComplianceStatusBadge } from "@/components/compliance/ComplianceStatusBadge";
import { OrgChart } from "@/components/compliance/OrgChart";
import { OrgResponsibilityTable } from "@/components/compliance/OrgResponsibilityTable";
import { OrgGapPanel } from "@/components/compliance/OrgGapPanel";
import { Plus, Pencil, Trash2, Printer, Sparkles, Loader2, FileText } from "lucide-react";
import { useOrgRoles, useOrgRoleMutations, type OrgRole } from "@/hooks/useCompliance";
import { useOrgPeople } from "@/hooks/useOrgPeople";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ORG_ROLE_TYPES, formatDate } from "@/lib/compliance";
import { computeOrgGaps, suggestOrgRoles, orgDocumentVersion, type RoleSuggestion } from "@/lib/org-overview";

const EMPTY: Partial<OrgRole> = {
  title: "", role_type: "other", person_id: null, deputy_person_id: null, reports_to_id: null,
  responsibilities: "", tasks: "", authority: "", valid_from: null, valid_to: null, sort_order: 100,
} as any;

export default function ComplianceOrganisationPage() {
  const roles = useOrgRoles();
  const people = useOrgPeople();
  const { save, remove } = useOrgRoleMutations();
  const { activeCompany } = useCompanyContext() as any;
  const [editing, setEditing] = useState<(Partial<OrgRole> & { reports_to_id?: string | null }) | null>(null);
  const [aiDraft, setAiDraft] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [tab, setTab] = useState("roller");

  const activePeople = useMemo(() => (people.data ?? []).filter((p) => p.is_active), [people.data]);

  const personOf = (id: string | null | undefined) => (people.data ?? []).find((p) => p.person_id === id);
  const nameOf = (id: string | null | undefined) => personOf(id)?.full_name ?? "Ikke tildelt";
  const jobTitleOf = (id: string | null | undefined) => {
    const p = personOf(id);
    if (!p) return null;
    return [p.job_role_name, p.department_name].filter(Boolean).join(" · ") || null;
  };

  const list = roles.data ?? [];
  const gaps = useMemo(() => computeOrgGaps(list, people.data ?? []), [list, people.data]);
  const suggestions = useMemo(() => suggestOrgRoles(list, people.data ?? []), [list, people.data]);
  const version = useMemo(() => orgDocumentVersion(list), [list]);

  const grouped = useMemo(() => {
    const map = new Map<string, OrgRole[]>();
    for (const r of list) {
      const arr = map.get(r.role_type) ?? [];
      arr.push(r);
      map.set(r.role_type, arr);
    }
    return ORG_ROLE_TYPES.map((t) => ({ ...t, items: map.get(t.value) ?? [] })).filter((g) => g.items.length > 0);
  }, [list]);

  const set = (patch: Partial<OrgRole>) => setEditing((e) => ({ ...(e ?? {}), ...patch }));

  const openRole = (id: string) => {
    const r = list.find((x) => x.id === id);
    if (r) { setAiDraft(false); setEditing(r); }
  };

  const acceptSuggestion = (s: RoleSuggestion) => {
    setAiDraft(false);
    setEditing({
      ...EMPTY,
      title: s.spec.label,
      role_type: s.spec.role_type,
      person_id: s.person?.person_id ?? null,
    } as any);
  };

  const runAi = async () => {
    if (!editing?.title) return;
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("org-role-ai-draft", {
        body: {
          roleTitle: editing.title,
          roleType: editing.role_type,
          personJobTitle: jobTitleOf(editing.person_id),
          companyName: activeCompany?.name ?? null,
          activities: "Elektroinstallasjon, tavler, strømskinner, service og prosjekt i næringsbygg",
          current: {
            responsibilities: editing.responsibilities,
            tasks: editing.tasks,
            authority: editing.authority,
          },
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      set({
        responsibilities: (data as any).responsibilities || editing.responsibilities,
        tasks: (data as any).tasks || editing.tasks,
        authority: (data as any).authority || editing.authority,
      });
      setAiDraft(true);
      toast.success("AI-utkast satt inn – kontroller og rediger før lagring");
    } catch (e: any) {
      toast.error(e.message ?? "Kunne ikke hente AI-utkast");
    } finally {
      setAiLoading(false);
    }
  };

  const printableRoles = useMemo(
    () => [...list].sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title, "nb")),
    [list],
  );

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Organisasjon og ansvar</h1>
          <p className="text-sm text-muted-foreground">
            Roller, ansvar, oppgaver og myndighet – personopplysninger hentes fra ansattregisteret
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setTab("oversikt")}>
            <FileText className="mr-1 h-3.5 w-3.5" /> Generer organisasjonsoversikt
          </Button>
          <Button size="sm" variant="outline" onClick={() => window.print()}>
            <Printer className="mr-1 h-3.5 w-3.5" /> Skriv ut oversikt
          </Button>
          <Button size="sm" onClick={() => { setAiDraft(false); setEditing({ ...EMPTY } as any); }}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Ny rolle
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="print:hidden">
          <TabsTrigger value="roller">Roller</TabsTrigger>
          <TabsTrigger value="oversikt">Organisasjonsoversikt</TabsTrigger>
          <TabsTrigger value="kontroll">
            Systemkontroll
            {gaps.length > 0 && <Badge variant="secondary" className="ml-1.5 text-[10px]">{gaps.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="roller" className="space-y-4 print:hidden">
          {roles.isLoading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
          ) : grouped.length === 0 ? (
            <Card><CardContent className="p-6 text-sm text-muted-foreground">Ingen roller registrert. Legg inn HMS-ansvar, KS-ansvar og elektrofaglig ansvar for å kunne dokumentere organisasjonen ved tilsyn.</CardContent></Card>
          ) : (
            grouped.map((g) => (
              <Card key={g.value}>
                <CardHeader className="pb-2"><CardTitle className="text-sm">{g.label}</CardTitle></CardHeader>
                <CardContent className="space-y-2 p-4 pt-0">
                  {g.items.map((r) => (
                    <div key={r.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{r.title}</span>
                          <ComplianceStatusBadge
                            label={nameOf(r.person_id)}
                            tone={r.person_id ? (personOf(r.person_id)?.is_active ? "ok" : "alert") : "warn"}
                          />
                          {jobTitleOf(r.person_id) && (
                            <span className="text-xs text-muted-foreground">{jobTitleOf(r.person_id)}</span>
                          )}
                          {r.deputy_person_id && <span className="text-xs text-muted-foreground">Stedfortreder: {nameOf(r.deputy_person_id)}</span>}
                        </div>
                        {r.responsibilities && <p className="text-sm"><span className="text-muted-foreground">Ansvar:</span> {r.responsibilities}</p>}
                        {r.tasks && <p className="text-sm"><span className="text-muted-foreground">Oppgaver:</span> {r.tasks}</p>}
                        {r.authority && <p className="text-sm"><span className="text-muted-foreground">Myndighet:</span> {r.authority}</p>}
                        {(r.valid_from || r.valid_to) && (
                          <p className="text-xs text-muted-foreground">Gyldig {formatDate(r.valid_from)} – {r.valid_to ? formatDate(r.valid_to) : "løpende"}</p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="h-8" onClick={() => openRole(r.id)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="ghost" className="h-8 text-destructive" onClick={() => remove.mutate(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="oversikt" className="space-y-4">
          <Card className="org-print-root">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{activeCompany?.name ?? "Virksomheten"} – organisasjon, ansvar og myndighet</CardTitle>
              <p className="text-xs text-muted-foreground">
                {activeCompany?.org_number ? `Org.nr ${activeCompany.org_number} · ` : ""}
                Generert {formatDate(new Date().toISOString().slice(0, 10))} · Dokumentversjon {version}
              </p>
            </CardHeader>
            <CardContent className="space-y-6 p-4 pt-0">
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">1. Organisasjonskart</h3>
                <OrgChart roles={printableRoles} nameOf={nameOf} jobTitleOf={jobTitleOf} />
              </div>
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">2. Ansvars- og myndighetsoversikt</h3>
                <OrgResponsibilityTable roles={printableRoles} nameOf={nameOf} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="kontroll" className="print:hidden">
          <OrgGapPanel gaps={gaps} suggestions={suggestions} onFix={openRole} onAcceptSuggestion={acceptSuggestion} />
        </TabsContent>
      </Tabs>

      <Dialog open={!!editing} onOpenChange={(v) => !v && (setEditing(null), setAiDraft(false))}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Endre rolle" : "Ny rolle"}</DialogTitle>
            <DialogDescription>
              Navn, stilling og avdeling hentes fra ansattregisteret og registreres ikke på nytt her.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Rolletittel</Label>
                <Input value={editing?.title ?? ""} onChange={(e) => set({ title: e.target.value })} placeholder="F.eks. Faglig ansvarlig elektro" />
              </div>
              <div className="space-y-1.5">
                <Label>Type ansvar</Label>
                <Select value={editing?.role_type ?? "other"} onValueChange={(v) => set({ role_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ORG_ROLE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Ansvarlig person (aktive ansatte)</Label>
                <Select value={editing?.person_id ?? "none"} onValueChange={(v) => set({ person_id: v === "none" ? null : v })}>
                  <SelectTrigger><SelectValue placeholder="Velg" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Ikke tildelt</SelectItem>
                    {activePeople.map((p) => (
                      <SelectItem key={p.person_id} value={p.person_id}>
                        {p.full_name}{p.job_role_name ? ` – ${p.job_role_name}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {jobTitleOf(editing?.person_id) && (
                  <p className="text-[11px] text-muted-foreground">Fra ansattregister: {jobTitleOf(editing?.person_id)}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Stedfortreder</Label>
                <Select value={editing?.deputy_person_id ?? "none"} onValueChange={(v) => set({ deputy_person_id: v === "none" ? null : v })}>
                  <SelectTrigger><SelectValue placeholder="Velg" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Ingen</SelectItem>
                    {activePeople.map((p) => <SelectItem key={p.person_id} value={p.person_id}>{p.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Rapporterer til (for organisasjonskart)</Label>
              <Select
                value={(editing as any)?.reports_to_id ?? "none"}
                onValueChange={(v) => set({ reports_to_id: v === "none" ? null : v } as any)}
              >
                <SelectTrigger><SelectValue placeholder="Øverste nivå" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Øverste nivå</SelectItem>
                  {list.filter((r) => r.id !== editing?.id).map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-2.5">
              <p className="text-xs text-muted-foreground">
                AI kan foreslå formulering av ansvar, oppgaver og myndighet. Forslaget er et utkast som må bekreftes.
              </p>
              <Button size="sm" variant="outline" className="h-7 shrink-0 text-xs" disabled={!editing?.title || aiLoading} onClick={runAi}>
                {aiLoading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1 h-3.5 w-3.5" />}
                AI-utkast
              </Button>
            </div>
            {aiDraft && (
              <Badge variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-400">
                AI-utkast – kontroller og rediger før lagring
              </Badge>
            )}

            <div className="space-y-1.5">
              <Label>Ansvar</Label>
              <Textarea rows={3} value={editing?.responsibilities ?? ""} onChange={(e) => set({ responsibilities: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Oppgaver</Label>
              <Textarea rows={3} value={editing?.tasks ?? ""} onChange={(e) => set({ tasks: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Myndighet / fullmakter</Label>
              <Textarea rows={3} value={editing?.authority ?? ""} onChange={(e) => set({ authority: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Gyldig fra</Label>
                <Input type="date" value={editing?.valid_from ?? ""} onChange={(e) => set({ valid_from: e.target.value || null })} />
              </div>
              <div className="space-y-1.5">
                <Label>Gyldig til</Label>
                <Input type="date" value={editing?.valid_to ?? ""} onChange={(e) => set({ valid_to: e.target.value || null })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditing(null); setAiDraft(false); }}>Avbryt</Button>
            <Button
              disabled={!editing?.title || save.isPending}
              onClick={async () => {
                await save.mutateAsync(editing!);
                setEditing(null);
                setAiDraft(false);
              }}
            >
              {save.isPending ? "Lagrer…" : aiDraft ? "Bekreft og lagre" : "Lagre"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
