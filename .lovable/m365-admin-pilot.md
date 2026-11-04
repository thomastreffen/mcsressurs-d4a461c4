# Microsoft 365 – admin- og pilotkontroll

## Implementert
- Approval, resend, påminnelser og oppdragsendringer bruker felles avsender bak bryter. Ukjent eller avvist Graph-resultat er ikke levering.
- Informasjonsmodus (`entity_type=internal` eller eksplisitt `response_required=false`) oppretter ikke Hub-godkjenning. Tittel brukes aldri til å gjette gammel møtetype.
- Separat arrangørmodell per tildeling støtter ulike montørtider og stabil transactionId/ImmutableId. Eksisterende individuelle kalenderobjekter beholdes. Svar leses fra arrangørobjektet og er separat fra Hub-oppdragsgodkjenning.
- Atomisk mottakerspor, feilmelding til planlegger og vedvarende arbeidskø. Alle tildelingsinnsettinger, tidsendringer, sletting/fjerning og sentrale oppdragsendringer registrerer intensjon uten nettverkskall fra triggere.
- Ny avgrenset dispatcher krever pilot/rettigheter, maks sju mottakere/tre forsøk og stopper ukjent resultat. Ingen cron aktivert.

## Ikke ferdig / ikke aktivert
- Køens endring/sletting/fjernet montør er registrert, men dispatcheren blokkerer disse operasjonene inntil komplett koordinering av gamle/ny kalender og mail er implementert. Direkte eksisterende booking/sletting er beholdt.
- Ukjent POST uten lagret arrangør-ID krever manuell reconciliation; automatisk marker-/transaction-søk er ikke implementert. Ingen blind replay.
- Ingen automatisk oppfølging av Outlook-svar/webhook; eksplisitt reconcile kan lese kjent arrangør-ID. Ingen bekreftelse av innboksmottak eller message trace-integrasjon.
- Gamle opprettelsesveier (ProjectNewPage, DropConfirmPopover, eldre tasks-sync) er ikke samlet i én servertransaksjon; ny kø fanger event_technicians, men automatisk kødrift er ikke aktivert. Ikke erklært komplett driftsklar.
- Ny kø/status-visning må ferdigstilles for egen arbeidsoverflate og separat Hub-varsel-/approval-status; dagens leveringslinje viser e-post og kalender.

## Microsoft-admin: må dokumenteres før brytere settes
1. Identifiser eksisterende appregistrering og eksisterende Postkontoret-rettigheter uten å dele hemmeligheter. Ingen nøkler roteres i dette arbeidet.
2. Verifiser application Mail.Send og application Calendars.ReadWrite, admin consent og Exchange Online tilgang for postkontoret@mcsservice.no. Delegated Mail.Send alene er ikke nok for app-auth.
3. Avgrens effektive Exchange-rettigheter til denne postboksen med Application RBAC/kompatibel eksisterende Application Access Policy. Kontroller at brede Entra-tillatelser ikke fortsatt gir additive tenant-wide rettigheter. Bevar innbokslesing, webhook og eksisterende sending som Postkontoret trenger.
4. Bekreft positiv tilgang til postkontoret og negativ tilgang til en uvedkommende testpostboks med Microsoft-admins verktøy. Dokumenter rettighet, scope, tidspunkt og ansvarlig; ingen ekte montørtesting.
5. Microsoft 202 = overlevert. Arrangørobjektets eksistens = kun arrangørkalender. Deltakers accepted = registrert Outlook-svar, ikke Hub-godkjenning eller bevis på alle e-postvedlegg lest.

## Pilot – krever separat eksplisitt godkjenning
- Bare avtalte isolerte testmottakere, én oppgave og to deltakere, ingen ekte montører.
- Sett først verifisert mailbox-scope, eksakt mottakerliste og deretter de to bryterne etter adminbekreftelsen. Verdier er serverkonfigurasjon, ikke frontend.
- Kontroller opprett, endret tid, fjern én, slett, nettverksfeil og nytt forsøk: null duplikater; ingen falsk grønn; Postkontoret inn/ut fortsatt virker.
- Ingen bred aktivering før blokkerte livsløpsveier og automatisert reconciliation er ferdig og testet. Ved stopp behold arrangør-ID-er, sett bryter av og avstem manuelt; ikke masseflytt gamle avtaler.

## Publisering
Ingen frontend-publisering eller manuell funksjonsdeploy bestilt her. Lovable kan distribuere funksjonskode automatisk; det er ikke det samme som aktivering. Additive schemaendringer er installert, ingen eksisterende oppgaver/avtaler er endret eller historiske poster backfilled. Funksjonsversjon i produksjon er ikke live-verifisert med sending.