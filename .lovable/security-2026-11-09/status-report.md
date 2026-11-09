# Sikkerhetsrevisjon – utført arbeid og aktiveringssperrer 09.11.2026

## Ikke ferdig: faktisk produksjonsresultat
Thomas har super_admin. Simen, John, Mats og Sindre har legacy admin. Hans Jakob, Lars Erik og Stian får is_admin via v1 Planlegger/Admin; Rune via v1 admin.manage_users-overstyring. Dermed ni adminveier (Thomas + åtte andre), ikke bare Thomas+Simen. Ingen personrettigheter eller operative RLS-regler er endret i denne runden.

Rune har fortsatt eksplisitt selskapsadmin MCS Service, orders.intake og tidligere mottakerpreferanse. Hans Jakobs Service-medlemskap er inaktivt. Ingen nye company_admin_assignments til John/Mats/Sindre.

## Implementert og deployet
- graph-webhook-inbound: obligatorisk clientState + subscriptionId, aktiv lagret subscription med company_id; aldri utled selskap fra klientens state. Uvaliderte callbacks henter ikke Graph-token, skriver ikke feilkø og henter ikke meldinger. Ressurs-URL tillater kun users/{id}/messages/{id}, ingen injiserte query-parametre. Basic Graph validationToken-handshake beholdt; ingen blind Hub-innlogging.
- portal-notify og task-thread-daily-digest: intern serviceautentisering krever nøyaktig Bearer-hemmelighet, ikke substring. Eksisterende bruker-/cron-gren ellers uendret. To eksisterende portal-notify typefeil rettet uten varslingsregelendring.
- Deploy bekreftet eksplisitt av deploy-verktøyet. Ingen app-publisering.

### Produksjonsverifikasjon
Etter eksplisitt deploy: Graph validationToken ga 200/text/plain; callback uten clientState ga processed=0. Daily digest med ugyldig bearer ga 401. Portal-notify ugyldig bearer ga 401 før eksplisitt deploy; ikke etterverifisert på nytt ennå.
Før eksplisitt deploy traff én avvisningstest gammel kode: ugyldig, ikke-eksisterende mailbox ble lest fra Graph (404) og én feilkøpost opprettet. Ingen e-post/invitasjon/bestilling/jobb. Den ene egenproduserte posten ble identifisert og fjernet med eksakt ID/tid/subscription, ingen andre data. Ny deployert kode prosesserte ikke samme payload. Dette er ikke en reell Microsoft-sendetest.

## Implementert og testet, IKKE aktivert
- security-boundary.ts: eksakt service-bearer, autoritativ global-manager-RPC og streng basic Graph-valideringsmodell. Den ekstra modellens utløpssjekk er ikke koblet til webhook-handleren, som foreløpig beholder aktiv subscription-status som minimum.
- access-write-gates.staged.sql: 45 restriktive skrivegrenser på 15 tilgangskilder. SELECT og operative tabeller uendret. Kun global superadmin kan skrive; permissive legacy-regler kan ikke OR-omgå portene. Ikke sendt til migrering/verken schema eller RLS endret.
- add-technicians/create-person komplette autorisasjonspatcher klargjort utenfor deployerte funksjoner. Global-superadmin-gate testet isolert som delt guard, ikke full personopprettelseshandler. Ikke deployet før Simen/HR-diff.
- company-role-permission.staged.sql: v2-scope-check klargjort, IKKE aktivert. v1 fallback er fortsatt global og må håndteres i samlet overgang.
- company-resource-rls.test.ts: faktisk isolert Postgres-rolle, Rune CRUD i Service, ingen Sindre company-admin via medlemskap, NULL-forelder og cross-company flytting avvist, montør egen info før/etter approval.

## Tester og usikkerhet
Baseline 577/577 i 75 filer; ingen to feilede filer kunne reproduseres. Etterarbeid 592/592 i 79 filer, to påfølgende stabile sluttrunder. Deno check består for alle tre endrede edge-funksjoner og felles guard. Automatisk appbygg/typekontroll består. En midlertidig test-typingfeil rettet før slutt.
Ny webhook-regresjon feilet på rekonstruert gammel sårbar branch (manglende state/ressursinjeksjon), består på endret handler; rekonstruksjonen var nødvendig fordi HEAD allerede inneholdt oppdatert kode. Ikke hevdet full historisk bundle-attestasjon.
Eksisterende komplette suite dekker approval/job-access/vedlegg/private tilgangsgrenser/prosjektinvitasjon/HMS/ordrevarsel/idempotens og mock Microsoft. Nye CRUD/RLS-kontroller er isolerte. Ikke full autentisert produksjons-CRUD mot ekte oppdrag og ikke Simen/Thomas begge adminvisninger: ingen passende tilgjengelig brukerlesesesjon; selv-mint fant ikke bestiller. Ingen tilfeldig konto valgt eller auth omgått.

## Aktuelt inventar – ikke eldre telleverk
902 gjeldende public-policyer; 155 inneholder is_admin(). 128 av disse har ikke ordet company i uttrykket (kun indikasjon, ikke bevis for manglende sikker forelder). Tidligere tall 164/113 kan ikke brukes som aktuell fasit. Alle legacy-policyer og deres faktiske uttrykk finnes i policies-snapshot.json; policy-matrix.md klassifiserer hver legacy/admin-nøkkelpolicy med direkte selskap, FK-forelder eller uavklart anker.
100 innganger bruker service-role direkte, alle listet i edge-matrix.md med identitets-, rettighets- og ressurs-signaler. Full semantisk legitime-kall attestasjon av alle 100 er ikke gjennomført; 27 tidligere risikofunn er ikke erklært løst.
Nytt viktig funn: company_role_permission ignorerer v2 scope_company_id i rolle-unionen, og has_company_access har legacy admin-bypass i ansattes selskap. Å fjerne bare is_admin eller admin.manage_users løser ikke dette alene.
user_accounts har også phase2_accounts_write via person_module_access; må inngå i eskaleringssikring selv om gamle utkast manglet tabellen.

## Konkrete sperrer og neste beslutning
A – Simen: legg til én idempotent user_roles(super_admin)-rad for 9ee227c5-7cc0-409a-93aa-1ef0696d27ca; behold eksisterende admin/roller/medlemskap. Thomas sin rad urørt. Nytt audit med Thomas som aktør, verifiser før/etter og Simens begge admininnganger før ytterligere innsnevring. Dette krever uttrykkelig separat godkjenning iht. siste bestilling.
B – Tilgangsskriving: godkjenn avgrensede 45 RLS-gates på 15 kilder + global-superadmin-gate i provisioning; syv øvrige mister direkte rettighets-/login-/medlemskapstyring, ikke operative permission-rader. Ren HR-personopprettelse koblet til login må avklares, ikke implisitt tas bort for Rune.
C – Operativ policyovergang: ikke godkjenn generisk is_admin→is_company_admin. John/Mats/Sindre/Hans Jakob/Lars/Stian har ingen company_admin_assignments; generisk bytte vil ta operative policytilganger i deres selskap. person-company-diff.md viser rad-per-person/per-selskap og eksisterende nøkler; endelig CRUD-projeksjon for hver tabell og ressurs trenger fortsatt avgrensede erstatningsregler. Ingen ny automatisk company admin.
D – Cron/service: ALLE NI gjeldende cron-jobber bruker anon bearer (kun rollen lest, ingen token skrevet i rapport). Eksakt service-gate vil derfor stoppe nåværende integrasjon. Må koordineres med sikker, serverlagret cron-hemmelighet og atomisk bytte av scheduler/callee, godkjent før aktivering. Ingen auth-lemping eller service-key eksponering. Dette er en scheduler/autentiseringssperre, ikke påvist manglende Entra-adminrettighet.
E – Graph-state: dagens aktive subscription har eldre forutsigbar mcs-prefiks-state og varer til 11.11. Nye subscriptions bør ha kryptografisk random state; eksisterende rotasjon krever kontrollert Microsoft subscription-overgang. Ingen rotasjon/recreate utført. Basic callbacks bruker clientState; rich callbacks krever særskilt signed validationTokens, ikke opprettet av dagens kode.

## Rollback og akseptansekriterier
- Før migrering: ta ny identisk snapshot og sammenlign SHA/enkeltfelter; stopp ved drift. Ta eksakte policydefinisjoner og privilegier. DDL brukes kun via migreringsverktøy etter godkjenning.
- A rollback fjerner kun nylig Simen-grant med dokumentert proveniens, aldri Thomas. Audit beholdes.
- B rollback fjerner kun de nye restriktive policyene per gruppe, tidligere policyer ligger fortsatt intakte; aldri masse-replay av stale dump. Gjenåpner legacy sikkerhetsrisiko og krever uttrykkelig nødavgjørelse.
- Edge rollback: gjenopprett kun disse handlernes førdiff fra revisjonsendringen og deploy kontrollert; ikke endre varslingsruting eller cron i samme handling.
- Mål skal bekreftes gjennom både globale legacy- og nye helperveier: Thomas+Simen true; John/Mats/Sindre/Hans Jakob/Lars/Rune/Stian false. Skrivere av roller/overrides/memberships/scopes må avvise disse syv og vanlige brukere.
- Rune: egne Service-moduler, HMS/HR/priser, ordreansvar og varsling, Service-CRUD består; BusBar/Elektrotavler-admin avvist. Sindre BusBar samarbeid kun eksplisitte prosjekter. Hans Service-medlemskap false. Ingen company admin til John/Mats.
- Montør egen jobb/fil før og etter approval; andre selskaper/andres filer avvist; UPDATE kan ikke flytte parent/company. Alle schemafamilier med polymorf/ukjent forelder må være løst før aktivering.
- Kun isolert/mock Microsoft inntil særskilt pilot. Ingen global-admin-ferdigmelding før reell produksjonsread-back og innlogget kontinuitet.

## Revisjonsartefakter
access-snapshot.json, policies-snapshot.json, schema-snapshot.json, definer-functions-snapshot.json, policy-matrix.md, edge-matrix.md, person-company-diff.md og sperrede SQL/provisioning-filer i samme mappe. Ingen nøkler/tokens lagret. Ikke en full databasedump og ikke brukerens driftsdata utover avgrenset tilgangssnapshot.
