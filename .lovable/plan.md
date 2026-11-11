# Sikkerhetsreview: «MCS Hub Kalender» – plan til Simen og Hub-oppsett etterpå

Kun lesing. Ingen produktendringer, tokenkall, kobling eller flaggendringer er gjort. Den eksponerte client secret er ikke lest, kopiert eller brukt.

## 1. Hub sin nåværende tilstand (verifisert)

- Den sentrale kalendersynken leser bare tre egne hemmeligheter: `HUB_CALENDAR_TENANT_ID`, `HUB_CALENDAR_CLIENT_ID` og `HUB_CALENDAR_CLIENT_SECRET`. Tenant faller tilbake til `AZURE_TENANT_ID`.
- Den bruker **aldri** Postkontoret-appen (`AZURE_*`) eller brukertokens. Mangler en av hemmelighetene, stopper den uten nettverkskall.
- Brytere i databasen nå:
  - Jobbsynk: `enabled=false`, `dry_run=true`, ingen pilotpostkasser, `scope_verified_at` tom.
  - Avtalesynk: `enabled=false`, `inbound_enabled=false`, `dry_run=true`, ingen pilotpostkasser.
- Ekstra sperre i koden: synken nekter å kjøre hvis `scope_verified_at` er tom, selv når den er slått på. Bare postkasser i pilotlisten behandles.

## 2. Viktig arkitekturpoeng

**En tenant-wide Entra application permission (`Calendars.ReadWrite` med admin consent) kan ikke begrenses bare ved å legge på Exchange RBAC for Applications.** Effektive rettigheter er summen av begge (additive). Appen beholder da tilgang til alle kalendere i tenanten. Begrensningen virker bare hvis den brede Entra-tillatelsen fjernes (A), eller hvis en faktisk ApplicationAccessPolicy med RestrictAccess legges på appen (B).

## 3. Bestilling til Simen (videresendbar, uten hemmeligheter eller persondata)

**Steg 0 – den eksponerte hemmeligheten (først)**
1. I Entra → App registrations → «MCS Hub Kalender» → Certificates & secrets: **slett den opprinnelige client secret** som ble sendt på e-post.
2. Slett e-posten fra sendt-, mottatt- og slettet-mappene hos begge parter.
3. Sjekk sign-in-loggene for service principal at det ikke finnes ukjente token-utstedelser etter at hemmeligheten ble opprettet.
4. Lag en **ny** secret med kort levetid (f.eks. 6 måneder) **først når Hub er klar til pilot**. Den sendes aldri på e-post eller chat, og legges inn av Thomas eller Simen direkte i Hub sine Secrets.

**Steg 1 – tilgangsbegrensning (velg A, anbefalt)**

*Løsning A – Exchange RBAC i stedet for Entra-grant*
1. Fjern `Calendars.ReadWrite` (Application) fra appens API-tillatelser og **revoker admin consent-granten** i Enterprise applications → Permissions.
2. Opprett en dedikert testpostkasse (ikke en ekte ansatt).
3. I Exchange Online PowerShell:
   - `New-ServicePrincipal` for appen (AppId + ObjectId for enterprise-appen).
   - `New-ManagementScope` som bare treffer testpostkassen.
   - `New-ManagementRoleAssignment -Role "Application Calendars.ReadWrite" -App <SP> -CustomResourceScope <scope>`.
4. Verifiser med `Test-ServicePrincipalAuthorization`: testpostkassen gir InScope=True og en annen postkasse gir InScope=False.

*Løsning B – behold grant, legg faktisk policy*
1. Opprett en **ny** mail-enabled security group som bare inneholder testpostkassen. **Ikke** bruk den eksisterende «MCS Service»-gruppen.
2. `New-ApplicationAccessPolicy -AppId <ny app> -PolicyScopeGroupId <ny gruppe> -AccessRight RestrictAccess`.
3. Verifiser med `Test-ApplicationAccessPolicy`: Granted for testpostkassen, Denied for en annen.
4. Merk: Microsoft anbefaler RBAC for Applications fremfor Application Access Policy. Derfor er A anbefalt.

**Steg 2 – forventet resultat (Simen dokumenterer)**
| Kontroll | Forventet |
|---|---|
| Graph kalender (les/skriv) mot testpostkassen | 200 |
| Graph kalender mot annen ansatt | 403 |
| Graph Mail API mot testpostkassen | 403 (appen har ingen mailtillatelse) |
| Appens API-tillatelser i Entra | A: ingen Graph application permission. B: kun `Calendars.ReadWrite` |

Kontrollene kjøres av Simen med egne verktøy eller sammen med Hub. Først da kobles appen til Hub.

**Rollback:** fjern rolletildelingen eller policyen, slett secret og eventuelt service principal. Hub stopper da automatisk fordi den ikke får token.

## 4. Hub-oppsett etter Simens bekreftelse (krever egen godkjenning)

1. Thomas eller Simen legger inn `HUB_CALENDAR_TENANT_ID`, `HUB_CALENDAR_CLIENT_ID` og den **nye** `HUB_CALENDAR_CLIENT_SECRET` i Hub sine Secrets. Ingen deler verdiene i chat.
2. Én lesende tokenkontroll som bare sjekker at token utstedes. Ingen kalenderkall.
3. Én lesende kontroll mot testpostkassen og én mot en annen postkasse (forventet 200 og 403). Resultatet lagres som revisjonsspor.
4. Først etter det settes `scope_verified_at` og `scope_verified_by`, og pilotlisten får **bare** testpostkassen. `dry_run` står fortsatt PÅ.
5. Dry-run i testpostkassen, deretter `dry_run=false` for testpostkassen alene.
6. Ekte montører legges til i scope hos Microsoft og i pilotlisten i Hub først etter egen godkjenning.

## 5. Det som ikke gjøres nå

Ingen tokentest, ingen kobling, ingen secrets lagt inn, ingen flagg endret, ingen bruk av «MCS Service»-gruppen og ingen kall mot ekte postkasser.

## Tekniske detaljer

- `supabase/functions/job-outlook-app-sync/index.ts:16-28`: `getCalendarAppToken()` bruker client credentials med `.default`-scope og returnerer null ved manglende env (fail closed).
- Brytere: tabellene `job_outlook_app_sync_settings` og `hub_outlook_sync_settings` (singleton-rader, lest 11.11).
- Mailvarsler bruker separat `AZURE_*` (`_shared/m365-sender.ts`) og påvirkes ikke.
