import { activeIdentity } from "./job-outlook-pilot-selector.ts";
import { osloDate } from "./job-outlook-app-core.ts";
import { type DailyScope, type DailyStore, type DailyOperation, type DailyCopy } from "./central-calendar-lifecycle.ts";

export const MANUAL_LINK_CUTOFF = "2026-11-19T15:00:00Z";
const checked = (r: any) => { if (r.error) throw new Error("authoritative_daily_read_failed"); return r.data; };
/** Adapter for the private daily journal; never touches old intent queues, jobs or approvals. */
export function centralCalendarStore(db: any, s: DailyScope, version: string | null): DailyStore {
  const exact = (q: any) => q.eq("event_id", s.eventId).eq("technician_id", s.technicianId).eq("company_id", s.companyId).eq("mailbox", s.mailbox).eq("work_date", s.workDate);
  return {
    async unresolved() {
      const r = checked(await exact(db.from("job_calendar_daily_operations").select("*")).in("state", ["claimed", "accepted", "uncertain"]).maybeSingle());
      // Operations accepted before the verification fix are linked only by an explicit operator click.
      return r ? { id: r.id, state: r.state, kind: r.kind, payload: r.payload, graphId: r.graph_event_id, manualOnly: Date.parse(r.created_at) < Date.parse(MANUAL_LINK_CUTOFF) } as DailyOperation : null;
    },
    async live(kind) {
      const job = checked(await db.from("events").select("company_id,status,deleted_at").eq("id", s.eventId).maybeSingle());
      if (!job || job.company_id !== s.companyId) return false;
      const tech = checked(await db.from("technicians").select("user_id,email,archived_at,deleted_at").eq("id", s.technicianId).maybeSingle());
      if (!tech || tech.email?.trim().toLowerCase() !== s.mailbox) return false;
      const account = checked(await db.from("user_accounts").select("person_id").eq("auth_user_id", tech.user_id).eq("is_active", true).maybeSingle());
      const person = account ? checked(await db.from("people").select("is_active").eq("id", account.person_id).maybeSingle()) : null;
      const employed = account ? checked(await db.from("employment_profiles").select("person_id").eq("person_id", account.person_id).eq("company_id", s.companyId).eq("relationship_type", "employee").is("archived_at", null).limit(1)) : [];
      if (!activeIdentity({ technician_id: s.technicianId, mailbox: s.mailbox, archived: !!tech.archived_at, deleted: !!tech.deleted_at, account_active: !!account, person_active: person?.is_active === true, employed_in_company: employed.length > 0 })) return false;
      const assignment = checked(await db.from("event_technicians").select("technician_id").eq("event_id", s.eventId).eq("technician_id", s.technicianId).maybeSingle());
      const blocks = checked(await db.from("schedule_blocks").select("start_at,end_at").eq("project_id", s.eventId).eq("company_id", s.companyId).eq("technician_id", s.technicianId).eq("source", "manual").is("deleted_at", null));
      const day = blocks.filter((b: any) => osloDate(b.start_at) === s.workDate);
      const cancelled = !!job.deleted_at || ["cancelled", "archived"].includes(job.status);
      // Individual rejection never authorizes deletion; only absent real assignment/day or explicit cancellation.
      if (kind === "delete") return cancelled || !assignment || day.length === 0;
      return !cancelled && !!assignment && day.length === 1 && Date.parse(day[0].start_at) === Date.parse(s.start) && Date.parse(day[0].end_at) === Date.parse(s.end);
    },
    async claim(kind, key, payload, copy) {
      const r = checked(await db.rpc("claim_central_calendar_day", { _key: key, _event: s.eventId, _tech: s.technicianId, _company: s.companyId, _mailbox: s.mailbox, _day: s.workDate, _kind: kind, _start: s.start, _end: s.end, _payload: payload, _graph_id: copy?.id ?? null, _change_key: copy?.changeKey ?? null }));
      return typeof r === "string" ? r : null;
    },
    async receipt(id, state, http, graphId, changeKey) {
      checked(await exact(db.from("job_calendar_daily_operations").update({ state, http_status: http, graph_event_id: graphId, graph_change_key: changeKey, finished_at: ["verified", "rejected", "conflict"].includes(state) ? new Date().toISOString() : null, ...(state === "verified" ? { verification_source: "automatic_readback" } : {}) })).eq("id", id));
    },
    async saveCopy(copy: DailyCopy | null, deleted: boolean) {
      const r = await db.from("job_outlook_app_links").upsert({ event_id: s.eventId, technician_id: s.technicianId, company_id: s.companyId, mailbox: s.mailbox, work_date: s.workDate, dedup_key: s.key, state: deleted ? "deleted" : "synced", outlook_event_id: copy?.id ?? null, outlook_change_key: copy?.changeKey ?? null, hub_version: version, updated_at: new Date().toISOString() }, { onConflict: "dedup_key" });
      checked(r);
      // Journal and app mapping are authoritative for central days. No legacy receipt is fabricated.
    },
  };
}