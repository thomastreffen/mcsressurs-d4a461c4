import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import {
  PARTICIPANT_ROLES,
  participantRoleLabel,
  uniqueParticipants,
  useEligibleParticipants,
  usePlanningLookups,
  usePlanningMemberMutations,
  usePlanningMembers,
  type PlanningProject,
} from "@/hooks/usePlanning";
import { ParticipantPicker } from "./ParticipantPicker";

/** Interne prosjektdeltakere – inline administrasjon i prosjektrommet (ingen modal). */
export function PlanningParticipants({ project }: { project: PlanningProject }) {
  const { data: members = [] } = usePlanningMembers(project.id);
  const { data: eligible } = useEligibleParticipants();
  const { data: lookups } = usePlanningLookups();
  const { addMembers, updateRole, removeMember } = usePlanningMemberMutations(project.id);
  const [pending, setPending] = useState<string[]>([]);

  const people = new Map(uniqueParticipants(eligible).map((p) => [p.user_id, p]));
  const userName = (id: string | null) =>
    (id && (people.get(id)?.full_name || lookups?.users.find((u) => u.user_id === id)?.name)) || "Ukjent bruker";
  const companyName = (id: string | null) => (id && lookups?.companies.find((c) => c.id === id)?.name) || null;
  const deptName = (id: string | null) => (id && lookups?.departments.find((d) => d.id === id)?.name) || null;

  const add = async () => {
    try {
      await addMembers.mutateAsync(
        pending.map((id) => ({ user_id: id, company_id: people.get(id)?.company_id, name: userName(id) })),
      );
      setPending([]);
      toast.success("Deltakere lagt til");
    } catch (e: any) {
      toast.error(e.message ?? "Kunne ikke legge til deltakere");
    }
  };

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Prosjektdeltakere</h2>
        <span className="text-xs text-muted-foreground">{members.length}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        Interne brukere som følger prosjektet. Kunde og kundekontakter gir ikke tilgang.
      </p>

      <ul className="space-y-2">
        {members.map((m) => {
          const isOwner = m.role === "owner";
          const name = userName(m.user_id);
          return (
            <li key={m.id} className="rounded-lg border border-border/40 p-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[companyName(m.company_id), deptName(m.department_id)].filter(Boolean).join(" · ") || "–"}
                  </p>
                </div>
                {!isOwner && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    aria-label={`Fjern ${name}`}
                    onClick={() => removeMember.mutate({ id: m.id, name }, { onError: (e: any) => toast.error(e.message) })}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                {isOwner ? (
                  <span className="text-xs font-medium text-primary">Overordnet ansvarlig</span>
                ) : (
                  <Select
                    value={m.role}
                    onValueChange={(role) =>
                      updateRole.mutate({ id: m.id, role, name }, { onError: (e: any) => toast.error(e.message) })
                    }
                  >
                    <SelectTrigger className="h-7 w-[150px] text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PARTICIPANT_ROLES.filter((r) => r.value !== "owner").map((r) => (
                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <span className="text-[11px] text-muted-foreground" title={`Lagt til av ${userName(m.created_by)}`}>
                  {m.created_by && m.created_by !== m.user_id ? `${userName(m.created_by).split(" ")[0]} · ` : ""}
                  {format(new Date(m.created_at), "d. MMM", { locale: nb })}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      <ParticipantPicker
        value={pending}
        onChange={(ids) => setPending(ids)}
        exclude={members.map((m) => m.user_id!).filter(Boolean)}
      />
      {pending.length > 0 && (
        <Button size="sm" className="w-full" onClick={add} disabled={addMembers.isPending}>
          Legg til {pending.length} {pending.length === 1 ? "deltaker" : "deltakere"}
        </Button>
      )}
      <p className="sr-only">{participantRoleLabel("member")}</p>
    </Card>
  );
}
