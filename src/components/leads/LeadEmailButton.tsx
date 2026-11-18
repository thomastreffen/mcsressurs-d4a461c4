import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CrmEmailComposer } from "@/components/customer/CrmEmailComposer";
import type { RegisterContact, RegisterData } from "@/lib/customer-register";

/** Explicit "Send e-post" on a lead linked to a customer card. Never sends on its own. */
export function LeadEmailButton({ companyId, customerId, accountId, leadId }: { companyId: string | null; customerId: string | null; accountId: string | null; leadId: string }) {
  const [contacts, setContacts] = useState<RegisterContact[] | null>(null);
  if (!companyId || !customerId) return null;
  const open = async () => {
    const { data } = await supabase.rpc("customer_register_get", { _company_id: companyId, _customer_id: customerId });
    setContacts(((data as unknown) as RegisterData | null)?.contacts ?? []);
  };
  return (
    <>
      <Button size="sm" variant="outline" className="gap-1.5 rounded-xl" onClick={open}><Mail className="h-4 w-4" />Send e-post</Button>
      {contacts && <CrmEmailComposer companyId={companyId} customerId={customerId} accountId={accountId} leadId={leadId} contacts={contacts} onClose={() => setContacts(null)} />}
    </>
  );
}
