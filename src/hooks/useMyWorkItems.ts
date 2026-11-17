import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface WorkItem {
  kind: "order" | "job";
  id: string;
  number: string;
  title: string;
  customer: string | null;
  status: string;
  statusLabel: string;
  date: string | null;
  href: string;
}

const ORDER_STATUS_LABEL: Record<string, string> = {
  new: "Ny bestilling",
  submitted: "Ny bestilling",
  under_review: "Til vurdering",
  in_review: "Til vurdering",
  waiting_internal: "Avventer internt",
  needs_info: "Trenger info",
  task_created: "Oppgave opprettet",
  closed: "Avsluttet",
};

const JOB_STATUS_LABEL: Record<string, string> = {
  requested: "Forespurt",
  approved: "Godkjent",
  time_change_proposed: "Tidsendring foreslått",
  scheduled: "Planlagt",
  in_progress: "Pågår",
  completed: "Ferdig",
  ready_for_invoicing: "Klar for faktura",
  invoiced: "Fakturert",
};

const normalizeText = (value: unknown, fallback: string | null = null): string | null => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") return value || fallback;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const preferred =
      record.firmanavn ??
      record.kontaktperson_kunde ??
      record.bestiller_navn ??
      record.submitter_name ??
      record.name ??
      record.title ??
      record.summary ??
      record.oppdragssted ??
      record.adresse;
    return normalizeText(preferred, fallback);
  }
  return fallback;
};

export function useMyWorkItems(limit = 6) {
  const { user, isAdmin } = useAuth();
  const [items, setItems] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setItems([]);
      setLoading(false);
      return;
    }

    async function load() {
      setLoading(true);
      const isInternal = isAdmin || user!.role === "montør";

      // Orders: internal sees newest open; non-internal sees own submissions
      const ordersBase = supabase
        .from("order_form_submissions")
        .select("id, submission_no, summary, status, created_at, submitter_name, linked_project_id")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(limit);

      const ordersQ = isInternal
        ? ordersBase.in("status", ["new", "submitted", "under_review", "waiting_internal", "needs_info"])
        : ordersBase.eq("submitter_user_id", user!.id);

      // Jobs: internal sees active/scheduled recent; non-internal skips
      const jobsQ = isInternal
        ? supabase
            .from("events")
            .select("id, title, customer, status, start_time, internal_number, job_number, project_number")
            .is("deleted_at", null)
            .in("status", ["requested", "approved", "scheduled", "in_progress", "time_change_proposed", "rejected"])
            .order("start_time", { ascending: true, nullsFirst: false })
            .limit(limit)
        : Promise.resolve({ data: [] as Record<string, unknown>[] });

      const [ordersRes, jobsRes] = await Promise.all([ordersQ, jobsQ]);
      if (cancelled) return;

      const orderRows = (ordersRes.data || []) as Record<string, unknown>[];
      const orderItems: WorkItem[] = orderRows.map((o) => ({
        kind: "order",
        id: String(o.id),
        number: o.submission_no ? `BST-${normalizeText(o.submission_no, "")}` : "Bestilling",
        title: normalizeText(o.summary, "Servicebestilling") || "Servicebestilling",
        customer: normalizeText(o.submitter_name),
        status: normalizeText(o.status, "") || "",
        statusLabel: ORDER_STATUS_LABEL[normalizeText(o.status, "") || ""] || normalizeText(o.status, "Ukjent status") || "Ukjent status",
        date: normalizeText(o.created_at),
        href: `/orders/${o.id}`,
      }));

      const jobRows = ((jobsRes as { data?: unknown[] }).data || []) as Record<string, unknown>[];
      const jobItems: WorkItem[] = jobRows.map((e) => ({
        kind: "job",
        id: String(e.id),
        number: normalizeText(e.job_number || e.internal_number || e.project_number, "Jobb") || "Jobb",
        title: normalizeText(e.title, "Servicejobb") || "Servicejobb",
        customer: normalizeText(e.customer),
        status: normalizeText(e.status, "") || "",
        statusLabel: JOB_STATUS_LABEL[normalizeText(e.status, "") || ""] || normalizeText(e.status, "Ukjent status") || "Ukjent status",
        date: normalizeText(e.start_time),
        href: `/projects/${e.id}`,
      }));

      // Merge, sort by date desc, cap to limit
      const merged = [...orderItems, ...jobItems]
        .sort((a, b) => {
          const da = a.date ? new Date(a.date).getTime() : 0;
          const db = b.date ? new Date(b.date).getTime() : 0;
          return db - da;
        })
        .slice(0, limit);

      setItems(merged);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [user, isAdmin, limit]);

  return { items, loading };
}
