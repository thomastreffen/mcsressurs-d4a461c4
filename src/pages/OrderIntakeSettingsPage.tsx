import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, AlertTriangle, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { nb } from "date-fns/locale";

type Member = { user_account_id: string; full_name: string; email: string | null; is_superadmin: boolean; has_admin: boolean; notify: boolean };

const rpc = supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: any; error: any }>;

export default function OrderIntakeSettingsPage() {
  const { isSuperAdmin, roleReady } = useAuth();
  const { companies, activeCompanyId } = useCompanyContext();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [companyId, setCompanyId] = useState<string | null>(activeCompanyId);
  const [q, setQ] = useState("");
  const cid = companyId ?? companies[0]?.id ?? null;

  const members = useQuery({
    queryKey: ["order-intake-members", cid],
    enabled: !!cid && isSuperAdmin,
    queryFn: async () => {
      const { data, error } = await rpc("list_order_intake_members", { _company_id: cid });
      if (error) throw error;
      return (data ?? []) as Member[];
    },
  });
  const candidates = useQuery({
    queryKey: ["order-intake-candidates", cid, q],
    enabled: !!cid && isSuperAdmin && q.trim().length >= 2,
    queryFn: async () => {
      const { data, error } = await rpc("search_order_intake_candidates", { _company_id: cid, _q: q.trim() });
      if (error) throw error;
      return (data ?? []) as { user_account_id: string; full_name: string; email: string | null }[];
    },
  });
  const history = useQuery({
    queryKey: ["order-intake-history", cid],
    enabled: !!cid && isSuperAdmin,
    queryFn: async () => {
      const { data, error } = await rpc("list_order_intake_history", { _company_id: cid });
      if (error) throw error;
      return (data ?? []) as { performed_at: string; person_name: string | null; performed_by_name: string | null; details: any }[];
    },
  });

  if (roleReady && !isSuperAdmin) return <Navigate to="/orders" replace />;

  const save = async (id: string, admin: boolean, notify: boolean) => {
    const { error } = await rpc("set_order_intake_member", { _company_id: cid, _user_account_id: id, _admin: admin, _notify: notify });
    if (error) { toast.error(error.message); return; }
    toast.success("Lagret");
    setQ("");
    qc.invalidateQueries({ queryKey: ["order-intake-members", cid] });
    qc.invalidateQueries({ queryKey: ["order-intake-history", cid] });
  };

  const list = members.data ?? [];
  const noRecipients = members.isSuccess && !list.some((m) => m.notify);
  const existing = new Set(list.map((m) => m.user_account_id));
  const label = (d: any) => `${d?.admin ? "Admin" : "Ingen admin"}, ${d?.notify ? "varsling på" : "varsling av"}`;

  return (
    <div className="space-y-4 p-4 sm:p-6 max-w-4xl mx-auto pb-24">
      <Button variant="ghost" size="sm" onClick={() => navigate("/orders")}><ArrowLeft className="h-4 w-4 mr-1" />Bestillinger</Button>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Ansvar og varsling</h1>
          <p className="text-sm text-muted-foreground">Hvem administrerer innkommende bestillinger, og hvem får varsel om nye.</p>
        </div>
        <Select value={cid ?? undefined} onValueChange={setCompanyId}>
          <SelectTrigger className="w-60"><SelectValue placeholder="Velg selskap" /></SelectTrigger>
          <SelectContent>{companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {noRecipients && (
        <div className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <span>Ingen mottar varsel om nye bestillinger i dette selskapet. Nye bestillinger går da til superadmin som reserve.</span>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="grid grid-cols-[1fr_auto_auto] gap-x-6 px-4 py-2 text-xs font-medium text-muted-foreground border-b">
            <span>Person</span><span>Admin-tilgang</span><span>Varsle ved ny bestilling</span>
          </div>
          {list.map((m) => (
            <div key={m.user_account_id} className="grid grid-cols-[1fr_auto_auto] items-center gap-x-6 px-4 py-3 border-b last:border-0">
              <div className="min-w-0">
                <div className="font-medium truncate">{m.full_name}</div>
                <div className="text-xs text-muted-foreground truncate">{m.email}</div>
              </div>
              <div className="w-28">
                {m.is_superadmin ? <Badge variant="secondary">Alltid (superadmin)</Badge>
                  : <Switch checked={m.has_admin} aria-label={`Admin-tilgang ${m.full_name}`} onCheckedChange={(v) => save(m.user_account_id, v, v ? m.notify : false)} />}
              </div>
              <div className="w-36">
                <Switch checked={m.notify} disabled={!m.has_admin && !m.is_superadmin} aria-label={`Varsling ${m.full_name}`}
                  onCheckedChange={(v) => save(m.user_account_id, m.has_admin, v)} />
              </div>
            </div>
          ))}
          {members.isLoading && <p className="p-4 text-sm text-muted-foreground">Laster …</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Legg til ansvarlig</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Søk ansatt (navn eller e-post)" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">Viser bare aktive ansatte med bekreftet innlogging i valgt selskap. Admin-tilgang og varsling slås på.</p>
          {(candidates.data ?? []).filter((c) => !existing.has(c.user_account_id)).map((c) => (
            <div key={c.user_account_id} className="flex items-center justify-between rounded-md border p-2">
              <div><div className="text-sm font-medium">{c.full_name}</div><div className="text-xs text-muted-foreground">{c.email}</div></div>
              <Button size="sm" onClick={() => save(c.user_account_id, true, true)}>Legg til</Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Historikk</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          {(history.data ?? []).length === 0 && <p className="text-muted-foreground">Ingen endringer ennå.</p>}
          {(history.data ?? []).map((h, i) => (
            <div key={i} className="flex flex-wrap gap-x-2">
              <span className="text-muted-foreground">{format(new Date(h.performed_at), "d. MMM yyyy HH:mm", { locale: nb })}</span>
              <span>{h.performed_by_name ?? "Ukjent"} endret {h.person_name ?? "ukjent"}: {label(h.details?.before)} → {label(h.details?.after)}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
