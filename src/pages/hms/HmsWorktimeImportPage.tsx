import { HmsMobileBack } from "@/components/hms/HmsMobileBack";
import { useState, useMemo, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, FileSpreadsheet, ArrowLeft, CheckCircle2, AlertCircle, Loader2, CalendarDays } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TripletexUploadZone } from "@/components/tripletex/TripletexUploadZone";
import { toast } from "@/hooks/use-toast";
import {
  WorktimeMapping,
  WorktimeRow,
  applyMapping,
  autoMapHeaders,
  buildSourceHash,
  readWorktimeFile,
} from "@/lib/hms/worktimeImport";
import {
  MonthlyParseResult,
  NormalizedDayRow,
  TRIPLETEX_MONTHLY_SOURCE,
  buildMonthlySourceHash,
  classifyActivity,
  looksLikeMonthlyOverview,
  parseTripletexMonthlyOverview,
} from "@/lib/hms/tripletexMonthlyOverview";

const FIELD_LABELS: Record<keyof WorktimeMapping, string> = {
  employee_name: "Ansattnavn *",
  employee_number: "Ansattnummer",
  employee_email: "E-post",
  date: "Dato *",
  start_time: "Starttid",
  end_time: "Sluttid",
  break_minutes: "Pause (min)",
  ordinary_hours: "Ordinære timer",
  overtime_hours: "Overtidstimer",
  total_hours: "Totaltimer",
  project: "Prosjekt",
  project_number: "Prosjektnummer",
  time_type: "Timeart",
  external_id: "Ekstern linje-ID",
};

type Mode = "generic" | "monthly";

export default function HmsWorktimeImportPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { activeCompanyId } = useCompanyContext();
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<Mode>("generic");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<WorktimeMapping>({});
  const [monthly, setMonthly] = useState<MonthlyParseResult | null>(null);
  const [step, setStep] = useState<"upload" | "map" | "match" | "preview" | "done">("upload");
  const [result, setResult] = useState<any>(null);
  // employee_number -> user_id (manual override, also persisted)
  const [manualMap, setManualMap] = useState<Record<string, string>>({});

  // Active users in selected company. user_id we expose = auth_user_id (matches worktime_entries.user_id and employee_work_profiles.user_id semantics).
  const { data: people } = useQuery({
    queryKey: ["company-people", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("user_accounts")
        .select("id, auth_user_id, person:people!user_accounts_person_id_fkey(full_name, email)")
        .eq("company_id", activeCompanyId)
        .eq("is_active", true);
      if (error) {
        console.error("[import] failed to load people", error);
        return [] as { id: string; full_name: string | null; email: string | null }[];
      }
      return (data ?? []).map((r: any) => ({
        id: r.auth_user_id as string,
        full_name: r.person?.full_name ?? null,
        email: r.person?.email ?? null,
      })) as { id: string; full_name: string | null; email: string | null }[];
    },
  });

  // Load employee_work_profiles for external_employee_id matching
  const { data: profiles } = useQuery({
    queryKey: ["employee-profiles", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("employee_work_profiles")
        .select("user_id, external_employee_id")
        .eq("company_id", activeCompanyId);
      return (data ?? []) as { user_id: string; external_employee_id: string | null }[];
    },
  });

  const parsedRows = useMemo<WorktimeRow[]>(() => {
    if (mode !== "generic") return [];
    if (!mapping.employee_name || !mapping.date) return [];
    return applyMapping(rawRows, mapping);
  }, [rawRows, mapping, mode]);

  const matched = useMemo(() => {
    if (!people) return parsedRows.map((r) => ({ row: r, user_id: null as string | null }));
    return parsedRows.map((r) => {
      const nameLower = r.employee_name.toLowerCase().trim();
      const emailLower = r.employee_email?.toLowerCase().trim();
      const found = people.find(
        (p) =>
          (emailLower && p.email?.toLowerCase() === emailLower) ||
          (p.full_name && p.full_name.toLowerCase().trim() === nameLower)
      );
      return { row: r, user_id: found?.id ?? null };
    });
  }, [parsedRows, people]);

  const unmatched = matched.filter((m) => !m.user_id);

  // Monthly matching: manual override → external_employee_id → normalized name
  function normalizeName(s: string) {
    return s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
  }

  const matchedMonthly = useMemo(() => {
    if (!monthly) return [];
    const byExt = new Map<string, string>();
    for (const p of profiles ?? []) {
      if (p.external_employee_id) byExt.set(p.external_employee_id.trim(), p.user_id);
    }
    return monthly.normalized.map((r) => {
      const key = r.employee_number || r.employee_name;
      let user_id: string | null = manualMap[key] ?? byExt.get(r.employee_number) ?? null;
      if (!user_id && people) {
        const nameLower = normalizeName(r.employee_name);
        const found = people.find((p) => p.full_name && normalizeName(p.full_name) === nameLower);
        user_id = found?.id ?? null;
      }
      return { row: r, user_id };
    });
  }, [monthly, profiles, people, manualMap]);

  // Unique employee list for the matching step
  type EmpMatch = { key: string; number: string; name: string; user_id: string | null; source: "manual" | "external_id" | "name" | "none"; lines: number };
  const employeeMatches = useMemo<EmpMatch[]>(() => {
    if (!monthly) return [];
    const byExt = new Map<string, string>();
    for (const p of profiles ?? []) {
      if (p.external_employee_id) byExt.set(p.external_employee_id.trim(), p.user_id);
    }
    const map = new Map<string, EmpMatch>();
    for (const r of monthly.normalized) {
      const key = r.employee_number || r.employee_name;
      const existing = map.get(key);
      if (existing) { existing.lines++; continue; }
      let user_id: string | null = null;
      let source: EmpMatch["source"] = "none";
      if (manualMap[key]) { user_id = manualMap[key]; source = "manual"; }
      else if (byExt.get(r.employee_number)) { user_id = byExt.get(r.employee_number)!; source = "external_id"; }
      else if (people) {
        const nameLower = normalizeName(r.employee_name);
        const found = people.find((p) => p.full_name && normalizeName(p.full_name) === nameLower);
        if (found) { user_id = found.id; source = "name"; }
      }
      map.set(key, { key, number: r.employee_number, name: r.employee_name, user_id, source, lines: 1 });
    }
    return Array.from(map.values()).sort((a, b) => Number(!!b.user_id) - Number(!!a.user_id) || a.name.localeCompare(b.name));
  }, [monthly, profiles, people, manualMap]);

  const unmatchedEmpCount = employeeMatches.filter((e) => !e.user_id).length;

  const monthlySummary = useMemo(() => {
    if (!monthly) return null;
    const employees = new Map<string, { name: string; matched: boolean }>();
    const activities = new Map<string, { kind: string; count: number; hours: number }>();
    let worked = 0, overtime = 0, absence = 0;
    let unmatchedEmployees = new Set<string>();
    for (const m of matchedMonthly) {
      const r = m.row;
      const key = r.employee_number || r.employee_name;
      employees.set(key, { name: r.employee_name, matched: !!m.user_id });
      if (!m.user_id) unmatchedEmployees.add(key);
      const ak = `${r.activity_number}|${r.activity_name}`;
      const a = activities.get(ak) ?? { kind: r.classification.kind, count: 0, hours: 0 };
      a.count++; a.hours += r.hours; activities.set(ak, a);
      if (r.classification.countsAsWork) worked += r.hours;
      if (r.classification.countsAsOvertime) overtime += r.hours;
      if (!r.classification.countsAsWork && r.classification.kind !== "payroll_compensation") absence += r.hours;
    }
    const unknown = Array.from(activities.entries())
      .filter(([, v]) => v.kind === "unknown")
      .map(([k]) => k.split("|")[1]);
    return {
      employees: employees.size,
      unmatchedEmployees: unmatchedEmployees.size,
      activities: activities.size,
      unknownActivities: unknown,
      worked, overtime, absence,
      lines: matchedMonthly.length,
    };
  }, [monthly, matchedMonthly]);

  async function handleFile(f: File) {
    setFile(f);
    setManualMap({});
    try {
      const { headers: hdrs, rows } = await readWorktimeFile(f);
      if (looksLikeMonthlyOverview(hdrs)) {
        const m = await parseTripletexMonthlyOverview(f);
        setMode("monthly");
        setMonthly(m);
        setHeaders(hdrs);
        setRawRows(rows);
        setStep("match");
        toast({
          title: "Tripletex månedsoversikt detektert",
          description: `${m.source_month} • ${m.normalized.length} normaliserte linjer`,
        });
        return;
      }
      setMode("generic");
      setHeaders(hdrs);
      setRawRows(rows);
      setMapping(autoMapHeaders(hdrs));
      setStep("map");
    } catch (e: any) {
      toast({ title: "Feil ved lesing", description: String(e.message || e), variant: "destructive" });
    }
  }

  // Persist external_employee_id on employee_work_profiles for future imports
  const saveMappingMut = useMutation({
    mutationFn: async (entries: { user_id: string; external_employee_id: string }[]) => {
      if (!activeCompanyId) throw new Error("Mangler selskap");
      const sb = supabase as any;
      for (const e of entries) {
        if (!e.external_employee_id) continue;
        const { data: existing } = await sb
          .from("employee_work_profiles")
          .select("id, external_employee_id")
          .eq("company_id", activeCompanyId)
          .eq("user_id", e.user_id)
          .maybeSingle();
        if (existing) {
          if (existing.external_employee_id !== e.external_employee_id) {
            await sb.from("employee_work_profiles")
              .update({ external_employee_id: e.external_employee_id })
              .eq("id", existing.id);
          }
        } else {
          await sb.from("employee_work_profiles").insert({
            company_id: activeCompanyId,
            user_id: e.user_id,
            external_employee_id: e.external_employee_id,
          });
        }
      }
      await qc.invalidateQueries({ queryKey: ["employee-profiles", activeCompanyId] });
    },
  });

  // ---- Generic import (existing flow) ----
  const importMut = useMutation({
    mutationFn: async () => {
      if (!activeCompanyId) throw new Error("Ingen aktivt selskap");
      const sb = supabase as any;
      const { data: batch, error: bErr } = await sb
        .from("worktime_import_batches")
        .insert({
          company_id: activeCompanyId,
          source_system: "tripletex",
          filename: file?.name ?? null,
          status: "processing",
          total_rows: parsedRows.length,
          mapping,
        })
        .select("id")
        .single();
      if (bErr) throw bErr;

      let inserted = 0, updated = 0, skipped = 0, unmatchedCount = 0;
      for (const m of matched) {
        const r = m.row;
        if (!m.user_id) { unmatchedCount++; continue; }
        const hash = await buildSourceHash([
          activeCompanyId, m.user_id, r.work_date, r.start_at, r.end_at,
          r.ordinary_hours, r.hours_overtime, r.total_hours, r.project_number_raw, r.time_type,
        ]);
        const payload: any = {
          company_id: activeCompanyId,
          user_id: m.user_id,
          external_employee_id: r.employee_number ?? null,
          employee_name: r.employee_name,
          work_date: r.work_date,
          start_at: r.start_at ?? null,
          end_at: r.end_at ?? null,
          break_minutes: Math.round(r.break_minutes),
          ordinary_hours: r.ordinary_hours,
          hours_overtime: r.hours_overtime,
          total_hours: r.total_hours,
          hours: r.total_hours,
          project_number_raw: r.project_number_raw ?? null,
          time_type: r.time_type ?? null,
          source_system: "tripletex",
          source_external_id: r.source_external_id || null,
          source_hash: hash,
          batch_id: batch.id,
          raw_payload: r.raw,
          status: "imported",
        };
        let existing: any = null;
        if (r.source_external_id) {
          const { data } = await sb.from("worktime_entries").select("id")
            .eq("source_system", "tripletex").eq("source_external_id", r.source_external_id).maybeSingle();
          existing = data;
        }
        if (!existing) {
          const { data } = await sb.from("worktime_entries").select("id")
            .eq("company_id", activeCompanyId).eq("source_hash", hash).maybeSingle();
          existing = data;
        }
        if (existing) {
          const { error } = await sb.from("worktime_entries").update(payload).eq("id", existing.id);
          if (error) skipped++; else updated++;
        } else {
          const { error } = await sb.from("worktime_entries").insert(payload);
          if (error) skipped++; else inserted++;
        }
      }
      await sb.from("worktime_import_batches").update({
        status: "done", new_rows: inserted, updated_rows: updated,
        skipped_rows: skipped + unmatchedCount, finished_at: new Date().toISOString(),
      }).eq("id", batch.id);

      const { data: aml, error: amlErr } = await sb.functions.invoke("worktime-aml-evaluate", {
        body: { company_id: activeCompanyId, batch_id: batch.id },
      });
      if (amlErr) console.error("AML evaluate failed", amlErr);
      return { batch_id: batch.id, inserted, updated, skipped, unmatched: unmatchedCount, aml: aml ?? null, amlError: amlErr ? String(amlErr?.message || amlErr) : null };
    },
    onSuccess: async (r) => {
      setResult(r); setStep("done");
      await qc.invalidateQueries({ predicate: (q) => {
        const k = q.queryKey?.[0];
        return typeof k === "string" && (k.startsWith("hms-aml") || k === "employee-profiles" || k === "hms-import-batches");
      }});
      toast({ title: "Import fullført", description: `${r.inserted} nye, ${r.updated} oppdatert` });
    },
    onError: (e: any) => {
      toast({ title: "Import feilet", description: String(e.message || e), variant: "destructive" });
    },
  });

  // ---- Monthly overview import ----
  const importMonthlyMut = useMutation({
    mutationFn: async () => {
      if (!activeCompanyId || !monthly) throw new Error("Mangler selskap eller fil");
      const sb = supabase as any;
      const { data: batch, error: bErr } = await sb
        .from("worktime_import_batches")
        .insert({
          company_id: activeCompanyId,
          source_system: TRIPLETEX_MONTHLY_SOURCE,
          filename: file?.name ?? null,
          status: "processing",
          total_rows: matchedMonthly.length,
          mapping: { mode: "monthly", source_month: monthly.source_month, day_columns: monthly.dayColumns.length },
        })
        .select("id").single();
      if (bErr) throw bErr;

      let inserted = 0, updated = 0, skipped = 0, unmatchedCount = 0;
      for (const m of matchedMonthly) {
        const r = m.row;
        if (!m.user_id) { unmatchedCount++; continue; }
        const hash = await buildMonthlySourceHash({
          company_id: activeCompanyId,
          employee_id: m.user_id,
          work_date: r.work_date,
          activity_number: r.activity_number,
          activity_name: r.activity_name,
          total_hours: r.total_hours,
          source_month: monthly.source_month,
        });
        const isAbsence = !r.classification.countsAsWork && r.classification.kind !== "payroll_compensation";
        const status = isAbsence ? "absence" : r.classification.kind === "payroll_compensation" ? "compensation" : "imported";
        const payload: any = {
          company_id: activeCompanyId,
          user_id: m.user_id,
          external_employee_id: r.employee_number || null,
          employee_name: r.employee_name,
          work_date: r.work_date,
          start_at: null,
          end_at: null,
          break_minutes: 0,
          ordinary_hours: r.ordinary_hours,
          hours_overtime: r.hours_overtime,
          total_hours: r.total_hours,
          hours: r.total_hours,
          activity: r.activity_name,
          time_type: r.classification.kind,
          source_system: TRIPLETEX_MONTHLY_SOURCE,
          source_external_id: null,
          source_hash: hash,
          batch_id: batch.id,
          raw_payload: {
            activity_number: r.activity_number,
            activity_name: r.activity_name,
            classification: r.classification,
            source_month: monthly.source_month,
            raw_hours: r.hours,
          },
          status,
        };
        // Natural key lookup: company + employee + work_date + activity_number + source_month + source_system.
        // source_hash is only used to detect whether the row content changed.
        const { data: existing } = await sb
          .from("worktime_entries").select("id, source_hash")
          .eq("company_id", activeCompanyId)
          .eq("user_id", m.user_id)
          .eq("work_date", r.work_date)
          .eq("source_system", TRIPLETEX_MONTHLY_SOURCE)
          .contains("raw_payload", {
            activity_number: r.activity_number,
            source_month: monthly.source_month,
          })
          .maybeSingle();
        if (!existing) {
          const { error } = await sb.from("worktime_entries").insert(payload);
          if (error) skipped++; else inserted++;
        } else if (existing.source_hash === hash) {
          // Unchanged content → true duplicate
          skipped++;
        } else {
          // Same natural key, changed hours/content → update in place
          const { error } = await sb.from("worktime_entries").update(payload).eq("id", existing.id);
          if (error) skipped++; else updated++;
        }
      }

      await sb.from("worktime_import_batches").update({
        status: "done", new_rows: inserted, updated_rows: updated,
        skipped_rows: skipped + unmatchedCount, finished_at: new Date().toISOString(),
      }).eq("id", batch.id);

      const { data: aml, error: amlErr } = await sb.functions.invoke("worktime-aml-evaluate", {
        body: { company_id: activeCompanyId, batch_id: batch.id },
      });
      if (amlErr) console.error("AML evaluate failed", amlErr);
      return { batch_id: batch.id, inserted, updated, skipped, unmatched: unmatchedCount, aml: aml ?? null, amlError: amlErr ? String(amlErr?.message || amlErr) : null };
    },
    onSuccess: async (r) => {
      setResult(r); setStep("done");
      await qc.invalidateQueries({ predicate: (q) => {
        const k = q.queryKey?.[0];
        return typeof k === "string" && (k.startsWith("hms-aml") || k === "employee-profiles" || k === "hms-import-batches");
      }});
      toast({ title: "Import fullført", description: `${r.inserted} nye, ${r.updated} oppdatert` });
    },
    onError: (e: any) => {
      toast({ title: "Import feilet", description: String(e.message || e), variant: "destructive" });
    },
  });

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      <HmsMobileBack />
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="hidden sm:inline-flex" onClick={() => navigate("/hms")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Importer arbeidstid</h1>
          <p className="text-sm text-muted-foreground">
            Tripletex Excel/CSV (linjeformat eller månedsoversikt) → matching → AML-motor
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs flex-wrap">
        {(mode === "monthly"
          ? ([["upload","Last opp"],["match","Ansattmatching"],["preview","Forhåndsvis"],["done","Ferdig"]] as const)
          : ([["upload","Last opp"],["map","Mapping"],["preview","Forhåndsvis"],["done","Ferdig"]] as const)
        ).map(([s, label], i) => (
          <Badge key={`${s}-${i}`} variant={step === s ? "default" : "outline"}>
            {i + 1}. {label}
          </Badge>
        ))}
        {mode === "monthly" && monthly && (
          <Badge variant="secondary" className="ml-2">
            <CalendarDays className="h-3 w-3 mr-1" /> Månedsoversikt {monthly.source_month}
          </Badge>
        )}
      </div>

      {step === "upload" && (
        <TripletexUploadZone onFile={handleFile} label="Slipp Tripletex timefil her (linjeformat eller månedsoversikt)" />
      )}

      {step === "map" && mode === "generic" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4" /> Kolonnemapping ({rawRows.length} rader)
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(Object.keys(FIELD_LABELS) as (keyof WorktimeMapping)[]).map((f) => (
              <div key={f} className="space-y-1">
                <Label className="text-xs">{FIELD_LABELS[f]}</Label>
                <Select
                  value={mapping[f] ?? "__none__"}
                  onValueChange={(v) =>
                    setMapping((m) => ({ ...m, [f]: v === "__none__" ? undefined : v }))
                  }
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Velg kolonne" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— ingen —</SelectItem>
                    {headers.map((h) => (
                      <SelectItem key={h} value={h}>{h}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
            <div className="col-span-full flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setStep("upload")}>Tilbake</Button>
              <Button disabled={!mapping.employee_name || !mapping.date} onClick={() => setStep("preview")}>
                Forhåndsvis
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "preview" && mode === "generic" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Forhåndsvisning – {matched.length} linjer ({unmatched.length} ikke matchet)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Ansatt</TableHead>
                    <TableHead>Dato</TableHead>
                    <TableHead className="text-right">Ord</TableHead>
                    <TableHead className="text-right">OT</TableHead>
                    <TableHead className="text-right">Sum</TableHead>
                    <TableHead>Prosjekt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matched.slice(0, 100).map((m, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        {m.user_id ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <AlertCircle className="h-4 w-4 text-amber-500" />}
                      </TableCell>
                      <TableCell className="text-xs">{m.row.employee_name}</TableCell>
                      <TableCell className="text-xs">{m.row.work_date}</TableCell>
                      <TableCell className="text-right text-xs">{m.row.ordinary_hours}</TableCell>
                      <TableCell className="text-right text-xs">{m.row.hours_overtime}</TableCell>
                      <TableCell className="text-right text-xs font-medium">{m.row.total_hours}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{m.row.project_label || m.row.project_number_raw || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {matched.length > 100 && (
                <p className="text-xs text-muted-foreground mt-2">Viser første 100 av {matched.length} linjer.</p>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="ghost" onClick={() => setStep("map")}>Tilbake</Button>
              <Button onClick={() => importMut.mutate()} disabled={importMut.isPending}>
                {importMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Importer & kjør AML
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "match" && mode === "monthly" && monthly && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Ansattmatching – {employeeMatches.length} ansatte i fil ({unmatchedEmpCount} uten kobling)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(people?.length ?? 0) === 0 ? (
              <div className="p-4 rounded-md bg-amber-500/10 border border-amber-500/30 text-sm">
                Ingen ansatte funnet i valgt selskap. Sjekk bruker-/ansattregister eller tilgang.
              </div>
            ) : unmatchedEmpCount > 0 && (
              <div className="p-3 rounded-md bg-amber-500/10 border border-amber-500/30 text-xs">
                <strong>{unmatchedEmpCount} ansatte mangler kobling.</strong> Velg riktig MCS-ansatt fra listen. Tripletex ansattnummer lagres på MCS-ansatten for fremtidige importer.
              </div>
            )}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ansattnr</TableHead>
                    <TableHead>Navn (Tripletex)</TableHead>
                    <TableHead className="text-right">Linjer</TableHead>
                    <TableHead>Kilde</TableHead>
                    <TableHead>MCS-ansatt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employeeMatches.map((e) => {
                    // Build a quick lookup: which user already has an external_employee_id?
                    const linkedExt = new Map<string, string>();
                    for (const p of profiles ?? []) {
                      if (p.external_employee_id) linkedExt.set(p.user_id, p.external_employee_id);
                    }
                    return (
                      <TableRow key={e.key}>
                        <TableCell className="text-xs font-mono">{e.number || "—"}</TableCell>
                        <TableCell className="text-xs">{e.name}</TableCell>
                        <TableCell className="text-right text-xs">{e.lines}</TableCell>
                        <TableCell>
                          {e.user_id
                            ? <Badge variant="outline" className="text-[10px]">{e.source === "manual" ? "Manuell" : e.source === "external_id" ? "Ansattnr" : "Navn"}</Badge>
                            : <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-600">Må kobles</Badge>}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={e.user_id ?? "__none__"}
                            onValueChange={(v) => {
                              if (v !== "__none__") {
                                const existingExt = linkedExt.get(v);
                                if (existingExt && e.number && existingExt !== e.number) {
                                  const ok = window.confirm(
                                    `Denne ansatte er allerede koblet til Tripletex #${existingExt}. Vil du endre kobling til #${e.number}?`
                                  );
                                  if (!ok) return;
                                }
                              }
                              setManualMap((m) => {
                                const next = { ...m };
                                if (v === "__none__") delete next[e.key];
                                else next[e.key] = v;
                                return next;
                              });
                            }}
                          >
                            <SelectTrigger className="h-9 w-[300px]">
                              <SelectValue placeholder="Velg MCS-ansatt" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">— ikke koblet —</SelectItem>
                              {(people ?? []).length === 0 && (
                                <div className="px-2 py-2 text-xs text-muted-foreground">Ingen ansatte i valgt selskap</div>
                              )}
                              {(people ?? []).map((p) => {
                                const ext = linkedExt.get(p.id);
                                return (
                                  <SelectItem key={p.id} value={p.id}>
                                    <div className="flex flex-col text-left">
                                      <span className="text-sm">{p.full_name || p.email || p.id}</span>
                                      <span className="text-[10px] text-muted-foreground">
                                        {p.email}{ext ? ` · Tripletex #${ext}` : ""}
                                      </span>
                                    </div>
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => { setStep("upload"); setMonthly(null); setMode("generic"); setManualMap({}); }}>Tilbake</Button>
              <Button
                onClick={async () => {
                  const toSave = employeeMatches
                    .filter((e) => e.user_id && e.number)
                    .map((e) => ({ user_id: e.user_id!, external_employee_id: e.number }));
                  try {
                    if (toSave.length) await saveMappingMut.mutateAsync(toSave);
                  } catch (err: any) {
                    toast({ title: "Kunne ikke lagre kobling", description: String(err.message || err), variant: "destructive" });
                  }
                  setStep("preview");
                }}
                disabled={saveMappingMut.isPending}
              >
                {saveMappingMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Bekreft kobling og forhåndsvis
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "preview" && mode === "monthly" && monthly && monthlySummary && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarDays className="h-4 w-4" /> Tripletex månedsoversikt – {monthly.source_month}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <Stat label="Ansatte" value={monthlySummary.employees} sub={`${monthlySummary.unmatchedEmployees} ikke matchet`} warn={monthlySummary.unmatchedEmployees > 0} />
                <Stat label="Aktiviteter" value={monthlySummary.activities} sub={`${monthlySummary.unknownActivities.length} ukjent`} warn={monthlySummary.unknownActivities.length > 0} />
                <Stat label="Linjer" value={monthlySummary.lines} sub={`${monthly.dayColumns.length} dagkolonner`} />
                <Stat label="Måned" value={monthly.source_month} sub={`Ferie-saldo ignorert (${monthly.vacationBalanceColumns.length})`} />
                <Stat label="Arbeidstimer" value={fmt(monthlySummary.worked)} />
                <Stat label="Overtid" value={fmt(monthlySummary.overtime)} />
                <Stat label="Fravær" value={fmt(monthlySummary.absence)} />
                <Stat label="AML hviletid" value="N/A" sub="Ingen start/slutt i fil" />
              </div>
              {monthlySummary.unknownActivities.length > 0 && (
                <div className="mt-3 p-3 rounded-md bg-amber-500/10 border border-amber-500/30 text-xs">
                  <strong>Ukjente aktiviteter:</strong> {monthlySummary.unknownActivities.join(", ")} — disse importeres som ordinære timer. Klassifiser dem i aktivitetsmal etter import.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Forhåndsvisning – linjer (første 100)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8"></TableHead>
                      <TableHead>Ansatt</TableHead>
                      <TableHead>Dato</TableHead>
                      <TableHead>Aktivitet</TableHead>
                      <TableHead>Klasse</TableHead>
                      <TableHead className="text-right">Timer</TableHead>
                      <TableHead className="text-right">Ord</TableHead>
                      <TableHead className="text-right">OT</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {matchedMonthly.slice(0, 100).map((m, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          {m.user_id ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <AlertCircle className="h-4 w-4 text-amber-500" />}
                        </TableCell>
                        <TableCell className="text-xs">{m.row.employee_name} <span className="text-muted-foreground">#{m.row.employee_number}</span></TableCell>
                        <TableCell className="text-xs">{m.row.work_date}</TableCell>
                        <TableCell className="text-xs">{m.row.activity_name}</TableCell>
                        <TableCell className="text-xs"><Badge variant="outline" className="text-[10px]">{m.row.classification.kind}</Badge></TableCell>
                        <TableCell className="text-right text-xs font-medium">{fmt(m.row.hours)}</TableCell>
                        <TableCell className="text-right text-xs">{fmt(m.row.ordinary_hours)}</TableCell>
                        <TableCell className="text-right text-xs">{fmt(m.row.hours_overtime)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {matchedMonthly.length > 100 && (
                  <p className="text-xs text-muted-foreground mt-2">Viser 100 av {matchedMonthly.length} linjer.</p>
                )}
              </div>
              {monthlySummary.unmatchedEmployees > 0 && (
                <div className="mt-3 p-3 rounded-md bg-amber-500/10 border border-amber-500/30 text-xs">
                  <strong>{matchedMonthly.filter((m) => !m.user_id).length} linjer kan ikke importeres</strong> fordi {monthlySummary.unmatchedEmployees} ansatte mangler kobling. Gå tilbake til Ansattmatching for å koble dem.
                </div>
              )}
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="ghost" onClick={() => setStep("match")}>Tilbake til matching</Button>
                <Button
                  onClick={() => importMonthlyMut.mutate()}
                  disabled={importMonthlyMut.isPending || matchedMonthly.filter((m) => m.user_id).length === 0}
                >
                  {importMonthlyMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Importer matchede & kjør AML ({matchedMonthly.filter((m) => m.user_id).length})
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {step === "done" && result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              {result.inserted + result.updated === 0 ? (
                <><AlertCircle className="h-5 w-5 text-amber-500" /> Import fullført – ingen linjer opprettet</>
              ) : (
                <><CheckCircle2 className="h-5 w-5 text-emerald-500" /> Import fullført</>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {result.inserted + result.updated === 0 && result.unmatched > 0 && (
              <div className="p-3 rounded-md bg-amber-500/10 border border-amber-500/30 text-xs">
                Ingen arbeidstidslinjer ble opprettet fordi {result.unmatched} linjer mangler ansattkobling. Gå tilbake til Ansattmatching og koble ansatte før du importerer på nytt.
              </div>
            )}
            <div>Nye linjer: <strong>{result.inserted}</strong></div>
            <div>Oppdaterte linjer: <strong>{result.updated}</strong></div>
            <div>Hoppet over (dubletter): <strong>{result.skipped}</strong></div>
            <div>Ikke matchet ansatt: <strong>{result.unmatched}</strong></div>
            {result.aml ? (
              <div className="pt-2 border-t mt-2">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">AML-motor</div>
                <div>Ansatte evaluert: <strong>{result.aml.users_evaluated}</strong></div>
                <div>Nye varsler: <strong>{result.aml.new_alerts}</strong></div>
                <div>Auto-løste varsler: <strong>{result.aml.resolved_alerts}</strong></div>
              </div>
            ) : (
              <div className="p-3 rounded-md bg-amber-500/10 border border-amber-500/30 text-xs">
                AML-motoren ble ikke kjørt etter import{result.amlError ? `: ${result.amlError}` : ""}. Du kan kjøre den manuelt fra AML-status.
              </div>
            )}
            <div className="flex gap-2 pt-3">
              <Button variant="outline" onClick={() => { setStep("upload"); setFile(null); setRawRows([]); setHeaders([]); setMapping({}); setMonthly(null); setMode("generic"); }}>
                Ny import
              </Button>
              <Button onClick={() => navigate("/hms/aml")}>Gå til AML-status</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function fmt(n: number) {
  return n.toFixed(2).replace(".", ",");
}

function Stat({ label, value, sub, warn }: { label: string; value: ReactNode; sub?: string; warn?: boolean }) {
  return (
    <div className={`rounded-md border p-3 ${warn ? "border-amber-500/40 bg-amber-500/5" : "bg-card"}`}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}
