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

## Scoped flow sweep
Rule: an approved pilot uses its own exact job/person/mailbox/day/key, and failed reads must not imply a calendar write.
- One-shot 60570/60576 UI status, diagnosis, preview, create and reconcile: read handler/core/UI; exact permits and shared server reason/stage control apply. Status is read-only. No other function calls this endpoint. UI non-Error fallback no longer labels every exception uncertain POST.
- Claim: read 0119; exact permit and live gates, per-day reservation and consumed uniqueness. Receipt/reconcile: read 0105 finish function; operate on run ID under consumed/state guards. Historical migration definitions remain unchanged; current constraints are 0120.
- Original 60570 update/delete preview: read mutation core and handler; found unfiltered successful-run lookup that would fail once another permit succeeds. Fixed exact tuple/key filtering and GET failure stage. Mutations remain locked; no PATCH/DELETE executed.
- Mutation claim storage: read 0107; per-run/kind/version uniqueness and service-only access; no live execution path enabled.
- Pilot target selection/probe/simulation/status, readiness UI: read relevant handler paths/UI. No one-shot hardcoded preview restrictions. Generic probe/simulation/readiness contain unchecked database reads that can show missing data as empty; no uncertain-POST label, but potential misleading readiness/simulation. Outside the requested narrow one-shot fix; not changed or run.
- Generic app-only background sync/queue: read complete handler; flags stop work, explicit queue release and delegated-copy guard apply. No use of one-shot preview table. Dormant generic writes still lack complete prewrite GET/claim/unknown reconciliation lifecycle; not fixed/activated in this narrow bugfix. No queues released or invoked.
41 additional targeted tests pass; redeployed one-shot function, preview build OK. Live preview-persist still not executed (it writes run/audit rows). Earlier signed-in 60576 GET200 diagnosis remains the live check; no claim/Graph write.
