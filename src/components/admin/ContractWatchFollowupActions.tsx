import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Phone, Clock, Undo2 } from "lucide-react";

export function ContractWatchFollowupActions({ id, resolved, snoozed }: { id: string; resolved: boolean; snoozed: boolean }) {
  const qc = useQueryClient();
  const act = useMutation({ mutationFn: async (action: "phone" | "snooze" | "reopen") => {
    const { error } = await supabase.rpc("cw_followup", { _id: id, _action: action }); if (error) throw error;
  }, onSuccess: () => { qc.invalidateQueries({ queryKey: ["cw-followups"] }); qc.invalidateQueries({ queryKey: ["cw-dashboard"] }); } });
  return <div className="flex flex-wrap gap-2 items-center">
    {resolved || snoozed ? <><span className="text-xs text-muted-foreground">{resolved ? "Håndtert på telefon" : "Slumret i 24 timer"}</span><Button variant="ghost" size="sm" disabled={act.isPending} onClick={() => act.mutate("reopen")}><Undo2 className="h-4 w-4 mr-1" />Åpne igjen</Button></> : <>
      <Button variant="outline" size="sm" disabled={act.isPending} onClick={() => act.mutate("phone")}><Phone className="h-4 w-4 mr-1" />Håndtert på telefon</Button>
      <Button variant="ghost" size="sm" disabled={act.isPending} onClick={() => act.mutate("snooze")}><Clock className="h-4 w-4 mr-1" />Slumre 24 timer</Button>
    </>}
    {act.isError && <span role="alert" className="text-xs text-destructive">Kunne ikke lagre: {act.error.message}</span>}
  </div>;
}