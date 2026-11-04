import { addDays, setHours, setMinutes, startOfWeek, differenceInMinutes } from "date-fns";
import type { JobStatus } from "@/lib/job-status";

// Re-export for backward compat
export type { JobStatus } from "@/lib/job-status";

export interface AttendeeStatus {
  technicianId: string;
  status: JobStatus;
  proposedStart?: Date;
  proposedEnd?: Date;
}

export interface Attachment {
  name: string;
  url: string;
  size?: number;
}

export type AppRole = "super_admin" | "admin" | "montør";

export interface EventLog {
  id: string;
  eventId: string;
  actionType: "created" | "updated" | "cancelled" | "attendee_added" | "attendee_removed" | "status_changed";
  performedBy: string;
  performedByName: string;
  timestamp: Date;
  changeSummary: string;
}

export type OutlookSyncStatus = "not_synced" | "synced" | "partial" | "missing_in_outlook" | "failed" | "cancelled" | "restored";

export interface Job {
  id: string;
  microsoftEventId: string;
  technicianIds: string[];
  attendeeStatuses: AttendeeStatus[];
  title: string;
  customer: string;
  address: string;
  description: string;
  start: Date;
  end: Date;
  status: JobStatus;
  jobNumber?: string | null;
  internalNumber?: string | null;
  projectNumber?: string | null;
  proposedStart?: Date;
  proposedEnd?: Date;
  attachments?: Attachment[];
  createdBy?: string;
  createdByName?: string;
  createdAt?: Date;
  updatedBy?: string;
  updatedByName?: string;
  updatedAt?: Date;
  cancelledBy?: string;
  cancelledByName?: string;
  cancelledAt?: Date;
  editingBy?: string;
  editingByName?: string;
  editingStartedAt?: Date;
  outlookSyncStatus?: OutlookSyncStatus;
  outlookLastSyncedAt?: Date;
  outlookDeletedAt?: Date;
  calendarDirty?: boolean;
  calendarLastSyncedAt?: string | null;
  meetingJoinUrl?: string | null;
  meetingId?: string | null;
  meetingCreatedAt?: Date | null;
}

const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });

export const eventLogs: EventLog[] = [
  { id: "l1", eventId: "j1", actionType: "created", performedBy: "a1", performedByName: "Thomas Berg", timestamp: addDays(weekStart, -1), changeSummary: "Jobb opprettet" },
  { id: "l2", eventId: "j1", actionType: "updated", performedBy: "a2", performedByName: "Øyvind Larsen", timestamp: addDays(weekStart, 0), changeSummary: "Endret tidspunkt fra 08:00-11:00 til 09:00-12:00" },
  { id: "l3", eventId: "j5", actionType: "created", performedBy: "a2", performedByName: "Øyvind Larsen", timestamp: addDays(weekStart, -2), changeSummary: "Jobb opprettet" },
  { id: "l4", eventId: "j5", actionType: "attendee_added", performedBy: "a2", performedByName: "Øyvind Larsen", timestamp: addDays(weekStart, -1), changeSummary: "Kari Olsen lagt til som montør" },
];

export function getEventLogs(eventId: string): EventLog[] {
  return eventLogs.filter((l) => l.eventId === eventId).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

export const jobs: Job[] = [
  {
    id: "j1",
    microsoftEventId: "ms-1",
    technicianIds: ["1"],
    attendeeStatuses: [{ technicianId: "1", status: "approved" }],
    title: "SERVICE – Varmepumpe vedlikehold",
    customer: "Norsk Bolig AS",
    address: "Storgata 15, 0182 Oslo",
    description: "Årlig vedlikehold av varmepumpe",
    start: setMinutes(setHours(addDays(weekStart, 0), 9), 0),
    end: setMinutes(setHours(addDays(weekStart, 0), 12), 0),
    status: "approved",
    internalNumber: "JOB-000001",
    createdBy: "a1",
    createdByName: "Thomas Berg",
    createdAt: addDays(weekStart, -1),
    updatedBy: "a2",
    updatedByName: "Øyvind Larsen",
    updatedAt: weekStart,
    attachments: [
      { name: "serviceskjema.pdf", url: "#", size: 245000 },
      { name: "foto_anlegg.jpg", url: "#", size: 1800000 },
    ],
  },
  {
    id: "j2",
    microsoftEventId: "ms-2",
    technicianIds: ["1"],
    attendeeStatuses: [{ technicianId: "1", status: "requested" }],
    title: "SERVICE – Ventilasjon inspeksjon",
    customer: "Fjord Eiendom",
    address: "Havnegata 8, 0150 Oslo",
    description: "Inspeksjon av ventilasjonsanlegg",
    start: setMinutes(setHours(addDays(weekStart, 1), 10), 0),
    end: setMinutes(setHours(addDays(weekStart, 1), 14), 0),
    status: "requested",
    internalNumber: "JOB-000002",
  },
  {
    id: "j3",
    microsoftEventId: "ms-3",
    technicianIds: ["2"],
    attendeeStatuses: [{ technicianId: "2", status: "approved" }],
    title: "SERVICE – Kjøling reparasjon",
    customer: "Bergen Handelshus",
    address: "Bryggen 22, 5003 Bergen",
    description: "Reparasjon av kjøleanlegg i serverrom",
    start: setMinutes(setHours(addDays(weekStart, 0), 8), 0),
    end: setMinutes(setHours(addDays(weekStart, 0), 11), 0),
    status: "approved",
    internalNumber: "JOB-000003",
  },
  {
    id: "j4",
    microsoftEventId: "ms-4",
    technicianIds: ["2"],
    attendeeStatuses: [
      {
        technicianId: "2",
        status: "time_change_proposed",
        proposedStart: setMinutes(setHours(addDays(weekStart, 3), 9), 0),
        proposedEnd: setMinutes(setHours(addDays(weekStart, 3), 12), 0),
      },
    ],
    title: "SERVICE – Varmeanlegg feil",
    customer: "Solsiden Senter",
    address: "Beddingen 10, 7014 Trondheim",
    description: "Feilsøking varmeanlegg",
    start: setMinutes(setHours(addDays(weekStart, 2), 13), 0),
    end: setMinutes(setHours(addDays(weekStart, 2), 16), 0),
    status: "time_change_proposed",
    internalNumber: "JOB-000004",
    proposedStart: setMinutes(setHours(addDays(weekStart, 3), 9), 0),
    proposedEnd: setMinutes(setHours(addDays(weekStart, 3), 12), 0),
  },
  {
    id: "j5",
    microsoftEventId: "ms-5",
    technicianIds: ["1", "3"],
    attendeeStatuses: [
      { technicianId: "1", status: "approved" },
      { technicianId: "3", status: "requested" },
    ],
    title: "SERVICE – Installasjon varmepumpe",
    customer: "Privatkunde Nilsen",
    address: "Løkkeveien 45, 4008 Stavanger",
    description: "Ny installasjon luft-til-luft",
    start: setMinutes(setHours(addDays(weekStart, 1), 8), 0),
    end: setMinutes(setHours(addDays(weekStart, 1), 16), 0),
    status: "approved",
    internalNumber: "JOB-000005",
  },
  {
    id: "j6",
    microsoftEventId: "ms-6",
    technicianIds: ["3"],
    attendeeStatuses: [{ technicianId: "3", status: "rejected" }],
    title: "SERVICE – Akutt lekkasje",
    customer: "Hotell Nordlys",
    address: "Sjøgata 12, 8006 Bodø",
    description: "Akutt lekkasje i kjølerør",
    start: setMinutes(setHours(addDays(weekStart, 3), 9), 0),
    end: setMinutes(setHours(addDays(weekStart, 3), 12), 0),
    status: "rejected",
    internalNumber: "JOB-000006",
  },
  {
    id: "j7",
    microsoftEventId: "ms-7",
    technicianIds: ["4"],
    attendeeStatuses: [{ technicianId: "4", status: "requested" }],
    title: "SERVICE – Preventiv vedlikehold",
    customer: "Kommunale bygg",
    address: "Rådhusplassen 1, 0037 Oslo",
    description: "Kvartalsvis vedlikehold HVAC",
    start: setMinutes(setHours(addDays(weekStart, 0), 7), 30),
    end: setMinutes(setHours(addDays(weekStart, 0), 15), 30),
    status: "requested",
    internalNumber: "JOB-000007",
  },
  {
    id: "j8",
    microsoftEventId: "ms-8",
    technicianIds: ["4"],
    attendeeStatuses: [{ technicianId: "4", status: "approved" }],
    title: "SERVICE – Garanti inspeksjon",
    customer: "Nybygg Prosjekt AS",
    address: "Ensjøveien 34, 0661 Oslo",
    description: "Garantiinspeksjon varmepumpe installert 2024",
    start: setMinutes(setHours(addDays(weekStart, 4), 10), 0),
    end: setMinutes(setHours(addDays(weekStart, 4), 13), 0),
    status: "approved",
    internalNumber: "JOB-000008",
  },
];

export function getJobsForTechnician(techId: string): Job[] {
  return jobs.filter((j) => j.technicianIds.includes(techId));
}

export function getJobsForDay(techId: string, date: Date): Job[] {
  return jobs.filter(
    (j) =>
      j.technicianIds.includes(techId) &&
      j.start.toDateString() === date.toDateString()
  );
}

export function getBookedMinutesForDay(techId: string, date: Date): number {
  const dayJobs = getJobsForDay(techId, date);
  return dayJobs.reduce((sum, job) => sum + differenceInMinutes(job.end, job.start), 0);
}

export function getConflicts(
  techIds: string[],
  start: Date,
  end: Date,
  excludeJobId?: string
): { technicianId: string; job: Job }[] {
  const conflicts: { technicianId: string; job: Job }[] = [];
  for (const techId of techIds) {
    const techJobs = getJobsForTechnician(techId).filter(
      (j) => j.id !== excludeJobId && j.start < end && j.end > start
    );
    for (const job of techJobs) {
      conflicts.push({ technicianId: techId, job });
    }
  }
  return conflicts;
}
