# Job notification flow audit — 16 November 2026

Rule: actual assigned job/task recipients normally receive operational jobinfo mail. Explicit no-notification saves are audited, Graph acceptance is not receipt, and uncertain sends never automatically replay.

## Read and corrected
- EventDrawer: new tasks now use informational create-approval, batch visits inspect recipient outcomes, changes use session-pinned calls and target new recipients unless time changed, explicit skips logged. Resend copy points to channel evidence, not forced reconnect.
- CreateJobDialog, EditJobDialog, ResourceAssignDialog, JobQuickEditSheet: inspect recipient outcomes; new assignments narrowed; quick-edit time changes notify.
- ProjectNewPage: explicit selected recipients notified; removed implicit assignment to an arbitrary technician when none selected (compatibility primary field untouched).
- ProjectSettingsPage: no swallowed error or false sent audit; explicit skip recorded.
- ConvertToJobDialog: selected leader receives operational information without response demand.
- PlanJobDialog: selected technician has a live event assignment before canonical job mail; no unconditional sent success.
- DropConfirmPopover project drop: notify planned explicit recipients after blocks exist. Legacy tasks-table drop is not a Hub events job and is not passed as a job id.
- ResourcePlan: event drag/resize and manual job-block drag/resize notify relevant recipients; Outlook-origin blocks remain untouched by notification logic.
- ScheduleBlockDetailPanel/create-job-from-schedule-block: canonical notification server-side for newly created jobs; caller gets outcome; existing-idempotent returns do not resend. Assignment uses server-resolved block identity.
- AssignResourceTaskDialog: already inspected outcomes; receipt and retry wording corrected.
- JobsPage manual request, EventDrawer/ProjectDashboard/LinkedTaskSection resends: no unconditional sent/all received claims.
- create-approval, notify-event-changes, approval-reminder: service-only atomic mail claims, 202 acceptance recorded, definite failure distinct from pending unknown; reminders share claims. Existing response locators reused on time-change replay.

## Read, no sending change
- UnplannedDrawer and UnplannedJobsStrip select existing jobs and route to the planner; useCalendarEvents is a read/realtime projection, not a sender.
- create_work_visits_on_project_batch creates jobs/assignments/blocks and returns per-event results; EventDrawer owns notification invocation. enqueue_m365_assignment/enqueue_m365_event_change record dormant intent only. record_event_delivery writes evidence only.
- m365-dispatch remains explicit bounded pilot-only with original gates; calendar-write-sync, ms-calendar, job-outlook-app-sync stay separate calendar channels and do not establish email receipt (read in preceding audit).
- task-thread-email-send, task-thread-daily-digest and task-thread-escalation are conversation-message channels, not assignment confirmation. They store task_messages/digest deliveries/escalation audit; they do not explain the missing assignment delivery on JOB-000420. No conversation workflow change in this job-notification fix.

## Evidence and limits
- JOB-000420: only created/technician_assigned event logs. No channel, approval, notification or activity row; no explicit skip proven. Exact deployed October failure remains unknown, and meeting was project/unclassified, not the current silent task branch.
- 6/19 recent scheduled jobs excluding test/mock/isolated titles had no email audit, 5 had approval rows: missing audit alone does not prove missing mail.
- Tests use mocks only; no real sender, Graph writes, notifications or jobs exercised. PC/mobile evidence view was screenshot-checked with mocks in the preceding turn.
- Actual recipient receipt/read, real OAuth/PWA and next normal assignment remain user verification steps after publishing. No Microsoft banner/settings/permissions or historic settled records altered.