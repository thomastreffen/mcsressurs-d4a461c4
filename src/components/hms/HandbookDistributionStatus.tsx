import { useMemo, useState } from "react";
import { BellRing, Download, Loader2, Send } from "lucide-react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import {
  useHandbookDistributions, useHandbookRecipients, useSendHandbook,
  recipientState, RECIPIENT_STATE_LABEL, type RecipientState,
} from "@/hooks/useHandbookDistribution";
import { HandbookDistributeDialog } from "@/components/hms/HandbookDistributeDialog";

const STATE_VARIANT: Record<RecipientState, "default" | "secondary" | "outline" | "destructive"> = {
  acknowledged: "default",
  opened: "secondary",
  sent: "outline",
  failed: "destructive",
};

export function HandbookDistributionStatus({
  handbookId,
  handbookTitle,
  versionId,
  versionNumber,
  chapters,
  canManage,
}: {
  handbookId: string;
  handbookTitle: string;
  versionId: string | null;
  versionNumber?: number | null;
  chapters: { id: string; heading: string; is_mandatory?: boolean }[];
  canManage: boolean;
}) {
  const { data: recipients = [], isLoading } = useHandbookRecipients(handbookId);
  const { data: distributions = [] } = useHandbookDistributions(handbookId);
  const sendMut = useSendHandbook();
  const [sendOpen, setSendOpen] = useState(false);

  /** Innhold slik det faktisk ble sendt – bruker lagrede kapittelnavn, med fallback til nåværende kapitler. */
  const contentLabel = (ids: string[] | null | undefined, titles: string[] | null | undefined) => {
    const list = ids ?? [];
    if (list.length === 0) return "Hele håndboken";
    return list
      .map((id, i) => chapters.find((c) => c.id === id)?.heading ?? titles?.[i] ?? "Kapittel")
      .join(", ");
  };
  const scopeLabel = (ids: string[] | null | undefined) =>
    (ids ?? []).length === 0 ? "Hele håndboken" : "Valgte kapitler";

  const currentRecipients = useMemo(
    () => recipients.filter((r) => !versionId || r.version_id === versionId),
    [recipients, versionId],
  );

  const stats = useMemo(() => {
    const s = { total: currentRecipients.length, acknowledged: 0, opened: 0, sent: 0, failed: 0 };
    for (const r of currentRecipients) s[recipientState(r)]++;
    return s;
  }, [currentRecipients]);

  /**
   * Purring gjelder kun innholdet som faktisk ble sendt: mottakere grupperes per
   * innhold (hele håndboken vs. samme kapittelutvalg), og hver gruppe purres for seg.
   */
  const remind = async () => {
    const pending = currentRecipients.filter((r) => !r.acknowledged_at);
    if (pending.length === 0 || !versionId) {
      toast({ title: "Ingen å purre", description: "Alle mottakere har bekreftet." });
      return;
    }

    const groups = new Map<string, { ids: string[]; titles: string[]; people: Map<string, typeof pending[number]> }>();
    for (const r of pending) {
      const ids = [...(r.section_ids ?? [])].sort();
      const key = ids.join("|");
      if (!groups.has(key)) groups.set(key, { ids, titles: r.section_titles ?? [], people: new Map() });
      const g = groups.get(key)!;
      const pid = r.person_id ?? r.id;
      if (!g.people.has(pid)) g.people.set(pid, r);
    }

    try {
      let count = 0;
      for (const g of groups.values()) {
        const label = contentLabel(g.ids, g.titles);
        await sendMut.mutateAsync({
          handbook_id: handbookId,
          version_id: versionId,
          section_ids: g.ids,
          channels: ["email"],
          kind: "reminder",
          subject: `Påminnelse: ${handbookTitle}`,
          message: `Vi mangler din bekreftelse på at du har lest ${label.toLowerCase() === "hele håndboken" ? "hele håndboken" : label}.`,
          recipients: [...g.people.values()].map((r) => ({
            person_id: r.person_id, user_id: r.user_id, full_name: r.full_name, email: r.email, phone: r.phone,
          })),
        });
        count += g.people.size;
      }
      toast({ title: "Påminnelse sendt", description: `${count} mottaker(e) er purret på det de fikk tilsendt.` });
    } catch (e: any) {
      toast({ title: "Purring feilet", description: String(e.message || e), variant: "destructive" });
    }
  };

  const exportCsv = () => {
    const q = (v: any) => JSON.stringify(v ?? "");
    const lines = [
      ["Navn", "E-post", "Telefon", "Type utsending", "Kapittelnavn", "Kapittel-IDer", "Utgave", "Kanal", "Sendt", "Første åpning", "Bekreftet", "Metode", "Levering", "Purringer", "Koblede ressurser", "Kjemikalier", "SDS-versjoner/revisjonsdatoer"].join(";"),
      ...recipients.map((r) => {
        const d = distributions.find((x) => x.id === r.distribution_id);
        const ids = r.section_ids?.length ? r.section_ids : d?.section_ids ?? [];
        const titles = r.section_titles?.length ? r.section_titles : d?.section_titles ?? [];
        return [
          q(r.full_name), q(r.email), q(r.phone),
          q(scopeLabel(ids)),
          q(ids.length === 0 ? "" : contentLabel(ids, titles)),
          q(ids.join(", ")),
          q(d?.version_number ?? ""),
          q(r.channel),
          q(r.sent_at ? format(new Date(r.sent_at), "yyyy-MM-dd HH:mm") : ""),
          q(r.first_opened_at ? format(new Date(r.first_opened_at), "yyyy-MM-dd HH:mm") : ""),
          q(r.acknowledged_at ? format(new Date(r.acknowledged_at), "yyyy-MM-dd HH:mm") : ""),
          q(r.ack_method), q(r.delivery_status), q(r.reminder_count),
          q((r.included_resources ?? []).map((resource) => `${resource.type}: ${resource.label}`).join(" | ")),
          q((r.chemical_snapshot ?? []).map((chemical) => chemical.product_name).join(" | ")),
          q((r.chemical_snapshot ?? []).map((chemical) => `${chemical.product_name}: ${chemical.sds_version ?? "uten versjon"}${chemical.sds_revision_date ? ` (${chemical.sds_revision_date})` : ""}`).join(" | ")),
        ].join(";");
      }),
    ].join("\n");
    const blob = new Blob(["\uFEFF" + lines], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `revisjonsspor-${handbookTitle.replace(/\s+/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {([
          ["Sendt", stats.total],
          ["Åpnet, ikke bekreftet", stats.opened],
          ["Ikke åpnet", stats.sent],
          ["Bekreftet", stats.acknowledged],
        ] as const).map(([label, value]) => (
          <Card key={label}>
            <CardContent className="py-4">
              <div className="text-2xl font-semibold">{value}</div>
              <div className="text-xs text-muted-foreground">{label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {canManage && (
          <Button size="sm" onClick={() => setSendOpen(true)}>
            <Send className="h-4 w-4 mr-1.5" /> Send til ansatte
          </Button>
        )}
        {canManage && (
          <Button size="sm" variant="outline" onClick={remind} disabled={sendMut.isPending}>
            {sendMut.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <BellRing className="h-4 w-4 mr-1.5" />}
            Purr manglende
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={exportCsv} disabled={recipients.length === 0}>
          <Download className="h-4 w-4 mr-1.5" /> Eksporter revisjonsspor
        </Button>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ansatt</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Innhold</TableHead>
              <TableHead>Utgave</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Sendt</TableHead>
              <TableHead>Åpnet</TableHead>
              <TableHead>Bekreftet</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={8} className="text-sm text-muted-foreground">Laster…</TableCell></TableRow>
            ) : recipients.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-sm text-muted-foreground">Ingen utsendinger enda.</TableCell></TableRow>
            ) : (
              recipients.map((r) => {
                const d = distributions.find((x) => x.id === r.distribution_id);
                const ids = r.section_ids?.length ? r.section_ids : d?.section_ids ?? [];
                const titles = r.section_titles?.length ? r.section_titles : d?.section_titles ?? [];
                const state = recipientState(r);
                return (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">
                      <div className="font-medium text-sm">{r.full_name ?? "—"}</div>
                      <div className="text-[11px] text-muted-foreground">{r.email ?? r.phone ?? ""}</div>
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      <Badge variant="outline" className="text-[10px]">{scopeLabel(ids)}</Badge>
                    </TableCell>
                    <TableCell className="text-xs max-w-[240px]">
                      <span className="line-clamp-2">{contentLabel(ids, titles)}</span>
                    </TableCell>
                    <TableCell className="text-xs">{d?.version_number ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={STATE_VARIANT[state]} className="text-[10px]">{RECIPIENT_STATE_LABEL[state]}</Badge>
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {r.sent_at ? format(new Date(r.sent_at), "d. MMM HH:mm", { locale: nb }) : "—"}
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {r.first_opened_at ? format(new Date(r.first_opened_at), "d. MMM HH:mm", { locale: nb }) : "—"}
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {r.acknowledged_at ? format(new Date(r.acknowledged_at), "d. MMM HH:mm", { locale: nb }) : "—"}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {canManage && (
        <HandbookDistributeDialog
          open={sendOpen}
          onOpenChange={setSendOpen}
          handbookId={handbookId}
          handbookTitle={handbookTitle}
          versionId={versionId}
          versionNumber={versionNumber}
          chapters={chapters}
        />
      )}
    </div>
  );
}
