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

  const chapterName = (ids: string[]) =>
    ids.length === 0
      ? "Hele håndboken"
      : ids.map((id) => chapters.find((c) => c.id === id)?.heading ?? "Kapittel").join(", ");

  const currentRecipients = useMemo(
    () => recipients.filter((r) => !versionId || r.version_id === versionId),
    [recipients, versionId],
  );

  const stats = useMemo(() => {
    const s = { total: currentRecipients.length, acknowledged: 0, opened: 0, sent: 0, failed: 0 };
    for (const r of currentRecipients) s[recipientState(r)]++;
    return s;
  }, [currentRecipients]);

  const remind = async () => {
    const pending = currentRecipients.filter((r) => !r.acknowledged_at);
    const unique = new Map<string, typeof pending[number]>();
    for (const r of pending) if (r.person_id && !unique.has(r.person_id)) unique.set(r.person_id, r);
    if (unique.size === 0 || !versionId) {
      toast({ title: "Ingen å purre", description: "Alle mottakere har bekreftet." });
      return;
    }
    try {
      await sendMut.mutateAsync({
        handbook_id: handbookId,
        version_id: versionId,
        section_ids: [],
        channels: ["email"],
        kind: "reminder",
        subject: `Påminnelse: ${handbookTitle}`,
        message: "Vi mangler din bekreftelse på at du har lest denne HMS-informasjonen.",
        recipients: [...unique.values()].map((r) => ({
          person_id: r.person_id, user_id: r.user_id, full_name: r.full_name, email: r.email, phone: r.phone,
        })),
      });
      toast({ title: "Påminnelse sendt", description: `${unique.size} mottaker(e) er purret.` });
    } catch (e: any) {
      toast({ title: "Purring feilet", description: String(e.message || e), variant: "destructive" });
    }
  };

  const exportCsv = () => {
    const q = (v: any) => JSON.stringify(v ?? "");
    const lines = [
      ["Navn", "E-post", "Telefon", "Innhold", "Utgave", "Kanal", "Sendt", "Første åpning", "Bekreftet", "Metode", "Levering", "Purringer"].join(";"),
      ...recipients.map((r) => {
        const d = distributions.find((x) => x.id === r.distribution_id);
        return [
          q(r.full_name), q(r.email), q(r.phone),
          q(chapterName(d?.section_ids ?? [])), q(d?.version_number ?? ""),
          q(r.channel),
          q(r.sent_at ? format(new Date(r.sent_at), "yyyy-MM-dd HH:mm") : ""),
          q(r.first_opened_at ? format(new Date(r.first_opened_at), "yyyy-MM-dd HH:mm") : ""),
          q(r.acknowledged_at ? format(new Date(r.acknowledged_at), "yyyy-MM-dd HH:mm") : ""),
          q(r.ack_method), q(r.delivery_status), q(r.reminder_count),
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
              <TableRow><TableCell colSpan={7} className="text-sm text-muted-foreground">Laster…</TableCell></TableRow>
            ) : recipients.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-sm text-muted-foreground">Ingen utsendinger enda.</TableCell></TableRow>
            ) : (
              recipients.map((r) => {
                const d = distributions.find((x) => x.id === r.distribution_id);
                const state = recipientState(r);
                return (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">
                      <div className="font-medium text-sm">{r.full_name ?? "—"}</div>
                      <div className="text-[11px] text-muted-foreground">{r.email ?? r.phone ?? ""}</div>
                    </TableCell>
                    <TableCell className="text-xs max-w-[220px] truncate">{chapterName(d?.section_ids ?? [])}</TableCell>
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
