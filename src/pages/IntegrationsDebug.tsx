import { useState, useCallback, useEffect } from "react";
import { MailboxConfig } from "@/components/admin/MailboxConfig";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithSession } from "@/lib/invoke-session";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  CheckCircle2,
  XCircle,
  RefreshCw,
  Copy,
  ExternalLink,
  Loader2,
  AlertTriangle,
  Plug,
  CalendarCheck,
  Zap,
} from "lucide-react";

const AZURE_CLIENT_ID = "f5605c08-b986-4626-9dec-e1446fd13702";
const AZURE_TENANT_ID = "e1b96c2a-c273-40b9-bb46-a2a7b570e133";
const EXPECTED_SCOPES = "openid profile email User.Read Calendars.ReadWrite User.Read.All Mail.ReadWrite offline_access";

type TestResult = { status: number; ok: boolean; error?: string; data?: string };

export default function IntegrationsDebug() {
  const { session, isAdmin } = useAuth();
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [tests, setTests] = useState<Record<string, TestResult> | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [justConnected, setJustConnected] = useState(false);
  const [syncingJobs, setSyncingJobs] = useState(false);
  const [failedJobCount, setFailedJobCount] = useState(0);

  const redirectUri = `${window.location.origin}/auth/callback`;

  const addLog = useCallback((msg: string) => {
    const ts = new Date().toISOString().slice(11, 23);
    setLogs((prev) => [`[${ts}] ${msg}`, ...prev].slice(0, 50));
  }, []);

  // Auto-fetch status on load
  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    setLoading(true);
    addLog("Henter Microsoft 365-status...");
    try {
      const { data, error } = await supabase.functions.invoke("ms-debug", {
        body: { action: "status" },
      });
      if (error) throw error;
      setStatus(data);
      if (data.logs) data.logs.forEach((l: string) => addLog(l));
      addLog(`Status hentet. Tilkoblet: ${data.ms_connected}`);

      // If connected, check for failed jobs to offer resync
      if (data.ms_connected) {
        const { data: failedLinks } = await supabase
          .from("job_calendar_links")
          .select("id")
          .eq("user_id", session?.user?.id || "")
          .eq("sync_status", "failed")
          .limit(20);
        const count = failedLinks?.length || 0;
        setFailedJobCount(count);
        if (count > 0) setJustConnected(true);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog(`FEIL: ${msg}`);
      toast.error("Kunne ikke hente status");
    } finally {
      setLoading(false);
    }
  };

  const runTests = async () => {
    setTesting(true);
    addLog("Kjører Graph API-tester...");
    try {
      const { data, error } = await supabase.functions.invoke("ms-debug", {
        body: { action: "test" },
      });
      if (error) throw error;
      setTests(data.tests || {});
      if (data.logs) data.logs.forEach((l: string) => addLog(l));
      if (data.ms_reauth) {
        addLog("⚠️ Re-autentisering påkrevd.");
        toast.warning("Microsoft-tilkobling må fornyes");
      } else {
        addLog("Tester fullført.");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog(`FEIL: ${msg}`);
      toast.error("Test feilet");
    } finally {
      setTesting(false);
    }
  };

  const handleConnect = () => {
    addLog("Starter Microsoft 365 OAuth-flyt...");
    const scope = encodeURIComponent(EXPECTED_SCOPES);
    const authUrl =
      `https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/authorize` +
      `?client_id=${AZURE_CLIENT_ID}` +
      `&response_type=code` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${scope}` +
      `&response_mode=query` +
      `&prompt=consent`;
    window.location.href = authUrl;
  };

  const handleSyncFailedJobs = async () => {
    setSyncingJobs(true);
    try {
      // Get failed links for this user
      const { data: failedLinks } = await supabase
        .from("job_calendar_links")
        .select("job_id")
        .eq("user_id", session?.user?.id || "")
        .eq("sync_status", "failed")
        .limit(20);

      const jobIds = [...new Set((failedLinks || []).map(l => l.job_id))];
      let successCount = 0;

      for (const jobId of jobIds) {
        try {
          const { error } = await supabase.functions.invoke("ms-calendar", {
            body: { action: "repair_sync", job_id: jobId },
          });
          if (!error) successCount++;
        } catch { /* continue */ }
      }

      toast.success(`${successCount} jobb(er) klargjort for ny synk`);
      setJustConnected(false);
      setFailedJobCount(0);

      // Notify admin
      // (Best effort – insert notification for admins if possible)
      addLog(`Synket ${successCount}/${jobIds.length} jobber`);
    } catch (e: any) {
      toast.error("Feil ved synk av jobber", { description: e.message });
    } finally {
      setSyncingJobs(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Kopiert til utklippstavle");
  };

  const isConnected = status?.ms_connected === true;

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Integrasjoner</h1>
        <p className="text-sm text-muted-foreground">
          Microsoft 365 – {isAdmin ? "Status og feilsøking" : "Tilkoblingsstatus"}
        </p>
      </div>

      {/* Postkontor mailbox config (admin only) */}
      {isAdmin && <MailboxConfig />}

      {/* Post-connect assist banner */}
      {justConnected && failedJobCount > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <Zap className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <div className="flex-1 space-y-2">
                <p className="text-sm font-medium text-foreground">
                  Microsoft er tilkoblet! {failedJobCount} jobb(er) venter på synk.
                </p>
                <p className="text-xs text-muted-foreground">
                  Du har tildelte jobber som ikke ble synket til Outlook. Vil du synke dem nå?
                </p>
                <Button size="sm" onClick={handleSyncFailedJobs} disabled={syncingJobs} className="gap-1.5">
                  {syncingJobs ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarCheck className="h-3.5 w-3.5" />}
                  Synk mine tildelte jobber nå
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Connection status (shown to everyone) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tilkoblingsstatus</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <StatusRow
            label="Innlogget bruker"
            value={session?.user?.email || "Ikke innlogget"}
          />
          <Separator />
          <StatusRow
            label="Microsoft-tilkobling"
            value={status ? (isConnected ? "Tilkoblet" : "Ikke tilkoblet") : loading ? "Sjekker..." : "Ukjent"}
            badge={isConnected ? "success" : status ? "error" : "neutral"}
          />
          <StatusRow
            label="Token-status"
            value={status ? (status.ms_expired === false ? "Gyldig" : status.ms_expired === true ? "Utløpt" : "Ukjent") : "Ukjent"}
            badge={status?.ms_expired === false ? "success" : status?.ms_expired === true ? "error" : "neutral"}
          />
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <Button onClick={handleConnect} className="gap-2">
          <Plug className="h-4 w-4" />
          {isConnected ? "Koble til på nytt" : "Koble til Microsoft 365"}
        </Button>
        <Button variant="outline" onClick={fetchStatus} disabled={loading} className="gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Oppdater status
        </Button>
        {isAdmin && (
          <Button variant="outline" onClick={runTests} disabled={testing} className="gap-2">
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
            Test Graph API
          </Button>
        )}
      </div>

      {/* Admin-only sections */}
      {isAdmin && (
        <>
          {/* Redirect URI Warning */}
          <Card className="border-status-requested/30 bg-status-requested/5">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-[hsl(var(--status-requested))] mt-0.5 shrink-0" />
                <div className="space-y-2 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    Redirect URI for Entra App Registration
                  </p>
                  <div className="flex items-center gap-2 bg-muted rounded-md px-3 py-2">
                    <code className="text-xs text-foreground flex-1 break-all">{redirectUri}</code>
                    <Button variant="ghost" size="sm" className="shrink-0" onClick={() => copyToClipboard(redirectUri)}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Detailed Status Panel */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Detaljert status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <StatusRow
                label="Refresh token"
                value={status ? (status.ms_refresh_available ? "Finnes" : "Mangler") : "Ukjent"}
                badge={status?.ms_refresh_available ? "success" : status ? "warning" : "neutral"}
              />
              <StatusRow
                label="Token utløper"
                value={status?.ms_expires_at ? String(status.ms_expires_at) : "N/A"}
                badge={status?.ms_expired === false ? "success" : status?.ms_expired === true ? "error" : "neutral"}
              />
              <Separator />
              <StatusRow label="Forventede scopes" value={EXPECTED_SCOPES} mono />
              <StatusRow label="Redirect URI" value={redirectUri} mono />
              <StatusRow label="Tenant ID" value={status?.tenant_id ? String(status.tenant_id) : AZURE_TENANT_ID} mono />
            </CardContent>
          </Card>

          {/* Test Results */}
          {tests && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Graph API-tester</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {Object.entries(tests).map(([endpoint, result]) => (
                  <div key={endpoint} className="flex items-start gap-3 p-3 rounded-md bg-muted/50">
                    {result.ok ? (
                      <CheckCircle2 className="h-5 w-5 text-[hsl(var(--status-approved))] mt-0.5 shrink-0" />
                    ) : (
                      <XCircle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{endpoint}</span>
                        <Badge variant={result.ok ? "default" : "destructive"} className="text-xs">
                          {result.status}
                        </Badge>
                      </div>
                      {result.data && <p className="text-xs text-muted-foreground mt-1">{result.data}</p>}
                      {result.error && <p className="text-xs text-destructive mt-1 break-all">{result.error}</p>}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Orphan Cleanup */}
          <OrphanCleanup addLog={addLog} />

          {/* Test Availability */}
          <AvailabilityTester addLog={addLog} />

          {/* Debug Log */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Debug-logg (siste 50)</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-64 rounded-md border bg-muted/30 p-3">
                {logs.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">
                    Ingen logger ennå. Trykk "Oppdater status" for å starte.
                  </p>
                ) : (
                  <div className="space-y-1">
                    {logs.map((line, i) => (
                      <p key={i} className="text-xs font-mono text-foreground whitespace-pre-wrap">
                        {line}
                      </p>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function AvailabilityTester({ addLog }: { addLog: (msg: string) => void }) {
  const [testDate, setTestDate] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [testStart, setTestStart] = useState("08:00");
  const [testEnd, setTestEnd] = useState("16:00");
  const [testing, setTesting] = useState(false);
  const [results, setResults] = useState<any[] | null>(null);

  const runTest = async () => {
    setTesting(true);
    setResults(null);
    addLog("Testing availability for all technicians...");
    try {
      const { data: techs } = await supabase.from("technicians").select("user_id");
      const userIds = (techs || []).map((t: any) => t.user_id).filter(Boolean);

      if (!userIds.length) {
        addLog("No technicians found");
        toast.error("Ingen teknikere funnet");
        setTesting(false);
        return;
      }

      const start = `${testDate}T${testStart}:00`;
      const end = `${testDate}T${testEnd}:00`;

      const { data, error } = await invokeWithSession("ms-calendar", {
        body: { action: "availability", user_ids: userIds, start, end },
      });

      if (error) throw error;
      setResults(data.results || []);
      if (data.logs) data.logs.forEach((l: string) => addLog(l));
      const busyCount = (data.results || []).filter((r: any) => r.busy).length;
      addLog(`Availability: ${busyCount}/${data.results?.length || 0} opptatt`);
      toast.success("Tilgjengelighetssjekk fullført");
    } catch (e: any) {
      addLog(`FEIL: ${e.message}`);
      toast.error("Test feilet", { description: e.message });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarCheck className="h-4 w-4" />
          Test tilgjengelighet
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <Label className="text-xs">Dato</Label>
            <Input type="date" value={testDate} onChange={(e) => setTestDate(e.target.value)} className="w-40 mt-1" />
          </div>
          <div>
            <Label className="text-xs">Fra</Label>
            <Input type="time" value={testStart} onChange={(e) => setTestStart(e.target.value)} className="w-28 mt-1" />
          </div>
          <div>
            <Label className="text-xs">Til</Label>
            <Input type="time" value={testEnd} onChange={(e) => setTestEnd(e.target.value)} className="w-28 mt-1" />
          </div>
          <Button onClick={runTest} disabled={testing} size="sm" className="gap-1.5">
            {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarCheck className="h-3.5 w-3.5" />}
            Test
          </Button>
        </div>

        {results && (
          <div className="space-y-2">
            {results.map((r: any, i: number) => (
              <div
                key={i}
                className={`flex items-center justify-between rounded-md border p-2.5 ${
                  r.busy ? "border-destructive/30 bg-destructive/5" : "border-[hsl(var(--status-approved))]/30 bg-[hsl(var(--status-approved))]/5"
                }`}
              >
                <div className="flex items-center gap-2">
                  {r.busy ? (
                    <XCircle className="h-4 w-4 text-destructive" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-[hsl(var(--status-approved))]" />
                  )}
                  <span className="text-sm font-medium">{r.name}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {r.busy ? `${r.busy_slots?.length || 0} konflikt(er)` : "Ledig"}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function OrphanCleanup({ addLog }: { addLog: (msg: string) => void }) {
  const [scanning, setScanning] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [orphanCount, setOrphanCount] = useState<number | null>(null);
  const [orphanIds, setOrphanIds] = useState<string[]>([]);

  const scan = async () => {
    setScanning(true);
    addLog("Skanner etter foreldreløse events uten event_technicians...");
    try {
      // Find events that have NO rows in event_technicians
      const { data: allEvents } = await supabase
        .from("events")
        .select("id, title, status, created_at")
        .is("deleted_at", null);

      if (!allEvents?.length) {
        setOrphanCount(0);
        setOrphanIds([]);
        addLog("Ingen events funnet.");
        return;
      }

      const { data: linkedEvents } = await supabase
        .from("event_technicians")
        .select("event_id");

      const linkedSet = new Set((linkedEvents || []).map((e: any) => e.event_id));
      const orphans = allEvents.filter((e: any) => !linkedSet.has(e.id));

      setOrphanCount(orphans.length);
      setOrphanIds(orphans.map((e: any) => e.id));
      addLog(`Fant ${orphans.length} foreldreløse events av ${allEvents.length} totalt`);

      for (const o of orphans.slice(0, 5)) {
        addLog(`  → ${o.id.slice(0, 8)}... "${o.title}" (${o.status})`);
      }
      if (orphans.length > 5) addLog(`  ... og ${orphans.length - 5} til`);
    } catch (e: any) {
      addLog(`FEIL: ${e.message}`);
    } finally {
      setScanning(false);
    }
  };

  const cleanup = async () => {
    if (!orphanIds.length) return;
    setCleaning(true);
    addLog(`Sletter ${orphanIds.length} foreldreløse events...`);
    try {
      let deleted = 0;
      // Batch delete in chunks of 20
      for (let i = 0; i < orphanIds.length; i += 20) {
        const chunk = orphanIds.slice(i, i + 20);
        const { error } = await supabase
          .from("events")
          .update({ deleted_at: new Date().toISOString(), delete_reason: "orphan_cleanup" })
          .in("id", chunk);
        if (!error) deleted += chunk.length;
      }
      addLog(`Soft-slettet ${deleted} foreldreløse events`);
      toast.success(`${deleted} foreldreløse events ryddet opp`);
      setOrphanCount(0);
      setOrphanIds([]);
    } catch (e: any) {
      addLog(`FEIL: ${e.message}`);
      toast.error("Opprydding feilet");
    } finally {
      setCleaning(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          Rydd opp eksterne blokker
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Finner og soft-sletter events uten montørkobling (event_technicians). Disse vises som feilaktige blokker i ressursplanen.
        </p>
        <div className="flex items-center gap-3">
          <Button onClick={scan} disabled={scanning} size="sm" variant="outline" className="gap-1.5">
            {scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Skann
          </Button>
          {orphanCount !== null && orphanCount > 0 && (
            <Button onClick={cleanup} disabled={cleaning} size="sm" variant="destructive" className="gap-1.5">
              {cleaning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <AlertTriangle className="h-3.5 w-3.5" />}
              Slett {orphanCount} foreldreløse
            </Button>
          )}
          {orphanCount !== null && (
            <Badge variant={orphanCount > 0 ? "destructive" : "default"}>
              {orphanCount} foreldreløse
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function StatusRow({
  label,
  value,
  sublabel,
  badge,
  mono,
}: {
  label: string;
  value: string;
  sublabel?: string;
  badge?: "success" | "error" | "warning" | "neutral";
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
      <span className="text-sm text-muted-foreground w-40 shrink-0">{label}</span>
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {badge && badge !== "neutral" && (
          <div
            className={`h-2 w-2 rounded-full shrink-0 ${
              badge === "success"
                ? "bg-[hsl(var(--status-approved))]"
                : badge === "error"
                ? "bg-destructive"
                : "bg-[hsl(var(--status-requested))]"
            }`}
          />
        )}
        <span className={`text-sm text-foreground ${mono ? "font-mono text-xs break-all" : ""}`}>
          {value}
        </span>
        {sublabel && (
          <span className="text-xs text-muted-foreground">({sublabel})</span>
        )}
      </div>
    </div>
  );
}
