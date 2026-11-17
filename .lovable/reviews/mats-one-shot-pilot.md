# Mats 60570 – klargjort engangspilot 17. november 2026

## Deploy
- Migrasjon 0105 og separat `job-calendar-one-shot` deployet. Ingen andre funksjoner endret/deployet i denne runden.
- UI ligger nederst i pilotavgrensning på `/admin/microsoft`; publisering gjenstår.
- 1069 tester / 134 filer bestod; 46 nye engangsregresjoner dekker mock Graph, lokal faktisk migrasjon, rolle/selskap/inputgrenser og separat sluttklikk. Automatisk bygg OK.
- Isolert PC/mobilvisning og mock sluttsvar kontrollert. Autentisert deployet statuslesing bestod. Live preflight/final write IKKE kjørt; ingen produksjonspermit/audit/dagsreservasjon opprettet.

## Eksakt begrensning
Kun event `0ecc7c59-c231-4102-8f0c-91d2091172e8`, technician `b0716dc3-ddf7-4501-92af-2397a5180085`, company `a0000000-0000-0000-0000-000000000001`, mailbox `mats.lien.hansen@mcselektrotavler.no`, Oslo 2026-11-19 08–16. Tidspunkter hentes/verifiseres som UTC instants 07–15 for denne konkrete dagen. Andre dager/personer kan ikke legges inn i request.

- Krever ekte signert Hub-operatør, global superadmin OG eksisterende selskapstilgang resource_plan edit + event RLS.
- Aktiv ansettelse/person/kontokobling og tildeling, manuelt dagsintervall, individuell pending/approved, ikke cancelled/archived/deleted. Aggregate rejected er ikke blokkering. Pending busy krever eksplisitt checkbox; endrer aldri responsstatus.
- Eksakt aktiv target, siste target-probe HTTP200 med app/tenant match <24h, full diagnostikk-pass <24h, egen HUB_CALENDAR-identitet med bare kalenderroller inkl ReadWrite; ingen mail/user-token fallback.
- Globale flagg må fortsatt være enabled=false/dry_run=true/tom pilotliste/scope null. Køen er aldri berørt.
- Preflight utfører read-only calendarView for den ene Oslo-dagen, sjekker full u-paginert respons og alle legacy/dag/organizer/approval-mappinger. Uklar tid eller overlappende avtale sperrer, ingen fuzzy-adopsjon. Treffets øvrige kalenderinnhold returneres ikke til UI eller logg.
- Server bygger og fryser payload/hash/signatur/full jobbsnapshot. Preview har nøyaktig method/path/payload, HTML med stabil job-info og ingen attendees/reminder/approval-link. Endelig tekstbekreftelse + checkbox + sluttklikk kreves innen 10 min.
- Før POST: ny GET + atomisk service-only claim rechecker live DB og reserverer den eksisterende calday-nøkkelen pending. Unik consumed permit hindrer alle senere engangsforsøk. Global synk er avslått; personlig dagsopprettelse kan ikke ta samme pending-nøkkel.
- Kun én Graph POST, ingen PATCH/DELETE/automatisk retry. 201+id persisteres atomisk med eksakt central day link/audit; dagsreservasjon forblir pending for å hindre at delegert oppdatering tar eierskap til sentral ID.
- Timeout/5xx/408 eller 2xx uten ID bruker permit og holder usikkerhet; 4xx holder terminalt failed. Ingen repost selv etter tom GET. Operatørens lesereconcile kan kun adoptere ett eksakt transactionId+Hub-marker+tech+day+tid-treff; den gjør ingen writes til Graph. Persistensfeil beholder posting og krever lesereconcile.

## Observert produksjon (SELECT)
- Mats aktiv ansatt/person/Hub-konto, aktivt assigned; pending respons; to aktive dager 19/20. JOB60570 fortsatt rejected, ikke slettet.
- Target aktiv til 18. november 09:09 UTC; mailbox-probe 17. november 09:09:50 UTC HTTP200, tenant/app match.
- Siste fulle diagnostikk 16. november 10:05 UTC er nå eldre enn 24 timer: **preflight vil holde igjen til ny read-only tilkoblingskontroll er bestått**. Ingenting omgås eller auto-fornyes.
- Etter deploy: 0 permits, 0 engangsaudit, 5 held queue attempts=0/released=null; global OFF/dry-run/tom liste/scope null.

## Thomas’ neste steg
1. Publiser UI og åpne Admin → Microsoft.
2. Kjør read-only tilkoblingskontroll for kalenderappens avgrensning på nytt (ikke den syntetiske skrivepilotknappen).
3. Ved behov kjør Mats’ target-lesetest på nytt; ved utløpt target kreves eksplisitt samme-dag-bekreftelse.
4. Nederst velg «Lesekontroll og forhåndsvisning»; kontroller mottaker, 19. november 08–16, tittel, jobbinfo og eksakte request-data.
5. Bare dersom Thomas separat ønsker faktisk opprettelse: bekreft Opptatt selv om pending, skriv `OPPRETT MATS 19.11.2026 08–16`, trykk sluttknappen «Opprett én avtale for Mats 19. november».
6. Krev Microsoft-bekreftet resultat og persistert ID; ved ukjent/feil bruk kun lesekontroll. Ingen aktivering eller køfrigivelse.

Live preflight, faktisk Graph POST, Outlook-rendering og Mats’ faktiske visning/mottak er ikke verifisert og avventer separat operatørhandling.