import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Info } from "lucide-react";
import type { OrderFormFieldType } from "@/types/order-forms";
import { PricingModelPreview } from "@/components/orders/fields/PricingModelField";

interface BuilderPreviewProps {
  sections: any[];
  templateTitle: string;
}

/* Width classes — MUST match BuilderCanvas exactly */
function getWidthStyle(w: string): string {
  switch (w) {
    case "half": return "w-full sm:w-[calc(50%-6px)]";
    case "third": return "w-full sm:w-[calc(33.333%-8px)]";
    case "two_thirds": return "w-full sm:w-[calc(66.666%-4px)]";
    default: return "w-full";
  }
}

/* Row grouping — MUST match BuilderCanvas exactly */
function groupFieldsIntoRows(fields: any[]): any[][] {
  const rows: any[][] = [];
  let currentRow: any[] = [];
  let currentRowWidth = 0;

  for (const field of fields) {
    const w = field.field_width || "full";
    const fraction = w === "half" ? 0.5 : w === "third" ? 1 / 3 : w === "two_thirds" ? 2 / 3 : 1;

    if (currentRowWidth + fraction > 1.01 && currentRow.length > 0) {
      rows.push(currentRow);
      currentRow = [];
      currentRowWidth = 0;
    }
    currentRow.push(field);
    currentRowWidth += fraction;

    if (currentRowWidth >= 0.99) {
      rows.push(currentRow);
      currentRow = [];
      currentRowWidth = 0;
    }
  }
  if (currentRow.length > 0) rows.push(currentRow);
  return rows;
}

export function BuilderPreview({ sections, templateTitle }: BuilderPreviewProps) {
  return (
    <div className="h-full overflow-y-auto bg-muted/20 p-4">
      <div className="max-w-2xl mx-auto space-y-5 py-4">
        <div className="text-center pb-2">
          <h2 className="text-lg font-bold">{templateTitle || "Skjema"}</h2>
          <p className="text-xs text-muted-foreground">Forhåndsvisning</p>
        </div>

        {sections.filter((s) => s.is_active !== false).map((section) => {
          const fields = (section.fields || []).filter((f: any) => f.is_active !== false);
          if (fields.length === 0) return null;
          const rows = groupFieldsIntoRows(fields);

          return (
            <Card key={section.id}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">{section.title}</CardTitle>
                {section.description && (
                  <p className="text-xs text-muted-foreground">{section.description}</p>
                )}
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {rows.map((row, rIdx) => (
                    <div key={rIdx} className="flex flex-wrap gap-3">
                      {row.map((field: any) => (
                        <div key={field.id} className={getWidthStyle(field.field_width || "full")} style={{ minWidth: 0 }}>
                          <PreviewField field={field} />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function PreviewField({ field }: { field: any }) {
  const options: string[] = Array.isArray(field.options)
    ? field.options.map((o: any) => typeof o === "string" ? o : o.label || o.value)
    : [];

  if (field.field_type === "section_header") {
    return <h3 className="text-sm font-semibold text-foreground pt-2">{field.label}</h3>;
  }

  if (field.field_type === "info_box") {
    return (
      <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 flex items-start gap-2">
        <Info className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
        <p className="text-xs text-blue-700">{field.help_text || field.label}</p>
      </div>
    );
  }

  const renderInput = () => {
    switch (field.field_type as OrderFormFieldType) {
      case "short_text": case "email": case "phone": case "address": case "org_number":
        return <Input placeholder={field.placeholder || ""} disabled className="h-8 text-sm" />;
      case "long_text":
        return <Textarea placeholder={field.placeholder || ""} disabled className="text-sm min-h-[60px]" />;
      case "number":
        return <Input type="number" placeholder={field.placeholder || ""} disabled className="h-8 text-sm" />;
      case "date":
        return <Input type="date" disabled className="h-8 text-sm" />;
      case "time": case "time_window":
        return <Input type="time" disabled className="h-8 text-sm" />;
      case "dropdown":
        return (
          <Select disabled>
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder={field.placeholder || "Velg..."} /></SelectTrigger>
            <SelectContent>{options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
          </Select>
        );
      case "radio":
        return (
          <RadioGroup disabled className="flex flex-wrap gap-x-4 gap-y-1.5">
            {options.map((o) => (
              <div key={o} className="flex items-center gap-2">
                <RadioGroupItem value={o} disabled />
                <span className="text-xs">{o}</span>
              </div>
            ))}
          </RadioGroup>
        );
      case "pricing_model":
        return <PricingModelPreview />;
      case "yes_no":
        return (
          <RadioGroup disabled className="flex gap-3">
            <div className="flex items-center gap-1.5"><RadioGroupItem value="ja" disabled /><span className="text-xs">Ja</span></div>
            <div className="flex items-center gap-1.5"><RadioGroupItem value="nei" disabled /><span className="text-xs">Nei</span></div>
          </RadioGroup>
        );
      case "checkbox_list": case "multi_select":
        return (
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {options.map((o) => (
              <div key={o} className="flex items-center gap-2">
                <Checkbox disabled />
                <span className="text-xs">{o}</span>
              </div>
            ))}
          </div>
        );
      case "file_upload": case "image_upload":
        return (
          <div className="rounded-lg border-2 border-dashed border-border/50 p-4 text-center">
            <Upload className="h-5 w-5 text-muted-foreground/40 mx-auto mb-1" />
            <p className="text-[10px] text-muted-foreground">
              {field.field_type === "image_upload" ? "Last opp bilde" : "Last opp fil"}
            </p>
          </div>
        );
      case "customer_lookup": case "project_lookup": case "user_lookup":
        return (
          <Select disabled>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder={
                field.field_type === "customer_lookup" ? "Søk kunde..." :
                field.field_type === "project_lookup" ? "Søk prosjekt..." : "Søk bruker..."
              } />
            </SelectTrigger>
          </Select>
        );
      default:
        return <Input disabled className="h-8 text-sm" />;
    }
  };

  return (
    <div>
      <Label className="text-xs mb-1 flex items-center gap-1">
        {field.label}
        {field.is_required && <span className="text-destructive">*</span>}
      </Label>
      {field.help_text && (
        <p className="text-[10px] text-muted-foreground mb-1">{field.help_text}</p>
      )}
      {renderInput()}
    </div>
  );
}
