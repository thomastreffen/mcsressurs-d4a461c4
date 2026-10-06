import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, UserPlus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { uniqueParticipants, useEligibleParticipants, type EligibleParticipant } from "@/hooks/usePlanning";

/**
 * Fler-valg av interne deltakere. Viser bare personer innlogget bruker har lov til å se
 * (planning_eligible_participants – samme regel håndheves ved lagring).
 */
export function ParticipantPicker({
  value,
  onChange,
  exclude = [],
  label = "Legg til deltakere",
  showChips = true,
}: {
  value: string[];
  onChange: (ids: string[], people: EligibleParticipant[]) => void;
  exclude?: string[];
  label?: string;
  showChips?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { data } = useEligibleParticipants();
  const people = uniqueParticipants(data).filter((p) => !exclude.includes(p.user_id));
  const byId = new Map(people.map((p) => [p.user_id, p]));

  const toggle = (id: string) => {
    const next = value.includes(id) ? value.filter((x) => x !== id) : [...value, id];
    onChange(next, next.map((x) => byId.get(x)).filter(Boolean) as EligibleParticipant[]);
  };

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" className="w-full justify-start gap-2" data-testid="participant-picker">
            <UserPlus className="h-4 w-4" />
            {value.length > 0 ? `${value.length} valgt` : label}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[340px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Søk etter person, firma eller avdeling…" />
            <CommandList>
              <CommandEmpty>Ingen personer du har tilgang til.</CommandEmpty>
              <CommandGroup>
                {people.map((p) => (
                  <CommandItem
                    key={p.user_id}
                    value={`${p.full_name} ${p.company_name} ${p.department_name ?? ""}`}
                    onSelect={() => toggle(p.user_id)}
                  >
                    <Check className={cn("mr-2 h-4 w-4", value.includes(p.user_id) ? "opacity-100" : "opacity-0")} />
                    <div className="min-w-0">
                      <p className="truncate text-sm">{p.full_name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[p.company_name, p.department_name].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {showChips && value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((id) => (
            <Badge key={id} variant="secondary" className="gap-1">
              {byId.get(id)?.full_name ?? "Ukjent"}
              <button type="button" onClick={() => toggle(id)} aria-label="Fjern">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
