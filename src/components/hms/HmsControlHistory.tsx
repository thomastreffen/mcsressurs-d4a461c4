import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";

export function HmsControlHistory({ entity, id }: { entity: string; id: string }) {
  const { activeCompanyId: cid } = useCompanyContext();
  const { data, error } = useQuery({
    queryKey: ["hms-control-history", cid, entity, id], enabled: !!cid,
    queryFn: async () => {
      const result = await supabase.from("hms_audit_log").select("id, performed_at, performed_by, action, payload")
        .eq("company_id", cid ?? "").eq("entity_type", entity).eq("entity_id", id).order("performed_at", { ascending: false }).limit(50);
      if (result.error) throw result.error;
      return result.data;
    },
  });
  return <details className="mt-3 w-full border-t pt-3 text-sm">
    <summary className="min-h-11 cursor-pointer">Endringshistorikk</summary>
    {error && <p role="alert">Kunne ikke hente historikk.</p>}
    {(data ?? []).map(row => <div key={row.id} className="py-2 border-b break-words">
      <p>{new Date(row.performed_at).toLocaleString("nb-NO")} · {row.performed_by ?? "System"} · {row.action}</p>
      {Object.entries((row.payload as { changes?: Record<string, { old: unknown; new: unknown }> })?.changes ?? {}).map(([key, change]) =>
        <p key={key} className="text-muted-foreground">{key}: {JSON.stringify(change.old)} → {JSON.stringify(change.new)}</p>)}
    </div>)}
  </details>;
}