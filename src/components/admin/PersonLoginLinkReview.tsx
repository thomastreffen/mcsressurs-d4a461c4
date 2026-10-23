import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface ReviewRow { person_id: string; full_name: string; email: string; issue: string; companies: string | null }

/** Personer der koblingen til innlogging er usikker eller mangler. Entydige koblinger vises ikke. */
export function PersonLoginLinkReview() {
  const qc = useQueryClient();
  const { data = [] } = useQuery<ReviewRow[]>({
    queryKey: ["person-login-link-review"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("person_login_link_review");
      if (error) throw error;
      return data ?? [];
    },
  });
  if (data.length === 0) return null;

  const confirm = async (id: string) => {
    const { error } = await (supabase as any).rpc("confirm_person_login_link", { _person_id: id });
    if (error) return toast.error(error.message);
    toast.success("Kobling bekreftet");
    qc.invalidateQueries({ queryKey: ["person-login-link-review"] });
  };

  return (
    <Card className="space-y-3 p-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Kobling til innlogging – trenger gjennomgang</h2>
        <p className="text-xs text-muted-foreground">Disse personene kan få oppgaver, men kan ikke varsles før koblingen er i orden.</p>
      </div>
      <ul className="divide-y divide-border">
        {data.map((r) => (
          <li key={r.person_id} className="flex flex-wrap items-center gap-2 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">{r.full_name}</p>
              <p className="text-xs text-muted-foreground">{[r.email, r.companies].filter(Boolean).join(" · ")}</p>
              <p className="text-xs text-foreground">{r.issue}</p>
            </div>
            {r.issue === "Kobling ikke bekreftet" && (
              <Button size="sm" variant="outline" onClick={() => confirm(r.person_id)}>Bekreft kobling</Button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
