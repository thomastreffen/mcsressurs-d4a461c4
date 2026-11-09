# Sluttopprydding global admin – 09.11.2026 (ca. 07:25–07:45 UTC)

## Gjennomført i produksjon
- 0075: 42 restriktive skrivegjerder (INSERT/UPDATE/DELETE) på 14 tilgangstabeller: user_roles, user_roles_v2, user_role_assignments, user_permission_overrides(+_v2), user_memberships, user_accounts, user_scopes, roles, role_permissions, permissions, company_module_access, company_admin_assignments, module_user_overrides. Kun global superadmin kan skrive. SECURITY DEFINER-RPC-er (save_permission_override_changes, set_order_intake_member, confirm_person_login_link) krever allerede superadmin. cross_company_access_grants holdt utenfor (operativ ordretildeling) og er i stedet selskapsavgrenset.
- 0075: legacy_admin_in_company(company) + 10 forelder-oppslag (SECURITY DEFINER).
- 0076: 120 policyer på 59 tabeller: is_admin()-grenen byttet til legacy_admin_in_company(<radens selskap eller validert forelder>). Andre grener uendret. UPDATE uten egen WITH CHECK bruker USING på ny rad → flytting til annet selskap avvises.
- 0077: tenant_settings, contract_cron_runs, import_logs, import_results, audit_log (lesing) → kun superadmin.
- Edge deployet: create-person, add-technicians, fetch-employees → kun superadmin. create-approval: global bypass kun superadmin, ellers has_company_access(jobbens selskap). fag-image-analyze: bypass kun superadmin. portal-notify / customer-portal-invite: superadmin, eller legacy admin-rolle KUN i prosjektets/kontoens eget selskap (v1 manage_users gir ikke ny tilgang).
- Live negativ probe: alle 6 funksjoner gir 401 uten innlogget bruker.

## Faktisk forbruk før endring
Ingen av de 9 hadde opprettede eller tildelte jobber i selskaper de ikke er aktivt medlem av → ingen kjent operativ bruk tapes.

## Read-back produksjon (rådata)
- user_roles super_admin: Thomas Treffen, Simen Kjeksli (kun disse).
- 120 policyer selskapsavgrenset; 42 restriktive gjerder; 44 policyer på 23 tabeller har fortsatt uavgrenset is_admin() (se Gjenstår).
- Legacy admin-rolle: John (Service), Mats (Service), Sindre (Service, Elektrotavler, BusBar). v1 admin.manage_users: Hans Jakob (BusBar), Lars Erik (BusBar), Rune (Service), Stian (Service, Elektrotavler, BusBar) – og Thomas/Simen.
  Disse gir nå bare selskapsavgrenset drift i medlemsselskap, ikke tilgangsstyring.

## Testet
- Isolert PGlite (company-bounded-admin.test.ts, 12): CRUD i eget selskap, avvist i BusBar, flytting avvist, Rune avgrenset, superadmin overalt, montør egen jobb, null-selskap-residual, ingen selv-eskalering, rollback.
- security-boundary.test.ts (6), simen-superadmin-swap (4). Full suite 2 ganger: 611/611, 81 filer. Bygg OK.
- IKKE testet: innlogget i produksjon som Thomas/Simen/andre (ingen tilgjengelig sesjon). Ingen e-post/Outlook/invitasjoner/testjobber.

## Gjenstår (global vei fortsatt åpen – derfor IKKE ferdig)
1. 44 policyer uten selskapsanker: lesing på tilgangstabellene, people (insert), technicians, user_documents, activity_log, communication_logs (polymorfe), settings og mailboxes (brukt operativt i kalkyle/Postkontor), form_pdf_imports, 9 storage-regler (job-attachments, fag-attachments, calculation-attachments, user-documents). Krever egen resolver per tabell.
2. can_view_planning_finance(): is_admin() uten selskap.
3. Varsel-/tokenlister i edge (handle-approval, outlook-sync, offer-public-view, ms-calendar) og inbox-scan/contract-alerts-cron godtar legacy admin globalt.
4. Rader uten selskap (bl.a. 1395 notifications, 26 inbox_messages, 8 documents, 8 form_templates) følger fortsatt gammel admin-regel.
5. BESLUTNING: Sindre (legacy admin) og Stian (v1 manage_users) har adminnivå drift i BusBar fordi de er aktive BusBar-medlemmer. Å fjerne krever endring av operative rettigheter → egen godkjenning.
6. Cron (9 jobber med anon-bearer) og Graph state-rotasjon: uendret, krever koordinert overgang.

## Rollback
- 0076: kjør company-bounded-admin.rollback.sql (eksakte 120 tidligere uttrykk fra før-snapshot admin-policies-before-0730.json).
- 0077: bytt has_role(auth.uid(),'super_admin') tilbake til is_admin() i de 6 policyene.
- 0075: DROP POLICY "global_access_write_insert|update|delete" ON <tabell> (14 tabeller); hjelpefunksjonene kan stå.
- Edge: gjenopprett forrige versjon av de 7 funksjonene og deploy.

## Sindre – BusBar admin fjernet (godkjent Thomas 09.11 07:45 UTC)
- Mekanismer kartlagt: legacy user_roles admin + v1 Planlegger/Admin (admin.manage_users) + aktivt BusBar-medlemskap → admin-gren i 120 selskapsavgrensede policyer. Ingen BusBar-ansettelse, CMA, planning-, selskapsadmin- eller scoped v2-rader. 0 BusBar-prosjekter/tildelinger/opprettede jobber.
- Endring: ny unntakstabell (migrasjon 0078) + legacy_admin_in_company/legacyAdminInCompany respekterer unntak. Én rad: Sindre × BusBar. Audit: access_audit_log 'legacy_admin_company_excluded'.
- Uendret: medlemskap (BusBar aktivt for operativ deltakelse), roller, Service/Elektrotavler-admin, Stian (radhash 513a4df1… før = etter), superadmin = Thomas+Simen, Hans Jakob Service inaktiv.
- Rest: Sindres legacy admin virker fortsatt i de 44 uavgrensede policyene (gjelder alle selskap, ikke BusBar-spesifikt).
- Rollback: UPDATE legacy_admin_company_exclusions SET revoked_at=now() WHERE auth_user_id='9138ec02-…' AND company_id=BusBar.

## Runde 09.11 ~08:00 (godkjent «Jepp, da gjør vi det»)
AKTIVERT OG TESTET
- 0079: alle 41 av 44 resterende globale is_admin-regler avgrenset (selskap på rad, forelder, felles medlemskap, mappens eier). Rader uten selskap: kun superadmin. 156 policyer bruker nå avgrensede hjelpere.
- legacy_admin_in_company: null-selskap er ikke lenger globalt. Postkontoret (inbox_messages, 2 policyer) beholder synlighet for 26 ufordelte meldinger (egen hjelper) til beslutning.
- Stian: eksplisitt, auditert bevaring (legacy_admin_global_retention). Radhash 513a4df1… uendret.
- can_view_planning_finance: is_admin fjernet; alle 7 har jobs.view_pricing → ingen endring.
- Selskap fylt inn sikkert: 1394 varsler, 8 dokumenter, 2 skjema, 4 tilbud (logget i security_company_backfill_log).
- Edge: inbox-scan/contract-alerts-cron manuell trigger kun superadmin; handle-approval, outlook-sync, offer-public-view varsler kun superadmin + admin i jobbens/tilbudets selskap (Sindre ikke for BusBar).
- Tester: 619/619 ×2, bygg OK.
GJENSTÅR
- 3 regler: settings-lesing (felles prisstandarder brukt i kalkyle), mailboxes-lesing (Postkontor-konfig), people WITH CHECK (opprett person). Globale delte innstillinger, ikke selskapsdata.
- Til manuell gjennomgang: 26 innboksmeldinger, 8 skjemamaler, 1 lead, 1 kalkyle, 1 varsel uten selskap; 48 aktivitetslogger og 1 e-postlogg uten sporbar forelder (nå bare superadmin); 3 montører uten innlogging (redigering bare superadmin).
- MS-token-valg i ms-calendar/outlook-sync bruker fortsatt admin-roller som tokenkilde (ikke tilgang).
BLOKKERT
- Cron: inbox-scan (*/15) og en timesjobb gir allerede 401 (før dagens endringer, minst siden 02:00). Krever egen cron-hemmelighet i hvelv + funksjonsstøtte; ikke byttet blindt.
- Graph clientState (30 tegn, svakt tegnsett), abonnement utløper 11.11 09:36 UTC. Rotasjon krever nytt abonnement via Microsoft og koordinert bytte.
Rollback 0079: sett legacy_admin_in_company tilbake til 0078-definisjon; policyuttrykk før endring i spørring over (44 stk) – lagret i policies-before-0079.txt; backfill: UPDATE … SET company_id=NULL WHERE id IN (logg).

## Cron-auth + Graph clientState (godkjent «Enig det må vi få ryddet opp i», 09.11 08:28 UTC)
AKTIVERT OG TESTET
- Rotårsak 401: inbox-scan (og task-thread-daily-digest) krevde service-role/superadmin, men alle 9 cron-jobber sendte anon-nøkkel. 20×401 siden 02:45, kun inbox-scan rammet (de øvrige hadde ingen auth-sjekk).
- Migrasjon 0080: app_runtime_secrets (kun service_role/postgres) + verify_cron_secret() (SECURITY DEFINER, kun service_role). Hemmelighet generert i databasen (gen_random_bytes), aldri eksponert.
- Alle 9 cron-jobber bygger nå Authorization-header fra databasen (cron.alter_job, tidsplaner uendret).
- Edge: isCronBearer + generateClientState i _shared/security-boundary.ts (import-fri, frontend-testbar); isSystemCaller i ny _shared/system-caller.ts. Porter: inbox-scan, contract-alerts-cron, task-thread-daily-digest (cron-secret lagt til), graph-subscription-renew-cron, outlook-schedule-sync, schedule-sweep-orphans, task-thread-escalation, graph-subscription-sync, graph-subscription-manage (ny superadmin/cron-port – tidligere helt åpne), offer-followup-check (cron/service ELLER innlogget bruker, UI-trigger bevart).
- Live verifisert: alle 10 gir 401 anonymt; outlook-schedule-sync 200 (08:35/08:40), task-thread-escalation 200 (08:45), inbox-scan full kjøring 08:45 («Scanned 5 users»).
- Graph: clientState rotert til kryptografisk tilfeldig (52 tegn) via ny rotate_state-handling på EKSISTERENDE abonnement 9d8b0306 (PATCH, ingen delete/recreate → ingen tapte varsler/duplikater). Ny utløp: 2026-11-12 06:09 UTC (var 11.11 09:36). Fremtidige abonnementer får tilfeldig clientState (mcs-postkontoret-<ts> / mcs-<company> fjernet).
- Tester: 11/11 Deno (5 nye), 619/619 vitest, bygg OK.
GJENSTÅR / AVVIK
- inbox-scan har en ELDRE, urelatert Graph-feil: $orderBy støttes ikke med $search (400 SearchWithOrderBy) for noen brukere – ikke auth, bør rettes i egen omgang.
- task-thread-daily-digest (13:30) og offer-followup-check (06:00) er ikke live-verifisert med ny auth ennå – første planlagte kjøring bekrefter.
- Backlog: inbox-scan gikk glipp av kjøringer 02:45–08:30; neste kjøring dekker siste 24 t (SEARCH_WINDOW_HOURS=24) → ingen tap.
Rollback: cron.alter_job tilbake til anon-bearer (kommandoer i cron.job-historikk), DROP FUNCTION verify_cron_secret + DROP TABLE app_runtime_secrets, gjenopprett forrige funksjonsversjoner.

## Integrasjonsretting 09.11 09:30 UTC
- inbox-scan: `$search`+`$orderby` (400 SearchWithOrderBy) fjernet; lokal sortering, `@odata.nextLink`-paging (maks 5 sider), tidsvindu-filter, dedupe på id. Status ok/partial/failed + feilkoder i svar. ms-mail fallback-søk rettet likt. Live 09:30: status ok, 5/5 brukere, 0 feil.
- Rollback: redeploy forrige versjon av inbox-scan/ms-mail (kun spørringsformat).
- Venter live: task-thread-daily-digest (13:30 man–fre), offer-followup-check (06:00), første planlagte Graph-fornyelse etter rotasjon (12:00).
