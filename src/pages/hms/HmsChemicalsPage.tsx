import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Beaker, FileWarning, Plus, Search, ShieldAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { useChemicals, useSaveChemical, useAllChemicalRecipients } from "@/hooks/useChemicals";
import {
  CHEMICAL_STATUS_LABELS, CHEMICAL_STATUS_STYLES, SDS_STATE_LABELS, sdsState,
} from "@/lib/hms/chemicals";
import { cn } from "@/lib/utils";

export default function HmsChemicalsPage() {
  const { data: chemicals = [], isLoading } = useChemicals();
  const { data: recipients = [] } = useAllChemicalRecipients();
  const saveMut = useSaveChemical();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "high_risk" | "missing_sds" | "missing_ack">("all");

  const ackedByChemical = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const r of recipients) {
      if (!r.acknowledged_at || !r.person_id) continue;
      if (!map.has(r.chemical_id)) map.set(r.chemical_id, new Set());
      map.get(r.chemical_id)!.add(r.person_id);
    }
    return map;
  }, [recipients]);

  const stats = useMemo(() => {
    const active = chemicals.filter((c) => c.status === "active");
    const missingSds = chemicals.filter((c) => sdsState(c) === "missing");
    const staleSds = chemicals.filter((c) => sdsState(c) === "stale");
    const highRisk = chemicals.filter((c) => c.is_high_risk);
    const needAck = chemicals.filter((c) => c.requires_acknowledgement);
    const withoutAnyAck = needAck.filter((c) => (ackedByChemical.get(c.id)?.size ?? 0) === 0);
    return { active: active.length, missingSds: missingSds.length, staleSds: staleSds.length, highRisk: highRisk.length, needAck: needAck.length, withoutAnyAck: withoutAnyAck.length };
  }, [chemicals, ackedByChemical]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return chemicals.filter((c) => {
      if (needle && ![c.product_name, c.supplier, c.category, c.usage_area].some((v) => (v ?? "").toLowerCase().includes(needle))) return false;
      if (filter === "high_risk" && !c.is_high_risk) return false;
      if (filter === "missing_sds" && sdsState(c) !== "missing") return false;
      if (filter === "missing_ack" && !(c.requires_acknowledgement && (ackedByChemical.get(c.id)?.size ?? 0) === 0)) return false;
      return true;
    });
  }, [chemicals, q, filter, ackedByChemical]);

  const seedDemo = async () => {
    const exists = chemicals.some((c) => c.product_name.toLowerCase() === "jointpack casting mix type a");
    if (exists) {
      toast({ title: "Eksempelproduktet finnes allerede" });
      return;
    }
    await saveMut.mutateAsync({
      product_name: "Jointpack Casting Mix Type A",
      supplier: "Jointpack",
      manufacturer: "Jointpack",
      category: "Epoxy/herdeplast",
      usage_area: "Skjøtestøp på strømskinner og kabelskjøter",
      locations: ["Strømskinneprosjekter", "Skjøtestøp i felt"],
      hms_areas: ["Epoxy/herdeplast", "Strømskinner"],
      pictograms: ["GHS07", "GHS08", "GHS09"],
      h_statements: [
        "H315 Irriterer huden",
        "H317 Kan utløse en allergisk hudreaksjon",
        "H319 Gir alvorlig øyeirritasjon",
        "H341 Mistenkes for å kunne føre til genetiske skader",
        "H411 Giftig, med langtidsvirkning, for liv i vann",
      ],
      p_statements: [
        "P280 Benytt vernehansker, vernebriller og vernetøy",
        "P261 Unngå innånding av damp",
        "P302+P352 VED HUDKONTAKT: Vask med mye vann og såpe",
        "P305+P351+P338 VED KONTAKT MED ØYNENE: Skyll forsiktig med vann i flere minutter",
        "P273 Unngå utslipp til miljøet",
      ],
      ppe_requirements:
        "Kjemikalieresistente nitrilhansker (ikke vanlige arbeidshansker), vernebriller/visir, langermet vernetøy. Bytt hansker ved søl.",
      ventilation_requirements: "Sørg for god ventilasjon. Unngå arbeid i lukkede rom uten avtrekk.",
      first_aid:
        "Hudkontakt: vask straks med mye vann og såpe, ikke bruk løsemiddel. Øyekontakt: skyll 15 minutter, kontakt lege. Ved utslett eller allergisk reaksjon: stopp arbeid, kontakt lege og meld avvik/RUH.",
      storage_requirements: "Tørt og frostfritt, i originalemballasje, adskilt fra mat og drikke. Herder lagres separat fra resin.",
      waste_handling: "Rester og forurenset emballasje leveres som farlig avfall. Ikke tøm i avløp eller natur.",
      status: "active",
      is_high_risk: true,
      requires_training: true,
      requires_acknowledgement: true,
      requires_sja: true,
      requires_special_ppe: true,
      notes: "Registrert etter hendelse med utslett ved skjøtestøp. Krever dokumentert bekreftelse før bruk.",
    });
    toast({ title: "Eksempelprodukt opprettet", description: "Jointpack Casting Mix Type A er lagt i stoffkartoteket." });
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
            <Beaker className="h-3.5 w-3.5" /> HMS &amp; HR
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Stoffkartotek / kjemikalier</h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Oversikt over kjemikalier i bruk, sikkerhetsdatablad, krav til verneutstyr og dokumenterte
            bekreftelser fra ansatte.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={seedDemo} disabled={saveMut.isPending}>
            Legg inn epoxy-eksempel
          </Button>
          <Button asChild>
            <Link to="/hms/kjemikalier/ny"><Plus className="h-4 w-4 mr-2" /> Nytt kjemikalie</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatCard label="Aktive kjemikalier" value={stats.active} icon={Beaker} onClick={() => setFilter("all")} />
        <StatCard label="Uten sikkerhetsdatablad" value={stats.missingSds} icon={FileWarning} tone={stats.missingSds > 0 ? "danger" : undefined} onClick={() => setFilter("missing_sds")} />
        <StatCard label="Høyrisiko" value={stats.highRisk} icon={ShieldAlert} tone={stats.highRisk > 0 ? "warn" : undefined} onClick={() => setFilter("high_risk")} />
        <StatCard label="Mangler bekreftelse" value={stats.withoutAnyAck} icon={AlertTriangle} tone={stats.withoutAnyAck > 0 ? "warn" : undefined} onClick={() => setFilter("missing_ack")} />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Søk produkt, leverandør, bruksområde…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {filter !== "all" && (
          <Button variant="ghost" size="sm" onClick={() => setFilter("all")}>Nullstill filter</Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produkt</TableHead>
                <TableHead className="hidden sm:table-cell">Kategori</TableHead>
                <TableHead>SDS</TableHead>
                <TableHead className="hidden md:table-cell">Krav</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5}><Skeleton className="h-6 w-full" /></TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-sm text-muted-foreground">
                    Ingen kjemikalier registrert ennå.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((c) => {
                  const sds = sdsState(c);
                  return (
                    <TableRow key={c.id} className="cursor-pointer">
                      <TableCell>
                        <Link to={`/hms/kjemikalier/${c.id}`} className="font-medium hover:underline">
                          {c.product_name}
                        </Link>
                        <div className="text-xs text-muted-foreground">{c.supplier ?? c.manufacturer ?? "—"}</div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-sm">{c.category ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={sds === "ok" ? "outline" : "destructive"} className="text-[10px]">
                          {SDS_STATE_LABELS[sds]}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {c.is_high_risk && <Badge variant="destructive" className="text-[10px]">Høyrisiko</Badge>}
                          {c.requires_training && <Badge variant="outline" className="text-[10px]">Opplæring</Badge>}
                          {c.requires_acknowledgement && <Badge variant="outline" className="text-[10px]">Bekreftelse</Badge>}
                          {c.requires_sja && <Badge variant="outline" className="text-[10px]">SJA</Badge>}
                          {c.requires_special_ppe && <Badge variant="outline" className="text-[10px]">Særskilt PVU</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("text-[10px]", CHEMICAL_STATUS_STYLES[c.status])}>
                          {CHEMICAL_STATUS_LABELS[c.status] ?? c.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, tone, onClick }: {
  label: string; value: number; icon: any; tone?: "warn" | "danger"; onClick?: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="text-left">
      <Card className={cn(
        "transition-colors hover:bg-muted/40",
        tone === "danger" && "border-destructive/40",
        tone === "warn" && "border-amber-300",
      )}>
        <CardContent className="p-4 space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Icon className="h-3.5 w-3.5" /> {label}
          </div>
          <div className="text-2xl font-semibold tabular-nums">{value}</div>
        </CardContent>
      </Card>
    </button>
  );
}
