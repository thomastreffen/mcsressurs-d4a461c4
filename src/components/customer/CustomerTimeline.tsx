import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { HISTORY_LABELS } from "@/lib/customer-register";

const KIND: Record<string, string> = { lead: "Henvendelse", offer: "Tilbud", project: "Prosjekt", invoice_basis: "Fakturagrunnlag", email: "E-post", register: "Register" };
type Row = { kind: string; ref_id: string; at: string; title: string; detail: string; account_id: string | null };

/** Read-only combined history across leads, offers, projects, invoice basis, CRM email and register changes. */
export function CustomerTimeline({ companyId, customerId, accountId }: { companyId: string; customerId: string; accountId: string | null }) {
  const q = useQuery({ queryKey: ["customer-timeline", companyId, customerId, accountId], queryFn: async () => {
    const { data, error } = await supabase.rpc("customer_timeline", { _company_id: companyId, _customer_id: customerId, _account_id: accountId as any });
    if (error) throw error; return (data as unknown as Row[]) ?? [];
  } });
  if (!q.data?.length) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">Samlet historikk{accountId ? " for avdelingen" : ""}</h3>
      <ul className="space-y-1.5">
        {q.data.slice(0, 40).map((r) => (
          <li key={`${r.kind}-${r.ref_id}`} className="text-xs flex flex-wrap gap-x-2">
            <span className="text-muted-foreground">{new Date(r.at).toLocaleDateString("nb-NO")}</span>
            <span className="font-medium">{KIND[r.kind] ?? r.kind}</span>
            <span>{r.kind === "register" ? `${HISTORY_LABELS[r.detail] ?? r.detail}${r.title ? `: ${r.title}` : ""}` : `${r.title} · ${r.detail}`}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
