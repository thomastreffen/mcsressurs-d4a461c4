# Tilstandsrapport – tilgangsstyring MCS Hub (2026-11-04, kun lesing)

Ingen produksjonsdata eller kode er endret i denne fasen.

## Funn rangert

### HØY-1 Serveren ignorerer selskapsavgrensning på individuelle overstyringer
`check_permission_v2` leser `user_permission_overrides_v2` uten å se på `scope_company_id`. Frontend (`usePermissions.ts`) bruker bare selskapsbundne overstyringer i riktig selskap. 8 selskapsbundne «tillat» finnes (bl.a. hms.manage, hms.view, jobs.view, jobs.view_pricing, task_thread.email_external, regulation.review). På serveren gjelder disse i alle selskaper -> mulig lekkasje mellom selskaper, og meny ≠ server.

### HØY-2 Unik nøkkel uten scope
`UNIQUE (user_account_id, permission_key)` gjør at én person ikke kan ha ulik overstyring per selskap. Dette er rotårsaken til at duplikatfeilen i det hele tatt kunne oppstå. Lagringsfeilen er rettet i koden (bare endrede nøkler), men modellen kan fortsatt ikke uttrykke «tillat i Service, ikke i BusBar».

### HØY-3 To parallelle overstyringslagre
v1 `user_permission_overrides` (144 rader) og v2 (148) brukes samtidig:
- `usePermissions.ts` slår sammen begge (v2 vinner per nøkkel)
- `UsersAccessTab.tsx` sletter/skriver fortsatt v1
- `usePreviewMode.tsx` og `check_permission` (v1) leser v1
I dag er det 0 avvik mellom v1 og v2 for aktive brukere, men to skrivesteder kan glippe når som helst.

### MIDDELS-1 Duplisert rolle «Ressursplan»
To roller: `Ressursplan` (6 rettigheter, inkl. security.view) og `Ressursplan ` med etterstilt mellomrom (5, uten security.view). Hvilken en person har gir ulike rettigheter uten at det synes i UI.

### MIDDELS-2 Rolle-scope ignoreres
`user_roles_v2.scope_company_id` brukes ikke av `check_permission_v2` (0 rader har scope i dag, så ingen faktisk effekt nå).

### MIDDELS-3 Identitetsavvik
- 2 aktive innlogginger uten rolle
- 1 inaktiv konto med rolle fortsatt
- 1 aktiv konto uten aktivt medlemskap
Ingen innlogging har mer enn én aktiv personkobling.

### LAV-1 Montører med samme rolle har ulike individuelle avslag
Montører med samme rolle har ulike individuelle avslag. Dette er bevisste overstyringer, men det mangler forklaring og historikk i UI.

## Marcus vs Emil (kilde per avvik)

| | Marcus | Emil |
|---|---|---|
| Roller | Montør | Montør + Ressursplan |
| resourceplan.view | **nei** (ingen kilde) | ja (rolle Ressursplan) |
| leads.view | nekt (individuell) | nekt (individuell) |
| regulation.review | tillat (individuell, global) | – |

Ressursplanforskjellen kommer fra rollen, ikke fra overstyring. Riktig handling for admin etter publisering er en av disse:
- gi Marcus individuell «Se ressursplan»
- gi Marcus rollen Ressursplan

## Forslag til sikker retting (krever godkjenning før produksjon)
1. `check_permission_v2`: bruk selskapsbundne overstyringer bare i aktuelt selskap. **Effekt:** de 8 selskapsbundne tillatelsene slutter å virke i andre selskaper. En diff per person vises før endring.
2. Ny unik nøkkel `(user_account_id, permission_key, coalesce(scope_company_id))` (additiv, gammel fjernes først etter godkjenning).
3. Stopp skriving til v1 (`UsersAccessTab`), les kun v2. Merk v1 DEPRECATED.
4. Slå sammen «Ressursplan »-rollen inn i «Ressursplan». Avklar først om security.view skal være med.
5. Felles serverfunksjon «effektiv rettighet med kilde», tilgangsoversikt, endringslogg og integritetsdashbord (plan fase 3–4).

## Rettighetsmatrise v1 (til godkjenning)
Se planen. Den brukes som fasit i tester først etter godkjenning.

## Beslutninger (bruker, 2026-11-04)
- Selskapsgrense: strammes inn etter at diff er godkjent.
- Sammenslått Ressursplan-rolle: UTEN security.view.
- Matrise v1: godkjent.

## Diff til godkjenning (ingen endring utført)
**A. Selskapsgrense på overstyringer.** Faktisk tap etter innstramming:
- Hans Jakob Risnes mister `regulation.review` og `task_thread.email_external` i MCS Service AS. De beholdes i BusBar AS.

Uten endring:
- Hans Jakob: `jobs.view` og `resourceplan.view_external_titles` dekkes av rollen.
- Rune Ørbeck: bare medlem i MCS Service.

**B. Rollesammenslåing.**
- Emil Strid flyttes fra «Ressursplan» til den sammenslåtte rollen og mister `security.view`.
- Eirik Oseth: ingen endring i rettigheter.

## Utført 2026-11-04 08:47 UTC
- Hans Jakob Risnes: hjemselskap BusBar AS, men han har også et AKTIVT medlemskap i MCS Service AS med rollen «Ressursplan» (fra 2026-03-26). Det medlemskapet er ikke endret.
- Serverkontroll: `check_permission_v2_company` (selskapsbundet). `check_permission_v2` uten selskap teller bare overstyringer for hjemselskapet. Etterkontroll: 0 personer mister noe uten rolledekning.
- E-post til eksterne fra oppgavetråd sjekkes nå i oppgavens selskap (funksjonen er deployet).
- Emil Strid flyttet til Ressursplan-rollen uten security.view (v1+v2), med revisjonslogg. Eirik er uendret. Ingen overstyringer er endret (148 før og etter).
- Ikke utført: sletting av duplikatrollen. Hans Jakob bruker den via medlemskapet i MCS Service, og han ville da mistet security.view der. Det krever en ny diff.

## Utført 2026-11-04 (Hans Jakob Risnes, godkjent diff)
- Årsak: Personer-listen filtrerer på ansettelse (bare i BusBar), mens et aktivt medlemskap i MCS Service ga datatilgang i ~88 tabeller.
- A: Medlemskapet i MCS Service er satt inaktivt (raden er beholdt).
- B: De MCS Service-bundne overstyringene jobs.view og resourceplan.view_external_titles er fjernet. Overstyringer totalt: 148 -> 146.
- BusBar er uendret: medlemskap, regulation.review, task_thread.email_external, roller og innlogging.
- Revisjonslogg: membership_deactivated + 2x override_removed, med tidligere verdier.
- IKKE utført: C (begrense rollene Prosjektleder og Planlegger/Admin til BusBar). Det har ingen effekt før serversjekken tar hensyn til rollens selskap, og krever en egen diff for alle.
- Integritetssjekk: Sindre Ulriksen har et aktivt medlemskap i BusBar AS uten ansettelse der. Ikke endret, og må avklares.

## Sindre Ulriksen (2026-11-04)
Utført:
- Ny kodeendring: roller med selskapsgrense gjelder bare i sitt selskap (server og app), og en v2-rolle erstatter sin v1-kopi. Ingen roller har grense i dag, så ingen effektiv endring for noen. Tester: role-scope.test.ts.
- Av de to Elektrotavler-medlemskapene er det uten avdeling satt inaktivt (det med avdeling er beholdt). Elektrotavler er satt som primær ansettelse. Begge er revisjonslogget.

STOPPET, krever ny diff:
- Punkt 2: «Prosjektleder i Elektrotavler + Service» kan ikke lagres, fordi en rolle bare kan tildeles én gang per person (UNIQUE user_account_id, role_id).
- Rettighetssjekker uten selskapskontekst (check_permission_v2 med to argumenter, brukt i ~15 serverfunksjoner og dataregler) bruker hjemselskapets roller. Uten videre arbeid kan en Elektrotavler-admin derfor fortsatt få admin i slike sjekker også når han handler i BusBar.
- BusBar-medlemskapet gir fortsatt datatilgang i BusBar via dataregler, uavhengig av roller.

## Selskapsbevisst rettighetsmotor – kodefase (2026-11-04 09:xx)
### Implementert (ingen effektive rettighetsendringer)
- Migrering 0069: samme rolle kan ha én rad per selskap pluss én global rad. Den gamle unike nøkkelen er fjernet. Alle eksisterende rader passer.
- Personsiden lagrer roller som diff, så rader med selskapsgrense blir aldri gjort globale. add-technicians legger til globale roller idempotent (deployet, fordi den gamle nøkkelen er borte).
- Appen: v2-roller med grense gjelder bare i sitt selskap. v2 erstatter v1-kopien av samme rolle.
- Server: check_permission_v2_company respekterer rollens og overstyringens selskap. Ukjent selskap (NULL) aktiverer aldri roller med grense.
- Tester: role-scope.test.ts og permission-scope.test.ts. 72 filer / 561 tester består.

### Ikke aktivert – kallespor uten selskapskontekst (check_permission_v2 med 2 argumenter)
- Edge: company-migrate, contract-ai, data-integrity, delete-schedule-block, generate-calculation-ai, job-access, ms-calendar, remove-work-visit-from-plan, send-change-order, sharepoint-connect/list/preview-url/upload, task-thread-daily-digest.
- Frontend: EventDrawer (2), useProjectAccess.
- Dataregler: ~38 regler (tasks, project_members, schedule_blocks, task_threads/messages/attachments, event_technicians, offer_*, order_form_templates*, calc_*, hms_area_* m.fl.).
- SQL: get_user_scope_v2, has_samtaler_access, user_has_company_access, is_project_admin, can_view_planning_finance.

FØR/ETTER hvis alle disse bytter til ressursens selskap (beregnet på dagens data):
| Person | Selskap | Medlem | Rettigheter som bortfaller |
|---|---|---|---|
| Hans Jakob Risnes | MCS Elektrotavler, MCS Service | nei | regulation.review, task_thread.email_external |
| Rune Ørbeck | BusBar, MCS Elektrotavler | nei | hms.manage, hms.view, jobs.view_pricing, module.hms |
Ingen bortfall i selskaper der personen er medlem. Ingen nye tilganger.

### KRITISK funn – global admin i datareglene
`is_admin()` = gammel rolle `admin` ELLER super_admin ELLER v1 check_permission('admin.manage_users').
Den brukes i 164 regler, og 137 av dem har ingen selskapsfilter. Det gjelder blant annet:
- events, offers, leads, invoice_basis og documents
- user_roles, user_roles_v2, user_permission_overrides(_v2) og user_memberships

Følgende har i dag admin i ALLE selskaper og kan i praksis endre roller/rettigheter (mulig eskalering):
John Aleksander Mandt, Mats Lien Hansen, Simen Kjeksli, Sindre Ulriksen (gammel admin + v1), Hans Jakob Risnes, Lars Erik Huseby, Rune Ørbeck, Stian Aarstad (via v1 admin.manage_users). Thomas Treffen er super_admin.
Forslag (krever egen godkjenning og diff): ny `is_admin_for(company)` i regler med selskapskolonne. Skriving i rolle- og rettighetstabeller bare for super_admin eller admin i samme selskap. Gammel admin-rolle og v1 fases ut etter at diffen per person er godkjent.

### Sindre / Hans Jakob / Ressursplan
Uendret i denne fasen. Hans Jakobs deaktivering i MCS Service står. Ressursplan-rollen som Emil har, gir ikke security.view. Den andre (2c92…, uten tildelte brukere i v2) har fortsatt security.view og skal ryddes med diff.

## Global admin (2026-11-04) – kartlegging, ingen produksjonsendring
Kilder til `is_admin()`: gammel rolle admin/super_admin ELLER v1 `admin.manage_users`.
- v1-rolle «Planlegger/Admin» gir admin.manage_users til: Hans Jakob, John, Lars Erik, Mats, Simen, Sindre, Stian.
- Rune Ørbeck: individuell v1-overstyring admin.manage_users=true.
- Gammel rolle admin: John, Mats, Sindre, Simen. super_admin: kun Thomas.
- Simen har v2 «Superadmin», men ikke super_admin → ikke superadmin i /admin/* i dag.
- 164 regler bruker is_admin(); bl.a. user_roles, user_roles_v2, user_role_assignments, user_permission_overrides(+v2), user_memberships, permissions, user_scopes → alle 8 kan i dag gi seg selv/andre rettigheter (selv-eskalering).
Lagt til (ubrukt): is_global_superadmin(uid), is_company_admin(uid, company).

### Før/etter-diff (til godkjenning)
| Person | Før | Etter |
|---|---|---|
| Thomas | superadmin | uendret |
| Simen | global admin, ikke /admin | + super_admin (A) |
| John, Mats | global admin | selskapsadmin MCS Service |
| Sindre | global admin | selskapsadmin Service, Elektrotavler, BusBar (bør snevres inn) |
| Hans Jakob, Lars Erik, Stian | global admin via v1 | ingen admin; beholder Prosjektleder/planlegging |
| Rune | global admin via v1-overstyring | ingen admin; beholder operativ MCS Service-tilgang |
Alle mister: endre roller/rettigheter/medlemskap, systemoppsett, data i selskaper uten medlemskap.

### Fase 1–2 utført (2026-11-04), ingen produksjonsrettighet endret
- is_admin()-regler i dag: 155 (a) 16 på tilgangsstyringstabeller (user_roles, user_roles_v2, user_role_assignments, user_permission_overrides(+v2), user_memberships, permissions, user_scopes, user_accounts, cross_company_access_grants) → mål: kun is_global_superadmin. (b) 26 selskapsfiltrerte → mål: is_company_admin(uid, rad.company_id). (c) 113 uten selskapsfilter på 64 tabeller → mål: is_company_admin via radens selskap; må kartlegges tabell for tabell før aktivering.
- Tjenestenøkkel: 100 serverfunksjoner; 65 uten egen rollesjekk, 33 uten selskapsreferanse (mange er token-/cron-flyter med vilje). Må gjennomgås én og én før fase 3 D.
- Nytt, ubrukt i regler: is_global_superadmin, is_company_admin, admin_tier_shadow_diff() (lesing, kun superadmin).
- Venter på godkjenning: A (Simen super_admin), B (fjerne admin.manage_users fra Planlegger/Admin og Rune), C (legacy admin → selskapsadmin), D (aktivere nye regler).

## Runde 3 (2026-11-04 09:30) – utført uten endring av effektive rettigheter
- Nytt: tom tabell company_admin_assignments (kun superadmin skriver, ingen selv-tildeling); is_company_admin krever nå eksplisitt tildeling + aktivt medlemskap. Gammel admin-rolle gir IKKE selskapsadmin. event_company_id() som selskapsoppslag. Ingen policy bruker dette ennå.
- RLS-klassifisering og erstatningsutkast: .lovable/rls-admin-replacement-draft.sql (ikke kjørt).
- Flaky tester: PGlite-oppstart >10 s ved kald parallellkjøring → hookTimeout 60 s. 3 kjøringer etterpå: 74/74 filer, 570/570.
- Serverfunksjoner: 27 HØY, 33 MIDDELS, rest LAV (se under).

### HØY – serverfunksjoner (ingen endring deployet)
Selv-eskalering: add-technicians, create-person (vilkårlige rolle-IDer, ingen tak).
Uten innlogging (verify_jwt=false): ai-project-matcher, analyze-message-actions, conversation-email-reprocess, conversation-email-send, extract-image-text, generate-offer-pdf, graph-subscription-manage, graph-subscription-renew-cron, graph-subscription-sync, outlook-schedule-sync, outlook-sync, schedule-sweep-orphans, task-thread-escalation, graph-webhook-inbound (clientState valgfri).
Innlogget, men vilkårlig ressurs uten selskapssjekk: absence-calendar-sync, add-participant, analyze-document, conversation-export-pdf, inbox-sync, inspection-report-analyze, seed-order-template, service-journal-pdf, service-journal-share, suggest-task-from-email, sync-task-to-calendar.

### Revidert målbilde-diff
| Person | Etter |
|---|---|
| Thomas | global superadmin (uendret) |
| Simen | global superadmin (A, venter) |
| John, Mats | ingen admin; Prosjektleder/Planlegger i MCS Service; selskapsadmin bare ved eksplisitt vedtak |
| Sindre | ingen admin; operativ i Service/Elektrotavler, samarbeid i BusBar uten administrasjon |
| Hans Jakob | BusBar operativ; MCS Service forblir deaktivert |
| Lars Erik, Stian, Rune | ingen admin; operative roller beholdes |
