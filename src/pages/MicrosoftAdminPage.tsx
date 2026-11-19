import { JobOutlookPilotScopeCard } from "@/components/admin/JobOutlookPilotScopeCard";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { triggerConversationEmailSend } from "@/lib/conversation-email";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { HubCalendarDiagnosticsCard } from "@/components/admin/HubCalendarDiagnosticsCard";
import { HubCalendarWritePilotCard } from "@/components/admin/HubCalendarWritePilotCard";
import {
  RefreshCw, ShieldOff, Plus, RotateCcw, CheckCircle2,
  AlertTriangle, XCircle, Clock, Mail, Info, Inbox, RotateCw, Ban, Send,
  Activity, ExternalLink, ShieldCheck, HelpCircle,
} from "lucide-react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";

type SubAction = "ensure" | "renew" | "recreate" | "disable" | "sync";
type EmailFilter = "all" | "invite" | "participant_added" | "new_post" | "resend";

export default function MicrosoftAdminPage() {
  const { activeCompanyId } = useCompanyContext();
  const queryClient = useQueryClient();
  const [actionLoading, setActionLoading] = useState<SubAction | null>(null);
  const [reprocessingId, setReprocessingId] = useState<string | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean; error?: string; status_code?: number; mailbox?: string;
    verified?: boolean; webLink?: string; internetMessageId?: string;
  } | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [emailFilter, setEmailFilter] = useState<EmailFilter>("all");

  // ── Subscriptions ──
  const { data: subscriptions, isLoading } = useQuery({
    queryKey: ["ms-graph-subscriptions", activeCompanyId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("graph-subscription-manage", {
        body: { action: "list", company_id: activeCompanyId },
      });
      if (error) throw error;
      return data?.subscriptions || [];
    },
    enabled: !!activeCompanyId,
  });

  // ── Email send monitor (last 50) ──
  const { data: emailLogs, refetch: refetchLogs } = useQuery({
    queryKey: ["email-send-monitor", activeCompanyId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("conversation_email_messages")
        .select("id, direction, status, subject, from_email, to_emails, created_at, processed_at, error, processing_status, processing_duration_ms, thread_id, post_id, verified, outlook_weblink, outlook_internet_message_id")
        .eq("company_id", activeCompanyId!)
        .order("created_at", { ascending: false })
        .limit(50);
      return data || [];
    },
    enabled: !!activeCompanyId,
  });

  // ── Dead letters ──
  const { data: deadLetters } = useQuery({
    queryKey: ["dead-letters", activeCompanyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("conversation_email_dead_letters")
        .select("*")
        .eq("company_id", activeCompanyId!)
        .order("created_at", { ascending: false })
        .limit(50);
      return data || [];
    },
    enabled: !!activeCompanyId,
  });

  // Computed stats
  const activeSubCount = (subscriptions || []).filter((s: any) => s.health === "healthy").length;
  const lastSent = (emailLogs || []).find((e: any) => e.status === "sent");
  const pendingDL = (deadLetters || []).filter((d: any) => d.status === "pending").length;
  const failedEmails = (emailLogs || []).filter((e: any) => e.status === "failed").length;
  const verifiedCount = (emailLogs || []).filter((e: any) => e.verified).length;

  const runAction = async (action: SubAction) => {
    setActionLoading(action);
    try {
      if (action === "sync") {
        const { data, error } = await supabase.functions.invoke("graph-subscription-sync", {
          body: {},
        });
        if (error) throw error;
        toast.success("Subscription-synk fullført", { description: data?.action || "OK" });
      } else {
        const { data, error } = await supabase.functions.invoke("graph-subscription-manage", {
          body: { action, company_id: activeCompanyId },
        });
        if (error) throw error;
        toast.success(`Handling "${action}" fullført`, { description: data?.status || "OK" });
      }
      queryClient.invalidateQueries({ queryKey: ["ms-graph-subscriptions"] });
    } catch (err: any) {
      toast.error(`Feil ved "${action}"`, { description: err.message });
    } finally {
      setActionLoading(null);
    }
  };

  const reprocessDeadLetter = async (id: string) => {
    setReprocessingId(id);
    try {
      const { data, error } = await supabase.functions.invoke("conversation-email-reprocess", {
        body: { dead_letter_id: id },
      });
      if (error) throw error;
      if (data?.status === "reprocessed") {
        toast.success("Meldingen ble reprocessert og lagt i tråden");
      } else if (data?.status === "duplicate") {
        toast.info("Meldingen var allerede prosessert");
      } else {
        toast.warning("Reprocessering feilet", { description: data?.error });
      }
      queryClient.invalidateQueries({ queryKey: ["dead-letters"] });
      queryClient.invalidateQueries({ queryKey: ["email-send-monitor"] });
    } catch (err: any) {
      toast.error("Reprocessering feilet", { description: err.message });
    } finally {
      setReprocessingId(null);
    }
  };

  const ignoreDeadLetter = async (id: string) => {
    const { error } = await supabase
      .from("conversation_email_dead_letters")
      .update({ status: "ignored", updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toast.error("Kunne ikke ignorere");
    } else {
      toast.success("Markert som ignorert");
      queryClient.invalidateQueries({ queryKey: ["dead-letters"] });
    }
  };

  const sendTestEmail = async () => {
    if (!testEmail.trim()) return;
    setTestSending(true);
    setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("conversation-email-send", {
        body: { test_mode: true, test_recipient: testEmail.trim() },
      });
      if (error) throw error;
      setTestResult(data);
      if (data?.success && data?.verified) {
        toast.success("Testmail sendt og verifisert i Sendte elementer!");
      } else if (data?.success) {
        toast.warning("Testmail akseptert av Graph, men IKKE funnet i Sendte elementer");
      } else {
        toast.error("Testmail feilet");
      }
    } catch (err: any) {
      setTestResult({ success: false, error: err.message });
      toast.error("Feil ved sending");
    } finally {
      setTestSending(false);
    }
  };

  const handleResend = async (log: any) => {
    setResendingId(log.id);
    try {
      const result = await triggerConversationEmailSend(
        log.thread_id,
        "resend",
        { post_id: log.post_id, recipient_email: log.to_emails?.[0] }
      );
      if (result.sent) {
        toast.success("E-post sendt på nytt");
      } else {
        toast.error(result.error || "Sending feilet");
      }
      refetchLogs();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setResendingId(null);
    }
  };

  const healthIcon = (health: string) => {
    switch (health) {
      case "healthy": return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
      case "expiring_soon": return <Clock className="h-4 w-4 text-amber-500" />;
      case "error": return <AlertTriangle className="h-4 w-4 text-destructive" />;
      case "expired": return <XCircle className="h-4 w-4 text-destructive" />;
      case "disabled": return <ShieldOff className="h-4 w-4 text-muted-foreground" />;
      default: return <Info className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const healthLabel = (h: string) =>
    ({ healthy: "Aktiv", expiring_soon: "Utløper snart", error: "Feil", expired: "Utløpt", disabled: "Deaktivert" }[h] || h);

  const healthVariant = (h: string): "default" | "secondary" | "destructive" | "outline" => {
    if (h === "healthy") return "default";
    if (h === "expiring_soon") return "secondary";
    if (h === "error" || h === "expired") return "destructive";
    return "outline";
  };

  const dlStatusVariant = (s: string): "default" | "secondary" | "destructive" | "outline" => {
    if (s === "pending") return "secondary";
    if (s === "failed") return "destructive";
    if (s === "reprocessed") return "default";
    return "outline";
  };

  const emailStatusVariant = (s: string): "default" | "secondary" | "destructive" | "outline" => {
    if (s === "sent") return "default";
    if (s === "attempted") return "secondary";
    if (s === "failed") return "destructive";
    if (s === "skipped") return "outline";
    return "outline";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Microsoft Graph – Webhooks & E-post</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Administrer Graph-subscriptions og overvåk all e-postutsending med leveringsbevis.
        </p>
      </div>

      <HubCalendarDiagnosticsCard />
      <HubCalendarWritePilotCard />
      <JobOutlookPilotScopeCard />

      {/* Health summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground">Aktive subscriptions</div>
            <div className="text-2xl font-semibold">{activeSubCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground">Siste sendt</div>
            <div className="text-sm font-medium">
              {lastSent ? format(new Date(lastSent.created_at), "d. MMM HH:mm", { locale: nb }) : "—"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground">Verifisert</div>
            <div className="text-2xl font-semibold text-emerald-600">{verifiedCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground">Feilede</div>
            <div className={`text-2xl font-semibold ${failedEmails > 0 ? "text-destructive" : ""}`}>{failedEmails}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground">Dead letters</div>
            <div className={`text-2xl font-semibold ${pendingDL > 0 ? "text-amber-600" : ""}`}>{pendingDL}</div>
          </CardContent>
        </Card>
      </div>

      {/* Send testmail */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Send className="h-4 w-4" />
            Send testmail
          </CardTitle>
          <CardDescription>
            Verifiser at Graph-integrasjonen kan sende e-post fra <code className="text-xs bg-muted px-1 rounded">postkontoret@mcsservice.no</code> og at den dukker opp i Sendte elementer.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="mottaker@example.com"
              value={testEmail}
              onChange={e => setTestEmail(e.target.value)}
              className="h-9 text-sm"
              onKeyDown={e => { if (e.key === "Enter") sendTestEmail(); }}
            />
            <Button size="sm" onClick={sendTestEmail} disabled={!testEmail.trim() || testSending} className="gap-1.5 shrink-0">
              {testSending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Send
            </Button>
          </div>
          {testResult && (
            <div className={`rounded-lg border p-3 text-sm ${
              testResult.success && testResult.verified
                ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800"
                : testResult.success
                  ? "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800"
                  : "bg-destructive/5 border-destructive/20"
            }`}>
              {testResult.success && testResult.verified ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    <p className="font-medium text-emerald-700 dark:text-emerald-300">
                      Testmail sendt og verifisert ✓
                    </p>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p><strong>Mailbox:</strong> {testResult.mailbox}</p>
                    {testResult.internetMessageId && (
                      <p className="font-mono text-[10px] break-all"><strong>Internet-Message-Id:</strong> {testResult.internetMessageId}</p>
                    )}
                    {testResult.webLink && (
                      <a href={testResult.webLink} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline">
                        <ExternalLink className="h-3 w-3" /> Åpne i Outlook
                      </a>
                    )}
                  </div>
                </div>
              ) : testResult.success ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <p className="font-medium text-amber-700 dark:text-amber-300">
                      Graph aksepterte meldingen, men den ble IKKE funnet i Sendte elementer
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Dette kan bety at appen mangler <code>Mail.ReadWrite</code> permission, eller at Exchange har en transport rule som blokkerer.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                    <div>
                      <p className="font-medium text-destructive">Sending feilet{testResult.status_code ? ` (HTTP ${testResult.status_code})` : ""}</p>
                      <p className="text-xs text-destructive/80 mt-0.5 break-all">{testResult.error}</p>
                    </div>
                  </div>
                  {testResult.status_code === 403 && (
                    <div className="rounded-md border border-destructive/20 bg-destructive/5 p-3 space-y-2">
                      <p className="text-xs font-semibold text-destructive">⚠️ Mangler Mail.Send (Application) permission</p>
                      <ol className="text-xs text-destructive/80 space-y-1 list-decimal list-inside">
                        <li>Gå til <strong>Azure Portal → App registrations → Din app</strong></li>
                        <li>Klikk <strong>API permissions → Add a permission → Microsoft Graph → Application permissions</strong></li>
                        <li>Søk etter <code className="bg-muted px-1 rounded">Mail.Send</code> og legg den til</li>
                        <li>Klikk <strong>"Grant admin consent for [tenant]"</strong></li>
                        <li>Vent 1-2 minutter, og test på nytt</li>
                      </ol>
                      <p className="text-[10px] text-muted-foreground mt-1">Behold også <code>Mail.ReadWrite</code> (Application) for Sent Items-verifisering.</p>
                    </div>
                  )}
                  {testResult.status_code === 401 && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3">
                      <p className="text-xs text-amber-700 dark:text-amber-300">Token er ugyldig eller utløpt. Sjekk at <code>AZURE_CLIENT_SECRET</code> ikke er utløpt i Azure Portal.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          <div className="text-xs text-muted-foreground space-y-1 border-t pt-2 mt-2">
            <p><strong>Endepunkt:</strong> <code>POST /users/postkontoret@mcsservice.no/sendMail</code></p>
            <p><strong>Nødvendige permissions:</strong> <code>Mail.Send</code> + <code>Mail.ReadWrite</code> (for Sent Items-verifisering)</p>
          </div>
        </CardContent>
      </Card>

      {/* ═══ EMAIL SEND MONITOR ═══ */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4" />
              E-post sendingslogg
            </CardTitle>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => refetchLogs()}>
              <RefreshCw className="h-3 w-3 mr-1" /> Oppdater
            </Button>
          </div>
          <CardDescription>Siste 50 utgående e-postforsøk med leveringsbevis</CardDescription>
          <div className="flex gap-1.5 flex-wrap pt-2">
            {(["all", "invite", "participant_added", "new_post", "resend"] as EmailFilter[]).map(f => (
              <Button
                key={f}
                variant={emailFilter === f ? "default" : "outline"}
                size="sm"
                className="h-6 text-[10px] px-2"
                onClick={() => setEmailFilter(f)}
              >
                {f === "all" ? "Alle" : f === "invite" ? "Invitasjon" : f === "participant_added" ? "Velkommen" : f === "new_post" ? "Nytt innlegg" : "Resend"}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {(() => {
            const filtered = emailFilter === "all"
              ? (emailLogs || [])
              : (emailLogs || []).filter((l: any) => l.processing_status === emailFilter);
            if (filtered.length === 0) {
              return <p className="text-sm text-muted-foreground">Ingen e-postforsøk {emailFilter !== "all" ? `av type "${emailFilter}" ` : ""}registrert.</p>;
            }
            return (
            <div className="space-y-2">
              {filtered.map((log: any) => (
                <div key={log.id} className="rounded-lg border p-3 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={emailStatusVariant(log.status)} className="text-[10px]">
                      {log.status}
                    </Badge>
                    {log.verified && (
                      <Badge variant="default" className="text-[10px] bg-emerald-600 hover:bg-emerald-700 gap-0.5">
                        <ShieldCheck className="h-2.5 w-2.5" />
                        Verified
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-[10px]">
                      {log.processing_status || log.direction}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">
                      {format(new Date(log.created_at), "d. MMM HH:mm:ss", { locale: nb })}
                    </span>
                    {log.processing_duration_ms != null && (
                      <span className="text-[10px] text-muted-foreground">{log.processing_duration_ms}ms</span>
                    )}
                    <span className="flex-1" />
                    {log.outlook_weblink && (
                      <a href={log.outlook_weblink} target="_blank" rel="noopener noreferrer">
                        <Button variant="outline" size="sm" className="h-6 text-[10px] px-2 gap-1">
                          <ExternalLink className="h-2.5 w-2.5" />
                          Åpne sendt
                        </Button>
                      </a>
                    )}
                    {(log.status === "failed" || log.status === "attempted") && log.thread_id && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-[10px] px-2"
                        disabled={resendingId === log.id}
                        onClick={() => handleResend(log)}
                      >
                        <RotateCw className="h-2.5 w-2.5 mr-1" />
                        {resendingId === log.id ? "Sender…" : "Resend"}
                      </Button>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    {log.subject && <div className="truncate"><strong>Emne:</strong> {log.subject}</div>}
                    <div><strong>Fra:</strong> {log.from_email || "—"}</div>
                    <div><strong>Til:</strong> {(log.to_emails || []).join(", ") || "—"}</div>
                    {log.outlook_internet_message_id && (
                      <div className="font-mono text-[10px] truncate"><strong>Message-ID:</strong> {log.outlook_internet_message_id}</div>
                    )}
                    {log.thread_id && <div className="font-mono text-[10px]">Thread: {log.thread_id.slice(0, 12)}…</div>}
                  </div>
                  {log.error && (
                    <p className="text-xs text-destructive line-clamp-2 mt-1">{log.error}</p>
                  )}
                </div>
              ))}
            </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* Troubleshooting help */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <HelpCircle className="h-4 w-4" />
            Feilsøking: E-post sendt men ikke mottatt?
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm space-y-2">
            <p className="text-muted-foreground">
              Hvis loggen viser <Badge variant="default" className="text-[10px] bg-emerald-600 mx-1"><ShieldCheck className="h-2.5 w-2.5 mr-0.5" />Verified</Badge> 
              men mottaker ikke har fått e-posten, sjekk følgende:
            </p>
            <div className="grid gap-2">
              <div className="rounded-md border p-3">
                <p className="text-xs font-medium">1. Message Trace i Microsoft 365 Admin Center</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Gå til <code className="bg-muted px-1 rounded">admin.microsoft.com → Exchange → Mail flow → Message trace</code>. 
                  Søk på avsender <code className="bg-muted px-1 rounded">postkontoret@mcsservice.no</code> for å se leveringsstatus.
                </p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs font-medium">2. Quarantine</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Sjekk <code className="bg-muted px-1 rounded">security.microsoft.com → Email & collaboration → Review → Quarantine</code> 
                  for å se om meldingen ble satt i karantene av Exchange Online Protection.
                </p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs font-medium">3. Transport Rules</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Sjekk <code className="bg-muted px-1 rounded">Exchange Admin → Mail flow → Rules</code> for transport rules 
                  som kan blokkere ekstern e-post fra shared mailboxes.
                </p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs font-medium">4. Mottakers spamfilter</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Be mottaker sjekke Spam/Junk-mappen i sin e-postklient (Gmail, Outlook, etc.).
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Webhook-handlinger</CardTitle>
          <CardDescription>Administrer webhook-subscription for dette selskapet</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button size="sm" variant="default" onClick={() => runAction("sync")} disabled={!!actionLoading}>
            <Activity className="mr-1.5 h-3.5 w-3.5" />
            {actionLoading === "sync" ? "Synkroniserer…" : "Synk Postkontoret"}
          </Button>
          <Button size="sm" onClick={() => runAction("ensure")} disabled={!!actionLoading}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            {actionLoading === "ensure" ? "Oppretter…" : "Aktiver / Ensure"}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => runAction("renew")} disabled={!!actionLoading}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            {actionLoading === "renew" ? "Fornyer…" : "Forny nå"}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => runAction("recreate")} disabled={!!actionLoading}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            {actionLoading === "recreate" ? "Gjenskaper…" : "Recreate"}
          </Button>
          <Button size="sm" variant="destructive" onClick={() => runAction("disable")} disabled={!!actionLoading}>
            <ShieldOff className="mr-1.5 h-3.5 w-3.5" />
            {actionLoading === "disable" ? "Deaktiverer…" : "Deaktiver"}
          </Button>
        </CardContent>
      </Card>

      {/* Subscription list */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Subscriptions</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Laster…</p>
          ) : !subscriptions || subscriptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Ingen subscriptions funnet. Klikk «Aktiver» for å opprette en.
            </p>
          ) : (
            <div className="space-y-3">
              {subscriptions.map((sub: any) => (
                <div key={sub.id} className="flex items-start justify-between rounded-lg border p-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {healthIcon(sub.health)}
                      <Badge variant={healthVariant(sub.health)}>{healthLabel(sub.health)}</Badge>
                      <span className="text-xs text-muted-foreground font-mono">{sub.subscription_id?.slice(0, 12)}…</span>
                    </div>
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      {sub.mailbox_email && <div>Mailbox: <span className="font-medium">{sub.mailbox_email}</span></div>}
                      <div>Resource: {sub.resource}</div>
                      <div>Utløper: {format(new Date(sub.expiration_at), "d. MMM yyyy HH:mm", { locale: nb })}</div>
                      {sub.last_renewed_at && (
                        <div>Sist fornyet: {format(new Date(sub.last_renewed_at), "d. MMM yyyy HH:mm", { locale: nb })}</div>
                      )}
                      {sub.last_checked_at && (
                        <div>Sist sjekket: {format(new Date(sub.last_checked_at), "d. MMM yyyy HH:mm", { locale: nb })}</div>
                      )}
                      {sub.last_error && <div className="text-destructive mt-1">{sub.last_error}</div>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dead letters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Inbox className="h-4 w-4" />
            Dead Letters
          </CardTitle>
          <CardDescription>Meldinger som feilet under webhook-prosessering</CardDescription>
        </CardHeader>
        <CardContent>
          {!deadLetters || deadLetters.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ingen dead letters.</p>
          ) : (
            <div className="space-y-2">
              {deadLetters.map((dl: any) => (
                <div key={dl.id} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant={dlStatusVariant(dl.status)}>{dl.status}</Badge>
                      <span className="text-xs text-muted-foreground">Forsøk: {dl.attempt_count}</span>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(dl.created_at), "d. MMM HH:mm", { locale: nb })}
                      </span>
                    </div>
                    {(dl.status === "pending" || dl.status === "failed") && (
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={reprocessingId === dl.id} onClick={() => reprocessDeadLetter(dl.id)}>
                          <RotateCw className="mr-1 h-3 w-3" />
                          {reprocessingId === dl.id ? "Prosesserer…" : "Reprocess"}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => ignoreDeadLetter(dl.id)}>
                          <Ban className="mr-1 h-3 w-3" />
                          Ignorer
                        </Button>
                      </div>
                    )}
                  </div>
                  {dl.error && <p className="text-xs text-destructive line-clamp-2">{dl.error}</p>}
                  {dl.internet_message_id && (
                    <p className="text-xs text-muted-foreground font-mono truncate">{dl.internet_message_id}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
