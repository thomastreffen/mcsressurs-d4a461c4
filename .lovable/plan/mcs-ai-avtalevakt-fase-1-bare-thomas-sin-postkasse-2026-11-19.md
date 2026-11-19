# MCS AI Avtalevakt – fase 1 (bare Thomas sin postkasse)

## Mål
Avtalevakten leser e-post i thomas.treffen@mcsservice.no, både innkommende og sendt. Den finner konkrete løfter om kundejobber, for eksempel «vi kommer tirsdag 25.11 kl 08 til Bravida Sandvika». Løftene sjekkes mot CRM, Ressursplan og tildelte montører, og Thomas varsles bare om avvik. Ved avvik foreslås en ferdig utfylt jobb som Thomas selv må opprette.

Avtalevakten sender aldri e-post. Den tildeler aldri montører og oppretter aldri jobber eller kalenderoppføringer av seg selv. Montører varsles aldri.

## Hva som finnes i dag (kontrollert i koden)

| Del | Status | Bruk i Avtalevakt |
|---|---|---|
| Microsoft-innlogging for den enkelte bruker (`auth-callback`) | Finnes. Ber om lese- og skrivetilgang til e-post, kalender og brukere, og lagrer tilgangene på serveren | Ikke brukt. Tilgangen er for bred, og selgernes sendeløsning bruker samme tilkobling |
| Henting av Postkontorets e-post (`inbox-sync`, `inbox-scan`, `graph-webhook-inbound`, `graph-subscription-manage/renew-cron`) | Finnes. Bruker appens egen tilgang til én bestemt postkasse, varsler fra Microsoft med hemmelig kontrollverdi (`clientState`) og fornyelse | Mønsteret gjenbrukes, men gjelder i dag bare postkontoret |
| AI-forslag fra e-post (`suggest-task-from-email`, `ai-project-matcher`) | Finnes, via Lovable AI | Mønsteret for uttrekk og kobling til prosjekt gjenbrukes |
| CRM: kunder, avdelinger, kontakter og leads | Finnes, avgrenset per selskap | Brukes til å finne riktig kunde |
| Ressursplan: jobber, arbeidsdager og tildelte montører | Finnes | Den autoritative fasiten det sammenlignes mot |
| Varsel i Hub | Finnes | Brukes bare til Thomas |
| Egen app-identitet bare for lesing av e-post, tabeller for løfter og avvik, og en egen Avtalevakt-skjerm | **Mangler** | Må bygges |

## Valg av tilgang i Microsoft
Anbefalt løsning er **en egen app-registrering «MCS Hub Avtalevakt» med bare leserettighet til e-post, `Mail.Read`, som applikasjonstillatelse**. Den begrenses i Exchange til akkurat Thomas sin postkasse.

Hvorfor ikke Thomas sin egen innlogging:
- Den har skrivetilgang til e-post og kalender.
- Den slutter å virke når tilkoblingen må fornyes eller Thomas logger ut.
- Den deles med sendeløsningen for selgere.

En egen app som bare kan lese kan aldri sende, slette eller endre e-post. Den kan slås av uavhengig av alt annet.

Alternativet er at Thomas logger inn på nytt og godkjenner en egen lesetilgang, `Mail.Read`, med fornyelse (`offline_access`) i en separat app. Det gir bare tilgang til hans postkasse, men er mer sårbart.

## Det Thomas og Simen må godkjenne i Microsoft 365
1. Simen oppretter appen «MCS Hub Avtalevakt» i Entra.
   - Den får bare `Mail.Read` som applikasjonstillatelse, med admin-samtykke.
   - Ingen `Mail.Send` eller `ReadWrite`, og ingen kalendertilgang.
2. Simen begrenser appen i Exchange til bare `thomas.treffen@mcsservice.no`. Det gjøres med en tilgangsregel (Application Access Policy eller RBAC for Applications) koblet til en sikkerhetsgruppe der bare Thomas er med.
3. Simen legger inn appens tre ID-er og hemmelighet som egne hemmeligheter i Hub: `AVTALEVAKT_TENANT_ID`, `AVTALEVAKT_CLIENT_ID` og `AVTALEVAKT_CLIENT_SECRET`. De deles ikke med andre apper.
4. Thomas godkjenner skriftlig i Hub:
   - at e-posten hans behandles i fase 1
   - en historisk test på 30 dager
   - at AI-behandlingen går gjennom Lovable AI
   - hvor lenge data lagres
5. Diagnosen i Hub bekrefter: lesing av Thomas sin postkasse gir svar 200, en annen postkasse gir 403, og sending gir 403.

## Byggetrinn

**Trinn 1 – Diagnose og brytere (ingen lesing av e-post)**
- En diagnoseskjerm bare for superadmin, etter samme mønster som kalenderdiagnosen. Den sjekker:
  - at hemmelighetene er satt (verdiene vises aldri)
  - at tilgangen bare er `Mail.Read`
  - at appen er en egen identitet
  - lesesjekker som gir 200 mot Thomas og 403 mot alle andre
- Innstillingene `contract_watch_settings` er av som standard. De har en liste over tillatte postkasser, som starter tom, og en rad for samtykke. Lesing er umulig før diagnosen er godkjent og Thomas er lagt til uttrykkelig.

**Trinn 2 – Henting med dataminimering**
- Henter bare utvalgte felt fra Innboks og Sendte elementer:
  - melding-ID, samtale-ID, internett-melding-ID
  - avsender og mottakere
  - emne og tidspunkt
  - tekst uten sitert tidligere tekst
- Vedlegg hentes ikke i fase 1.
- Ny e-post:
  - varsler fra Microsoft (`changeType=created,updated`) med egen kontrollverdi og fornyelse
  - endringer hentes per mappe (`delta`) med lagret posisjon (`deltaLink`)
  - kontrollhenting hvert 15. minutt som reserve
- Forhåndsfilter uten AI: interne nyhetsbrev, varsler fra systemer, automatiske svar og e-post uten treff i kunderegister eller domene hoppes over.
- Selve e-postteksten lagres ikke. Bare et kort utdrag med det relevante løftet, høyst 500 tegn, og en kontrollsum (hash) av meldingen lagres.

**Trinn 3 – AI-uttrekk av løfter**
- Lovable AI trekker ut strukturerte løfter: kunde, avdeling, sted, dato og klokkeslett, antall montører, oppgavetype, hvem som lovet, og ordrett sitat.
- Hvert løfte får en konfidens fra 0 til 1.
- Datoer tolkes relativt til sendetidspunktet i Europe/Oslo. «Neste tirsdag» blir en eksakt dato. Uklare datoer eller tider merkes som uklare og gjettes aldri.
- Under 0,6: lagres som «Usikker», uten varsel. Fra 0,6 til 0,85: «Bør sjekkes». Over 0,85 og med klar dato: «Sannsynlig løfte».

**Trinn 4 – Sammenligning med CRM og Ressursplan (kun lesing)**
- Kunden matches på domene, kontaktens e-postadresse og navn mot kunder, avdelinger og kontakter. Hvis kunden er usikker, vises den som «Ukjent kunde». Den kobles aldri automatisk.
- Ressursplanen søkes for samme kunde eller prosjekt i et tidsvindu på ±1 dag. Resultatet blir én av disse klassene:
  - Dekket: jobb med tildelte montører finnes.
  - Delvis: jobb finnes, men har feil dag, for få montører eller ingen tildeling.
  - Mangler: ingen jobb finnes.
  - Konflikt: montøren er opptatt eller borte.

**Trinn 5 – Duplikater, endringer og avlysninger**
- Løftene grupperes på samtale-ID og en nøkkel av kunde, dato og oppgave. Svar, videresendinger og sendt kopi blir samme løfte.
- En senere e-post i samme samtale som flytter eller avlyser avtalen, oppdaterer løftet med full historikk. Ressursplanen endres aldri.
- E-post som er slettet eller endret i Outlook gjør løftet «utdatert», men historikken beholdes.

**Trinn 6 – Avvik og forslag til jobb**
- Skjermen «Avtalevakt» viser kø, filtre og et kort per løfte: sitat, lenke til e-posten i Outlook, treff i CRM og status i Ressursplanen.
- Knappen «Lag jobb fra forslag» åpner det vanlige skjemaet for ny jobb i Ressursplan, ferdig utfylt med kunde, avdeling, dato, sted og beskrivelse.
  - Montører er ikke valgt.
  - Varsel til montør er avslått som standard og må slås på aktivt.
  - Ingenting lagres før Thomas trykker Lagre.
- Thomas kan også velge «Ikke et løfte» eller «Allerede håndtert», med begrunnelse. Valget lagres og brukes til læring.
- Varsler går bare i Hub og bare til Thomas. Ved status «Mangler» innen 48 timer og ingen handling innen 2 timer, eskaleres saken med et varsel på toppen av listen. Ingen e-post eller SMS i fase 1.

**Trinn 7 – Historisk test på 30 dager (kun lesing)**
- Kjøres på uttrykkelig klikk etter samtykket. Leser de siste 30 dagene i Innboks og Sendte elementer.
- Resultatet merkes som test og sender ingen varsler.
- Rapporten viser antall løfter per klasse, et utvalg til manuell kontroll av treffsikkerhet og antall falske treff.
- Fortløpende drift slås på først etter at Thomas har godkjent rapporten.

## Sikkerhet, roller og GDPR
- Bare superadmin og Thomas ser Avtalevakten. Dataene er avgrenset per selskap med radsikkerhet (RLS). Montører og andre ansatte har ingen tilgang.
- Alle innhentinger, AI-kall, beslutninger og bryterendringer logges i en revisjonslogg som bare kan utvides.
- Lagring:
  - Utdrag og løfter slettes etter 90 dager.
  - Avviste ting slettes etter 30 dager.
  - Kontrollsummer beholdes for å unngå duplikater.
  - Selve e-posten blir værende i Outlook.
- Private e-poster uten kundetreff behandles ikke av AI. Thomas kan når som helst slå av, og «slett alle data» fjerner løfter og utdrag.
- Ingen produksjonsjobber for test, ingen varsler til montører, og ingen skriving mot Graph.

## Tekniske detaljer
- Nye tabeller: `contract_watch_settings`, `contract_watch_mailbox_state` (deltaLink og abonnement per mappe), `contract_watch_messages` (ID-er, kontrollsum, utdrag), `contract_watch_commitments` (strukturert løfte, konfidens, status og historikk i jsonb), `contract_watch_decisions` og `contract_watch_audit`. Alle får RLS og tilgang via `has_company_access`.
- Nye funksjoner: `contract-watch-diagnostics`, `contract-watch-webhook` (egen `clientState`), `contract-watch-sync` (delta per mappe, med grense per kjøring, `Retry-After` ved 429), `contract-watch-analyze` (Lovable AI med strukturert verktøykall) og `contract-watch-backfill`.
- Rene, testbare kjernemoduler: datotolking i Europe/Oslo, konfidensgrenser, dedupliseringsnøkkel, matching mot Ressursplan og forhåndsfilter.
- Tester med falske Graph-svar (mock) og isolerte databasetester som rulles tilbake. Ingen ekte e-post behandles før punkt 1–5 i godkjenningslisten er gjort.
