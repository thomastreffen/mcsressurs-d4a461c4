# CRM-e-post: direkte sending fra selgerens egen Microsoft 365-konto

Målmodell: Rune trykker **Send** i Hub, og e-posten går fra hans egen Microsoft-konto. Han får en sannferdig status i Hub uten å åpne Outlook. «Utkast i Outlook» er ikke primærløsning. Postkontoret brukes ikke som avsender for CRM-e-post. Denne runden er bare plan: ingen kode, ingen sending og ingen aktivering av flagg eller rettigheter.

## Status i dag (lest fra koden)

- Sendefunksjonen `crm-email-send` finnes og er avslått (`CRM_EMAIL_SEND_ENABLED` er ikke satt).
- Den har allerede:
  - forhåndsvisning
  - kontroll av mottakere på serveren
  - engangsnøkkel
  - svaradresse til Hub-tråden
  - stopp hvis Microsoft-tilkobling mangler, uten å bruke en annen avsender
- **Viktig funn:** Innloggingen (`auth-callback`) ber i dag Microsoft om tilgang til å lese og skrive e-post og kalender, men **ikke om å sende e-post** (`Mail.Send`).
  - Sendefunksjonen ber om sendetilgang når den fornyer tilkoblingen. Det virker bare hvis administrator allerede har godkjent `Mail.Send` for hele organisasjonen. Det er ikke bekreftet.
  - Hvis tilgangen mangler, vil dagens kode lage et utkast i selgerens Outlook før selve sendingen avvises. Det kan legge igjen utkast. Det må rettes før sending slås på.
- Svar fra kunden kobles til riktig tråd i Postkontoret via `thread+{token}` i svaradressen og Microsofts melding-ID. Tråden er koblet til kunde, avdeling og henvendelse.

## Brukerflyt

1. Fra kundekort, avdeling eller lead: trykk **Send e-post**. Ingen e-post sendes ved opprettelse av lead.
2. Velg mottakere blant aktive kontakter hos kunden. Manuelle adresser er merket og må bekreftes.
3. Skriv emne og tekst, og trykk **Forhåndsvis**. Forhåndsvisningen viser:
   - avsender (din konto)
   - om Microsoft-tilkoblingen tillater sending
   - mottakere
   - svaradresse
   - kunde, avdeling og sak
4. Kryss av «Kontrollert», og trykk **Send**.
5. Status vises i panelet og i historikken.

| Status | Når | Hva brukeren ser og gjør |
|---|---|---|
| Klargjort | Før Send | Kan redigere |
| Sender … | Mens serveren kaller Microsoft | Knappen er låst |
| Akseptert av Microsoft | Microsoft svarte 202 | «Akseptert, ikke bekreftet levert». Aldri «levert» |
| Feilet | 4xx, f.eks. manglende tilgang eller ugyldig mottaker | Tekst og mottakere beholdes. Konkret handling: «Koble til Microsoft på nytt» eller «Rett mottaker» |
| Uavklart | Tidsavbrudd, 5xx eller 429 | Ingen ny sending. Hub sjekker selv om meldingen finnes i Sendte elementer. Bare «Ikke funnet etter kontroll» åpner for en ny, eksplisitt sending med ny engangsnøkkel |

Uten gyldig tilkobling med sendetilgang er **Send** sperret med en ærlig forklaring. Hub bytter aldri til en annen avsender.

## Gjennomføring

**1. Tilgangskontroll (kun lesing, før noe annet)**
- Forhåndsvisningen leser hvilke rettigheter selgerens Microsoft-tilgang faktisk har (`scp`), uten å vise selve tilgangen. Den viser én av tre tilstander:
  - «Kan sende»
  - «Mangler sendetilgang»
  - «Ikke tilkoblet / utløpt»
- Simen bekrefter i Entra om den eksisterende innloggingsappen har delegert `Mail.Send` med admin-samtykke. Hvis ikke, legges `Mail.Send` til i innloggingens tilgangsliste, og brukerne godkjenner én gang ved neste innlogging. Det krever egen godkjenning.

**2. Rett sendesekvensen**
- Uten bekreftet sendetilgang kalles Microsoft ikke i det hele tatt, og det lages ingen utkast.
- Med sendetilgang lages og sendes én e-post. Melding-ID, samtale-ID og internett-melding-ID lagres for kobling av svar.
- Hvis sendingen avvises etter at utkastet er laget, slettes bare det utkastet Hub selv laget, med nøyaktig ID.

**3. Lagre alt som trengs for sporing**
- `crm_email_sends` utvides med: kontakt-ID-er, kunde, avdeling, lead/sak, tråd, avsenderens konto, Microsofts melding-ID og samtale-ID, statushistorikk og feilkode.
- Utkastets tekst og mottakere lagres på serveren, slik at ingenting går tapt ved feil eller lukket fane.

**4. Avstemming ved uavklart utfall**
- Lesesjekk i selgerens Sendte elementer etter nøyaktig internett-melding-ID.
- Funnet gir «Akseptert». Ikke funnet gir «Ikke sendt», og ny sending krever et nytt eksplisitt klikk.

**5. Status i panelet og historikken**
- Statusene over vises i e-postpanelet, i kundens samlede historikk og på lead.
- Knappen «Send e-post» legges også på lead-siden.

**6. Svar til Postkontoret**
- Bruk eksisterende kobling med trådtoken og In-Reply-To.
- Svar som ikke kan kobles sikkert, merkes «Ukjent kobling» og må velges manuelt.

**7. Aktivering (egen godkjenning)**
- Først én testmelding fra Thomas' egen konto til Thomas selv.
- Deretter slås det på for navngitte selgere. Ingen masseutsending.

## Ikke med

- Utkast i Outlook som primærløsning.
- Postkontoret eller annen avsender som reserve.
- Automatisk e-post ved opprettelse av lead.
- Teams og kalender.
- Endring av rettigheter eller flagg uten separat godkjenning.

## Tekniske detaljer

- Rettighetene leses fra `scp` i den delegerte tilgangen på serveren. Feilkodene `consent_required` og `invalid_grant` ved fornyelse gir «Koble til Microsoft på nytt». Tilgangen logges eller returneres aldri.
- Sending skjer med `POST /me/messages` og deretter `/send` på samme ID, eller med `sendMail` når melding-ID ikke trengs. Retry skjer bare etter avstemming. Engangsnøkkel og `client_request_id` beholdes.
- Tester: mock av Microsoft for 202, 401, 403 (manglende tilgang, uten utkast igjen), 429, 5xx og tidsavbrudd, med avstemming som finner eller ikke finner meldingen, dobbeltklikk, sluttet kontakt og manuell adresse som ikke er bekreftet. Isolerte databasetester som rulles tilbake for selskapsgrenser.
