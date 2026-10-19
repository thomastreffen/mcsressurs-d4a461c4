import { useEffect, useState } from "react";
import { LocalExportMenu } from '@/components/LocalExportMenu';
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, FolderOpen, Users, Archive } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useCompanyContext } from "@/hooks/useCompanyContext";

interface TechRow {
  id: string;
  name: string;
  email: string;
  trade_certificate_type: string | null;
  is_plannable_in_company: boolean;
  archived_at: string | null;
}

export default function EmployeesPage() {
  const navigate = useNavigate();
  const { activeCompanyId, allowedCompanyIds } = useCompanyContext();
  const [technicians, setTechnicians] = useState<TechRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);

  const fetchTechnicians = async () => {
    setLoading(true);

    let techQuery = supabase
      .from("technicians")
      .select("id, name, email, user_id, trade_certificate_type, archived_at")
      .not("user_id", "is", null)
      .order("name");

    if (!showArchived) {
      techQuery = techQuery.is("archived_at", null);
    }

    const { data: techs } = await techQuery;
    if (!techs || techs.length === 0) {
      setTechnicians([]);
      setLoading(false);
      return;
    }

    // Build plannable lookup from employment_profiles scoped to active company
    const authUserIds = techs.map((t: any) => t.user_id).filter(Boolean);
    const { data: accounts } = await supabase
      .from("user_accounts")
      .select("auth_user_id, person_id")
      .in("auth_user_id", authUserIds)
      .eq("is_active", true);

    const personIds = [...new Set((accounts || []).map((a: any) => a.person_id).filter(Boolean))];
    const authToPersonMap = new Map((accounts || []).map((a: any) => [a.auth_user_id, a.person_id]));

    let epQuery = supabase
      .from("employment_profiles")
      .select("person_id, is_plannable_resource")
      .is("archived_at", null);

    if (activeCompanyId) {
      epQuery = epQuery.eq("company_id", activeCompanyId);
    } else if (allowedCompanyIds.length > 0) {
      epQuery = epQuery.in("company_id", allowedCompanyIds);
    }

    if (personIds.length > 0) {
      epQuery = epQuery.in("person_id", personIds);
    }

    const { data: eps } = await epQuery;
    const plannablePersonIds = new Set(
      (eps || []).filter((ep: any) => ep.is_plannable_resource).map((ep: any) => ep.person_id)
    );

    setTechnicians(
      techs.map((t: any) => ({
        id: t.id,
        name: t.name,
        email: t.email,
        trade_certificate_type: t.trade_certificate_type,
        is_plannable_in_company: plannablePersonIds.has(authToPersonMap.get(t.user_id)),
        archived_at: t.archived_at,
      }))
    );
    setLoading(false);
  };

  useEffect(() => {
    fetchTechnicians();
  }, [showArchived, activeCompanyId]);

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Ansatte</h1>
          <p className="text-sm text-muted-foreground">
            Operativ oversikt over montører og ressurser
          </p>
        </div>
        <div className="flex items-center gap-2">
          <LocalExportMenu title="Ansatte – ressurser" module="employees" disabled={loading} filters={{'Vis arkiverte':showArchived?'Ja':'Nei'}} rows={technicians.map(t=>({'Navn':t.name,'E-post':t.email,'Rolle / Fagbrev':t.trade_certificate_type,'Planleggbar':t.is_plannable_in_company,'Status':t.archived_at?'Arkivert':'Aktiv'}))}/>
          <Archive className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Vis arkiverte</span>
          <Switch checked={showArchived} onCheckedChange={setShowArchived} />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : technicians.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
          <Users className="h-10 w-10" />
          <p className="text-sm">Ingen ansatte funnet.</p>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Navn</TableHead>
                <TableHead className="hidden sm:table-cell">Rolle / Fagbrev</TableHead>
                <TableHead className="text-center">Planleggbar</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-center w-[60px]">Mappe</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {technicians.map((tech) => (
                <TableRow
                  key={tech.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => navigate(`/admin/ansatte/${tech.id}`)}
                >
                  <TableCell>
                    <div>
                      <p className="font-medium text-sm">{tech.name}</p>
                      <p className="text-xs text-muted-foreground">{tech.email}</p>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <span className="text-sm text-muted-foreground">
                      {tech.trade_certificate_type || "–"}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    {tech.is_plannable_in_company ? (
                      <Badge variant="success" className="text-[10px]">Ja</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">Nei</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {tech.archived_at ? (
                      <Badge variant="destructive" className="text-[10px]">Arkivert</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">Aktiv</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/admin/ansatte/${tech.id}`);
                      }}
                    >
                      <FolderOpen className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
