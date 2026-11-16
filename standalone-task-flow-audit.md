# Frittstående Ressursplan-oppgaver – kontroll 16. november 2026

Regel: Oppgave kan stå alene uten prosjekt, med person-tildeling, arbeidsdager,
vedlegg og egen jobbinfo; prosjektunderoppgaver beholder ekte selskapsriktig parent.
Ingen historiske rader eller kalender-/tilgangsinnstillinger endres.

## Lest og kontrollert

- EventDrawer Opprett: atomisk task/internal uten parent, e-post standard på med loggført fravalg, filer før utsendingskall. Tripletex master kan ikke tvinge Oppgave til eksisterende prosjekt. Isolert PC/mobil-kjøring bestod.
- OverviewPage Opprett: bruker EventDrawer. Mine gjøremål og separat MyTasks viste task som prosjektlenke; rettet til egen /job-info/:id. MyTasks-filteret heter nå Oppgaver.
- AssignResourceTaskDialog (bestilling): oppretter et selvstendig service-event, ikke project_type=task; rammes ikke av parent-triggerfeilen. Beholder bestillings-/godkjenningssemantikk.
- CreateJobDialog og ResourceAssignDialog: oppretter ordinære hendelser, ikke task med tvungen parent. Ikke omklassifisert.
- EventDrawer existing: create_work_visits_on_project_batch og create_work_visit_on_project krever en virkelig parent fordi dette er prosjektets arbeidsbesøk. Beholdt.
- EditJobDialog, JobQuickEditSheet og EventDrawer endring: endrer eksisterende event/tildeling, krever ikke ny parent for frittstående task. Internal-klassifisering betyr fortsatt informasjon uten godkjenningsplikt i create-approval.
- CalendarEvents og MyDay: leser events/tildelinger/planblokker uten task-parentfilter. Ny task har project_id=job_id=egen event-id. MyDay jobbinfo bruker event-id.
- JobsPage/Mine: montører åpner jobbinfo via jobEntryPath; planleggere beholder arbeidsflate. Separat useMyPlanningTasks leser planning_tasks og er ikke Ressursplan-event-modellen.
- JobInformationPage og job-access: legitim sesjon, read_my_assigned_job eller eksisterende selskapslesetilgang; ingen task-parentkrav. Filer krever autorisert jobb og eksakt filtilhørighet. Det nye eventet får egen stabil lenke.
- create-approval og communication-policy: internal / response_required=false går til informasjonsmail før selv-godkjenningsunntaket. notify-event-changes bruker tildelte mottakere; job_email_attempt-claims beskytter mot replay. Ingen ekte utsending utført.
- calendar-write-sync: delegated kalenderbody bruker job-communication og egen event-id, uten task-parentkrav. Ingen Graph-kall kjørt.
- job-outlook-app-sync, job-outlook-app-pilot og job-outlook-pilot-selector: sentral prosjektjobbpilot avviser task bevisst. Ikke utvidet eller aktivert. Frittstående Ressursplan-task er ikke automatisk støttet av sentral pilot.
- hub-appointment-outlook-sync og sync-task-to-calendar: bruker tasks/task_assignees, ikke events-task. Ikke koblet på den nye oppgaveflyten og ikke aktivert.
- Prosjektvelgere (EventDrawer search, QuickProjectSearch, UnplannedDrawer, SQL search_resource_plan_projects): ekskluderer task som prosjekt-parent med hensikt; ingen dummy-parent eller økonomisk prosjektopprykk.
- enforce_task_parent_integrity: standalone tillatt; child krever aktiv same-company non-task parent; economic standalone task avvist. Ingen tidligere automatisk prosjektopprykk reversert.
- enforce_schedule_block_project_match: child peker til parent, standalone til egen id; selskap må stemme.
- create_standalone_resource_task: SECURITY INVOKER, eksisterende RLS og resource_plan edit; én transaksjon for event/tildeling/dager/audit, advisory lock og client_request_id. Ingen service-role-bypass.
- enforce_event_entity_rules og enforce_planning_billing_rules: eksisterende økonomisk-/Tripletex-/faktureringsvalidering beholdt.
- seed_project_access: eksisterende creator-owner/default spaces opprettes transaksjonelt; ingen falsk parent.
- sync_schedule_blocks_for_event_time_change: støtter egne event/job-referanser og soft-delete. Ingen endring i denne gjennomgangen.
- delete-schedule-block: task myktslettes først når ingen aktive andre planblokker refererer til den; eksisterende fjerningskontrakt beholdt.
- suggestClassification: historiske usikre oppgaver krever fortsatt gjennomgang; nye standalone tasks får eksplisitt internal og trenger ikke heuristisk klassifisering.

## Bevis og gjenstående kontroll

- Produksjonslesing: feil-ID b30aadc9-ff17-4186-b67b-e07129ead424 har null events, tildelinger og planblokker.
- Migrasjon 0098 aktiv; opprettingsfunksjonen er invoker, authenticated har execute, anon har ikke.
- Sentral prosjektkalender: enabled=false, dry_run=true, pilot_mailboxes=[].
- 923 tester bestod før ekstra navigasjonsretting; relevante tester kjøres på nytt etterpå.
- Full reell oppretting med produksjonssession, mottatt e-post, Outlook og mottakerens jobbinfo er ikke testet. Kun isolerte SQL-/handler-/skjermtester.
- Publisering av opprettings- og navigasjonsrettelser kreves. Kontroller neste ordinære oppgave med egne kontoer; ikke send historikk på nytt.