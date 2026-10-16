import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

const sb = supabase as any;

export const ACCESS_MODULES: Record<string, string> = {
  resource_plan: "Ressursplan", planning: "Planlegging", customers: "Kunder og kontakter", hms: "HMS/HR",
  finance: "Økonomi", organisation: "Organisasjon", employees: "Ansatte", documents: "Dokumenter",
};
export const ACCESS_LEVELS: Record<string, string> = { view: "Se", edit: "Se + endre", admin: "Admin" };
const ACTION: Record<string, string> = { granted: "Gitt", changed: "Endret", revoked: "Fjernet" };

interface Props {
  authUserId: string;
  companies: { id: string; name: string }[];
}

export function CrossCompanyAccessCard({ authUserId, companies }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState({ company_id: "", module: "resource_plan", level: "view", valid_from: "", valid_to: "", reason: "" });
  const cname = (id: string | null) => companies.find((c) => c.id === id)?.name ?? "Ukjent selskap";

  const home = useQuery({
    queryKey: ["home-employment", authUserId],
    queryFn: async () => {
      const { data } = await sb.from("user_accounts").select("person_id").eq("auth_user_id", authUserId).maybeSingle();
      if (!data) return null;
      const { data: ep } = await sb.from("employment_profiles")
        .select("company_id, is_primary, internal_companies(name), departments(name)")
        .eq("person_id", data.person_id).is("archived_at", null).order("is_primary", { ascending: false });
      return ep ?? [];
    },
  });
  const grants = useQuery({
    queryKey: ["cma", authUserId],
    queryFn: async () => {
      const { data, error } = await sb.from("company_module_access").select("*").eq("user_id", authUserId).is("revoked_at", null).order("granted_at");
      if (error) throw error;
      return data ?? [];
    },
  });
  const log = useQuery({
    queryKey: ["cma-log", authUserId],
    queryFn: async () => {
      const { data } = await sb.from("access_audit_log").select("*").eq("user_id", authUserId).order("performed_at", { ascending: false }).limit(50);
      return data ?? [];
    },
  });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["cma", authUserId] }); qc.invalidateQueries({ queryKey: ["cma-log", authUserId] }); };

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await sb.from("company_module_access").insert({
        user_id: authUserId, company_id: form.company_id, module: form.module, level: form.level,
        valid_from: form.valid_from || null, valid_to: form.valid_to || null, reason: form.reason.trim(), granted_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Tilgang gitt"); setForm((f) => ({ ...f, reason: "", valid_from: "", valid_to: "" })); refresh(); },
    onError: (e: any) => toast.error(e.message?.includes("duplicate") ? "Personen har allerede tilgang til denne modulen i selskapet – endre den i listen" : e.message),
  });
  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: any }) => {
      const { error } = await sb.from("company_module_access").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Lagret"); refresh(); },
    onError: (e: any) => toast.error(e.message),
  });

  const homeRows = home.data ?? [];
  const homeIds = new Set(homeRows.map((r: any) => r.company_id));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Tilgang til andre selskaper</CardTitle>
        <p className="text-xs text-muted-foreground">
          Ansettelse og tilgang er to forskjellige ting. Tilgang her gjør ikke personen til ansatt, og gir bare de modulene som er valgt.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
          <p className="text-xs font-medium text-muted-foreground">Ansatt i</p>
          {homeRows.length === 0 ? <p>Ikke registrert som ansatt noe sted</p> : homeRows.map((r: any) => (
            <p key={r.company_id}>
              {r.internal_companies?.name}{r.departments?.name ? ` · ${r.departments.name}` : ""}
              {r.is_primary && <Badge variant="outline" className="ml-2 text-[10px]">Primær arbeidsgiver</Badge>}
            </p>
          ))}
          {homeRows.length > 1 && <p className="mt-1 text-xs text-destructive">Registrert som ansatt i flere selskaper – kontroller om dette stemmer.</p>}
        </div>

        {(grants.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Ingen tilgang til andre selskaper.</p>
        ) : (
          <div className="space-y-2">
            {(grants.data ?? []).map((g: any) => (
              <div key={g.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2.5 text-sm">
                <span className="font-medium">{cname(g.company_id)}</span>
                <Badge variant="secondary">{ACCESS_MODULES[g.module]}</Badge>
                <Select value={g.level} onValueChange={(v) => update.mutate({ id: g.id, patch: { level: v } })}>
                  <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(ACCESS_LEVELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
                {(g.valid_from || g.valid_to) && <span className="text-xs text-muted-foreground">{g.valid_from ?? "…"} – {g.valid_to ?? "løpende"}</span>}
                {g.reason && <span className="w-full text-xs text-muted-foreground">Begrunnelse: {g.reason}</span>}
                <Button size="sm" variant="ghost" className="ml-auto h-8 text-destructive"
                  onClick={() => window.confirm("Fjerne denne tilgangen?") && update.mutate({ id: g.id, patch: { revoked_at: new Date().toISOString(), revoked_by: user?.id } })}>
                  Fjern
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-3 rounded-lg border p-3">
          <p className="text-sm font-medium">Gi ny tilgang</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5"><Label>Selskap</Label>
              <Select value={form.company_id} onValueChange={(v) => setForm({ ...form, company_id: v })}>
                <SelectTrigger><SelectValue placeholder="Velg selskap" /></SelectTrigger>
                <SelectContent>{companies.filter((c) => !homeIds.has(c.id)).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Modul</Label>
              <Select value={form.module} onValueChange={(v) => setForm({ ...form, module: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(ACCESS_MODULES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Rettighet</Label>
              <Select value={form.level} onValueChange={(v) => setForm({ ...form, level: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(ACCESS_LEVELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Gyldig fra</Label><Input type="date" value={form.valid_from} onChange={(e) => setForm({ ...form, valid_from: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Gyldig til</Label><Input type="date" value={form.valid_to} onChange={(e) => setForm({ ...form, valid_to: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Begrunnelse</Label><Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Påkrevd" /></div>
          </div>
          <div className="flex justify-end">
            <Button size="sm" disabled={!form.company_id || !form.reason.trim() || add.isPending} onClick={() => add.mutate()}>Gi tilgang</Button>
          </div>
        </div>

        {(log.data ?? []).length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Revisjonsspor</p>
            {(log.data ?? []).map((l: any) => (
              <p key={l.id} className="text-xs">
                {new Date(l.performed_at).toLocaleString("nb-NO")} · {ACTION[l.action] ?? l.action}: {cname(l.company_id)} · {ACCESS_MODULES[l.module] ?? l.module} · {ACCESS_LEVELS[l.level] ?? l.level}
                {l.details?.old_level && l.action === "changed" ? ` (var ${ACCESS_LEVELS[l.details.old_level]})` : ""}
                {l.home_company_id ? ` · hjemselskap ${cname(l.home_company_id)}` : ""}
              </p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
