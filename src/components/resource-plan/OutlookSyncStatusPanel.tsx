import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, CalendarSync, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useEffectiveAppRole } from "@/hooks/usePreviewMode";
import {
  useHubOutlookLinks, useResolveHubOutlookConflict, useHubOutlookSyncSettings, useSetHubOutlookSyncSettings,
  conflictReasonLabel, linkStateLabel,
} from "@/hooks/useHubOutlookLinks";

/** Drawer with Hub<->Outlook appointment sync status for planners, plus superadmin pilot settings.
 * Read-only for the calendar itself; resolving a conflict only chooses which side's values win. */
export function OutlookSyncStatusPanel({ companyIds, open, onOpenChange }: { companyIds: string[]; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { isSuperAdmin } = useEffectiveAppRole();
  const links = useHubOutlookLinks(companyIds);
  const resolve = useResolveHubOutlookConflict();

  const rows = links.data ?? [];
  const conflicts = rows.filter((r) => r.state === "conflict");
  const attention = rows.filter((r) => r.state === "failed" || r.state === "deleted");
  const ok = rows.filter((r) => r.state === "synced" || r.state === "pending" || r.state === "dry_run");

  const onResolve = (linkId: string, resolution: "keep_hub" | "keep_outlook") => {
    resolve.mutate({ linkId, resolution }, {
      onSuccess: () => toast.success(resolution === "keep_hub" ? "Hubs versjon beholdes – sendes til Outlook på nytt" : "Outlooks versjon er tatt inn i Hub"),
      onError: (e) => toast.error(`Kunne ikke løse konflikten: ${e.message}`),
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2"><CalendarSync className="h-5 w-5" /> Kalendersynk – status</SheetTitle>
          <SheetDescription>
            Avtaler og oppgaver som deles mellom Hub og Outlook. Prosjektjobber berøres aldri her.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-6">
          {links.isLoading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Laster synkstatus …</div>}
          {links.isError && <p className="text-sm text-destructive">Kunne ikke hente synkstatus. Prøv igjen senere.</p>}

          {!links.isLoading && rows.length === 0 && (
            <p className="text-sm text-muted-foreground">Ingen avtaler eller oppgaver er koblet mot Outlook ennå.</p>
          )}

          {conflicts.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" /> Krever avklaring ({conflicts.length})</h3>
              {conflicts.map((r) => (
                <div key={r.link_id} className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium truncate">{r.task_title}</span>
                    <Badge variant="outline" className="shrink-0 border-amber-400 text-amber-700 dark:text-amber-300">{linkStateLabel(r.state)}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{conflictReasonLabel(r.conflict_reason)} · {r.mailbox}</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="default" disabled={resolve.isPending} onClick={() => onResolve(r.link_id, "keep_hub")}>Behold Hub</Button>
                    <Button size="sm" variant="outline" disabled={resolve.isPending} onClick={() => onResolve(r.link_id, "keep_outlook")}>Behold Outlook</Button>
                  </div>
                </div>
              ))}
            </section>
          )}

          {attention.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Trenger oppfølging ({attention.length})</h3>
              {attention.map((r) => (
                <div key={r.link_id} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm truncate">{r.task_title}</span>
                    <Badge variant="secondary" className="shrink-0">{linkStateLabel(r.state)}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{r.mailbox}{r.last_error ? ` · ${r.last_error.slice(0, 120)}` : ""}</p>
                </div>
              ))}
            </section>
          )}

          {ok.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">I synk ({ok.length})</h3>
              {ok.map((r) => (
                <div key={r.link_id} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm truncate">{r.task_title}</span>
                    <Badge variant="outline" className="shrink-0">{linkStateLabel(r.state)}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{r.mailbox}</p>
                </div>
              ))}
            </section>
          )}

          {isSuperAdmin && <PilotSettings />}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function PilotSettings() {
  const settings = useHubOutlookSyncSettings(true);
  const save = useSetHubOutlookSyncSettings();
  const [enabled, setEnabled] = useState(false);
  const [dryRun, setDryRun] = useState(true);
  const [inbound, setInbound] = useState(false);
  const [mailboxes, setMailboxes] = useState("");

  useEffect(() => {
    if (settings.data) {
      setEnabled(settings.data.enabled);
      setDryRun(settings.data.dry_run);
      setInbound(settings.data.inbound_enabled);
      setMailboxes((settings.data.pilot_mailboxes ?? []).join("\n"));
    }
  }, [settings.data]);

  if (!settings.data) return null;

  return (
    <section className="space-y-3 rounded-lg border border-border p-3">
      <h3 className="text-sm font-semibold">Pilotinnstillinger (kun superadmin)</h3>
      <p className="text-xs text-muted-foreground">
        Synk av avtaler/oppgaver til Outlook er av som standard. Aktivering krever godkjent testpostkasse.
        Prosjektjobber har egen app-only-tjeneste som fortsatt er av.
      </p>
      <label className="flex items-center justify-between gap-3 text-sm">
        Ut sending Hub → Outlook
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </label>
      <label className="flex items-center justify-between gap-3 text-sm">
        Kun testkjøring (dry run – ingen echte endringer i Outlook)
        <Switch checked={dryRun} onCheckedChange={setDryRun} />
      </label>
      <label className="flex items-center justify-between gap-3 text-sm">
        Innsynk Outlook → Hub
        <Switch checked={inbound} onCheckedChange={setInbound} />
      </label>
      <div className="space-y-1">
        <label className="text-sm">Pilotpostkasser (én per linje)</label>
        <Textarea rows={3} value={mailboxes} onChange={(e) => setMailboxes(e.target.value)} placeholder="test@mcs.no" />
      </div>
      <Button
        size="sm"
        disabled={save.isPending}
        onClick={() => save.mutate(
          { enabled, dry_run: dryRun, inbound_enabled: inbound, pilot_mailboxes: mailboxes.split("\n").map((m) => m.trim().toLowerCase()).filter(Boolean) },
          { onSuccess: () => toast.success("Innstillinger lagret"), onError: (e) => toast.error(`Kunne ikke lagre: ${e.message}`) },
        )}
      >
        Lagre innstillinger
      </Button>
    </section>
  );
}
