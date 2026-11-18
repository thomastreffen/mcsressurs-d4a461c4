# CRM fase 2: avdelinger, kontaktpersoner og kundee-post fra kundekort/lead

Kun plan. Ingen kode, ingen sending, ingen endring av ekte kunder, kontakter eller leads, og ingen flagg slått på.

## Dagens status (kontrollert ved lesing)

| Område | Fungerer i dag | Mangler |
|---|---|---|
| Juridisk kunde (`customers`) | Kundekort, org.nr., selskapsavgrenset tilgang | – |
| Avdelinger (`customer_accounts`) | Tabell med navn, eget org.nr. (valgfritt) og kunde. CRM-laget fra fase 1 (ansvarlig, Hot/Warm/Cold, A/B/C, oppfølging, historikk) bygger på den | Produksjon har 0 avdelinger. Ingen skjerm for å opprette eller endre avdelinger. Direkte lesing er bare åpen for selskapsadmin og kundeportalbrukere |
| Kontaktpersoner (`customer_contacts`) | Navn, e-post, telefon, rolle per kunde (1 rad i produksjon) | Ingen kobling til avdeling, ingen intern ansvarlig, ingen aktiv/sluttet-status, ingen kontroll av duplikater |
| Ny henvendelse | Søk og valg av kunde, avdeling og kontaktutfylling; serveren kontrollerer kunde og selskap (siste leveranse, ikke publisert) | Lead lagrer bare kontaktens navn og e-post som tekst, ingen kobling til kontaktkortet |
| Utgående e-post | `conversation-email-send` sender i en samtaletråd via Microsoft, med Reply-To `thread+{token}@mcsservice.no` og lagrer Microsofts melding-ID per melding. `create-lead-email-draft` lager utkast med brukerens personlige Microsoft-tilkobling | Samtaletråder kan i dag kobles til prosjekt, tilbud og bestilling, men ikke til kunde, avdeling eller lead |
| Innkommende svar | Postkontoret-synk kobler svar til tråd via `thread+`-token og deretter melding-ID. Innboksmeldinger kan allerede kobles til et lead | Ingen kobling til kunde eller avdeling. Ingen kobling av svar til kontaktperson |
| Avsender | Felles avsenderlogikk (`m365-sender`). Systemavsender er av og under separat utprøving | Personlig salgsmail må gå fra den innloggede brukerens egen Microsoft-identitet, ikke fra postkontoret |

## Prinsipper

- «Ny henvendelse» er bare en salgsregistrering. Den sender aldri e-post automatisk.
- «Send e-post» er en egen handling: velg mottaker, forhåndsvis og trykk eksplisitt «Send».
- Vi lager ingen ny e-postsender. All sending går gjennom eksisterende `conversation-email-send` og samtaletrådene.
- Avdelinger og kontakter opprettes bare manuelt av Rune/Thomas eller andre med redigeringsrett. Ingen import og ingen automatisk sammenslåing.
- Kjente feil i kunderegisteret (feilnavn, ugyldige org.nr. og duplikater) håndteres separat.

## Leveranse i fire steg

**Steg 1 – Avdelinger på kundekortet**
- Ny fane «Avdelinger»: liste, «Ny avdeling» (navn, by eller sted, eget org.nr. som valgfritt felt), redigering og arkivering. Avdelinger slettes ikke, de arkiveres.
- Det er tillatt at avdelingen mangler eget org.nr.
- Varsel om mulig duplikat ved likt navn hos samme kunde. Varselet stopper ikke lagring, men krever en bekreftelse.
- Samme CRM-felt og historikk som i fase 1.

**Steg 2 – Kontaktpersoner**
- Nye felt: avdeling (valgfri), intern ansvarlig, aktiv/sluttet og sist verifisert.
- Liste på kundekortet med filter per avdeling. Redigering i en sideskuff (drawer), ikke i et modalvindu.
- Duplikatsjekk på e-post innen samme kunde. Samme e-post hos en annen kunde gir advarsel.
- Ny henvendelse og lead lagrer valgt kontaktperson; den gamle tekstkontakten beholdes på eldre leads.

**Steg 3 – Kundetråd og sending**
- Knappen «Send e-post» på kundekort, avdeling og lead åpner en tråd knyttet til kunde, eventuelt avdeling og lead, eller gjenbruker en eksisterende tråd.
- Mottakere velges bare blant aktive kontakter på samme kunde, i tillegg til manuelt skrevne adresser. Manuelle adresser får tydelig merking og må bekreftes.
- Forhåndsvisning viser:
  - avsender (din Microsoft-konto)
  - Reply-To (trådadresse)
  - mottakere, kopi og eventuell advarsel om eksternt domene
  - kunde, avdeling og sak
- Sending går via eksisterende `conversation-email-send` med engangsnøkkel. Statusen «Akseptert av Microsoft» betyr ikke at e-posten er levert.
- Hvis Microsoft-tilkoblingen mangler, stopper sendingen med en tydelig feilmelding. Ingen reserve via postkontoret.

**Steg 4 – Svar og historikk**
- Innkommende svar kobles som i dag via `thread+`-token, deretter melding-ID/In-Reply-To og samtale-ID. Kunden og avdelingen arves fra tråden.
- Svar som ikke kan kobles sikkert, havner i Postkontoret som «Ukjent kobling» og må velges manuelt. Svar kobles aldri automatisk bare fordi avsenderens domene ligner.
- Én tidslinje i `activity_log` viser leads, e-post, CRM-endringer og kontaktendringer på tvers av kunde, avdeling og lead.

## Tekniske detaljer

- Alle databaseendringer legger bare til nye felt og tabeller:
  - `customer_contacts`: `customer_account_id`, `owner_user_id`, `is_active`, `verified_at`
  - `leads`: `customer_contact_id`
  - `conversation_threads`: `customer_id`, `customer_account_id`, `lead_id`
- Valideringsregler (triggere) på samme måte som på leads: avdelingen hører til kunden, kontakten hører til kunden og eventuelt avdelingen, kunden er ikke slettet og tilhører samme selskap.
- Lagring av avdelinger og kontakter skjer via egne selskapsavgrensede serverfunksjoner som krever redigeringsrett til kunder, med historikk og versjonskontroll. Eksisterende RLS-regler endres ikke. Nye regler legges til i både de vanlige og de begrensende tilgangsreglene der modulreglene krever det.
- Mottakerkontroll på serveren i `conversation-email-send`:
  - kontaktene må tilhøre trådens kunde
  - manuelle adresser må være eksplisitt bekreftet
  - avsender er bare innlogget bruker
  - engangsnøkkel hindrer at samme e-post sendes på nytt
- Tester: isolerte databasetester som rulles tilbake (ulike selskaper, avdeling hos feil kunde, duplikater, sluttet kontakt), mock av Microsoft for vellykket sending, feil, gjentatt klikk og tråding av svar, og UI-test på PC og mobil.

## Ikke med nå

- Systemavsender og postkontoret som avsender.
- Teams, kalender og automatiske varsler.
- Masseutsending.
- Reparasjon og import av kunderegisteret.
- Publisering.
