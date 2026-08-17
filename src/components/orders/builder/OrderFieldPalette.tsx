import { useState } from "react";
import {
  Type, AlignLeft, Hash, Calendar, Clock, Mail, Phone, MapPin, Building2,
  ChevronDown, CircleDot, CheckSquare, ListChecks, Upload, Image, Search,
  Users, FolderSearch, UserSearch, Info, Heading, Timer, Package, FileCheck,
  Blocks, User, FileText, Receipt, ClipboardList, BadgeDollarSign,
  Star, Columns2, Columns3, LayoutGrid,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { OrderFormFieldType } from "@/types/order-forms";

export const FIELD_ICONS: Record<OrderFormFieldType, React.ElementType> = {
  short_text: Type,
  long_text: AlignLeft,
  number: Hash,
  date: Calendar,
  time: Clock,
  time_window: Timer,
  email: Mail,
  phone: Phone,
  address: MapPin,
  org_number: Building2,
  dropdown: ChevronDown,
  multi_select: ListChecks,
  yes_no: CheckSquare,
  checkbox_list: ListChecks,
  radio: CircleDot,
  pricing_model: BadgeDollarSign,
  file_upload: Upload,
  image_upload: Image,
  customer_lookup: UserSearch,
  project_lookup: FolderSearch,
  user_lookup: Users,
  info_box: Info,
  section_header: Heading,
};

// ── Business Presets ──

export interface BusinessPreset {
  id: string;
  label: string;
  icon: React.ElementType;
  fieldType: OrderFormFieldType;
  fieldKey: string;
  helpText?: string;
  options?: string[];
  isRequired?: boolean;
  fieldWidth?: string;
}

const BUSINESS_PRESETS: BusinessPreset[] = [
  // ── Bestiller (primærkilde for oppdateringsmottaker) ──
  { id: "bestiller_navn", label: "Bestiller – Navn", icon: Star, fieldType: "short_text", fieldKey: "bestiller_navn", helpText: "Navn på personen som bestiller", isRequired: true, fieldWidth: "half" },
  { id: "bestiller_epost", label: "Bestiller – E-post", icon: Mail, fieldType: "email", fieldKey: "bestiller_epost", helpText: "E-post til bestiller (mottar oppdateringer)", isRequired: true, fieldWidth: "half" },
  { id: "bestiller_telefon", label: "Bestiller – Telefon", icon: Phone, fieldType: "phone", fieldKey: "bestiller_telefon", helpText: "Telefonnummer til bestiller", fieldWidth: "half" },
  // ── Kunde og firma ──
  { id: "firmanavn", label: "Firmanavn", icon: Building2, fieldType: "short_text", fieldKey: "firmanavn", helpText: "Navn på firma / kunde", fieldWidth: "half" },
  { id: "kontaktperson", label: "Kontaktperson", icon: User, fieldType: "short_text", fieldKey: "kontaktperson", helpText: "Navn på kontaktperson hos kunde", fieldWidth: "half" },
  { id: "epost_kunde", label: "E-post kunde", icon: Mail, fieldType: "email", fieldKey: "epost_kunde", helpText: "E-postadresse til kontaktperson", fieldWidth: "half" },
  { id: "telefon_kunde", label: "Telefon kunde", icon: Phone, fieldType: "phone", fieldKey: "telefon_kunde", helpText: "Telefonnummer til kontaktperson", fieldWidth: "half" },
  { id: "fakturamottaker", label: "Fakturamottaker", icon: Receipt, fieldType: "short_text", fieldKey: "fakturamottaker", helpText: "Hvem skal motta faktura?", fieldWidth: "half" },
  { id: "fakturaadresse", label: "Fakturaadresse", icon: MapPin, fieldType: "address", fieldKey: "fakturaadresse", helpText: "Adresse for fakturering" },
  { id: "fakturamerking", label: "Fakturamerking / PO", icon: FileText, fieldType: "short_text", fieldKey: "fakturamerking", helpText: "PO-nummer, referanse eller annen fakturamerking", fieldWidth: "half" },
  { id: "oppdragssted", label: "Oppdragssted", icon: MapPin, fieldType: "short_text", fieldKey: "oppdragssted", helpText: "Navn på anlegg eller oppdragssted", isRequired: true },
  { id: "anleggsadresse", label: "Anleggsadresse", icon: MapPin, fieldType: "address", fieldKey: "anleggsadresse", helpText: "Adresse der arbeidet skal utføres", isRequired: true },
  { id: "referanse_po", label: "Referanse / PO", icon: FileText, fieldType: "short_text", fieldKey: "referanse_po", helpText: "Innkjøpsordrenummer, prosjektreferanse eller intern referanse", fieldWidth: "half" },
  { id: "arbeidsbeskrivelse", label: "Arbeidsbeskrivelse", icon: ClipboardList, fieldType: "long_text", fieldKey: "arbeidsbeskrivelse", helpText: "Beskriv hva som skal utføres så detaljert som mulig", isRequired: true },
  { id: "materialansvar", label: "Materialansvar", icon: Package, fieldType: "radio", fieldKey: "materialansvar", helpText: "Angi hvem som skaffer materiell", options: ["Service skaffer alt", "Bestiller leverer alt", "Deles mellom partene"], isRequired: true },
  { id: "oensket_dato", label: "Ønsket utført dato", icon: Calendar, fieldType: "date", fieldKey: "oensket_dato", helpText: "Når ønsker du at arbeidet skal utføres?", fieldWidth: "half" },
];

export function getPresetById(presetId: string): BusinessPreset | undefined {
  return BUSINESS_PRESETS.find(p => p.id === presetId);
}

// ── Field Blocks ──

export interface FieldBlock {
  id: string;
  label: string;
  icon: React.ElementType;
  description: string;
  previewLayout: string; // e.g. "2-col", "full"
  fields: { label: string; type: OrderFormFieldType; field_key: string; is_required?: boolean; help_text?: string; options?: string[]; field_width?: string }[];
}

export type FieldBlockInsert = Pick<FieldBlock, "id" | "label" | "description" | "previewLayout" | "fields">;

const FIELD_BLOCKS: FieldBlock[] = [
  {
    id: "bestiller_blokk", label: "Bestiller", icon: Star,
    description: "Navn, e-post og telefon til bestiller – primærkilde for oppdateringer",
    previewLayout: "2-col",
    fields: [
      { label: "Bestiller – Navn", type: "short_text", field_key: "bestiller_navn", is_required: true, help_text: "Navn på personen som bestiller", field_width: "full" },
      { label: "Bestiller – E-post", type: "email", field_key: "bestiller_epost", is_required: true, help_text: "Denne e-postadressen mottar oppdateringer om bestillingen", field_width: "half" },
      { label: "Bestiller – Telefon", type: "phone", field_key: "bestiller_telefon", help_text: "Telefonnummer til bestiller", field_width: "half" },
    ],
  },
  {
    id: "customer_info", label: "Kundeinformasjon", icon: UserSearch,
    description: "Firmanavn, org.nr, kontakt, telefon, e-post",
    previewLayout: "2-col",
    fields: [
      { label: "Firmanavn", type: "short_text", field_key: "firmanavn", is_required: true, help_text: "Navn på firma / kunde", field_width: "half" },
      { label: "Org.nr", type: "org_number", field_key: "org_nr", help_text: "Organisasjonsnummer", field_width: "half" },
      { label: "Kontaktperson", type: "short_text", field_key: "kontaktperson_kunde", help_text: "Navn på kontaktperson hos kunde", field_width: "half" },
      { label: "E-post kunde", type: "email", field_key: "epost_kunde", help_text: "E-postadresse til kontaktperson", field_width: "half" },
      { label: "Telefon kunde", type: "phone", field_key: "telefon_kunde", help_text: "Telefonnummer til kontaktperson", field_width: "half" },
    ],
  },
  {
    id: "faktura_info", label: "Fakturainformasjon", icon: Receipt,
    description: "Fakturamottaker, fakturaadresse, PO",
    previewLayout: "2-col",
    fields: [
      { label: "Fakturamottaker", type: "short_text", field_key: "fakturamottaker", help_text: "Hvem skal motta faktura?", field_width: "half" },
      { label: "Fakturamerking / PO", type: "short_text", field_key: "fakturamerking", help_text: "PO-nummer, referanse eller annen merking", field_width: "half" },
      { label: "Fakturaadresse", type: "address", field_key: "fakturaadresse", help_text: "Adresse for fakturering" },
    ],
  },
  {
    id: "order_location", label: "Oppdragssted", icon: MapPin,
    description: "Oppdragssted og anleggsadresse",
    previewLayout: "full",
    fields: [
      { label: "Oppdragssted", type: "short_text", field_key: "oppdragssted", is_required: true, help_text: "Navn på anlegg eller oppdragssted" },
      { label: "Anleggsadresse", type: "address", field_key: "anleggsadresse", is_required: true, help_text: "Adresse der arbeidet skal utføres" },
    ],
  },
  {
    id: "kontaktperson_blokk", label: "Kontaktperson", icon: User,
    description: "Kontaktperson med telefon og e-post",
    previewLayout: "2-col",
    fields: [
      { label: "Kontaktperson", type: "short_text", field_key: "kontaktperson", is_required: true, help_text: "Navn på kontaktperson", field_width: "half" },
      { label: "Telefon", type: "phone", field_key: "kontakt_telefon", help_text: "Telefonnummer", field_width: "half" },
      { label: "E-post", type: "email", field_key: "kontakt_epost", help_text: "E-postadresse" },
    ],
  },
  {
    id: "referanse_po_blokk", label: "Referanse og PO", icon: FileText,
    description: "PO-nummer og referanser",
    previewLayout: "2-col",
    fields: [
      { label: "PO / Innkjøpsordre", type: "short_text", field_key: "po_nummer", help_text: "Innkjøpsordrenummer fra kunde", field_width: "half" },
      { label: "Midlertidig referanse", type: "short_text", field_key: "midlertidig_referanse", help_text: "Bruk dette dersom PO ikke er klar ennå", field_width: "half" },
      { label: "Intern referanse", type: "short_text", field_key: "intern_referanse", help_text: "Eventuell intern referanse" },
    ],
  },
  {
    id: "material_responsibility", label: "Material og ansvar", icon: Package,
    description: "Hvem skaffer materiell og hva som trengs",
    previewLayout: "full",
    fields: [
      { label: "Hvem skaffer materiell?", type: "radio", field_key: "materialansvar", is_required: true, options: ["Service skaffer alt", "Bestiller leverer alt", "Deles mellom partene"], help_text: "Angi tydelig materialansvar" },
      { label: "Hva leverer bestiller / kunde?", type: "long_text", field_key: "hva_leverer_bestiller", help_text: "Beskriv hva bestiller/kunde leverer av materiell" },
      { label: "Hva må service skaffe?", type: "long_text", field_key: "hva_skaffer_service", help_text: "Beskriv hva service må skaffe" },
    ],
  },
  {
    id: "attachments_pack", label: "Vedleggspakke", icon: Upload,
    description: "Tegninger, bilder, materialliste, FDV",
    previewLayout: "2-col",
    fields: [
      { label: "Tegninger", type: "file_upload", field_key: "vedlegg_tegninger", help_text: "Last opp reviderte tegninger", field_width: "half" },
      { label: "Bilder", type: "image_upload", field_key: "vedlegg_bilder", help_text: "Last opp relevante bilder fra anlegget", field_width: "half" },
      { label: "Materialliste", type: "file_upload", field_key: "vedlegg_materialliste", help_text: "Last opp materialliste hvis tilgjengelig", field_width: "half" },
      { label: "FDV-dokumentasjon", type: "file_upload", field_key: "vedlegg_fdv", help_text: "Last opp FDV-dokumentasjon", field_width: "half" },
    ],
  },
  {
    id: "intern_kontroll", label: "Intern kontroll", icon: FileCheck,
    description: "Sjekkliste for kvalitetskontroll",
    previewLayout: "2-col",
    fields: [
      { label: "Kundeinfo er kontrollert", type: "yes_no", field_key: "kundeinfo_kontrollert", field_width: "half" },
      { label: "Anleggsadresse er kontrollert", type: "yes_no", field_key: "anleggsadresse_kontrollert", field_width: "half" },
      { label: "Tegninger er vedlagt eller vurdert", type: "yes_no", field_key: "tegninger_vurdert", field_width: "half" },
      { label: "Materialbehov er avklart", type: "yes_no", field_key: "materialbehov_avklart", field_width: "half" },
      { label: "PO / referanse er avklart", type: "yes_no", field_key: "po_avklart", field_width: "half" },
      { label: "Bestillingen er klar for planlegging", type: "yes_no", field_key: "klar_for_planlegging", field_width: "half" },
    ],
  },
];

// ── Generic field types (shown under "Avansert") ──

interface GenericFieldDef {
  type: OrderFormFieldType;
  label: string;
  description: string;
  icon: React.ElementType;
}

const GENERIC_FIELDS: GenericFieldDef[] = [
  { type: "short_text", label: "Kort tekst", description: "Enkel tekstlinje", icon: Type },
  { type: "long_text", label: "Lang tekst", description: "Flerlinjes tekstfelt", icon: AlignLeft },
  { type: "number", label: "Tall", description: "Numerisk verdi", icon: Hash },
  { type: "date", label: "Dato", description: "Datovelger", icon: Calendar },
  { type: "time", label: "Klokkeslett", description: "Tidspunkt", icon: Clock },
  { type: "time_window", label: "Tidsvindu", description: "Fra–til tidspunkt", icon: Timer },
  { type: "email", label: "E-post", description: "E-postadresse", icon: Mail },
  { type: "phone", label: "Telefon", description: "Telefonnummer", icon: Phone },
  { type: "address", label: "Adresse", description: "Full adresse", icon: MapPin },
  { type: "org_number", label: "Org.nr", description: "Organisasjonsnummer", icon: Building2 },
  { type: "dropdown", label: "Nedtrekksliste", description: "Velg ett alternativ", icon: ChevronDown },
  { type: "radio", label: "Radioknapper", description: "Velg ett synlig valg", icon: CircleDot },
  { type: "yes_no", label: "Ja / Nei", description: "Enkelt ja/nei", icon: CheckSquare },
  { type: "checkbox_list", label: "Sjekkliste", description: "Huk av flere", icon: ListChecks },
  { type: "multi_select", label: "Flervalg", description: "Velg flere fra liste", icon: ListChecks },
  { type: "file_upload", label: "Filopplasting", description: "PDF, XLSX m.m.", icon: Upload },
  { type: "image_upload", label: "Bildeopplasting", description: "JPG, PNG bilder", icon: Image },
  { type: "customer_lookup", label: "Kundeoppslag", description: "Søk eksisterende kunde", icon: UserSearch },
  { type: "project_lookup", label: "Prosjektoppslag", description: "Koble til prosjekt", icon: FolderSearch },
  { type: "user_lookup", label: "Brukeroppslag", description: "Velg intern bruker", icon: Users },
  { type: "section_header", label: "Overskrift", description: "Visuell gruppering", icon: Heading },
  { type: "info_box", label: "Infoboks", description: "Hjelpetekst til utfyller", icon: Info },
];

// ── Component ──

export interface OrderFieldPaletteProps {
  onAddField: (type: OrderFormFieldType, sectionId: string, preset?: { label: string; fieldKey: string; helpText?: string; options?: string[]; isRequired?: boolean; fieldWidth?: string }) => void;
  onAddBlock: (block: FieldBlockInsert, sectionId: string) => void;
  activeSectionId: string | null;
}

function FieldTile({
  icon: Icon, label, description, disabled, draggable: isDraggable, onDragStart, onClick,
}: {
  icon: React.ElementType; label: string; description?: string;
  disabled?: boolean; draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void; onClick?: () => void;
}) {
  return (
    <button
      draggable={isDraggable}
      onDragStart={onDragStart}
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-start gap-2.5 rounded-xl border border-border/60 bg-card px-3 py-2.5 text-left hover:border-primary/30 hover:shadow-sm hover:bg-primary/[0.02] transition-all cursor-grab active:cursor-grabbing active:scale-[0.98] select-none disabled:opacity-30 disabled:cursor-not-allowed"
    >
      <div className="h-8 w-8 rounded-lg bg-muted/50 flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="h-4 w-4 text-primary/70" />
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-xs font-medium block truncate">{label}</span>
        {description && (
          <span className="text-[10px] text-muted-foreground block truncate leading-tight mt-0.5">{description}</span>
        )}
      </div>
    </button>
  );
}

function BlockTile({
  block, disabled, draggable: isDraggable, onDragStart, onClick,
}: {
  block: FieldBlock; disabled?: boolean; draggable?: boolean; onDragStart?: (e: React.DragEvent) => void; onClick?: () => void;
}) {
  const Icon = block.icon;
  return (
    <button
      draggable={isDraggable}
      onDragStart={onDragStart}
      onClick={onClick}
      disabled={disabled}
      className="w-full rounded-xl border border-border/60 bg-card px-3 py-3 text-left hover:border-primary/30 hover:shadow-sm hover:bg-primary/[0.02] transition-all select-none cursor-grab active:cursor-grabbing active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed"
    >
      <div className="flex items-start gap-2.5">
        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-xs font-medium block">{block.label}</span>
          <span className="text-[10px] text-muted-foreground block leading-tight mt-0.5">{block.description}</span>
        </div>
        <Badge variant="outline" className="text-[9px] shrink-0 mt-0.5">{block.fields.length} felt</Badge>
      </div>
      {/* Mini layout preview */}
      <div className="mt-2 flex flex-wrap gap-1">
        {block.fields.slice(0, 6).map((f, i) => (
          <div
            key={i}
            className={`h-1.5 rounded-full bg-muted-foreground/15 ${
              f.field_width === "half" ? "w-[calc(50%-2px)]" : f.field_width === "third" ? "w-[calc(33%-2px)]" : "w-full"
            }`}
          />
        ))}
      </div>
    </button>
  );
}

export function OrderFieldPalette({ onAddField, onAddBlock, activeSectionId }: OrderFieldPaletteProps) {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"business" | "blocks" | "advanced">("business");
  const q = search.toLowerCase();

  const filteredPresets = BUSINESS_PRESETS.filter(
    p => !q || p.label.toLowerCase().includes(q) || (p.helpText?.toLowerCase().includes(q))
  );

  const filteredGeneric = GENERIC_FIELDS.filter(
    f => !q || f.label.toLowerCase().includes(q) || f.description.toLowerCase().includes(q)
  );

  const filteredBlocks = FIELD_BLOCKS.filter(
    b => !q || b.label.toLowerCase().includes(q) || b.description.toLowerCase().includes(q)
  );

  const handlePresetClick = (preset: BusinessPreset) => {
    if (!activeSectionId) return;
    onAddField(preset.fieldType, activeSectionId, {
      label: preset.label, fieldKey: preset.fieldKey,
        helpText: preset.helpText, options: preset.options, isRequired: preset.isRequired, fieldWidth: preset.fieldWidth,
    });
  };

  const handleGenericClick = (type: OrderFormFieldType) => {
    if (!activeSectionId) return;
    onAddField(type, activeSectionId);
  };

  const noSection = !activeSectionId;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-3 border-b border-border space-y-2">
        <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Feltbibliotek</h3>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Søk felt..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8 text-xs" />
        </div>
        <div className="flex gap-1">
          {([
            { key: "business" as const, label: "Felt", icon: Star },
            { key: "blocks" as const, label: "Blokker", icon: LayoutGrid },
            { key: "advanced" as const, label: "Alle typer", icon: Blocks },
          ]).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 px-2 py-1.5 text-[10px] font-medium rounded-lg transition-colors ${
                tab === t.key ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:bg-muted"
              }`}
            >
              <t.icon className="h-3 w-3 inline mr-0.5 -mt-px" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {noSection && (
        <div className="p-3 text-center">
          <p className="text-[10px] text-muted-foreground">Velg en seksjon i skjemaet for å legge til felt</p>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {tab === "business" && (
          <div className="space-y-1.5">
            {filteredPresets.map((preset) => (
              <FieldTile
                key={preset.id}
                icon={preset.icon}
                label={preset.label}
                description={preset.helpText}
                disabled={noSection}
                draggable={!noSection}
                onDragStart={(e) => {
                  e.dataTransfer.setData("order-field-type", preset.fieldType);
                  e.dataTransfer.setData("order-preset-data", JSON.stringify({
                    label: preset.label, fieldKey: preset.fieldKey,
                    helpText: preset.helpText, options: preset.options, isRequired: preset.isRequired, fieldWidth: preset.fieldWidth,
                  }));
                  e.dataTransfer.effectAllowed = "copy";
                }}
                onClick={() => handlePresetClick(preset)}
              />
            ))}
          </div>
        )}

        {tab === "blocks" && (
          <div className="space-y-2">
            {filteredBlocks.map((block) => (
              <BlockTile
                key={block.id}
                block={block}
                disabled={noSection}
                draggable={!noSection}
                onDragStart={(e) => {
                  e.dataTransfer.setData("order-block-data", JSON.stringify({
                    id: block.id,
                    label: block.label,
                    description: block.description,
                    previewLayout: block.previewLayout,
                    fields: block.fields,
                  }));
                  e.dataTransfer.effectAllowed = "copy";
                }}
                onClick={() => { if (activeSectionId) onAddBlock(block, activeSectionId); }}
              />
            ))}
          </div>
        )}

        {tab === "advanced" && (
          <div className="space-y-1.5">
            {filteredGeneric.map((f) => (
              <FieldTile
                key={f.type}
                icon={f.icon}
                label={f.label}
                description={f.description}
                disabled={noSection}
                draggable={!noSection}
                onDragStart={(e) => {
                  e.dataTransfer.setData("order-field-type", f.type);
                  e.dataTransfer.effectAllowed = "copy";
                }}
                onClick={() => handleGenericClick(f.type)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
