# JOB60576 preflight blocker — 19 November 2026

## Confirmed cause
The live `job_calendar_one_shot_runs` table retained 0105 CHECK constraints restricting event_id, work_date and idempotency_key to JOB60570/19 November. Migration 0119 added the 60576 permit and generic claim but did not update these preview constraints. Thus a valid 60576 preview insert was necessarily rejected. Old logs contain boot/shutdown only, so the exact historical exception is not recoverable; the reproducible schema blocker is confirmed, not a guessed join failure.

## Targeted fix
0120 replaces only the three obsolete constraints with a composite foreign key to the exact existing approved permit tuple (key, event, technician, company, mailbox, day). Existing mailbox/technician/company checks, RLS, grants and consumed-key uniqueness are unchanged. No permit, pilot target, job, queue, assignment or settings row was modified.
Server returns fixed reason_code, stage, graph_post_attempted and status_check_required for failures. DB/schema/cardinality/runtime/token/Graph-read errors no longer imply an uncertain POST. Actual POST/receipt exceptions retain status-check/no-repost behavior. Logs include fixed codes only, not raw errors/content/secrets. UI clears preview on failure and shows the safe reason/stage.

## Verification
104 tests passed across five one-shot test files: exact 60570 and 60576 preview through mocked Graph GET, both SQL permit scopes, wrong tuple rejection, authorization, concurrency, conflicts, Graph 401/403/429/500/timeout/non-JSON/incomplete pagination, no mutation on failed reads. Preview build OK. Function deployment confirmed.
Signed-in browser on /admin/microsoft, existing Thomas session: only “Undersøk kalenderkonflikt – kun lesing” clicked for 60576. Deployed diagnosis HTTP200, category other, one tentative recurring overlap 13:00–13:30 Oslo, no same-Hub marker. Screenshot checked. No live preview-persist action was executed because it creates run/audit rows; that part was verified with isolated mock/PGlite tests only.
Live checks: 0 60576 runs, 7 held intents with 0 attempts/unreleased, global enabled=false/dry_run=true/pilot_mailboxes empty/scope_verified_at null. No Graph POST/PATCH/DELETE or email.

## Thomas's next steps
Publish the UI (function and migration are already live), reload the app, open the 60576 permit and click “Lesekontroll og forhåndsvisning”. Expect a preview for 26 November 08–16 Oslo and the known conflict warning, including the explicit conflict checkbox/override phrase. Stop if a new reason/stage is reported. A preview is not consent to create: creation requires separate final authorization, the plan/busy/conflict confirmations and exact override phrase before the final button. No queues or global activation are involved.
