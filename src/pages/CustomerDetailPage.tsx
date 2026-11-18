import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FolderKanban, UserPlus, Building2, Inbox, Loader2, Activity, Star } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useCustomerTags } from "@/hooks/useCustomerTags";
import { useCustomerValueLevels } from "@/hooks/useCustomerValueLevels";
import { type JobStatus } from "@/lib/job-status";
import { CustomerHeader } from "@/components/customer/CustomerHeader";
import { CustomerProjectsList } from "@/components/customer/CustomerProjectsList";
import { CustomerContactsTab } from "@/components/customer/CustomerContactsTab";
import { CustomerRegisterPanel } from "@/components/customer/CustomerRegisterPanel";
import { CustomerCasesSection } from "@/components/customer/CustomerCasesSection";
import { CustomerInfoTab } from "@/components/customer/CustomerInfoTab";
import { CustomerSnapshot } from "@/components/customer/CustomerSnapshot";
import { CustomerActionRequired } from "@/components/customer/CustomerActionRequired";
import { CustomerSalesInfo } from "@/components/customer/CustomerSalesInfo";
import { CustomerActivityList } from "@/components/customer/CustomerActivityList";
import type { CustomerTag } from "@/hooks/useCustomerTags";
import { CustomerDevelopment } from "@/components/customer/CustomerDevelopment";

interface Customer {
  id: string;
  name: string;
  org_number: string | null;
  main_email: string | null;
  main_phone: string | null;
  billing_address: string | null;
  billing_zip: string | null;
  billing_city: string | null;
  notes: string | null;
  created_at: string;
  external_tripletex_id: string | null;
  company_id: string | null;
  customer_value: string | null;
  products_of_interest: string[] | null;
}

interface Contact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
}

interface ProjectRow {
  id: string;
  title: string;
  status: JobStatus;
  start_time: string;
  internal_number: string | null;
}

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAdmin } = useAuth();
  const { activeCompany } = useCompanyContext();
  const { tags: allTags, addTagToCustomer, removeTagFromCustomer, getCustomerTagIds, createTag } = useCustomerTags();
  const { levels: valueLevels } = useCustomerValueLevels();

  const activeTab = searchParams.get("tab") || "overview";
  const setActiveTab = (tab: string) => {
    setSearchParams(tab === "overview" ? {} : { tab }, { replace: true });
  };

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [assignedTags, setAssignedTags] = useState<CustomerTag[]>([]);
  const [leadCount, setLeadCount] = useState(0);
  const [offerCount, setOfferCount] = useState(0);
  const [lastActivity, setLastActivity] = useState<string | null>(null);

  const fetchCustomer = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from("customers")
      .select("*")
      .eq("id", id)
      .single();
    if (data) setCustomer(data as any);
    setLoading(false);
  }, [id]);

  const fetchProjects = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from("events")
      .select("id, title, status, start_time, internal_number")
      .eq("customer_id", id)
      .is("deleted_at", null)
      .order("start_time", { ascending: false });
    if (data) {
      setProjects(data as any);
      if (data.length > 0) setLastActivity((data as any)[0].start_time);
    }
  }, [id]);

  const fetchContacts = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from("customer_contacts")
      .select("*")
      .eq("customer_id", id)
      .order("created_at", { ascending: true });
    if (data) setContacts(data as any);
  }, [id]);

  const fetchTags = useCallback(async () => {
    if (!id) return;
    const tagIds = await getCustomerTagIds(id);
    setAssignedTags(allTags.filter((t) => tagIds.includes(t.id)));
  }, [id, allTags, getCustomerTagIds]);

  const fetchCounts = useCallback(async () => {
    if (!id) return;
    const leadsQuery = supabase
      .from("leads")
      .select("id", { count: "exact", head: true }) as any;
    const { count: lc } = await leadsQuery.eq("customer_id", id).is("deleted_at", null);
    setLeadCount(lc || 0);

    // Offer count via calculations linked by customer name – simplified
    setOfferCount(0);
  }, [id]);

  useEffect(() => {
    fetchCustomer();
    fetchProjects();
    fetchContacts();
    fetchCounts();
  }, [fetchCustomer, fetchProjects, fetchContacts, fetchCounts]);

  useEffect(() => { fetchTags(); }, [fetchTags]);

  const handleAddTag = async (tagId: string) => {
    if (!id) return;
    await addTagToCustomer(id, tagId);
    await fetchTags();
  };

  const handleRemoveTag = async (tagId: string) => {
    if (!id) return;
    await removeTagFromCustomer(id, tagId);
    await fetchTags();
  };

  const handleCreateTag = async (name: string, color: string) => {
    const tag = await createTag(name, color);
    if (tag && id) {
      await addTagToCustomer(id, tag.id);
      await fetchTags();
    }
  };

  const handleValueChange = async (code: string | null) => {
    if (!customer) return;
    const { error } = await supabase
      .from("customers")
      .update({ customer_value: code } as any)
      .eq("id", customer.id);
    if (error) toast.error("Kunne ikke oppdatere kundeverdi");
    else { setCustomer({ ...customer, customer_value: code }); toast.success("Kundeverdi oppdatert"); }
  };

  const handleProductToggle = async (product: string) => {
    if (!customer) return;
    const current = customer.products_of_interest || [];
    const updated = current.includes(product) ? current.filter((p) => p !== product) : [...current, product];
    const { error } = await supabase
      .from("customers")
      .update({ products_of_interest: updated } as any)
      .eq("id", customer.id);
    if (!error) setCustomer({ ...customer, products_of_interest: updated });
  };

  const handleSaveInfo = async (data: {
    name: string; org_number: string; main_email: string; main_phone: string;
    billing_address: string; billing_zip: string; billing_city: string;
  }) => {
    if (!customer) return;
    const { error } = await supabase
      .from("customers")
      .update({
        name: data.name, org_number: data.org_number || null, main_email: data.main_email || null,
        main_phone: data.main_phone || null, billing_address: data.billing_address || null,
        billing_zip: data.billing_zip || null, billing_city: data.billing_city || null,
      } as any)
      .eq("id", customer.id);
    if (error) toast.error("Kunne ikke lagre", { description: error.message });
    else { toast.success("Kunde oppdatert"); fetchCustomer(); }
  };

  const handleAddContact = async (contact: { name: string; email: string; phone: string; role: string }) => {
    if (!id) return;
    const { error } = await supabase.from("customer_contacts").insert({
      customer_id: id, name: contact.name, email: contact.email || null,
      phone: contact.phone || null, role: contact.role || null,
    } as any);
    if (error) toast.error("Kunne ikke legge til kontakt");
    else { toast.success("Kontakt lagt til"); fetchContacts(); }
  };

  const handleDeleteContact = async (contactId: string) => {
    const { error } = await supabase.from("customer_contacts").delete().eq("id", contactId);
    if (error) toast.error("Kunne ikke slette kontakt");
    else { toast.success("Kontakt slettet"); fetchContacts(); }
  };

  if (loading) {
    return <div className="flex items-center justify-center p-20"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>;
  }

  if (!customer) {
    return (
      <div className="flex items-center justify-center p-20">
        <div className="text-center space-y-3">
          <p className="text-lg font-semibold">Kunde ikke funnet</p>
          <Button variant="outline" onClick={() => navigate("/customers")}>Tilbake til kunder</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <CustomerHeader customer={customer} companyName={activeCompany?.name} />

      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6 space-y-4">
        {/* Snapshot */}
        <CustomerSnapshot
          projectCount={projects.length}
          offerCount={offerCount}
          leadCount={leadCount}
          lastActivity={lastActivity}
        />

        {/* Action required */}
        <CustomerActionRequired
          customerId={customer.id}
          customerName={customer.name}
          leadCount={leadCount}
          offerCount={offerCount}
          lastActivity={lastActivity}
        />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="rounded-xl max-w-full overflow-x-auto justify-start">
            <TabsTrigger value="development" className="rounded-lg gap-1.5">Kundeutvikling</TabsTrigger>
            <TabsTrigger value="overview" className="rounded-lg gap-1.5">
              <Star className="h-3.5 w-3.5" /> Oversikt
            </TabsTrigger>
            <TabsTrigger value="projects" className="rounded-lg gap-1.5">
              <FolderKanban className="h-3.5 w-3.5" /> Prosjekter ({projects.length})
            </TabsTrigger>
            <TabsTrigger value="contacts" className="rounded-lg gap-1.5">
              <UserPlus className="h-3.5 w-3.5" /> Avdelinger og kontakter
            </TabsTrigger>
            <TabsTrigger value="cases" className="rounded-lg gap-1.5">
              <Inbox className="h-3.5 w-3.5" /> Saker
            </TabsTrigger>
            <TabsTrigger value="info" className="rounded-lg gap-1.5">
              <Building2 className="h-3.5 w-3.5" /> Info
            </TabsTrigger>
          </TabsList>

          <TabsContent value="development"><CustomerDevelopment customerId={customer.id} /></TabsContent>
          <TabsContent value="overview">
            <div className="space-y-4">
              <CustomerSalesInfo
                assignedTags={assignedTags}
                allTags={allTags}
                onAddTag={handleAddTag}
                onRemoveTag={handleRemoveTag}
                onCreateTag={handleCreateTag}
                customerValue={customer.customer_value}
                valueLevels={valueLevels}
                onValueChange={handleValueChange}
                productsOfInterest={customer.products_of_interest || []}
                onProductToggle={handleProductToggle}
              />
              <CustomerActivityList customerId={customer.id} />
            </div>
          </TabsContent>

          <TabsContent value="projects">
            <CustomerProjectsList projects={projects} customerId={customer.id} />
          </TabsContent>

          <TabsContent value="contacts">
            <CustomerRegisterPanel customerId={customer.id} />
          </TabsContent>

          <TabsContent value="cases">
            <CustomerCasesSection customerId={customer.id} />
          </TabsContent>

          <TabsContent value="info">
            <CustomerInfoTab
              customer={customer} isAdmin={isAdmin}
              companyName={activeCompany?.name} onSave={handleSaveInfo}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
