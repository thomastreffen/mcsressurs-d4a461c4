import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, Search, AlertTriangle, CheckCircle2, Database, Link2, Mail, BookOpen, ArrowRightLeft, Archive, Trash2, Globe, RefreshCw } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface ScanReport {
  orphan_regulation_queries: any[];
  orphan_comm_logs: any[];
  orphan_calendar_links: any[];
  resource_plan_findings: any[];
  totals: { regulation_queries: number; communication_logs: number; calendar_links: number; resource_plan: number; total: number };
}

type TabKey = "regulation" | "communication" | "calendar" | "resource_plan";

export default function DataIntegrityPage() {
  const [scanning, setScanning] = useState(false);
  const [marking, setMarking] = useState(false);
  const [report, setReport] = useState<ScanReport | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("regulation");
  const [showOrphansOnly, setShowOrphansOnly] = useState(false);
  const [repairing, setRepairing] = useState<string | null>(null);
  const [relinkDialog, setRelinkDialog] = useState<{ id: string; table: string } | null>(null);
  const [newScopeId, setNewScopeId] = useState("");

  const invoke = useCallback(async (body: any) => {
    const { data, error } = await supabase.functions.invoke("data-integrity", { body });
    if (error) throw new Error(error.message);
    return data;
  }, []);

  const runScan = async () => {
    setScanning(true);
    try {
      const data = await invoke({ action: "scan" });
      setReport(data);
      toast.success(`Skanning fullført – ${data.totals.total} foreldreløse funnet`);
    } catch (e: any) {
      toast.error("Skanning feilet: " + e.message);
    } finally {
      setScanning(false);
    }
  };

  const markAll = async () => {
    setMarking(true);
    try {
      const data = await invoke({ action: "mark_orphans" });
      toast.success(`${data.marked} poster markert som foreldreløse`);
      await runScan();
    } catch (e: any) {
      toast.error("Markering feilet: " + e.message);
    } finally {
      setMarking(false);
    }
  };

  const repairResourcePlan = async () => {
    setMarking(true);
    try {
      await invoke({ action: "repair_resource_plan" });
      toast.success("Ghost-bookinger er reparert; Outlook-retries beholdes til de er bekreftet slettet");
      await runScan();
    } catch (e: any) {
      toast.error("Reparasjon feilet: " + e.message);
    } finally {
      setMarking(false);
    }
  };

  const repair = async (table: string, record_id: string, repair_type: string, new_scope_id?: string) => {
    setRepairing(record_id);
    try {
      await invoke({ action: "repair", table, record_id, repair_type, new_scope_id });
      toast.success("Reparasjon utført");
      await runScan();
    } catch (e: any) {
      toast.error("Reparasjon feilet: " + e.message);
    } finally {
      setRepairing(null);
    }
  };

  const categories: { key: TabKey; label: string; icon: React.ReactNode; count: number }[] = [
    { key: "regulation", label: "Fagforespørsler", icon: <BookOpen className="h-5 w-5" />, count: report?.totals.regulation_queries ?? 0 },
    { key: "communication", label: "Kommunikasjonslogg", icon: <Mail className="h-5 w-5" />, count: report?.totals.communication_logs ?? 0 },
    { key: "calendar", label: "Kalenderkoblinger", icon: <Link2 className="h-5 w-5" />, count: report?.totals.calendar_links ?? 0 },
    { key: "resource_plan", label: "Ressursplan", icon: <Database className="h-5 w-5" />, count: report?.totals.resource_plan ?? 0 },
  ];

  const activeItems = activeTab === "regulation"
    ? report?.orphan_regulation_queries ?? []
    : activeTab === "communication"
      ? report?.orphan_comm_logs ?? []
      : activeTab === "calendar" ? report?.orphan_calendar_links ?? [] : report?.resource_plan_findings ?? [];

  const filteredItems = showOrphansOnly
    ? activeItems.filter((i: any) => i.is_orphan)
    : activeItems;

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dataintegritet</h1>
          <p className="text-muted-foreground text-sm">Finn og reparer foreldreløse poster i databasen</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={runScan} disabled={scanning}>
            {scanning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
            Skann
          </Button>
          <Button variant="outline" onClick={markAll} disabled={marking || !report || report.totals.total === 0}>
            {marking ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <AlertTriangle className="h-4 w-4 mr-2" />}
            Marker alle som orphan
          </Button>
          <Button variant="outline" onClick={repairResourcePlan} disabled={marking || !report || report.totals.resource_plan === 0}>
            <RefreshCw className="h-4 w-4 mr-2" /> Reparer ressursplan
          </Button>
        </div>
      </div>

      {/* Category cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        {categories.map((cat) => (
          <Card
            key={cat.key}
            className={`cursor-pointer transition-all hover:shadow-md ${activeTab === cat.key ? "ring-2 ring-primary" : ""}`}
            onClick={() => setActiveTab(cat.key)}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-muted-foreground">{cat.icon}<CardTitle className="text-sm font-medium">{cat.label}</CardTitle></div>
                {cat.count > 0 ? (
                  <Badge variant="destructive">{cat.count}</Badge>
                ) : report ? (
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                ) : null}
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{cat.count}</p>
              <p className="text-xs text-muted-foreground">foreldreløse poster</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter */}
      {report && (
        <div className="flex items-center gap-2">
          <Switch id="orphan-filter" checked={showOrphansOnly} onCheckedChange={setShowOrphansOnly} />
          <Label htmlFor="orphan-filter" className="text-sm">Vis kun allerede markerte</Label>
        </div>
      )}

      {/* Results table */}
      {report && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{categories.find(c => c.key === activeTab)?.label} – Funn</CardTitle>
            <CardDescription>{filteredItems.length} poster</CardDescription>
          </CardHeader>
          <CardContent>
            {filteredItems.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Database className="h-10 w-10 mx-auto mb-2 opacity-40" />
                <p>Ingen foreldreløse poster funnet i denne kategorien.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      {activeTab === "regulation" && <><TableHead>Spørsmål</TableHead><TableHead>Scope</TableHead></>}
                      {activeTab === "communication" && <><TableHead>Emne</TableHead><TableHead>Type</TableHead></>}
                      {activeTab === "calendar" && <><TableHead>Jobb-ID</TableHead><TableHead>Status</TableHead></>}
                      {activeTab === "resource_plan" && <><TableHead>Kategori</TableHead><TableHead>Oppgave</TableHead></>}
                      <TableHead>Årsak</TableHead>
                      <TableHead>Markert</TableHead>
                      <TableHead className="text-right">Handlinger</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredItems.map((item: any) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono text-xs">{item.id.slice(0, 8)}…</TableCell>
                        {activeTab === "regulation" && (
                          <>
                            <TableCell className="max-w-[200px] truncate">{item.question}</TableCell>
                            <TableCell><Badge variant="outline">{item.scope_type}</Badge></TableCell>
                          </>
                        )}
                        {activeTab === "communication" && (
                          <>
                            <TableCell className="max-w-[200px] truncate">{item.subject}</TableCell>
                            <TableCell><Badge variant="outline">{item.entity_type}</Badge></TableCell>
                          </>
                        )}
                        {activeTab === "calendar" && (
                          <>
                            <TableCell className="font-mono text-xs">{item.job_id?.slice(0, 8)}…</TableCell>
                            <TableCell><Badge variant="outline">{item.sync_status}</Badge></TableCell>
                          </>
                        )}
                        {activeTab === "resource_plan" && (
                          <><TableCell><Badge variant="outline">{item.category}</Badge></TableCell><TableCell className="font-mono text-xs">{item.event_id?.slice(0, 8) || "—"}…</TableCell></>
                        )}
                        <TableCell className="text-sm text-destructive">{item.orphan_reason || item.details?.last_error || "Ghost-booking"}</TableCell>
                        <TableCell>{activeTab === "resource_plan" || item.is_orphan ? <Badge variant="destructive" className="text-xs">Ja</Badge> : <span className="text-xs text-muted-foreground">Nei</span>}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end flex-wrap">
                            {activeTab === "regulation" && (
                              <>
                                <Button size="sm" variant="outline" disabled={repairing === item.id} onClick={() => repair("regulation_queries", item.id, "move_to_global")}>
                                  <Globe className="h-3 w-3 mr-1" />Global
                                </Button>
                                <Button size="sm" variant="outline" disabled={repairing === item.id} onClick={() => { setRelinkDialog({ id: item.id, table: "regulation_queries" }); setNewScopeId(""); }}>
                                  <ArrowRightLeft className="h-3 w-3 mr-1" />Knytt
                                </Button>
                              </>
                            )}
                            {activeTab === "communication" && (
                              <>
                                <Button size="sm" variant="outline" disabled={repairing === item.id} onClick={() => repair("communication_logs", item.id, "mark_archived")}>
                                  <Archive className="h-3 w-3 mr-1" />Arkiver
                                </Button>
                                <Button size="sm" variant="outline" disabled={repairing === item.id} onClick={() => { setRelinkDialog({ id: item.id, table: "communication_logs" }); setNewScopeId(""); }}>
                                  <ArrowRightLeft className="h-3 w-3 mr-1" />Knytt
                                </Button>
                              </>
                            )}
                            {activeTab === "calendar" && (
                              <>
                                <Button size="sm" variant="outline" disabled={repairing === item.id} onClick={() => repair("job_calendar_links", item.id, "unlink_and_fail")}>
                                  <AlertTriangle className="h-3 w-3 mr-1" />Feil
                                </Button>
                                <Button size="sm" variant="outline" disabled={repairing === item.id} onClick={() => repair("job_calendar_links", item.id, "delete_link")}>
                                  <Trash2 className="h-3 w-3 mr-1" />Arkiver
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Relink dialog */}
      <Dialog open={!!relinkDialog} onOpenChange={() => setRelinkDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Knytt til ny entitet</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">Lim inn ID-en til jobben, leadet eller kalkylen du vil koble denne posten til.</p>
            <Input placeholder="UUID for ny entitet" value={newScopeId} onChange={(e) => setNewScopeId(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRelinkDialog(null)}>Avbryt</Button>
            <Button disabled={!newScopeId || repairing === relinkDialog?.id} onClick={() => {
              if (relinkDialog) {
                repair(relinkDialog.table, relinkDialog.id, "relink", newScopeId);
                setRelinkDialog(null);
              }
            }}>
              Knytt på nytt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
