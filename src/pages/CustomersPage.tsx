import { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useCustomerTags } from "@/hooks/useCustomerTags";
import { useCustomerValueLevels } from "@/hooks/useCustomerValueLevels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CustomerValueBadge } from "@/components/customer/CustomerValueBadge";
import {
  Plus, Search, ArrowUpDown, Loader2, ChevronLeft, ChevronRight,
  Users2, Upload,
} from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { SoftDeleteRowButton } from "@/components/shared/SoftDeleteRowButton";
import { CustomerDevelopment } from "@/components/customer/CustomerDevelopment";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface CustomerRow {
  id: string;
  name: string;
  org_number: string | null;
  billing_city: string | null;
  main_email: string | null;
  customer_value: string | null;
  projectCount: number;
  offerCount: number;
  lastActivity: string | null;
  tagIds: string[];
}

const PAGE_SIZE = 20;

export default function CustomersPage() {
  const navigate = useNavigate();
  const { activeCompanyId, allowedCompanyIds } = useCompanyContext();
  const { tags } = useCustomerTags();
  const { levels, getLevelByCode } = useCustomerValueLevels();
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<"name" | "city" | "projects" | "value">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);
  const [filterTag, setFilterTag] = useState<string>("__all__");
  const [filterValue, setFilterValue] = useState<string>("__all__");
  const [view, setView] = useState("register");

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("customers")
      .select("id, name, org_number, billing_city, main_email, customer_value, created_at")
      .order("name", { ascending: true });

    if (activeCompanyId) {
      query = query.eq("company_id", activeCompanyId);
    } else if (allowedCompanyIds.length > 0) {
      query = query.in("company_id", allowedCompanyIds);
    }

    const { data } = await query;

    if (data) {
      // Get project counts
      let projectQuery = supabase
        .from("events")
        .select("customer_id")
        .not("customer_id", "is", null)
        .is("deleted_at", null);
      if (activeCompanyId) projectQuery = projectQuery.eq("company_id", activeCompanyId);
      else if (allowedCompanyIds.length > 0) projectQuery = projectQuery.in("company_id", allowedCompanyIds);
      const { data: projectCounts } = await projectQuery;

      const countMap = new Map<string, number>();
      if (projectCounts) {
        for (const p of projectCounts) {
          const cid = (p as any).customer_id;
          if (cid) countMap.set(cid, (countMap.get(cid) || 0) + 1);
        }
      }

      // Get tag relations
      const { data: tagRels } = await supabase
        .from("customer_tag_relations")
        .select("customer_id, tag_id");
      const tagMap = new Map<string, string[]>();
      if (tagRels) {
        for (const r of tagRels as any[]) {
          const existing = tagMap.get(r.customer_id) || [];
          existing.push(r.tag_id);
          tagMap.set(r.customer_id, existing);
        }
      }

      // Get last activity (latest event start_time per customer)
      let activityQuery = supabase
        .from("events")
        .select("customer_id, start_time")
        .not("customer_id", "is", null)
        .is("deleted_at", null)
        .order("start_time", { ascending: false });
      if (activeCompanyId) activityQuery = activityQuery.eq("company_id", activeCompanyId);
      else if (allowedCompanyIds.length > 0) activityQuery = activityQuery.in("company_id", allowedCompanyIds);
      const { data: activities } = await activityQuery;

      const activityMap = new Map<string, string>();
      if (activities) {
        for (const a of activities as any[]) {
          if (a.customer_id && !activityMap.has(a.customer_id)) {
            activityMap.set(a.customer_id, a.start_time);
          }
        }
      }

      setCustomers(
        data.map((c: any) => ({
          id: c.id,
          name: c.name,
          org_number: c.org_number,
          billing_city: c.billing_city,
          main_email: c.main_email,
          customer_value: c.customer_value,
          projectCount: countMap.get(c.id) || 0,
          offerCount: 0,
          lastActivity: activityMap.get(c.id) || null,
          tagIds: tagMap.get(c.id) || [],
        }))
      );
    }
    setLoading(false);
  }, [activeCompanyId]);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  const filtered = useMemo(() => {
    let result = [...customers];
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.org_number || "").toLowerCase().includes(q) ||
          (c.billing_city || "").toLowerCase().includes(q) ||
          (c.main_email || "").toLowerCase().includes(q)
      );
    }
    if (filterTag !== "__all__") {
      result = result.filter((c) => c.tagIds.includes(filterTag));
    }
    if (filterValue !== "__all__") {
      result = result.filter((c) => c.customer_value === filterValue);
    }
    const valueSortOrder = new Map(levels.map((l) => [l.code, l.sort_order]));
    result.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortField === "name") return dir * a.name.localeCompare(b.name);
      if (sortField === "city") return dir * (a.billing_city || "").localeCompare(b.billing_city || "");
      if (sortField === "value") return dir * ((valueSortOrder.get(a.customer_value || "") || 99) - (valueSortOrder.get(b.customer_value || "") || 99));
      return dir * (a.projectCount - b.projectCount);
    });
    return result;
  }, [customers, search, sortField, sortDir, filterTag, filterValue, levels]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("asc"); }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5 max-w-[1920px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Users2 className="h-6 w-6 text-primary" />
            Kunder
          </h1>
          <p className="text-sm text-muted-foreground/70">{filtered.length} kunder totalt</p>
        </div>
        <div className="flex items-center gap-2 self-start">
          <Button variant="outline" onClick={() => navigate("/customers/import")} className="gap-1.5 rounded-xl">
            <Upload className="h-4 w-4" />
            Importer
          </Button>
          <Button onClick={() => navigate("/customers/new")} className="gap-1.5 rounded-xl">
            <Plus className="h-4 w-4" />
            Ny kunde
          </Button>
        </div>
      </div>

      <Tabs value={view} onValueChange={setView}><TabsList><TabsTrigger value="register">Kunderegister</TabsTrigger><TabsTrigger value="development">Kundeutvikling</TabsTrigger></TabsList></Tabs>
      {view === "development" ? <CustomerDevelopment /> : <>
      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Søk kunder..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="pl-9 rounded-xl"
          />
        </div>
        <Select value={filterValue} onValueChange={(v) => { setFilterValue(v); setPage(0); }}>
          <SelectTrigger className="w-36 rounded-xl h-10">
            <SelectValue placeholder="Kundeverdi" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Alle verdier</SelectItem>
            {levels.map((l) => (
              <SelectItem key={l.code} value={l.code}>
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: l.color }} />
                  {l.code} – {l.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {tags.length > 0 && (
          <Select value={filterTag} onValueChange={(v) => { setFilterTag(v); setPage(0); }}>
            <SelectTrigger className="w-36 rounded-xl h-10">
              <SelectValue placeholder="Tag" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Alle tags</SelectItem>
              {tags.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color }} />
                    {t.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : paged.length === 0 && !search && filterTag === "__all__" && filterValue === "__all__" ? (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
          <div className="rounded-2xl bg-primary/5 p-6">
            <Users2 className="h-12 w-12 text-primary/40" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Ingen kunder ennå</h2>
            <p className="text-sm text-muted-foreground mt-1">Opprett din første kunde for å komme i gang.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/customers/import")} className="gap-1.5 rounded-xl">
              <Upload className="h-4 w-4" /> Importer
            </Button>
            <Button onClick={() => navigate("/customers/new")} className="gap-1.5 rounded-xl">
              <Plus className="h-4 w-4" /> Opprett kunde
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-border/40 bg-card shadow-sm overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-border/30">
                  <TableHead>
                    <button onClick={() => toggleSort("name")} className="flex items-center gap-1 hover:text-foreground text-xs font-semibold uppercase tracking-wider">
                      Kundenavn <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead>
                    <button onClick={() => toggleSort("value")} className="flex items-center gap-1 hover:text-foreground text-xs font-semibold uppercase tracking-wider">
                      Verdi <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">Tags</TableHead>
                  <TableHead>
                    <button onClick={() => toggleSort("city")} className="flex items-center gap-1 hover:text-foreground text-xs font-semibold uppercase tracking-wider">
                      By <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead>
                    <button onClick={() => toggleSort("projects")} className="flex items-center gap-1 hover:text-foreground text-xs font-semibold uppercase tracking-wider">
                      Prosjekter <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">Sist aktiv</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-12">
                      Ingen kunder funnet.
                    </TableCell>
                  </TableRow>
                ) : (
                  paged.map((c) => {
                    const valueLevel = getLevelByCode(c.customer_value);
                    const customerTags = c.tagIds.map((tid) => tags.find((t) => t.id === tid)).filter(Boolean);
                    return (
                      <TableRow
                        key={c.id}
                        className="cursor-pointer hover:bg-secondary/40 transition-colors group"
                        onClick={() => navigate(`/customers/${c.id}`)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary text-xs font-bold shrink-0">
                              {c.name.charAt(0).toUpperCase()}
                            </div>
                            <span className="text-sm font-medium">{c.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <CustomerValueBadge level={valueLevel} />
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {customerTags.slice(0, 3).map((tag) => tag && (
                              <Badge
                                key={tag.id}
                                className="text-[9px] rounded-md px-1.5 py-0"
                                style={{ backgroundColor: tag.color + "20", color: tag.color, borderColor: tag.color + "40" }}
                              >
                                {tag.name}
                              </Badge>
                            ))}
                            {customerTags.length > 3 && (
                              <span className="text-[9px] text-muted-foreground">+{customerTags.length - 3}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{c.billing_city || "—"}</TableCell>
                        <TableCell>
                          {c.projectCount > 0 ? (
                            <Badge variant="secondary" className="text-xs rounded-lg">{c.projectCount}</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">0</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {c.lastActivity
                            ? new Date(c.lastActivity).toLocaleDateString("nb-NO", { day: "numeric", month: "short" })
                            : "—"}
                        </TableCell>
                        <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                            <SoftDeleteRowButton
                              table="customers"
                              id={c.id}
                              entityLabel="Kunde"
                              entityName={c.name}
                              onDeleted={() => setCustomers((prev) => prev.filter((x) => x.id !== c.id))}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Side {page + 1} av {totalPages}</p>
              <div className="flex gap-1">
                <Button variant="outline" size="icon" disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="rounded-xl">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)} className="rounded-xl">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
      </>}
    </div>
  );
}
