import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useTechnicians } from "@/hooks/useTechnicians";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, CalendarDays, ArrowRightLeft } from "lucide-react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { notifyJobAssignment } from "@/lib/notify-job-assignment";


interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  calculationId: string;
  offerId?: string;
  defaultTitle?: string;
  defaultCustomer?: string;
  defaultDescription?: string;
  totalPrice?: number;
  offerNumber?: string;
}

export function ConvertToJobDialog({
  open, onOpenChange, calculationId, offerId,
  defaultTitle, defaultCustomer, defaultDescription,
  totalPrice, offerNumber,
}: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeCompanyId } = useCompanyContext();
  const [creating, setCreating] = useState(false);

  const [title, setTitle] = useState(defaultTitle || "");
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [projectLeader, setProjectLeader] = useState<string>("");
  const [createWorkPackages, setCreateWorkPackages] = useState(false);
  const { technicians } = useTechnicians(activeCompanyId);

  // Reset form when opened
  useEffect(() => {
    if (open) {
      setTitle(defaultTitle || "");
      setStartDate(undefined);
      setProjectLeader("");
      setCreateWorkPackages(false);
    }
  }, [open, defaultTitle]);

  const handleCreate = async () => {
    if (!title.trim()) { toast.error("Prosjektnavn er påkrevd"); return; }
    if (!startDate) { toast.error("Velg startdato"); return; }
    setCreating(true);

    try {
      const start = new Date(startDate);
      start.setHours(8, 0, 0, 0);
      const end = new Date(start);
      end.setHours(16, 0, 0, 0);

      // 1. Create project
      const { data: event, error } = await supabase.from("events").insert({
        title: title.trim(),
        customer: (defaultCustomer || "").trim() || null,
        description: defaultDescription?.trim() || null,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        status: "approved",
        technician_id: projectLeader || null,
        created_by: user?.id,
        offer_id: offerId || null,
        project_type: "project",
        company_id: activeCompanyId,
      } as any).select("id").single();

      if (error) {
        toast.error("Kunne ikke opprette prosjekt", { description: error.message });
        setCreating(false);
        return;
      }

      // 2. Assign project leader as technician
      if (projectLeader) {
        await supabase.from("event_technicians").insert({
          event_id: event.id,
          technician_id: projectLeader,
        });
      }

      // 3. Update calculation status to "converted"
      if (projectLeader) await notifyJobAssignment(event.id, [projectLeader], false);
      await supabase.from("calculations").update({
        status: "converted" as any,
      }).eq("id", calculationId);

      // 4. Log activity on project
      await supabase.from("activity_log").insert({
        entity_id: event.id,
        entity_type: "event",
        action: "created",
        type: "system",
        title: `Opprettet fra tilbud${offerNumber ? ` ${offerNumber}` : ""}`,
        description: `Prosjekt opprettet fra tilbud med budsjett kr ${(totalPrice || 0).toLocaleString("nb-NO")}`,
        performed_by: user?.id,
      });

      // 5. Log activity on calculation
      await supabase.from("activity_log").insert({
        entity_id: calculationId,
        entity_type: "calculation",
        action: "converted",
        type: "system",
        title: "Konvertert til prosjekt",
        description: `Tilbudet er konvertert til prosjekt "${title.trim()}"`,
        performed_by: user?.id,
      });

      toast.success("Prosjekt opprettet", {
        description: `"${title.trim()}" er klart i prosjektlisten`,
      });
      onOpenChange(false);
      navigate(`/projects/${event.id}`);
    } catch (err: any) {
      toast.error("Noe gikk galt", { description: err.message });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-primary" />
            Konverter til prosjekt
          </DialogTitle>
          <DialogDescription>
            Opprett et nytt prosjekt basert på dette tilbudet. Tilbudet markeres som vunnet.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Budget summary */}
          {totalPrice !== undefined && totalPrice > 0 && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-center">
              <p className="text-xs text-muted-foreground">Budsjett fra tilbud</p>
              <p className="text-lg font-bold text-primary font-mono">
                kr {totalPrice.toLocaleString("nb-NO", { maximumFractionDigits: 0 })}
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Prosjektnavn *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Prosjektnavn"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Prosjektleder</Label>
            <Select value={projectLeader} onValueChange={setProjectLeader}>
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder="Velg prosjektleder" />
              </SelectTrigger>
              <SelectContent>
                {technicians.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Startdato *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start gap-2 font-normal rounded-xl">
                  <CalendarDays className="h-4 w-4" />
                  {startDate ? format(startDate, "EEEE d. MMMM yyyy", { locale: nb }) : "Velg dato"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={startDate}
                  onSelect={setStartDate}
                  locale={nb}
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-border/40 p-3">
            <Checkbox
              id="create-wp"
              checked={createWorkPackages}
              onCheckedChange={(v) => setCreateWorkPackages(!!v)}
            />
            <label htmlFor="create-wp" className="text-sm cursor-pointer">
              <span className="font-medium">Opprett arbeidspakker fra kalkylelinjer</span>
              <p className="text-xs text-muted-foreground mt-0.5">
                Hver post i kalkylen blir en egen arbeidspakke
              </p>
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">
            Avbryt
          </Button>
          <Button
            onClick={handleCreate}
            disabled={creating}
            className="gap-1.5 rounded-xl bg-primary hover:bg-primary/90"
          >
            {creating && <Loader2 className="h-4 w-4 animate-spin" />}
            Opprett prosjekt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
