# Hub-authoritative calendar policy – 17 November 2026

## Delivered
- Exact Mats/60570/19 Nov 08–16 pilot classifies A same Hub job, B known other appointment, C unresolved metadata/identity/read.
- A and C cannot override. B can prepare a frozen preview, but final create requires correct-plan consent, pending-busy consent, known-conflict consent and `OPPRETT LIKEVEL MATS 19.11.2026 08–16 – TIDSKONFLIKT KJENT`.
- create repeats exact GET, verifies calendar hash and classification, then atomically consumes/audits the permit through migration 0106. Calendar changes require fresh preview, not blind retry. One POST maximum; unknown response is held for existing exact GET reconciliation.
- Both functions deployed: job-calendar-one-shot and ms-calendar. Migration 0106 applied; RLS enabled, claim executable only by service_role with explicit operator + company checks. No broadened rights or flags.
- ResourceCalendar and capacity no longer suppress external commitments merely due to Hub-time coverage. Availability helper now requires verified identity before suppressing a slot. getSchedule cannot supply that identity, so its slots remain unverified warnings, not duplicate proof.
- JobCalendarSync aborts on failed or incomplete availability instead of proceeding silently; existing time-conflict confirmation remains. External busy read surfaces partial lookup failure. New frontend requires publication.

## Read-only production verification
- Authenticated `diagnose` on deployed function: 1 known OTHER occurrence, tentative, overlap 13:00–13:30 Europe/Oslo. No mapping. Override principle applies, but no actual preview permit or create was requested.
- runs=0, audit=0 after verification. Five pending queue items attempts=0/released_at=null. Global enabled=false,dry_run=true,pilot_mailboxes=[],scope_verified_at=null. No Graph POST/PATCH/DELETE, mail or test jobs.
- 1107 tests / 134 files pass; build OK. Isolated desktop/mobile confirms final button stays disabled until separate plan/conflict consent and exact phrase, then becomes enabled; no live final click. Mock UI test exercises one create call and SQL tests assert one append-only consent audit and held queue.

## Non-overridable limitations
- Missing id/body/subject/type/showAs/cancelled/all-day fields, unrecognized time zone, malformed own transaction, unknown app markers, same title without strong markers, same/related Hub-job marker, existing mapping, paged/failed/timeout Graph GET all stop.
- Same title does not prove duplicate and is not automatically adopted. A manual copy with a different title and no Hub marker cannot be identified with certainty from these fields. Exact request data, identity/schedule gates and mapping checks still apply.
- calendarView is the fixed default mailbox calendar and Oslo day only. No scan of other calendars, mailboxes or adjacent days. A concurrent external client can create an appointment between last GET and POST; Graph transactionId and local claim prevent this pilot replay, not unrelated external writes.
- Existing reconciliation adopts only the unique exact one-shot key/time/job/person/day marker combination after consumed unknown attempt. No general adoption or delete capability added.

## Flow sweep (code read; no live mutation flows exercised)
| Place | Result under policy |
|---|---|
| One-shot preflight/create/diagnose/reconcile + claim/finish | Exact exception implemented and tested; A/C stop, B explicit audit; live diagnose verified |
| Pilot selection/probe/simulate/release + job-outlook-app-sync | Simulation remains Hub-only, no conflict-free claim; global OFF and queue release held; writes not activated |
| Project Plan JobCalendarSync + ms-calendar availability | Failed read stops; unknown getSchedule identity no longer time-filtered; warning and existing explicit proceed flow remain |
| ResourcePlan/useExternalBusy/ResourceCalendar/WeekCalendar/TechnicianNowStatus/useCapacity | Other commitments no longer hidden by job coverage in calendar/capacity; weekly/now displays are availability estimates, not duplicate authorization |
| ProjectScheduleSheet on JobDetail | Day-load estimate only; no direct Graph duplicate or exact-time guarantee. Creation does not silently move Hub time |
| IntegrationsDebug AvailabilityTester | Code read: naive local fields interpreted as UTC remain an unrelated debug-time issue; not changed here |
| calendar-write-sync + multi-day-sync | Linked per-day claims/idempotency and exact unplan protect copies; no blanket other-time hard gate. Older single-event error/retry lacks full one-shot recovery parity; not expanded/activated here |
| outlook-sync legacy get_schedule/check/resync | Code read: no exact one-shot identity classification; legacy read/repair limitations remain, no live call |
| outlook-schedule-sync + outlook-match-policy | Hub copies skipped; canceled/declined external import removed locally; private content masked; fuzzy title only suggestion. This does not cancel Hub assignment; no private Graph deletion added |
| import-outlook-tasks | Separate legacy task import; lacks pagination/cancel/recurrence completeness. Not used as pilot gate and not invoked |
| hub-appointment-outlook-sync/inbound + hub-outlook-sync-core + OutlookSyncStatusPanel + resolve_hub_outlook_conflict | Version-edit conflicts, not availability override; jobs excluded, existing flags untouched. No widening from pilot |
| synthetic hub-calendar-write-pilot | Separate hard test mailbox, explicit synthetic own-event lifecycle; not invoked |

## Next operator step
Publish frontend, run preview, review minimal other-time warning and frozen exact request. Do not press the final creation button until separately granting actual one-write consent. If any A/C gate appears, it cannot be waived as an ordinary time conflict.

This completes the exact requested one-shot implementation and policy sweep, not a replacement of every legacy calendar engine. Legacy general-send atomicity, debug-time correctness and general import completeness are documented rather than silently broadened.