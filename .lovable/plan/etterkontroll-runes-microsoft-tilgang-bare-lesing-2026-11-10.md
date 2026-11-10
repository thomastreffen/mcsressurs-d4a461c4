# Etterkontroll: Runes Microsoft-tilgang (bare lesing)

## Status nå (bekreftet før planen)
- Synkstatus for Rune (rune.orbeck@mcsservice.no): fortsatt **403 / ingen tilgang**. Det har feilet 27 ganger på rad. Siste forsøk var kl. 11:10 norsk tid, seks minutter etter Simens endring kl. 11:04. Hub har aldri klart å lese Runes kalender.
- Hans Jakob og Lars Erik har også fortsatt 403. Det er som forventet, siden de ikke er lagt i gruppen.
- Mats, Marcus, John Aleksander og Emil har vellykket lesing (ok) kl. 11:10. Synken fungerer for dem.
- Konklusjon foreløpig: Microsoft-endringen hadde ikke slått gjennom kl. 11:10. Simen oppga 30–60 minutter, så kontrollen gjøres tidligst ca. kl. 11:35–12:05.

## Hva jeg gjør etter godkjenning (bare lesing)
1. **Kalender, én lesing:** henter én Runes kalender med eksisterende Hub-app, uten innhold (bare id). Jeg noterer HTTP-status og Microsofts feilkode.
2. **E-post, én lesing:** henter én Runes innboks, bare metadata (antall/id, ingen emne, ingen avsender, ingen innhold). Jeg noterer status og feilkode. Formålet er å bekrefte om gruppen også har åpnet e-posttilgang.
3. **Sammenligning:** den samme lesingen for Mats (kjent ok) og Hans Jakob (kjent sperret), slik at resultatet kan tolkes sikkert.
4. **Synkstatus i Hub:** leser Runes rad på nytt etter neste automatiske kjøring (hvert ~5. min). Jeg ser om den har gått fra 403 til ok, og om Runes Outlook-avtaler har kommet inn i Ressursplan (antall, ikke innhold).
5. Hvis det fortsatt er 403: jeg rapporterer at endringen ikke har slått gjennom ennå, og foreslår ny kontroll om 30 minutter. Jeg tvinger ingenting.

## Hva jeg ikke gjør
Ingen skriving eller sending i kalender eller e-post. Ingen ny utsending av avtaler. Ingen manuell synk. Jeg endrer ikke grupper, tilgangsregler, nøkler eller roller. Ingen tokens eller innhold blir logget eller vist.

## Rapporten skiller
- **Verifisert:** målt status og feilkode for kalender og e-post, og Hub-synkstatus.
- **Antatt:** at gruppen «MCS Service» også gjelder andre i gruppen, altså e-post og kalender for alle medlemmer. Jeg kan ikke se medlemslisten.
- **Konsekvens:** med dagens app (Mail.Read, Mail.ReadWrite, Mail.Send) gir medlemskap i gruppen tilgang til både e-post og kalender, ikke bare kalender. Den egne appen «MCS Hub Kalender» er fortsatt anbefalt varig løsning. Etter at den er på plass kan Rune tas ut av gruppen igjen.

## Teknisk
Én engangs GET via serverfunksjonen med eksisterende app-token: `/users/{upn}/calendars?$select=id&$top=1` og `/users/{upn}/mailFolders/inbox?$select=id,totalItemCount`. Bare statuskode og `error.code` returneres. Etterpå leser jeg `schedule_sync_state` og teller `schedule_blocks` for Rune.
