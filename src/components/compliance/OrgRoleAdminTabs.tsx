import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Check, X } from "lucide-react";
import {
  useRoleTemplates, useOrgRoleAudit, type ResponsibilityType, type RoleTemplate,
} from "@/hooks/useOrgRoleLibrary";

/* ---------- Ansvarstyper ---------- */

export function ResponsibilityTypesTab({
  types, upsert, usage,
}: {
  types: ResponsibilityType[];
  upsert: { mutate: (t: any) => void; isPending: boolean };
  usage: (key: string) => number;
}) {
  const [newName, setNewName] = useState("");
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Ansvarstyper</CardTitle>
        <p className="text-xs text-muted-foreground">Kategorier som grupperer roller. Standardtypene kan gis nytt navn eller deaktiveres, og dere kan legge til egne.</p>
      </CardHeader>
      <CardContent className="space-y-2 p-4 pt-0">
        {types.map((t) => (
          <div key={t.key} className="flex flex-wrap items-center gap-3 rounded-lg border p-2.5">
            {editKey === t.key ? (
              <>
                <Input className="h-8 max-w-xs" value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus />
                <Button size="sm" className="h-8" disabled={!editName.trim()} onClick={() => { upsert.mutate({ key: t.key, name: editName, is_active: t.is_active }); setEditKey(null); }}><Check className="h-3.5 w-3.5" /></Button>
                <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditKey(null)}><X className="h-3.5 w-3.5" /></Button>
              </>
            ) : (
              <>
                <span className={`font-medium ${t.is_active ? "" : "text-muted-foreground line-through"}`}>{t.name}</span>
                {t.is_standard && <Badge variant="outline" className="text-[10px]">Standard</Badge>}
                <span className="text-xs text-muted-foreground">{usage(t.key)} roller</span>
                <div className="ml-auto flex items-center gap-2">
                  <Button size="sm" variant="ghost" className="h-8" onClick={() => { setEditKey(t.key); setEditName(t.name); }}><Pencil className="h-3.5 w-3.5" /></Button>
                  <span className="text-xs text-muted-foreground">{t.is_active ? "Aktiv" : "Deaktivert"}</span>
                  <Switch checked={t.is_active} onCheckedChange={(v) => upsert.mutate({ key: t.key, name: t.name, is_active: v })} />
                </div>
              </>
            )}
          </div>
        ))}
        <div className="flex gap-2 pt-2">
          <Input className="h-9 max-w-xs" placeholder="Ny type, f.eks. Tavleansvar" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <Button size="sm" disabled={!newName.trim() || upsert.isPending} onClick={() => { upsert.mutate({ name: newName, is_active: true }); setNewName(""); }}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Legg til
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------- Rollebibliotek ---------- */

const EMPTY_TPL: Partial<RoleTemplate> = { title: "", role_type: "other", responsibilities: "", tasks: "", authority: "", is_active: true };

export function OrgRoleLibraryTab({ types, onUse }: { types: ResponsibilityType[]; onUse: (t: RoleTemplate) => void }) {
  const { templates, isLoading, save } = useRoleTemplates();
  const [edit, setEdit] = useState<Partial<RoleTemplate> | null>(null);
  const typeName = (k: string) => types.find((t) => t.key === k)?.name ?? "Annet";
  const set = (p: Partial<RoleTemplate>) => setEdit((e) => ({ ...(e ?? {}), ...p }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Gjenbrukbare maler med ferdig formulert ansvar, oppgaver og myndighet.</p>
        {!edit && <Button size="sm" onClick={() => setEdit({ ...EMPTY_TPL })}><Plus className="mr-1 h-3.5 w-3.5" /> Ny mal</Button>}
      </div>

      {edit && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Maltittel</Label><Input value={edit.title ?? ""} onChange={(e) => set({ title: e.target.value })} placeholder="F.eks. Ansvarlig for arbeid på elektrotavler" /></div>
              <div className="space-y-1.5">
                <Label>Type ansvar</Label>
                <Select value={edit.role_type ?? "other"} onValueChange={(v) => set({ role_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{types.filter((t) => t.is_active || t.key === edit.role_type).map((t) => <SelectItem key={t.key} value={t.key}>{t.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5"><Label>Ansvar</Label><Textarea rows={3} value={edit.responsibilities ?? ""} onChange={(e) => set({ responsibilities: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Oppgaver</Label><Textarea rows={5} value={edit.tasks ?? ""} onChange={(e) => set({ tasks: e.target.value })} placeholder="- én oppgave per linje" /></div>
            <div className="space-y-1.5"><Label>Myndighet / fullmakter</Label><Textarea rows={4} value={edit.authority ?? ""} onChange={(e) => set({ authority: e.target.value })} /></div>
            <div className="flex items-center gap-2"><Switch checked={edit.is_active !== false} onCheckedChange={(v) => set({ is_active: v })} /><span className="text-sm">Aktiv mal</span></div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEdit(null)}>Avbryt</Button>
              <Button disabled={!edit.title?.trim() || save.isPending} onClick={async () => { await save.mutateAsync(edit); setEdit(null); }}>Lagre mal</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? null : templates.length === 0 && !edit ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">Ingen maler ennå. Lag f.eks. «Ansvarlig for arbeid på elektrotavler» én gang og bruk den når rollen tildeles.</CardContent></Card>
      ) : (
        templates.map((t) => (
          <Card key={t.id} className={t.is_active ? "" : "opacity-60"}>
            <CardContent className="space-y-1.5 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{t.title}</span>
                <Badge variant="outline" className="text-[10px]">{typeName(t.role_type)}</Badge>
                {!t.is_active && <Badge variant="outline" className="text-[10px]">Inaktiv</Badge>}
                <div className="ml-auto flex gap-2">
                  <Button size="sm" variant="outline" className="h-8" onClick={() => setEdit(t)}><Pencil className="h-3.5 w-3.5" /></Button>
                  {t.is_active && <Button size="sm" className="h-8" onClick={() => onUse(t)}>Bruk mal</Button>}
                </div>
              </div>
              {t.responsibilities && <p className="text-sm whitespace-pre-line"><span className="text-muted-foreground">Ansvar:</span> {t.responsibilities}</p>}
              {t.tasks && <p className="text-sm whitespace-pre-line"><span className="text-muted-foreground">Oppgaver:</span> {t.tasks}</p>}
              {t.authority && <p className="text-sm whitespace-pre-line"><span className="text-muted-foreground">Myndighet:</span> {t.authority}</p>}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

/* ---------- Historikk ---------- */

const FIELD_LABEL: Record<string, string> = {
  title: "Rolletittel", role_type: "Type ansvar", person_id: "Ansvarlig person", deputy_person_id: "Stedfortreder",
  reports_to_id: "Rapporterer til", responsibilities: "Ansvar", tasks: "Oppgaver", authority: "Myndighet",
  valid_from: "Gyldig fra", valid_to: "Gyldig til", is_active: "Aktiv", additional_person_ids: "Flere ansvarlige",
};

export function OrgRoleHistoryTab({
  nameOf, roleTitle,
}: { nameOf: (id: string) => string; roleTitle: (id: string) => string | null }) {
  const q = useOrgRoleAudit();
  const fmt = (field: string, v: any): string => {
    if (v === null || v === undefined || v === "") return "—";
    if (field === "person_id" || field === "deputy_person_id") return nameOf(v);
    if (field === "reports_to_id") return roleTitle(v) ?? "annen rolle";
    if (field === "additional_person_ids") return (v as string[]).map(nameOf).join(", ") || "—";
    if (field === "is_active") return v ? "Ja" : "Nei";
    const s = String(v);
    return s.length > 160 ? s.slice(0, 160) + "…" : s;
  };
  const ACTION: Record<string, string> = { created: "Opprettet", updated: "Endret", deleted: "Fjernet" };

  if (q.isLoading) return null;
  if (q.error) return <p className="text-sm text-muted-foreground">Historikken er bare synlig for de som administrerer HMS.</p>;
  const rows = q.data ?? [];
  if (rows.length === 0) return <Card><CardContent className="p-6 text-sm text-muted-foreground">Ingen endringer logget ennå. Fra nå logges alle opprettelser og endringer av roller.</CardContent></Card>;

  return (
    <Card>
      <CardContent className="divide-y p-0">
        {rows.map((r) => (
          <div key={r.id} className="space-y-1 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="text-[10px]">{ACTION[r.action] ?? r.action}</Badge>
              <span className="font-medium">{r.payload?.title}</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {new Date(r.performed_at).toLocaleString("nb-NO")} · {r.performed_by_name ?? (r.performed_by ? "Ukjent bruker" : "System")}
              </span>
            </div>
            {r.action === "updated" &&
              Object.entries(r.payload?.changes ?? {}).map(([k, v]: [string, any]) => (
                <p key={k} className="text-xs">
                  <span className="text-muted-foreground">{FIELD_LABEL[k] ?? k}:</span> {fmt(k, v?.old)} → {fmt(k, v?.new)}
                </p>
              ))}
            {r.action === "created" && r.payload?.changes?.person_id && (
              <p className="text-xs"><span className="text-muted-foreground">Tildelt:</span> {nameOf(r.payload.changes.person_id)}</p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
