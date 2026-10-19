import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ENTITY_LABELS, type EntityType } from "@/lib/project-classification";

interface Row {
  id: string; title: string; customer: string | null; project_type: string | null;
  entity_type: EntityType; classification_status: string; classification_reason: string | null;
  company_id: string | null; created_at: string; project_number: string | null;
}

export default function ProjectClassificationPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [projects, setProjects] = useState<Row[]>([]);
  const [search, setSearch] = useState("");
  const [moving, setMoving] = useState<string | null>(null);
  const [parentSearch, setParentSearch] = useState("");

  async function load() {
    const sel = "id,title,customer,project_type,entity_type,classification_status,classification_reason,company_id,created_at,project_number";
    const [q, p] = await Promise.all([
      supabase.from("events").select(sel).is("deleted_at", null).eq("classification_status", "needs_review").order("created_at", { ascending: false }),
      supabase.from("events").select(sel).is("deleted_at", null).eq("entity_type", "financial_project").order("title"),
    ]);
    setRows((q.data as Row[]) ?? []);
    setProjects((p.data as Row[]) ?? []);
  }
  useEffect(() => { load(); }, []);

  async function classify(r: Row, entity_type: EntityType, parent?: string) {
    const { data: u } = await supabase.auth.getUser();
    const patch: Record<string, unknown> = {
      entity_type, classification_status: "confirmed", classified_by: u.user?.id, classified_at: new Date().toISOString(),
      classification_reason: `Manuelt: ${ENTITY_LABELS[entity_type]}`,
    };
    if (parent) patch.parent_project_id = parent;
    if (entity_type === "financial_project") patch.parent_project_id = null;
    const { error } = await supabase.from("events").update(patch).eq("id", r.id);
    if (error) return toast.error(error.message);
    await supabase.from("activity_log").insert({
      entity_type: "event", entity_id: r.id, action: "classification_changed", performed_by: u.user?.id,
      description: `Klassifisert som ${ENTITY_LABELS[entity_type]} (var ${ENTITY_LABELS[r.entity_type]})`,
      metadata: { old: r.entity_type, new: entity_type, parent_project_id: parent ?? null },
    } as never);
    toast.success("Lagret");
    setMoving(null);
    load();
  }

  const filtered = useMemo(() => rows.filter((r) => `${r.title} ${r.customer ?? ""}`.toLowerCase().includes(search.toLowerCase())), [rows, search]);

  return (
    <div className="p-6 space-y-4 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold">Prosjektklassifisering</h1>
        <p className="text-sm text-muted-foreground">Avklar hva som er økonomisk prosjekt før Tripletex-koblingen aktiveres. {rows.length} poster venter.</p>
      </div>
      <Input placeholder="Søk tittel eller kunde" value={search} onChange={(e) => setSearch(e.target.value)} />
      <div className="divide-y rounded-md border">
        {filtered.map((r) => {
          const candidates = projects.filter((p) => p.id !== r.id && p.company_id === r.company_id && `${p.title} ${p.project_number ?? ""}`.toLowerCase().includes(parentSearch.toLowerCase())).slice(0, 8);
          return (
            <div key={r.id} className="p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="font-medium">{r.title}</div>
                  <div className="text-xs text-muted-foreground">{r.customer || "Ingen kunde"} · {new Date(r.created_at).toLocaleDateString("nb-NO")} · {r.classification_reason}</div>
                </div>
                <Badge variant="outline">{ENTITY_LABELS[r.entity_type]}</Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => classify(r, "financial_project")}>Gjør til prosjekt</Button>
                <Button size="sm" variant="outline" onClick={() => { setMoving(moving === r.id ? null : r.id); setParentSearch(""); }}>Jobb under prosjekt…</Button>
                <Button size="sm" variant="outline" onClick={() => classify(r, "service")}>Serviceoppdrag</Button>
                <Button size="sm" variant="outline" onClick={() => classify(r, "internal")}>Intern aktivitet</Button>
              </div>
              {moving === r.id && (
                <div className="space-y-1 rounded-md bg-muted p-2">
                  <Input placeholder="Søk prosjekt" value={parentSearch} onChange={(e) => setParentSearch(e.target.value)} />
                  {candidates.map((p) => (
                    <button key={p.id} className="block w-full text-left text-sm px-2 py-1 rounded hover:bg-background" onClick={() => classify(r, "job", p.id)}>
                      {p.project_number ? `${p.project_number} – ` : ""}{p.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && <div className="p-6 text-sm text-muted-foreground">Ingen poster venter på avklaring.</div>}
      </div>
    </div>
  );
}
