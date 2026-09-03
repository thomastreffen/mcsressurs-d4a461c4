import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AlertTriangle, BookOpen, CheckCircle2, Eye, FileClock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const sb = supabase as any;

interface Stats {
  employees: number;
  missingMandatory: number;
  openedNotConfirmed: number;
  notOpened: number;
  newVersions: number;
}

/** HMS-status for dokumentbekreftelser (obligatoriske kapitler). */
export function HandbookAckStatusCard() {
  const { activeCompanyId: cid } = useCompanyContext();

  const { data, isLoading } = useQuery<Stats>({
    queryKey: ["handbook-ack-status", cid],
    enabled: !!cid,
    queryFn: async () => {
      const [{ data: hbs }, { data: emps }] = await Promise.all([
        sb.from("hms_handbooks").select("id, current_version_id").eq("company_id", cid).is("deleted_at", null),
        sb.from("employment_profiles").select("person_id, archived_at, people(is_active)").eq("company_id", cid),
      ]);

      const activePeople = new Set<string>(
        (emps ?? [])
          .filter((e: any) => !e.archived_at && e.people?.is_active !== false && e.person_id)
          .map((e: any) => e.person_id),
      );
      const versionIds = (hbs ?? []).map((h: any) => h.current_version_id).filter(Boolean);
      const empty: Stats = { employees: activePeople.size, missingMandatory: 0, openedNotConfirmed: 0, notOpened: 0, newVersions: 0 };
      if (versionIds.length === 0) return empty;

      const [{ data: vers }, { data: secs }, { data: acks }, { data: recips }] = await Promise.all([
        sb.from("hms_handbook_versions").select("id, handbook_id, version_number, requires_acknowledgement").in("id", versionIds),
        sb.from("hms_handbook_sections").select("id, version_id, is_mandatory").in("version_id", versionIds),
        sb.from("hms_handbook_acknowledgements").select("version_id, section_id, user_id, person_id").in("version_id", versionIds),
        sb.from("hms_handbook_recipients").select("person_id, version_id, first_opened_at, acknowledged_at").eq("company_id", cid).in("version_id", versionIds),
      ]);

      // Versjoner som krever bekreftelse og har obligatoriske kapitler
      const mandatoryVersions = (vers ?? []).filter((v: any) => v.requires_acknowledgement);
      const accountRes = await sb.from("user_accounts").select("person_id, auth_user_id").eq("company_id", cid);
      const userToPerson = new Map<string, string>((accountRes.data ?? []).map((a: any) => [a.auth_user_id, a.person_id]));

      const ackPersons = new Map<string, Set<string>>(); // version_id -> person set (whole or all mandatory)
      for (const v of mandatoryVersions) {
        const mandatorySections = (secs ?? []).filter((s: any) => s.version_id === v.id && s.is_mandatory);
        const rows = (acks ?? []).filter((a: any) => a.version_id === v.id);
        const byPerson = new Map<string, Set<string | null>>();
        for (const a of rows) {
          const pid = a.person_id ?? (a.user_id ? userToPerson.get(a.user_id) : null);
          if (!pid) continue;
          if (!byPerson.has(pid)) byPerson.set(pid, new Set());
          byPerson.get(pid)!.add(a.section_id ?? null);
        }
        const done = new Set<string>();
        for (const [pid, sset] of byPerson) {
          const whole = sset.has(null);
          const allMandatory = mandatorySections.length > 0 && mandatorySections.every((s: any) => sset.has(s.id));
          if (whole || allMandatory) done.add(pid);
        }
        ackPersons.set(v.id, done);
      }

      let missingMandatory = 0;
      let openedNotConfirmed = 0;
      let notOpened = 0;
      for (const pid of activePeople) {
        const missingVersions = mandatoryVersions.filter((v: any) => !ackPersons.get(v.id)?.has(pid));
        if (missingVersions.length === 0) continue;
        missingMandatory++;
        const opened = (recips ?? []).some(
          (r: any) => r.person_id === pid && !r.acknowledged_at && r.first_opened_at &&
            missingVersions.some((v: any) => v.id === r.version_id),
        );
        if (opened) openedNotConfirmed++;
        else notOpened++;
      }

      return {
        employees: activePeople.size,
        missingMandatory,
        openedNotConfirmed,
        notOpened,
        newVersions: mandatoryVersions.filter((v: any) => (v.version_number ?? 1) > 1 && (ackPersons.get(v.id)?.size ?? 0) < activePeople.size).length,
      };
    },
  });

  return (
    <Card>
      <CardHeader className="pb-2 flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" /> Dokumentbekreftelser
        </CardTitle>
        <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
          <Link to="/hms/handbooks">Håndbøker</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading || !data ? (
          <Skeleton className="h-20" />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat icon={<AlertTriangle className="h-3.5 w-3.5 text-amber-600" />} value={data.missingMandatory} label="Mangler obligatorisk bekreftelse" />
            <Stat icon={<Eye className="h-3.5 w-3.5 text-sky-600" />} value={data.openedNotConfirmed} label="Åpnet, ikke bekreftet" />
            <Stat icon={<CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />} value={data.notOpened} label="Har ikke åpnet" />
            <Stat icon={<FileClock className="h-3.5 w-3.5 text-violet-600" />} value={data.newVersions} label="Nye utgaver som krever bekreftelse" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="rounded-lg border p-3 space-y-1">
      <div className="flex items-center gap-1.5">{icon}<span className="text-xl font-semibold">{value}</span></div>
      <div className="text-[11px] leading-tight text-muted-foreground">{label}</div>
    </div>
  );
}
