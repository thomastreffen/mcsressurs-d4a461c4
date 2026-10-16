import type { ReactNode } from 'react';
import { Loader2, ShieldAlert } from 'lucide-react';
import { useCompanyModuleAccess } from '@/hooks/useCompanyModuleAccess';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { CompanyModule, AccessLevel } from '@/lib/company-module-access';

export function CompanyModuleGate({ module, level = 'view', children }: { module: CompanyModule | null; level?: AccessLevel; children: ReactNode }) {
  const access = useCompanyModuleAccess();
  if (!module) return <>{children}</>;
  if (access.loading) return <div className="p-6"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (access.error) return <div className="p-6"><Alert variant="destructive"><AlertTitle>Kunne ikke kontrollere tilgang</AlertTitle><AlertDescription><Button variant="outline" onClick={() => access.refetch()}>Prøv igjen</Button></AlertDescription></Alert></div>;
  if (!access.can(module, level)) return <div className="p-6"><Alert><ShieldAlert className="h-4 w-4" /><AlertTitle>Ingen tilgang</AlertTitle><AlertDescription>Du har ikke tilgang til denne delen av systemet i valgt selskap.</AlertDescription></Alert></div>;
  return <>{children}</>;
}