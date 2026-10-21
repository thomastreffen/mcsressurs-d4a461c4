import { useState } from "react";
import { usePreviewMode } from "@/hooks/usePreviewMode";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eye, X, ChevronDown, ChevronUp, Shield, Lock, Unlock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMontorPreview } from "@/hooks/useMontorPreview";

export function PreviewModeBanner() {
  const { active, target, permissions, permissionDetails, scope, deactivate, effectiveRole } = usePreviewMode();
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const { stop } = useMontorPreview();

  if (!active || !target) return null;

  const permEntries = Object.entries(permissions);
  const allowedCount = permEntries.filter(([, v]) => v).length;
  const deniedCount = permEntries.filter(([, v]) => !v).length;

  // Group permissions by category
  const grouped: Record<string, { key: string; allowed: boolean }[]> = {};
  for (const [key, allowed] of permEntries) {
    const category = key.split(".")[0];
    if (!grouped[category]) grouped[category] = [];
    grouped[category].push({ key, allowed });
  }

  // Find overrides
  const overrideKeys = new Set(
    permissionDetails.filter(d => d.source === "override").map(d => d.key)
  );

  return (
    <div className="sticky top-0 z-50">
      {/* Main banner */}
      <div className="bg-amber-500/15 border-b border-amber-500/30 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-2 px-3 py-1.5 sm:px-4 sm:py-2">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-1.5 bg-amber-500/20 rounded-md px-2 py-1">
              <Eye className="h-4 w-4 text-amber-700 dark:text-amber-400" />
              <span className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
                <span className="sm:hidden">{effectiveRole === "montør" ? "Montørvisning" : "Preview"}</span>
                <span className="hidden sm:inline">Preview</span>
              </span>
            </div>
            <div className="hidden sm:block text-sm">
              <span className="text-muted-foreground">Du forhåndsviser som </span>
              <span className="font-semibold text-foreground">
                {target.type === "user" ? target.label : `rolle "${target.label}"`}
              </span>
            </div>
            {effectiveRole && (
              <Badge variant="outline" className="hidden sm:inline-flex text-[10px] border-amber-500/30 text-amber-700 dark:text-amber-400">
                {effectiveRole}
              </Badge>
            )}
            <Badge variant="outline" className="hidden sm:inline-flex text-[10px] border-amber-500/30 text-amber-700 dark:text-amber-400">
              Omfang: {scope}
            </Badge>
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
              <Lock className="h-3 w-3" />
              Skrivebeskyttet
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setInspectorOpen(!inspectorOpen)}
              aria-label="Tilgangsinspektør"
              className="min-h-11 sm:min-h-9 gap-1.5 text-xs text-amber-700 dark:text-amber-400 hover:text-amber-800 hover:bg-amber-500/10"
            >
              <Shield className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Tilgangsinspektør</span>
              {inspectorOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={stop}
              className="min-h-11 sm:min-h-9 gap-1.5 text-xs border-amber-500/30 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20"
            >
              <X className="h-3.5 w-3.5" />
              Avslutt<span className="hidden sm:inline"> preview</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Inspector panel */}
      {inspectorOpen && (
        <div className="bg-card border-b border-border shadow-lg max-h-[50vh] overflow-y-auto">
          <div className="px-4 py-3">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                Tilgangsinspektør
              </h3>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">
                  <Unlock className="h-3 w-3 mr-1 text-emerald-600" />
                  {allowedCount} tillatt
                </Badge>
                <Badge variant="secondary" className="text-[10px]">
                  <Lock className="h-3 w-3 mr-1 text-destructive" />
                  {deniedCount} nektet
                </Badge>
                {overrideKeys.size > 0 && (
                  <Badge variant="secondary" className="text-[10px]">
                    <AlertTriangle className="h-3 w-3 mr-1 text-amber-500" />
                    {overrideKeys.size} overstyringer
                  </Badge>
                )}
              </div>
            </div>

            {/* Summary info */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <div className="rounded-lg bg-muted/50 p-2.5">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Target</p>
                <p className="text-sm font-medium mt-0.5">{target.label}</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-2.5">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Type</p>
                <p className="text-sm font-medium mt-0.5">{target.type === "user" ? "Bruker" : "Rolle"}</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-2.5">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Systemrolle</p>
                <p className="text-sm font-medium mt-0.5">{effectiveRole || "—"}</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-2.5">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Omfang</p>
                <p className="text-sm font-medium mt-0.5">{scope}</p>
              </div>
            </div>

            {/* Permission categories */}
            <div className="space-y-3">
              {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([category, perms]) => (
                <div key={category}>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                    {category}
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {perms.sort((a, b) => a.key.localeCompare(b.key)).map(({ key, allowed }) => {
                      const isOverride = overrideKeys.has(key);
                      return (
                        <span
                          key={key}
                          className={cn(
                            "inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-mono",
                            allowed
                              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                              : "bg-destructive/10 text-destructive",
                            isOverride && "ring-1 ring-amber-400/50"
                          )}
                        >
                          {allowed ? <Unlock className="h-2.5 w-2.5" /> : <Lock className="h-2.5 w-2.5" />}
                          {key.split(".").slice(1).join(".")}
                          {isOverride && <AlertTriangle className="h-2.5 w-2.5 text-amber-500 ml-0.5" />}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {permEntries.length === 0 && (
              <div className="text-center py-6 text-sm text-muted-foreground">
                Ingen rettigheter definert for denne {target.type === "user" ? "brukeren" : "rollen"}.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
