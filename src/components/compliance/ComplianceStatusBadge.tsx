import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { TONE_CLASS, TONE_DOT, type ComplianceTone } from "@/lib/compliance";

export function ComplianceStatusBadge({
  label,
  tone,
  className,
}: {
  label: string;
  tone: ComplianceTone;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn("gap-1.5 font-medium", TONE_CLASS[tone], className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", TONE_DOT[tone])} />
      {label}
    </Badge>
  );
}
