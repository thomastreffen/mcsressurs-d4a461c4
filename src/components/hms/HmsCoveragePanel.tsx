import { useMemo } from "react";
import { ShieldCheck, Download } from "lucide-react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  useHandbookDistributions, useHandbookRecipients, useHandbookSectionResources,
} from "@/hooks/useHandbookDistribution";
import { HMS_COVERAGE_AREAS } from "@/lib/hms/handbookPackage";

/**
 * «Dekning i HMS-håndbok»: viser om hvert arbeidsområde MCS utfører har
 * aktivt kapittel, koblede ressurser, siste utsending og bekreftelsesstatus.
 */
export function HmsCoveragePanel({
  handbookId,
  versionId,
  versionNumber,
}: {
  handbookId: string;
  versionId: string | null;
  versionNumber?: number | null;
}) {
  const { data: sections = [] } = useHandbookSectionResources(versionId);
  const { data: distributions = [] } = useHandbookDistributions(handbookId);
  const { data: recipients = [] } = useHandbookRecipients(handbookId);

  const rows = useMemo(() => {
    return HMS_COVERAGE_AREAS.map((area) => {
      const matched = sections.filter((s) => s.coverage_areas.includes(area));
      const sectionIds = matched.map((s) => s.id);
      const resourceCount = matched.reduce(
        (n, s) => n + s.resource_links.length + s.chemical_ids.length,
        0,
      );
      const dists = distributions.filter(
        (d) =>
          !!versionId &&
          d.version_id === versionId &&
          ((d.section_ids ?? []).length === 0 || (d.section_ids ?? []).some((id) => sectionIds.includes(id))),
      );
      const lastSent = dists[0]?.sent_at ?? null;
      const relevant = recipients.filter(
        (r) =>
          (!versionId || r.version_id === versionId) &&
          ((r.section_ids ?? []).length === 0 || (r.section_ids ?? []).some((id) => sectionIds.includes(id))),
      );
      const acked = relevant.filter((r) => !!r.acknowledged_at).length;
      return {
        area,
        matched,
        resourceCount,
        lastSent,
        acked,
        missing: relevant.length - acked,
      };
    });
  }, [sections, distributions, recipients, versionId]);

  const covered = rows.filter((r) => r.matched.length > 0).length;

  const exportCsv = () => {
    const lines = [
      ["Område", "Kapittel", "Utgave", "Obligatorisk", "Koblede ressurser", "Siste utsending", "Bekreftet", "Mangler"].join(","),
      ...rows.map((r) =>
        [
          JSON.stringify(r.area),
          JSON.stringify(r.matched.map((m) => m.heading).join(" | ")),
          versionNumber ?? "",
          r.matched.some((m) => m.is_mandatory) ? "ja" : "nei",
          r.resourceCount,
          r.lastSent ? format(new Date(r.lastSent), "yyyy-MM-dd HH:mm") : "",
          r.acked,
          r.missing,
        ].join(","),
      ),
    ].join("\n");
    const blob = new Blob([lines], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "hms-dekning.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0 gap-3 flex-wrap">
        <div className="space-y-1">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> Dekning i HMS-håndbok
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {covered} av {rows.length} arbeidsområder har eget kapittel
            {versionNumber ? ` i utgave ${versionNumber}` : ""}.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={exportCsv}>
          <Download className="h-4 w-4 mr-1.5" /> Eksporter CSV
        </Button>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Arbeidsområde</TableHead>
              <TableHead>Kapittel</TableHead>
              <TableHead>Obligatorisk</TableHead>
              <TableHead>Ressurser</TableHead>
              <TableHead>Siste utsending</TableHead>
              <TableHead>Bekreftet / mangler</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.area}>
                <TableCell className="font-medium">{r.area}</TableCell>
                <TableCell className="text-sm">
                  {r.matched.length === 0 ? (
                    <Badge variant="outline" className="text-[10px] border-red-300 bg-red-50 text-red-700">
                      Mangler kapittel
                    </Badge>
                  ) : (
                    r.matched.map((m) => m.heading).join(", ")
                  )}
                </TableCell>
                <TableCell className="text-xs">
                  {r.matched.some((m) => m.is_mandatory) ? "Ja" : r.matched.length ? "Nei" : "–"}
                </TableCell>
                <TableCell className="text-xs">{r.resourceCount || "–"}</TableCell>
                <TableCell className="text-xs">
                  {r.lastSent ? format(new Date(r.lastSent), "d. MMM yyyy", { locale: nb }) : "Ikke sendt"}
                </TableCell>
                <TableCell className="text-xs">
                  {r.acked} / {r.missing}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
