import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import {
  BookOpen, ChevronRight, FileCheck2, Pencil, Plus, Trash2, MoveUp, MoveDown,
  CheckCircle2, ShieldCheck, Download, Loader2, Sparkles,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { toast } from "@/hooks/use-toast";
import { logHmsAudit } from "@/lib/hms/audit";
import { invalidateAckQueries, confirmedViaLabel } from "@/lib/hms/handbookAck";
import { usePermissions } from "@/hooks/usePermissions";
import { HandbookDistributionStatus } from "@/components/hms/HandbookDistributionStatus";
import { HandbookResourceLinks } from "@/components/hms/HandbookResourceLinks";
import { HmsCoveragePanel } from "@/components/hms/HmsCoveragePanel";
import { useHandbookSectionResources } from "@/hooks/useHandbookDistribution";

const CONFIRMATION_TEXT = "Jeg har lest og forstått denne håndboken.";

interface Handbook {
  id: string; title: string; description: string | null; kind: string; status: string;
  current_version_id: string | null; updated_at: string; company_id: string;
}
interface Version {
  id: string; handbook_id: string; company_id: string; version_number: number; status: string;
  requires_acknowledgement: boolean; published_at: string | null; published_by: string | null;
  changelog: string | null; created_at: string;
}
interface Section { id: string; heading: string; body: string | null; ordering: number; is_mandatory: boolean; }
interface Ack { id: string; user_id: string; version_id: string; acknowledged_at: string; }

export default function HmsHandbookDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { activeCompanyId } = useCompanyContext();
  const { user } = useAuth();
  const { hasPermission } = usePermissions();
  const canManage = hasPermission("hms.manage") || hasPermission("admin.manage_users");
  const qc = useQueryClient();

  const [editMode, setEditMode] = useState(false);
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [editedSections, setEditedSections] = useState<Record<string, { heading: string; body: string }>>({});
  const [reqAck, setReqAck] = useState(true);
  const [changelog, setChangelog] = useState("");
  const [publishOpen, setPublishOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: handbook, isLoading } = useQuery({
    queryKey: ["hms-handbook", id, activeCompanyId],
    enabled: !!id && !!activeCompanyId,
    queryFn: async () => {
      const sb = supabase as any;
      const { data, error } = await sb
        .from("hms_handbooks")
        .select("id, title, description, kind, status, current_version_id, updated_at, company_id")
        .eq("id", id).eq("company_id", activeCompanyId).is("deleted_at", null).maybeSingle();
      if (error) throw error;
      return data as Handbook | null;
    },
  });

  const { data: versions = [] } = useQuery({
    queryKey: ["hms-handbook-versions", id],
    enabled: !!handbook,
    queryFn: async () => {
      const sb = supabase as any;
      const { data, error } = await sb
        .from("hms_handbook_versions")
        .select("id, handbook_id, company_id, version_number, status, requires_acknowledgement, published_at, published_by, changelog, created_at")
        .eq("handbook_id", id)
        .order("version_number", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Version[];
    },
  });

  // Active = published current version. Draft = latest draft (for editing).
  const publishedVersion = handbook?.current_version_id
    ? versions.find((v) => v.id === handbook.current_version_id)
    : versions.find((v) => v.status === "published");
  const draftVersion = versions.find((v) => v.status === "draft");
  const viewVersion = editMode ? draftVersion ?? publishedVersion : publishedVersion ?? draftVersion ?? versions[0];

  const { data: sections = [] } = useQuery({
    queryKey: ["hms-handbook-sections", viewVersion?.id],
    enabled: !!viewVersion,
    queryFn: async () => {
      const sb = supabase as any;
      const { data, error } = await sb
        .from("hms_handbook_sections")
        .select("id, heading, body, ordering, is_mandatory")
        .eq("version_id", viewVersion!.id)
        .order("ordering", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Section[];
    },
  });

  const { data: sectionResources = [] } = useHandbookSectionResources(viewVersion?.id ?? null);

  useEffect(() => {
    if (sections.length && !activeChapterId) setActiveChapterId(sections[0].id);
  }, [sections, activeChapterId]);

  // Load my acknowledgement (samlet bekreftelse for hele håndboken)
  const { data: myAck } = useQuery({
    queryKey: ["hms-handbook-my-ack", publishedVersion?.id, user?.id],
    enabled: !!publishedVersion && !!user?.id,
    queryFn: async () => {
      const sb = supabase as any;
      const { data } = await sb
        .from("hms_handbook_acknowledgements")
        .select("id, user_id, version_id, acknowledged_at")
        .eq("version_id", publishedVersion!.id)
        .eq("user_id", user!.id)
        .is("section_id", null)
        .order("acknowledged_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as Ack | null;
    },
  });

  // Admin: alle aktive ansatte + bekreftelser (interne og fra utsending) for publisert versjon
  const { data: ackOverview } = useQuery({
    queryKey: ["hms-handbook-ack-overview", publishedVersion?.id, activeCompanyId],
    enabled: !!publishedVersion && !!activeCompanyId && canManage,
    queryFn: async () => {
      const sb = supabase as any;
      const [{ data: emps }, { data: accounts }, { data: acks }, { data: recips }] = await Promise.all([
        sb.from("employment_profiles")
          .select("person_id, archived_at, people(full_name, email, is_active)")
          .eq("company_id", activeCompanyId)
          .eq("include_in_hms_people", true),

        sb.from("user_accounts").select("person_id, auth_user_id").eq("company_id", activeCompanyId),
        sb.from("hms_handbook_acknowledgements")
          .select("user_id, person_id, recipient_id, section_id, acknowledged_at, confirmed_via")
          .eq("version_id", publishedVersion!.id)
          .is("section_id", null),
        sb.from("hms_handbook_recipients")
          .select("id, person_id, user_id, full_name, email, sent_at, acknowledged_at, section_ids")
          .eq("company_id", activeCompanyId)
          .eq("version_id", publishedVersion!.id),
      ]);

      const personToUser = new Map<string, string>((accounts ?? []).map((a: any) => [a.person_id, a.auth_user_id]));
      const userToPerson = new Map<string, string>((accounts ?? []).map((a: any) => [a.auth_user_id, a.person_id]));

      type Row = {
        key: string; person_id: string | null; user_id: string | null;
        full_name: string | null; email: string | null;
        acknowledged_at: string | null; confirmed_via: string | null;
        sent_at: string | null; is_employee: boolean;
      };

      const rows: Row[] = [];
      const byPerson = new Map<string, Row>();

      for (const e of (emps ?? []) as any[]) {
        if (!e.person_id || e.archived_at || e.people?.is_active === false) continue;
        if (byPerson.has(e.person_id)) continue;
        const row: Row = {
          key: e.person_id,
          person_id: e.person_id,
          user_id: personToUser.get(e.person_id) ?? null,
          full_name: e.people?.full_name ?? null,
          email: e.people?.email ?? null,
          acknowledged_at: null, confirmed_via: null, sent_at: null, is_employee: true,
        };
        byPerson.set(e.person_id, row);
        rows.push(row);
      }

      // Mottakere som ikke er aktive ansatte tas med, slik at utsendinger alltid synes
      const recipientRows = new Map<string, Row>();
      for (const r of (recips ?? []) as any[]) {
        const pid = r.person_id ?? (r.user_id ? userToPerson.get(r.user_id) ?? null : null);
        const target = pid ? byPerson.get(pid) : null;
        if (target) {
          if (r.sent_at && (!target.sent_at || r.sent_at > target.sent_at)) target.sent_at = r.sent_at;
          continue;
        }
        const key = `recipient:${r.id}`;
        const row: Row = {
          key, person_id: pid, user_id: r.user_id ?? null,
          full_name: r.full_name ?? null, email: r.email ?? null,
          acknowledged_at: r.acknowledged_at ?? null,
          confirmed_via: r.acknowledged_at ? "token" : null,
          sent_at: r.sent_at ?? null, is_employee: false,
        };
        recipientRows.set(r.id, row);
        rows.push(row);
      }

      for (const a of (acks ?? []) as any[]) {
        const pid = a.person_id ?? (a.user_id ? userToPerson.get(a.user_id) ?? null : null);
        let row = pid ? byPerson.get(pid) : undefined;
        if (!row && a.recipient_id) row = recipientRows.get(a.recipient_id);
        if (!row) continue;
        if (!row.acknowledged_at || (a.acknowledged_at && a.acknowledged_at < row.acknowledged_at)) {
          row.acknowledged_at = a.acknowledged_at;
          row.confirmed_via = a.confirmed_via ?? "internal";
        }
      }

      return rows.sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? "", "nb"));
    },
  });

  // ----- Mutations -----

  const ensureDraftMut = useMutation({
    mutationFn: async () => {
      if (!handbook) throw new Error("Mangler håndbok");
      if (draftVersion) return draftVersion;
      const sb = supabase as any;
      const { data: u } = await supabase.auth.getUser();
      const nextNo = (versions[0]?.version_number ?? 0) + 1;
      const { data: ver, error } = await sb.from("hms_handbook_versions").insert({
        handbook_id: handbook.id,
        company_id: handbook.company_id,
        version_number: nextNo,
        status: "draft",
        requires_acknowledgement: true,
        created_by: u.user?.id,
      }).select("*").single();
      if (error) throw error;
      // Copy sections from published into draft
      if (publishedVersion) {
        const { data: src } = await sb.from("hms_handbook_sections")
          .select("heading, body, ordering").eq("version_id", publishedVersion.id).order("ordering");
        if (src && src.length) {
          await sb.from("hms_handbook_sections").insert(
            src.map((s: any) => ({ version_id: ver.id, heading: s.heading, body: s.body, ordering: s.ordering }))
          );
        }
      }
      return ver as Version;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hms-handbook-versions", id] }),
  });

  const startEdit = async () => {
    await ensureDraftMut.mutateAsync();
    setEditMode(true);
    setEditedSections({});
  };

  const saveSection = useMutation({
    mutationFn: async (s: { id: string; heading: string; body: string }) => {
      const sb = supabase as any;
      const { error } = await sb.from("hms_handbook_sections")
        .update({ heading: s.heading, body: s.body }).eq("id", s.id);
      if (error) throw error;
      await logHmsAudit({
        company_id: handbook?.company_id, entity_type: "hms_handbook", entity_id: handbook?.id,
        action: "section.updated", payload: { section_id: s.id, version_id: viewVersion?.id },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hms-handbook-sections", viewVersion?.id] });
      toast({ title: "Lagret" });
    },
    onError: (e: any) => toast({ title: "Feil", description: String(e.message || e), variant: "destructive" }),
  });

  const addSection = useMutation({
    mutationFn: async () => {
      const sb = supabase as any;
      if (!viewVersion) throw new Error("Ingen versjon");
      const ordering = (sections[sections.length - 1]?.ordering ?? -1) + 1;
      const { error } = await sb.from("hms_handbook_sections").insert({
        version_id: viewVersion.id, heading: "Nytt kapittel", body: "", ordering,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hms-handbook-sections", viewVersion?.id] }),
  });

  const deleteSection = useMutation({
    mutationFn: async (sid: string) => {
      const sb = supabase as any;
      const { error } = await sb.from("hms_handbook_sections").delete().eq("id", sid);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hms-handbook-sections", viewVersion?.id] }),
  });

  const reorderSection = useMutation({
    mutationFn: async ({ sid, dir }: { sid: string; dir: -1 | 1 }) => {
      const sb = supabase as any;
      const idx = sections.findIndex((s) => s.id === sid);
      const swap = sections[idx + dir];
      if (!swap) return;
      const a = sections[idx];
      await sb.from("hms_handbook_sections").update({ ordering: swap.ordering }).eq("id", a.id);
      await sb.from("hms_handbook_sections").update({ ordering: a.ordering }).eq("id", swap.id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hms-handbook-sections", viewVersion?.id] }),
  });

  const toggleMandatory = useMutation({
    mutationFn: async ({ sid, value }: { sid: string; value: boolean }) => {
      const sb = supabase as any;
      const { error } = await sb.from("hms_handbook_sections").update({ is_mandatory: value }).eq("id", sid);
      if (error) throw error;
      await logHmsAudit({
        company_id: handbook?.company_id, entity_type: "hms_handbook", entity_id: handbook?.id,
        action: "section.mandatory_changed", payload: { section_id: sid, is_mandatory: value },
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hms-handbook-sections", viewVersion?.id] }),
    onError: (e: any) => toast({ title: "Feil", description: String(e.message || e), variant: "destructive" }),
  });

  const publishMut = useMutation({
    mutationFn: async () => {
      if (!handbook || !draftVersion) throw new Error("Mangler utkast");
      const sb = supabase as any;
      const { data: u } = await supabase.auth.getUser();
      const { error: vErr } = await sb.from("hms_handbook_versions").update({
        status: "published",
        published_at: new Date().toISOString(),
        published_by: u.user?.id,
        requires_acknowledgement: reqAck,
        changelog: changelog || null,
      }).eq("id", draftVersion.id);
      if (vErr) throw vErr;
      const { error: hErr } = await sb.from("hms_handbooks").update({
        current_version_id: draftVersion.id, status: "published",
      }).eq("id", handbook.id);
      if (hErr) throw hErr;
      await logHmsAudit({
        company_id: handbook.company_id, entity_type: "hms_handbook", entity_id: handbook.id,
        action: "version.published",
        payload: { version_id: draftVersion.id, version_number: draftVersion.version_number, requires_acknowledgement: reqAck, changelog },
      });
    },
    onSuccess: () => {
      toast({ title: "Versjon publisert" });
      setPublishOpen(false); setEditMode(false); setChangelog("");
      qc.invalidateQueries({ queryKey: ["hms-handbook", id] });
      qc.invalidateQueries({ queryKey: ["hms-handbook-versions", id] });
    },
    onError: (e: any) => toast({ title: "Feil", description: String(e.message || e), variant: "destructive" }),
  });

  const ackMut = useMutation({
    mutationFn: async () => {
      if (!handbook || !publishedVersion || !user?.id) throw new Error("Mangler kontekst");
      const sb = supabase as any;
      const { data, error } = await sb.rpc("hms_handbook_ack_internal", {
        p_version_id: publishedVersion.id,
        p_section_id: null,
        p_user_agent: navigator.userAgent.slice(0, 250),
        p_confirmation_text: CONFIRMATION_TEXT,
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error(String((data as any).error));
    },
    onSuccess: () => {
      toast({ title: "Bekreftelse registrert" });
      setConfirmOpen(false);
      invalidateAckQueries(qc);
    },
    onError: (e: any) => toast({ title: "Feil", description: String(e.message || e), variant: "destructive" }),
  });

  const exportCsv = () => {
    if (!ackOverview) return;
    const lines = [
      ["Navn", "E-post", "Grunnlag", "Sendt", "Status", "Bekreftet via", "Bekreftet"].join(","),
      ...ackOverview.map((r: any) => [
        JSON.stringify(r.full_name ?? ""), JSON.stringify(r.email ?? ""),
        r.is_employee ? "ansatt" : "mottaker",
        r.sent_at ? format(new Date(r.sent_at), "yyyy-MM-dd HH:mm") : "",
        r.acknowledged_at ? "bekreftet" : "mangler",
        r.acknowledged_at ? (r.confirmed_via === "token" ? "utsending" : "internt") : "",
        r.acknowledged_at ? format(new Date(r.acknowledged_at), "yyyy-MM-dd HH:mm") : "",
      ].join(",")),
    ].join("\n");
    const blob = new Blob([lines], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `bekreftelser-${handbook?.title ?? "handbok"}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const aiDraftMut = useMutation({
    mutationFn: async (mode: "draft" | "simplify" | "leader" | "short" | "checklist") => {
      if (!activeChapter || !handbook) throw new Error("Mangler kontekst");
      const sb = supabase as any;
      const currentBody = draftHas(activeChapter.id)?.body ?? activeChapter.body ?? "";
      const { data, error } = await sb.functions.invoke("hms-handbook-ai-draft", {
        body: {
          handbookKind: handbook.kind,
          handbookTitle: handbook.title,
          chapterTitle: draftHas(activeChapter.id)?.heading ?? activeChapter.heading,
          currentBody,
          mode,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return (data as any)?.content as string;
    },
    onSuccess: (content) => {
      if (!activeChapter || !content) return;
      setEditedSections((p) => ({
        ...p,
        [activeChapter.id]: {
          heading: draftHas(activeChapter.id)?.heading ?? activeChapter.heading,
          body: content,
        },
      }));
      toast({ title: "AI-utkast lagt inn", description: "Utkastet er ikke lagret enda – gjennomgå og lagre manuelt." });
    },
    onError: (e: any) => toast({ title: "AI feilet", description: String(e.message || e), variant: "destructive" }),
  });

  const activeChapter = useMemo(() => {
    return sections.find((s) => s.id === activeChapterId) ?? sections[0];
  }, [sections, activeChapterId]);

  const draftHas = (sid: string) => editedSections[sid];
  const heading = activeChapter ? draftHas(activeChapter.id)?.heading ?? activeChapter.heading : "";
  const body = activeChapter ? draftHas(activeChapter.id)?.body ?? (activeChapter.body ?? "") : "";

  if (isLoading) {
    return <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-64" /></div>;
  }
  if (!handbook) {
    return (
      <div className="p-4 sm:p-6 max-w-4xl mx-auto">
        <Card className="border-dashed"><CardContent className="py-12 text-center text-sm text-muted-foreground space-y-2">
          <BookOpen className="h-8 w-8 mx-auto text-muted-foreground/40" />
          <div className="font-medium text-foreground">Ikke funnet eller ingen tilgang</div>
          <Link to="/hms/handbooks" className="text-primary text-xs underline">Tilbake</Link>
        </CardContent></Card>
      </div>
    );
  }

  const ackedCount = ackOverview?.filter((r: any) => r.acknowledged_at).length ?? 0;
  const totalPeople = ackOverview?.length ?? 0;
  const employeeCount = ackOverview?.filter((r: any) => r.is_employee).length ?? 0;
  const sentCount = ackOverview?.filter((r: any) => r.sent_at).length ?? 0;

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      <nav className="flex items-center gap-1 text-xs text-muted-foreground">
        <Link to="/hms" className="hover:text-foreground">HMS &amp; HR</Link>
        <ChevronRight className="h-3 w-3" />
        <Link to="/hms/handbooks" className="hover:text-foreground">Håndbøker</Link>
        <ChevronRight className="h-3 w-3" />
        <span className="text-foreground truncate">{handbook.title}</span>
      </nav>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-semibold tracking-tight">{handbook.title}</h1>
            <Badge variant="outline" className="text-[10px] uppercase">{handbook.kind}</Badge>
            {publishedVersion ? (
              <Badge variant="default" className="text-[10px]">v{publishedVersion.version_number} publisert</Badge>
            ) : (
              <Badge variant="secondary" className="text-[10px]">Ikke publisert</Badge>
            )}
            {draftVersion && draftVersion.id !== publishedVersion?.id && (
              <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">
                v{draftVersion.version_number} utkast
              </Badge>
            )}
          </div>
          {handbook.description && <p className="text-sm text-muted-foreground max-w-2xl">{handbook.description}</p>}
          <p className="text-xs text-muted-foreground">
            Sist oppdatert {format(new Date(handbook.updated_at), "d. MMM yyyy", { locale: nb })}
            {publishedVersion?.published_at && ` · publisert ${format(new Date(publishedVersion.published_at), "d. MMM yyyy", { locale: nb })}`}
          </p>
        </div>
        <div className="flex gap-2">
          {canManage && !editMode && (
            <Button size="sm" variant="outline" onClick={startEdit} disabled={ensureDraftMut.isPending}>
              <Pencil className="h-4 w-4 mr-1.5" /> Rediger
            </Button>
          )}
          {canManage && editMode && draftVersion && (
            <>
              <Button size="sm" variant="ghost" onClick={() => setEditMode(false)}>Avslutt redigering</Button>
              <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
                <DialogTrigger asChild>
                  <Button size="sm"><CheckCircle2 className="h-4 w-4 mr-1.5" /> Publiser v{draftVersion.version_number}</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Publiser ny versjon</DialogTitle>
                    <DialogDescription>
                      Versjon {draftVersion.version_number} blir aktiv og låst. Tidligere versjon beholdes som historikk.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Endringslogg (valgfritt)</Label>
                      <Textarea value={changelog} onChange={(e) => setChangelog(e.target.value)} rows={3} placeholder="Hva er endret?" />
                    </div>
                    <div className="flex items-center justify-between rounded-md border p-3">
                      <div>
                        <div className="text-sm font-medium">Krev lesebekreftelse</div>
                        <div className="text-xs text-muted-foreground">Alle aktive ansatte må bekrefte ny versjon.</div>
                      </div>
                      <Switch checked={reqAck} onCheckedChange={setReqAck} />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="ghost" onClick={() => setPublishOpen(false)}>Avbryt</Button>
                    <Button onClick={() => publishMut.mutate()} disabled={publishMut.isPending}>
                      {publishMut.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                      Publiser
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>
      </div>

      {/* Read-confirmation banner (only when published version exists) */}
      {publishedVersion && publishedVersion.requires_acknowledgement && (
        <Card className={myAck ? "border-emerald-300 bg-emerald-50/40" : "border-amber-300 bg-amber-50/40"}>
          <CardContent className="py-3 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-sm">
              <ShieldCheck className={`h-4 w-4 ${myAck ? "text-emerald-600" : "text-amber-600"}`} />
              {myAck ? (
                <span>Du bekreftet v{publishedVersion.version_number} {format(new Date(myAck.acknowledged_at), "d. MMM yyyy", { locale: nb })}.</span>
              ) : (
                <span>Du har ikke bekreftet versjon {publishedVersion.version_number} ennå.</span>
              )}
            </div>
            {!myAck && (
              <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <DialogTrigger asChild><Button size="sm">Les og bekreft</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Bekreft lest</DialogTitle>
                    <DialogDescription>Bekreftelsen logges med tidspunkt og bruker.</DialogDescription>
                  </DialogHeader>
                  <p className="text-sm">"{CONFIRMATION_TEXT}"</p>
                  <DialogFooter>
                    <Button variant="ghost" onClick={() => setConfirmOpen(false)}>Avbryt</Button>
                    <Button onClick={() => ackMut.mutate()} disabled={ackMut.isPending}>
                      {ackMut.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                      Bekreft
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="content">
        <TabsList>
          <TabsTrigger value="content">Innhold</TabsTrigger>
          {canManage && <TabsTrigger value="status">Bekreftelser{totalPeople > 0 && ` (${ackedCount}/${totalPeople})`}</TabsTrigger>}
          {canManage && <TabsTrigger value="distribution">Utsending</TabsTrigger>}
          {canManage && <TabsTrigger value="coverage">Dekning</TabsTrigger>}
          <TabsTrigger value="versions">Versjoner</TabsTrigger>
        </TabsList>

        <TabsContent value="content" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4">
            <Card className="h-fit">
              <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm">Kapitler</CardTitle>
                {editMode && (
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => addSection.mutate()}>
                    <Plus className="h-4 w-4" />
                  </Button>
                )}
              </CardHeader>
              <CardContent className="p-2 space-y-0.5">
                {sections.map((s, i) => (
                  <div key={s.id} className={`group flex items-center gap-1 rounded-md text-sm ${activeChapterId === s.id ? "bg-muted" : "hover:bg-muted/50"}`}>
                    <button
                      onClick={() => setActiveChapterId(s.id)}
                      className="flex-1 text-left px-2 py-1.5 truncate"
                    >
                      <span className="text-muted-foreground mr-1">{i + 1}.</span>{s.heading}
                    </button>
                    {editMode && (
                      <div className="opacity-0 group-hover:opacity-100 flex">
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => reorderSection.mutate({ sid: s.id, dir: -1 })} disabled={i === 0}>
                          <MoveUp className="h-3 w-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => reorderSection.mutate({ sid: s.id, dir: 1 })} disabled={i === sections.length - 1}>
                          <MoveDown className="h-3 w-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => { if (confirm("Slett kapittel?")) deleteSection.mutate(s.id); }}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
                {sections.length === 0 && <p className="text-xs text-muted-foreground p-2">Ingen kapitler.</p>}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6 space-y-3">
                {!activeChapter && <p className="text-sm text-muted-foreground">Velg et kapittel.</p>}
                {activeChapter && editMode && (
                  <>
                    <Input value={heading} onChange={(e) => setEditedSections((p) => ({ ...p, [activeChapter.id]: { heading: e.target.value, body } }))} className="text-lg font-semibold" />
                    <div className="flex items-center justify-between rounded-md border p-3">
                      <div>
                        <div className="text-sm font-medium">Obligatorisk kapittel</div>
                        <div className="text-xs text-muted-foreground">Krever egen lesebekreftelse fra alle ansatte, også ved ny utgave.</div>
                      </div>
                      <Switch
                        checked={!!activeChapter.is_mandatory}
                        onCheckedChange={(v) => toggleMandatory.mutate({ sid: activeChapter.id, value: v })}
                      />
                    </div>
                    <Textarea value={body} onChange={(e) => setEditedSections((p) => ({ ...p, [activeChapter.id]: { heading, body: e.target.value } }))} rows={24} className="font-mono text-xs" />
                    <div className="flex justify-between items-center gap-2 flex-wrap">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="outline" disabled={aiDraftMut.isPending}>
                            {aiDraftMut.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1.5" />}
                            AI-utkast
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-64">
                          <DropdownMenuLabel className="text-xs">Generer / forbedre</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => aiDraftMut.mutate("draft")}>
                            Komplett utkast
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => aiDraftMut.mutate("simplify")}>
                            Enklere språk for montører
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => aiDraftMut.mutate("leader")}>
                            Lederversjon
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => aiDraftMut.mutate("short")}>
                            Kortversjon (mobil)
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => aiDraftMut.mutate("checklist")}>
                            Foreslå sjekkpunkter / SJA-koblinger
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <div className="flex gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setEditedSections((p) => { const c = { ...p }; delete c[activeChapter.id]; return c; })} disabled={!draftHas(activeChapter.id)}>Tilbakestill</Button>
                        <Button size="sm" onClick={() => saveSection.mutate({ id: activeChapter.id, heading, body })} disabled={!draftHas(activeChapter.id) || saveSection.isPending}>
                          Lagre
                        </Button>
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      AI-forslag erstatter teksten i editoren, men lagres ikke automatisk. Gjennomgå, lagre, og publiser ny versjon for å aktivere.
                    </p>
                  </>
                )}
                {activeChapter && !editMode && (
                  <>
                    <h2 className="text-xl font-semibold">{activeChapter.heading}</h2>
                    <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{activeChapter.body || <span className="text-muted-foreground">Tomt.</span>}</div>
                  </>
                )}
              </CardContent>
            </Card>
            {canManage && activeChapter && viewVersion && (() => {
              const sr = sectionResources.find((s) => s.id === activeChapter.id);
              return sr ? (
                <div className="md:col-start-2">
                  <HandbookResourceLinks versionId={viewVersion.id} section={sr} />
                </div>
              ) : null;
            })()}
          </div>

        </TabsContent>

        {canManage && (
          <TabsContent value="status" className="mt-4">
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileCheck2 className="h-4 w-4" /> Alle ansattbekreftelser {publishedVersion && `– v${publishedVersion.version_number}`}
                </CardTitle>
                <Button size="sm" variant="outline" onClick={exportCsv} disabled={!ackOverview?.length}>
                  <Download className="h-4 w-4 mr-1.5" /> Eksporter CSV
                </Button>
              </CardHeader>
              <CardContent>
                {!publishedVersion && <p className="text-sm text-muted-foreground">Ingen publisert versjon enda.</p>}
                {publishedVersion && (
                  <div className="mb-3 space-y-1">
                    {totalPeople === 0 ? (
                      <p className="text-sm text-muted-foreground">Ingen aktive ansatte eller utsendinger er registrert enda.</p>
                    ) : (
                      <p className="text-sm">
                        <span className="font-medium">{ackedCount} av {totalPeople}</span>{" "}
                        {employeeCount > 0 ? "ansatte" : "mottakere"} har bekreftet v{publishedVersion.version_number}.
                      </p>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      Grunnlaget er alle aktive ansatte. Bekreftelser teller uansett om de er gjort internt i systemet eller via personlig utsendingslenke.
                      {sentCount === 0 ? " Ingen utsendinger er sendt ennå." : ` ${sentCount} har fått håndboken tilsendt.`}
                    </p>
                  </div>
                )}
                <div className="divide-y">
                  {(ackOverview ?? []).map((r: any) => (
                    <div key={r.key} className="py-2 flex items-center justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{r.full_name ?? r.email ?? "Ukjent"}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {r.email ?? "Ingen e-post"}
                          {!r.is_employee && " · kun mottaker"}
                          {r.is_employee && !r.sent_at && " · ikke tilsendt"}
                        </div>
                      </div>
                      {r.acknowledged_at ? (
                        <Badge variant="outline" className="shrink-0 text-emerald-700 border-emerald-300 bg-emerald-50">
                          {confirmedViaLabel(r.confirmed_via)} {format(new Date(r.acknowledged_at), "d. MMM yyyy", { locale: nb })}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="shrink-0 text-amber-700 border-amber-300 bg-amber-50">
                          {r.sent_at ? "Sendt, ikke bekreftet" : "Mangler bekreftelse"}
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {canManage && (
          <TabsContent value="distribution" className="mt-4">
            <HandbookDistributionStatus
              handbookId={handbook.id}
              handbookTitle={handbook.title}
              versionId={publishedVersion?.id ?? null}
              versionNumber={publishedVersion?.version_number ?? null}
              chapters={sections.map((s) => ({ id: s.id, heading: s.heading, is_mandatory: s.is_mandatory }))}
              canManage={canManage}
            />
          </TabsContent>
        )}

        {canManage && (
          <TabsContent value="coverage" className="mt-4">
            <HmsCoveragePanel
              handbookId={handbook.id}
              versionId={viewVersion?.id ?? null}
              versionNumber={viewVersion?.version_number ?? null}
            />
          </TabsContent>
        )}

        <TabsContent value="versions" className="mt-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Versjoner</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {versions.map((v) => (
                <div key={v.id} className="flex items-center justify-between text-sm border-b last:border-0 py-2">
                  <div>
                    <div className="font-medium">v{v.version_number}</div>
                    {v.changelog && <div className="text-xs text-muted-foreground max-w-md">{v.changelog}</div>}
                    {v.published_at && (
                      <div className="text-xs text-muted-foreground">
                        Publisert {format(new Date(v.published_at), "d. MMM yyyy", { locale: nb })}
                      </div>
                    )}
                  </div>
                  <Badge variant={v.status === "published" ? "default" : "secondary"} className="text-[10px]">{v.status}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
