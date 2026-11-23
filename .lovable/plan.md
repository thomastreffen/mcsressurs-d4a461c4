# Avtalevakt: tilgangstest for Exchange RBAC-only

Status: bare gjennomgang. Ingen e-post er lest, ingenting er endret og ingen hemmelighet er bedt om.

## Funn i dagens diagnostikk
Det som allerede stemmer:
- Ingen Entra-roller i tokenet regnes som «Exchange RBAC», og det godtas.
- Positiv prøve mot thomas.treffen@ (forventer 200) og negativ prøve mot postkontoret@ (forventer 403). 401/429/5xx gir «uavklart», aldri godkjent.
- Testen setter aldri `scope_verified_at`, så den kan ikke aktivere tjenesten.

Det som må justeres:
1. **Bred Entra Mail.Read godkjennes i dag.** `assessRoles` godtar `Mail.Read` i tokenet («klassisk»). Med RBAC blir Entra og RBAC slått sammen, så Mail.Read gir tilgang til hele organisasjonen. Ny regel: tokenet skal ikke ha noen e-post-, postkasse-, kalender- eller kontaktroller i Entra (samme liste som `UNSCOPED_RISK`). Finnes en slik rolle, feiler testen med beskjed om å fjerne den.
2. **Tokenets tenant og app-ID sjekkes ikke.** Legg til en sjekk på at `tid` og `appid`/`azp` er lik AVTALEVAKT_TENANT_ID og AVTALEVAKT_CLIENT_ID. Det samme gjør vi allerede for systemavsenderen.
3. **Den positive prøven henter en meldings-ID.** I dag leses `inbox/messages?$select=id&$top=1`. Bytt til `GET /users/{thomas}/mailFolders/inbox?$select=id`. Det krever samme RBAC-tilgang, men henter bare mappeinformasjon, aldri meldinger.
4. **Den negative prøven er for grov.** I dag holder det med 403. Nå må Graph svare 403 med feilkoden `ErrorAccessDenied` eller `AccessDenied`. 404 eller en ukjent postkasse gir «uavklart», ikke godkjent. Vi legger også til én negativ prøve til, mot en annen MCS-postkasse, mappenivå GET.
5. **Teksten på skjermen er utdatert.** Den sier «bare Mail.Read». Ny tekst: «Exchange RBAC for Applications, Application Mail.Read avgrenset til Thomas sin postkasse. Ingen Graph-e-posttillatelser i Entra.»
6. **Krevd modell lagres.** Hver kjøring lagrer `auth_path: exchange_rbac`, statuskoder og feilkoder for hver prøve, men aldri innhold eller token.

Uendret: lesesperren `mayRead` (enabled + scope_verified_at + consent + postkasse), ingen sending og ingen aktivering.

## Etter at hemmeligheten er rotert (rekkefølge)
1. Simen lager en ny client secret for Avtalevakt-appen og sletter den gamle i Entra med en gang. Den gamle er sendt på e-post og må regnes som lekket.
2. Thomas legger inn den nye verdien selv i Project Settings → Secrets som `AVTALEVAKT_CLIENT_SECRET`. Han oppdaterer også TENANT_ID og CLIENT_ID hvis de er nye. Verdien skal ikke sendes i chat eller e-post.
3. Admin → Avtalevakt → «Tilkoblingstest» → «Kjør test». Forventet resultat: token OK, tenant/app OK, ingen Entra-e-postroller, egen identitet, Thomas 200, andre postkasser 403 AccessDenied, og samlet «Bestått».
4. Hvis testen feiler, viser skjermen hvilken rolle som må fjernes eller hvilken Exchange-regel som mangler. Ingenting aktiveres.
5. Aktivering, det vil si å sette avgrensningen som verifisert, gi samtykke og slå på, er et eget steg som Thomas gjør selv senere. Det er ikke med i denne planen.

## Tekniske detaljer
- `_shared/contract-watch-core.ts`: `assessRoles` feiler hvis tokenet har en rolle fra `UNSCOPED_RISK`, og `path` er alltid `exchange_rbac`. Nye funksjoner: `assessTokenIdentity(claims, tenant, clientId)` og `judgeNegativeProbe(status, errorCode)`.
- `contract-watch-diagnostics/index.ts`: prøve på mappenivå, lese feilkoden fra 403-svaret uten å lagre det, to negative postkasser, ny sjekk av tid/appid.
- `ContractWatchDiagnosticsCard.tsx`: ny tekst og visning av feilkode for hver prøve.
- `src/test/contract-watch-core.test.ts`: Mail.Read i Entra skal nå feile, tomme roller skal bestå, feil tenant/app skal feile, 403 uten AccessDenied og 404 skal gi uavklart.
- Funksjonen deployes, og skjermbildet krever publisering.
