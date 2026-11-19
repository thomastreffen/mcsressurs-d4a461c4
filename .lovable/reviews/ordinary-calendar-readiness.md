# Ordinary central calendar readiness — 19 November

## Delivered, locked
Dedicated generic daily lifecycle with exact mailbox/event/technician/company/day markers, immutable Graph ID, changeKey/If-Match PATCH/DELETE, private durable journal and service-only atomic claim. Create uses exact-day GET duplicate/unknown classification, permits no automatic override. 201/200/204 are acceptance until GET verifies desired content or exact deletion absence. Unknown operations reconcile with GET, never repost. Unknown creates without an ID stay manual-reconciliation held. Closed/global cancelled differs from individual rejected; real missing assignment/day required for delete. App-created one-shot mappings persist and pin central ownership even while global flags are off, so delegated cannot touch them.
Ordinary calendar-write-sync now calls the guarded central function for an eligible selected recipient, never drain_queue. Deployment approval false prevents any execution. Per-day pilot selection and read-only preflight are available in Admin Microsoft, with start disabled; revoke target is the existing operator stop. No deployment-triggered target or settings writes.

## Concrete current gaps (not production-ready yet)
- Narrow transactional per-mailbox/day activation is not implemented: ordinary central gates still require global enabled/scope/list. Disabled start is not an activation implementation; separate reviewed activation is needed.
- Known other commitment warning exists but audited consent-backed release for generic automatic routing is not wired. It deliberately stops, not silently overrides.
- General remove-work-visit path still holds central delete and does not dispatch the new lifecycle automatically after true unplan. Lifecycle/atomic delete checks are implemented/tested, integration still needed.
- Central verified receipt writes app link/journal; job_calendar_day_links and every per-day status screen are not yet unified with the new central read model. No old receipts/statuses were rewritten. Calendar/email status remains separate, not all screens claim fresh GET verification.
- Generic unchanged planned rows can skip GET and open-operation handling before reaching the lifecycle. Must route those through verification before activation; deployment lock prevents production use now.
- Delegated legacy-day adoption is blocked rather than automatically promoted; requires explicit exact ownership verification. Both Mats one-shots already have central links/IDs/changeKeys; generic verified update recognizes old transaction IDs and needs no second create.
- Full runtime token-scope attestation, refresh/rollback activation transaction and end-to-end removal dispatch still need readiness review. Calendar app independent of system mail identity; no Mail.Send requirement added.

## Evidence
1253 tests / 148 files passed, including 24 new lifecycle tests and 2 daily SQL claim/access tests with PGlite. Mock flows exercise POST+GET, PATCH If-Match, DELETE+404 verification, 401/403/404/409/412/429/5xx/timeouts, duplicate/unknown, tentative recurring warning, partial day/person cancellation and old one-shot ID adoption. No real Graph writes. Build OK. Functions calendar-write-sync/job-outlook-app-sync/job-outlook-app-pilot deployed. Schema checked live: journal/claim exist, zero operations. Globals off/dry-run/empty list/unverified; seven old intents untouched. Both Mats successful one-shot and app-link IDs/changeKeys read-only confirmed.
Signed-in Admin Microsoft screen checked: ordinary-rollout panel renders, GET disabled until explicit eligible selection. No Rune/other-staff Graph probe, no new pilot target, no live lifecycle exercise. No production job/status/email/permissions/environment changes.

## Thomas steps
1. Publish and reload Admin Microsoft.
2. Select an existing future job, active technician (e.g. Rune) and actual workday. Click “Kontroller valgt arbeidsdag – kun lesing”. This reads only that selected mailbox/day and does not save a target or enable sync. Stop if denied/unknown/duplicate.
3. Give a separate exact live rollout authorization only after the remaining gates above are completed. Start remains unavailable now; no global/queue activation occurs.
