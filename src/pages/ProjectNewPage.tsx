import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AddressAutocomplete } from "@/components/ui/address-autocomplete";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Loader2, FolderKanban, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { TechnicianMultiSelect } from "@/components/TechnicianMultiSelect";

interface CustomerOption {
  id: string;
  name: string;
}

interface ProjectOption {
  id: string;
  title: string;
  internal_number: string | null;
}

export default function ProjectNewPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedCustomerId = searchParams.get("customer") || "";
  const preselectedParentId = searchParams.get("parent") || "";
  const { user } = useAuth();
  const { activeCompanyId } = useCompanyContext();
  const { isSuperAdmin: canImportTripletex } = useAuth();

  const [saving, setSaving] = useState(false);
  const [showOptional, setShowOptional] = useState(!!preselectedParentId);

  // Required
  const [title, setTitle] = useState("");
  const [customerId, setCustomerId] = useState(preselectedCustomerId);
  const [projectType, setProjectType] = useState("service");

  // Optional
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("08:00");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("16:00");
  const [techIds, setTechIds] = useState<string[]>([]);
  const [parentProjectId, setParentProjectId] = useState(preselectedParentId);
  const [projectNumber, setProjectNumber] = useState("");

  // Data
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [parentProjects, setParentProjects] = useState<ProjectOption[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [customerSearch, setCustomerSearch] = useState("");

  useEffect(() => {
    const fetchCustomers = async () => {
      const { data } = await supabase.from("customers").select("id, name").order("name");
      if (data) setCustomers(data as any);
      setLoadingCustomers(false);
    };
    fetchCustomers();
  }, []);

  useEffect(() => {
    const fetchParents = async () => {
      if (!customerId) { setParentProjects([]); return; }
      const { data } = await supabase
        .from("events")
        .select("id, title, internal_number")
        .eq("customer_id", customerId)
        .is("parent_project_id", null)
        .is("deleted_at", null)
        .order("title");
      if (data) setParentProjects(data as any);
    };
    fetchParents();
  }, [customerId]);

  const filteredCustomers = customerSearch.trim()
    ? customers.filter((c) => c.name.toLowerCase().includes(customerSearch.toLowerCase()))
    : customers;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !customerId) return;
    setSaving(true);

    const now = new Date();
    const defaultStart = startDate ? `${startDate}T${startTime}` : now.toISOString();
    const defaultEnd = endDate ? `${endDate}T${endTime}` : new Date(now.getTime() + 8 * 3600000).toISOString();

    const insertData: any = {
      title: title.trim(),
      customer_id: customerId,
      project_type: projectType,
      status: "requested",
      start_time: defaultStart,
      end_time: defaultEnd,
      address: address.trim() || null,
      description: description.trim() || null,
      project_number: projectNumber.trim() || null,
      parent_project_id: parentProjectId || null,
      company_id: activeCompanyId || null,
      created_by: user?.id || null,
      technician_id: techIds[0] || null,
    };

    if (!insertData.technician_id) {
      const { data: firstTech } = await supabase.from("technicians").select("id").limit(1).single();
      if (firstTech) insertData.technician_id = firstTech.id;
    }

    if (!insertData.technician_id) {
      toast.error("Ingen montører tilgjengelig. Legg til montører først.");
      setSaving(false);
      return;
    }

    const { data, error } = await supabase
      .from("events")
      .insert(insertData)
      .select("id")
      .single();

    if (error) {
      toast.error("Kunne ikke opprette prosjekt", { description: error.message });
      setSaving(false);
      return;
    }

    if (techIds.length > 0) {
      await supabase.from("event_technicians").insert(
        techIds.map((tid) => ({ event_id: data.id, technician_id: tid }))
      );
    } else {
      await supabase.from("event_technicians").insert({
        event_id: data.id,
        technician_id: insertData.technician_id,
      });
    }

    toast.success("Prosjekt opprettet", { description: title });
    navigate(`/projects/${data.id}`);
  };

  const selectedCustomerName = customers.find((c) => c.id === customerId)?.name;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-2xl mx-auto space-y-6">
      {canImportTripletex && !preselectedParentId && (
        <div className="rounded-xl border border-border bg-muted/40 p-3 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span>Økonomisk prosjekt? Opprett det i Tripletex først, og hent det inn her.</span>
          <Button size="sm" variant="outline" onClick={() => navigate("/projects/import-tripletex")}>Hent fra Tripletex TEST</Button>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-xl h-8 w-8">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <FolderKanban className="h-5 w-5 text-primary" />
            Nytt prosjekt
          </h1>
          <p className="text-sm text-muted-foreground">Fyll ut minimum og kom i gang på sekunder</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Stage A – Required */}
        <Card className="rounded-2xl border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Grunnleggende
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Customer */}
            <div className="space-y-1.5">
              <Label>Kunde *</Label>
              {loadingCustomers ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Laster kunder...
                </div>
              ) : (
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="Velg kunde" />
                  </SelectTrigger>
                  <SelectContent>
                    <div className="px-2 pb-2">
                      <Input
                        placeholder="Søk kunde..."
                        value={customerSearch}
                        onChange={(e) => setCustomerSearch(e.target.value)}
                        className="h-8 text-sm"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                    {filteredCustomers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                    {filteredCustomers.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-2">Ingen treff</p>
                    )}
                  </SelectContent>
                </Select>
              )}
              {customers.length === 0 && !loadingCustomers && (
                <Button type="button" variant="link" className="text-xs p-0 h-auto" onClick={() => navigate("/customers/new")}>
                  + Opprett kunde først
                </Button>
              )}
              {customers.length > 0 && (
                <Button type="button" variant="link" className="text-xs p-0 h-auto text-muted-foreground" onClick={() => navigate("/customers/new")}>
                  + Ny kunde
                </Button>
              )}
            </div>

            {/* Title */}
            <div className="space-y-1.5">
              <Label htmlFor="title">Prosjektnavn *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Navn på prosjektet"
                required
                autoFocus
              />
            </div>

            {/* Type */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Prosjekttype</Label>
                <Select value={projectType} onValueChange={setProjectType}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="service">Service</SelectItem>
                    <SelectItem value="project">Prosjekt</SelectItem>
                    <SelectItem value="internal">Internt</SelectItem>
                    <SelectItem value="offer">Tilbud</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Submit – prominent */}
        <div className="flex items-center justify-between mt-5 gap-3">
          <Button type="button" variant="ghost" onClick={() => navigate(-1)} className="rounded-xl text-muted-foreground">
            Avbryt
          </Button>
          <Button type="submit" disabled={saving || !title.trim() || !customerId} className="rounded-xl gap-1.5 px-6">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Opprett og gå til prosjekt
          </Button>
        </div>

        {/* Stage B – Optional */}
        <Button
          type="button"
          variant="ghost"
          className="w-full mt-6 gap-2 text-muted-foreground text-xs"
          onClick={() => setShowOptional(!showOptional)}
        >
          {showOptional ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {showOptional ? "Skjul valgfrie detaljer" : "Legg til detaljer (adresse, montør, m.m.)"}
        </Button>

        {showOptional && (
          <Card className="rounded-2xl mt-2 border-dashed">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-muted-foreground">Valgfritt – kan fylles ut senere</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Prosjektnummer</Label>
                <Input value={projectNumber} onChange={(e) => setProjectNumber(e.target.value)} placeholder="F.eks. P-12345" />
              </div>

              <div className="space-y-1.5">
                <Label>Adresse</Label>
                <AddressAutocomplete value={address} onChange={setAddress} placeholder="Søk prosjektadresse…" />
              </div>

              <TechnicianMultiSelect selectedIds={techIds} onChange={setTechIds} />

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Startdato</Label>
                  <div className="flex gap-2">
                    <Input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); if (!endDate) setEndDate(e.target.value); }} />
                    <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-28" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Sluttdato</Label>
                  <div className="flex gap-2">
                    <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                    <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="w-28" />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Beskrivelse</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Beskrivelse av prosjektet..." rows={3} />
              </div>

              {parentProjects.length > 0 && (
                <div className="space-y-1.5">
                  <Label>Hovedprosjekt (gjør dette til underprosjekt)</Label>
                  <Select value={parentProjectId} onValueChange={setParentProjectId}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue placeholder="Ingen (dette er et hovedprosjekt)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Ingen</SelectItem>
                      {parentProjects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.internal_number ? `${p.internal_number} – ` : ""}{p.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </form>
    </div>
  );
}
