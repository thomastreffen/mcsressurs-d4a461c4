import { useState, useRef, useEffect, useCallback } from "react";
import {
  GripVertical, Plus, ChevronDown, ChevronRight, Eye, EyeOff, ArrowUp, ArrowDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Info } from "lucide-react";
import { type OrderFormFieldType } from "@/types/order-forms";

interface PresetData {
  label: string;
  fieldKey: string;
  helpText?: string;
  options?: string[];
  isRequired?: boolean;
  fieldWidth?: string;
}

interface BlockData {
  id: string;
  label: string;
  description: string;
  previewLayout: string;
  fields: Array<{
    label: string;
    type: OrderFormFieldType;
    field_key: string;
    is_required?: boolean;
    help_text?: string;
    options?: string[];
    field_width?: string;
  }>;
}

interface BuilderCanvasProps {
  sections: any[];
  selectedFieldId: string | null;
  selectedSectionId: string | null;
  onSelectField: (fieldId: string | null, sectionId: string) => void;
  onSelectSection: (sectionId: string) => void;
  onAddSection: () => void;
  onToggleFieldRequired: (fieldId: string, required: boolean) => void;
  onToggleFieldActive: (fieldId: string, active: boolean) => void;
  onToggleSectionActive: (sectionId: string, active: boolean) => void;
  onMoveSection: (fromIdx: number, toIdx: number) => void;
  onMoveField: (fieldId: string, fromSectionId: string, toSectionId: string, toIndex: number) => void;
  onDropNewField: (type: OrderFormFieldType, sectionId: string, index: number, preset?: PresetData) => void;
  onDropNewBlock: (block: BlockData, sectionId: string, index: number) => void;
  templateTitle: string;
}

/* ── Row grouping — identical logic used in preview ── */
function groupFieldsIntoRows(fields: any[]) {
  const rows: { fields: any[]; startIndex: number }[] = [];
  let currentRow: any[] = [];
  let currentRowWidth = 0;
  let rowStartIndex = 0;

  for (let i = 0; i < fields.length; i++) {
    const w = fields[i].field_width || "full";
    const fraction = w === "half" ? 0.5 : w === "third" ? 1 / 3 : w === "two_thirds" ? 2 / 3 : 1;

    if (currentRowWidth + fraction > 1.01 && currentRow.length > 0) {
      rows.push({ fields: currentRow, startIndex: rowStartIndex });
      currentRow = [];
      currentRowWidth = 0;
      rowStartIndex = i;
    }
    currentRow.push(fields[i]);
    currentRowWidth += fraction;

    if (currentRowWidth >= 0.99) {
      rows.push({ fields: currentRow, startIndex: rowStartIndex });
      currentRow = [];
      currentRowWidth = 0;
      rowStartIndex = i + 1;
    }
  }
  if (currentRow.length > 0) rows.push({ fields: currentRow, startIndex: rowStartIndex });
  return rows;
}

/* Tailwind classes matching preview exactly */
function getWidthStyle(w: string): string {
  switch (w) {
    case "half": return "w-full sm:w-[calc(50%-6px)]";
    case "third": return "w-full sm:w-[calc(33.333%-8px)]";
    case "two_thirds": return "w-full sm:w-[calc(66.666%-4px)]";
    default: return "w-full";
  }
}

/* ── Inline field renderer — renders actual form controls ── */
function FieldPreviewInline({ field }: { field: any }) {
  const options: string[] = Array.isArray(field.options)
    ? field.options.map((o: any) => typeof o === "string" ? o : o.label || o.value)
    : [];

  if (field.field_type === "section_header") {
    return <h4 className="text-sm font-semibold text-foreground pt-1">{field.label}</h4>;
  }

  if (field.field_type === "info_box") {
    return (
      <div className="rounded-lg bg-blue-50 border border-blue-200/50 p-2.5 flex items-start gap-2">
        <Info className="h-3.5 w-3.5 text-blue-500 mt-0.5 shrink-0" />
        <p className="text-[11px] text-blue-700">{field.help_text || field.label}</p>
      </div>
    );
  }

  const renderInput = () => {
    switch (field.field_type as OrderFormFieldType) {
      case "short_text": case "email": case "phone": case "address": case "org_number":
        return <Input placeholder={field.placeholder || ""} disabled className="h-8 text-xs" />;
      case "long_text":
        return <Textarea placeholder={field.placeholder || ""} disabled className="text-xs min-h-[56px]" />;
      case "number":
        return <Input type="number" placeholder={field.placeholder || ""} disabled className="h-8 text-xs" />;
      case "date":
        return <Input type="date" disabled className="h-8 text-xs" />;
      case "time": case "time_window":
        return <Input type="time" disabled className="h-8 text-xs" />;
      case "dropdown":
        return (
          <Select disabled>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={field.placeholder || "Velg..."} /></SelectTrigger>
            <SelectContent>{options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
          </Select>
        );
      case "radio":
        return (
          <RadioGroup disabled className="flex flex-wrap gap-x-4 gap-y-1">
            {options.map((o) => (
              <div key={o} className="flex items-center gap-1.5">
                <RadioGroupItem value={o} disabled className="h-3.5 w-3.5" />
                <span className="text-[11px]">{o}</span>
              </div>
            ))}
          </RadioGroup>
        );
      case "yes_no":
        return (
          <RadioGroup disabled className="flex gap-4">
            <div className="flex items-center gap-1.5"><RadioGroupItem value="ja" disabled className="h-3.5 w-3.5" /><span className="text-[11px]">Ja</span></div>
            <div className="flex items-center gap-1.5"><RadioGroupItem value="nei" disabled className="h-3.5 w-3.5" /><span className="text-[11px]">Nei</span></div>
          </RadioGroup>
        );
      case "checkbox_list": case "multi_select":
        return (
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {options.map((o) => (
              <div key={o} className="flex items-center gap-1.5">
                <Checkbox disabled className="h-3.5 w-3.5" />
                <span className="text-[11px]">{o}</span>
              </div>
            ))}
          </div>
        );
      case "file_upload": case "image_upload":
        return (
          <div className="rounded-lg border-2 border-dashed border-border/40 p-3 text-center">
            <Upload className="h-4 w-4 text-muted-foreground/40 mx-auto mb-0.5" />
            <p className="text-[10px] text-muted-foreground">
              {field.field_type === "image_upload" ? "Last opp bilde" : "Last opp fil"}
            </p>
          </div>
        );
      case "customer_lookup": case "project_lookup": case "user_lookup":
        return (
          <Select disabled>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder={
                field.field_type === "customer_lookup" ? "Søk kunde..." :
                field.field_type === "project_lookup" ? "Søk prosjekt..." : "Søk bruker..."
              } />
            </SelectTrigger>
          </Select>
        );
      default:
        return <Input disabled className="h-8 text-xs" />;
    }
  };

  return (
    <div>
      <Label className="text-[11px] font-medium mb-1 flex items-center gap-1 text-foreground">
        {field.label}
        {field.is_required && <span className="text-destructive text-xs">*</span>}
      </Label>
      {field.help_text && (
        <p className="text-[10px] text-muted-foreground mb-1">{field.help_text}</p>
      )}
      {renderInput()}
    </div>
  );
}

/* ── Main Canvas ── */
export function BuilderCanvas({
  sections, selectedFieldId, selectedSectionId,
  onSelectField, onSelectSection, onAddSection,
  onToggleFieldRequired, onToggleFieldActive, onToggleSectionActive,
  onMoveSection, onMoveField, onDropNewField, onDropNewBlock, templateTitle,
}: BuilderCanvasProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(sections.map((s) => s.id))
  );
  const [dropTarget, setDropTarget] = useState<{ sectionId: string; index: number } | null>(null);
  const [draggingFieldId, setDraggingFieldId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      sections.forEach(s => next.add(s.id));
      return next;
    });
  }, [sections.length]);

  const toggleExpand = (id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleAutoScroll = useCallback((clientY: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const edge = 60;
    if (clientY - rect.top < edge) el.scrollTop -= 10;
    else if (rect.bottom - clientY < edge) el.scrollTop += 10;
  }, []);

  /* Compute drop index from cursor Y relative to field elements in the drop zone */
  const computeDropIndex = useCallback((e: React.DragEvent, containerEl: HTMLElement, fields: any[]): number => {
    const fieldEls = containerEl.querySelectorAll('[data-field-idx]');
    for (let i = 0; i < fieldEls.length; i++) {
      const rect = fieldEls[i].getBoundingClientRect();
      if (e.clientY < rect.top + rect.height * 0.5) return i;
    }
    return fields.length;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, sectionId: string, fields: any[]) => {
    e.preventDefault();
    e.stopPropagation();
    handleAutoScroll(e.clientY);
    const isNew = e.dataTransfer.types.includes("order-field-type");
    const isBlock = e.dataTransfer.types.includes("order-block-data");
    const isMove = e.dataTransfer.types.includes("move-field");
    if (!isNew && !isMove && !isBlock) return;
    e.dataTransfer.dropEffect = isMove ? "move" : "copy";
    const idx = computeDropIndex(e, e.currentTarget as HTMLElement, fields);
    setDropTarget(prev => {
      if (prev?.sectionId === sectionId && prev?.index === idx) return prev;
      return { sectionId, index: idx };
    });
  }, [handleAutoScroll, computeDropIndex]);

  const handleDrop = useCallback((e: React.DragEvent, sectionId: string, fields: any[]) => {
    e.preventDefault();
    e.stopPropagation();
    const idx = dropTarget?.sectionId === sectionId ? dropTarget.index : fields.length;
    setDropTarget(null);
    setDraggingFieldId(null);

    const newType = e.dataTransfer.getData("order-field-type") as OrderFormFieldType;
    if (newType) {
      const presetRaw = e.dataTransfer.getData("order-preset-data");
      const preset: PresetData | undefined = presetRaw ? JSON.parse(presetRaw) : undefined;
      onDropNewField(newType, sectionId, idx, preset);
      return;
    }

    const blockRaw = e.dataTransfer.getData("order-block-data");
    if (blockRaw) {
      const block: BlockData = JSON.parse(blockRaw);
      onDropNewBlock(block, sectionId, idx);
      return;
    }

    const moveData = e.dataTransfer.getData("move-field");
    if (moveData) {
      const { fieldId, fromSectionId } = JSON.parse(moveData);
      onMoveField(fieldId, fromSectionId, sectionId, idx);
    }
  }, [dropTarget, onDropNewBlock, onDropNewField, onMoveField]);

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto bg-muted/20">
      <div className="max-w-4xl mx-auto pt-6 pb-12 px-6">
        {/* Form title */}
        <div className="text-center mb-6">
          <h2 className="text-lg font-bold text-foreground">{templateTitle || "Nytt skjema"}</h2>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {sections.filter(s => s.is_active !== false).length} seksjoner · {sections.reduce((n: number, s: any) => n + (s.fields?.filter((f: any) => f.is_active !== false)?.length || 0), 0)} felt
          </p>
        </div>

        {/* Sections rendered as form cards */}
        <div className="space-y-6">
          {sections.map((section, sIdx) => {
            const isExpanded = expandedSections.has(section.id);
            const isSelected = selectedSectionId === section.id && !selectedFieldId;
            const fields: any[] = section.fields || [];
            const activeFields = fields.filter((f: any) => f.is_active !== false);

            return (
              <div
                key={section.id}
                className={`rounded-3xl border bg-card transition-all ${
                  isSelected ? "border-primary ring-2 ring-primary/10 shadow-[var(--shadow-card)]" : "border-border/40 shadow-sm"
                } ${section.is_active === false ? "opacity-40" : ""}`}
                onClick={(e) => { e.stopPropagation(); onSelectSection(section.id); }}
              >
                {/* Section header — compact, clean */}
                <div className="flex items-center gap-2 px-6 py-4 border-b border-border/20 bg-muted/20 rounded-t-3xl">
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleExpand(section.id); }}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                  <h3 className="text-sm font-semibold flex-1 truncate">{section.title}</h3>
                  {section.description && (
                    <span className="text-[10px] text-muted-foreground truncate max-w-[140px] hidden lg:block">{section.description}</span>
                  )}
                  <Badge variant="outline" className="text-[10px] font-normal shrink-0">{activeFields.length} felt</Badge>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      disabled={sIdx === 0}
                      onClick={(e) => { e.stopPropagation(); onMoveSection(sIdx, sIdx - 1); }}
                      className="p-1 rounded hover:bg-muted disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                      title="Flytt opp"
                    >
                      <ArrowUp className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                    <button
                      disabled={sIdx === sections.length - 1}
                      onClick={(e) => { e.stopPropagation(); onMoveSection(sIdx, sIdx + 1); }}
                      className="p-1 rounded hover:bg-muted disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                      title="Flytt ned"
                    >
                      <ArrowDown className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  </div>
                  <Switch
                    checked={section.is_active !== false}
                    onCheckedChange={(v) => onToggleSectionActive(section.id, v)}
                    className="scale-75"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>

                {/* Field area */}
                {isExpanded && (
                  <div
                    className={`px-6 py-5 transition-colors min-h-[120px] ${
                      dropTarget?.sectionId === section.id ? "bg-primary/[0.04]" : ""
                    }`}
                    onDragOver={(e) => handleDragOver(e, section.id, fields)}
                    onDrop={(e) => handleDrop(e, section.id, fields)}
                    onDragLeave={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null);
                    }}
                  >
                    {fields.length === 0 ? (
                      <div
                          className={`rounded-2xl border-2 border-dashed p-10 text-center transition-all ${
                          dropTarget?.sectionId === section.id
                              ? "border-primary bg-primary/5 shadow-sm"
                            : "border-border/30 hover:border-border/50"
                        }`}
                      >
                        <Plus className="h-5 w-5 text-muted-foreground/30 mx-auto mb-1.5" />
                        <p className="text-xs text-muted-foreground">
                          Dra felt hit, eller klikk på et felt i biblioteket
                        </p>
                      </div>
                    ) : (
                        <div className="space-y-4">
                        {groupFieldsIntoRows(fields).map((row, rIdx) => (
                          <div key={rIdx}>
                            {/* Drop indicator line */}
                            {dropTarget?.sectionId === section.id && dropTarget.index === row.startIndex && (
                                <div className="rounded-2xl border-2 border-dashed border-primary bg-primary/5 px-4 py-3 mb-3 text-xs text-primary font-medium animate-pulse">
                                  Slipp her i {section.title}
                                </div>
                            )}

                            <div className="flex flex-wrap gap-3">
                              {row.fields.map((field: any, fIdx: number) => {
                                const globalIdx = row.startIndex + fIdx;
                                const isFieldSelected = selectedFieldId === field.id;
                                const fw = field.field_width || "full";
                                const isDragging = draggingFieldId === field.id;

                                return (
                                  <div
                                    key={field.id}
                                    data-field-idx={globalIdx}
                                    className={getWidthStyle(fw)}
                                    style={{ minWidth: 0 }}
                                  >
                                    <div
                                      draggable
                                      onDragStart={(e) => {
                                        e.dataTransfer.setData("move-field", JSON.stringify({ fieldId: field.id, fromSectionId: section.id }));
                                        setDraggingFieldId(field.id);
                                      }}
                                      onDragEnd={() => { setDraggingFieldId(null); setDropTarget(null); }}
                                      onClick={(e) => { e.stopPropagation(); onSelectField(field.id, section.id); }}
                                      className={`relative rounded-2xl px-4 py-3 transition-all group bg-background/80 ${
                                        isFieldSelected
                                          ? "ring-2 ring-primary/30 bg-primary/[0.03] border border-primary/20 shadow-sm"
                                          : "border border-border/30 hover:border-border/60 hover:bg-muted/20"
                                      } ${!field.is_active ? "opacity-25" : ""} ${
                                        isDragging ? "opacity-20 scale-95" : ""
                                      } cursor-grab active:cursor-grabbing`}
                                    >
                                      {/* Hover actions */}
                                      <div className={`absolute -top-2 -right-1 flex items-center gap-0.5 z-10 transition-opacity ${
                                        isFieldSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                                      }`}>
                                        <div className="flex items-center bg-card border border-border/60 rounded-md shadow-sm px-1 py-0.5">
                                          <GripVertical className="h-3 w-3 text-muted-foreground/50" />
                                          {fw !== "full" && (
                                            <span className="text-[8px] text-muted-foreground font-medium ml-0.5">
                                              {fw === "half" ? "50%" : fw === "third" ? "33%" : "66%"}
                                            </span>
                                          )}
                                          <button
                                            className="p-0.5 hover:bg-muted rounded ml-0.5"
                                            onClick={(e) => { e.stopPropagation(); onToggleFieldActive(field.id, !field.is_active); }}
                                          >
                                            {field.is_active !== false
                                              ? <Eye className="h-2.5 w-2.5 text-muted-foreground/50" />
                                              : <EyeOff className="h-2.5 w-2.5 text-muted-foreground/50" />
                                            }
                                          </button>
                                        </div>
                                      </div>

                                      {/* WYSIWYG field */}
                                      <FieldPreviewInline field={field} />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}

                        {/* Drop indicator after last field */}
                        {dropTarget?.sectionId === section.id && dropTarget.index >= fields.length && (
                          <div className="rounded-2xl border-2 border-dashed border-primary bg-primary/5 px-4 py-3 mt-2 text-xs text-primary font-medium animate-pulse">
                            Slipp nederst i {section.title}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          <Button
            variant="outline" size="sm"
            className="w-full text-xs h-10 rounded-xl border-dashed border-2 border-border/40 text-muted-foreground hover:border-primary/30 hover:text-primary"
            onClick={onAddSection}
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Legg til seksjon
          </Button>
        </div>
      </div>
    </div>
  );
}
