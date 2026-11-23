# Auto Avtalevakt – staged, not operational

## Shipped safely
- Separate metadata-only Graph delta core, fixed Thomas mailbox, Inbox/Sent cursors, 25 messages/page and two pages/folder/run. Empty deltas advance normally; 410 stops instead of resetting to a full scan.
- Database lease/fencing and atomic item+cursor commits, persistent 15-minute minimum spacing, strict owner/company scope, default-off state, baseline/commissioning gates.
- Private IDs-only queue with seven-day expiry; physical removal on page commits. No mail body, recipients, subject or attachments stored in this queue.
- Health and baseline status on admin/dashboard, no green status for unverified or absent runs. Separate switch locked, stop available if ever enabled.
- Audited phone/snooze/reopen on existing findings; source findings remain unchanged. Sent internal replies now remain awaiting others, never automatically closed.

## Not shipped / cannot be enabled yet
- The deployed monitor endpoint only supports status/stop and rejects run with pipeline_not_ready. The delta core is mock-tested but NOT connected to a live token/Graph runner.
- AI queue consumer, incremental thread-state persistence, source-email deep links and safe manual task drafts are not finished. Existing manual order drafts remain available.
- Owner-only deduplicated HIGH Hub notifications are specified/tested as a pure rule but no notification writer is installed. No new bell alerts are emitted.
- No webhook, scheduler or production cron created. Existing Postkontoret sync is unchanged and must not be reused (it reads bodies, downloads attachments and notifies mentions).
- Retention of this new queue is enforced on future commits, not continuously while stopped. Existing historical-test retention cleanup remains incomplete; no old production/test rows were deleted.

## Evidence / operator action
- 59 targeted tests passed, including actual migration SQL in isolated PGlite (RLS, owner identity, baseline, single-flight/fencing, atomic cursor progress, physical expiry and audited follow-ups). Desktop/mobile real-component rendering and mocked phone/snooze requests passed; the auto switch was visibly locked.
- Deployed contract-watch-monitor and contract-watch-scan. Monitor without a bearer returns 401, not a startup crash. Authenticated Thomas status could not be checked: preview was signed out and account minting required unavailable approval.
- Final read-only DB verification: monitor rows=0, queue rows=0, follow-ups=0, Avtalevakt cron jobs=0; original consent/reading setting remains enabled for Thomas only. Thomas' account is active and canonically verified.
- Production read audit: only v3 lookup existed; latest full scan was v2. No mailbox content was accessed for this request.
- First publish UI, then Thomas can run the existing full historical test v3 and inspect failures/caps/quality. A lookup alone cannot unlock baseline.
- Auto activation remains unavailable until remaining consumer/notification/retention work and a separately approved live incremental E2E check are complete. A full baseline alone does not activate anything.