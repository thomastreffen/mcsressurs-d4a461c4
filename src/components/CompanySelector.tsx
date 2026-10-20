import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useAuth } from "@/hooks/useAuth";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Building, Globe } from "lucide-react";

export function CompanySelector() {
  const { companies, activeCompanyId, isAllCompanies, setActiveCompanyId } = useCompanyContext();
  const { isSuperAdmin } = useAuth();

  const showSelector = companies.length > 1 || (isSuperAdmin && companies.length > 0);
  if (!showSelector) return null;

  const displayValue = isAllCompanies ? "__all__" : (activeCompanyId || "");

  return (
    <div className="flex items-center gap-2 min-w-0 w-full md:w-auto">
      {isAllCompanies ? (
        <Globe className="h-4 w-4 text-primary shrink-0" />
      ) : (
        <Building className="h-4 w-4 text-muted-foreground shrink-0" />
      )}
      <Select
        value={displayValue}
        onValueChange={(v) => setActiveCompanyId(v === "__all__" ? null : v)}
      >
        <SelectTrigger className="w-full min-w-0 md:w-[200px] h-11 md:h-8 text-sm md:text-xs [&>span]:truncate">
          <SelectValue placeholder="Velg selskap" />
        </SelectTrigger>
        <SelectContent>
          {companies.length > 1 && (
            <SelectItem value="__all__">
              <span className="flex items-center gap-1.5">
                <Globe className="h-3 w-3" />
                Alle mine selskaper
              </span>
            </SelectItem>
          )}
          {companies.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
