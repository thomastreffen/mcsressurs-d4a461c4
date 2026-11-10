# Outlook ↔ Hub Ressursplan – gap-analyse og datakontrakt (10.11.2026)

## Faktisk i dag
| Retning | Mekanisme | Status |
|---|---|---|
| Outlook → Hub | `outlook-schedule-sync` (cron 5/15 min, app-token, calendarView/delta 4 uker) → `schedule_blocks` source=outlook | I drift for montører med lesetilgang. 403 for Eirik, Hans Jakob, Lars Erik, Rune |
| Hub jobb → Outlook | `calendar-write-sync` per tildelt montør (create/update/delete, etag) | I drift |
| Hub oppgave → Outlook | `sync-task-to-calendar` via `/me` (brukerens egen token) | Kun når brukeren selv er innlogget med Microsoft; ikke robust |
| Outlook-endring på Hub-opprettet avtale → Hub | Hoppes over (kategori MCS / MCS_SOURCE) | Mangler – Hub overskriver ved neste oppdatering |
| Webhook kalender | Graph-subscription gjelder kun e-post | Mangler; polling-delta brukes |

## Rettet i denne leveransen (etappe 2, sikkerhet/personvern)
- Private/personlige/konfidensielle Outlook-avtaler lagres kun som «Opptatt» + tidsrom; emne, tekst, sted, arrangør og lenke importeres ikke. Én full gjenlesing ryddet eksisterende rader.
- Tekst-match mot prosjekter var på tvers av selskap og uten escaping; nå selskapsavgrenset og renset.
- Tekst-match kobler ikke lenger automatisk; den foreslår (needs_confirmation). Kun Hub-markør (MCS_BLOCK_ID) kobler automatisk.
- Kansellerte avtaler (isCancelled) behandles som slettet blokk (aldri sletting av jobb).
- Lagrer iCalUId, sensitivity, showAs, heldags og serie-ID.
- Per-ansatt synkstatus (ok / access_denied / error, feilkode, antall feil på rad).

## Datakontrakt (mål)
`calendar_sync_links`: company_id, person/technician_id, mailbox, graph_event_id (immutable id), ical_uid, hub_entity_type (job|task|block), hub_entity_id, change_key, hub_version, direction_owner, last_synced_at, conflict_state, last_error. Unik (mailbox, graph_event_id) og (hub_entity_type, hub_entity_id, technician_id).

Regler:
- Hub-jobb: Hub er master for kunde, prosjekt, PL, faktura, dokumentasjon. Fra Outlook aksepteres kun tid/varighet for den montørens tildeling (event_technicians overstyring) → rekvirerer ny bekreftelse, aldri endring av jobbens øvrige felt.
- Hub-oppgave (planning_tasks/tasks): tid og tittel kan endres begge veier.
- Outlook-avtale: forblir kalenderblokk til bruker velger «Knytt til jobb» eller «Opprett Hub-oppgave». Aldri jobb, HMS, Tripletex, ordre eller varsel automatisk.
- Konflikt: hvis begge sider endret siden forrige synk (changeKey ≠ lagret og hub_version ≠ lagret) → conflict_state=open, ingen overskriving, vises for planlegger.
- Sletting i Outlook: myk-sletter blokk/kobling, aldri jobb/oppgave; logges.
- Tid lagres som UTC; visning Europe/Oslo.

## Etapper
1. Gap/kontrakt – levert (dette dokumentet).
2. Trygg import – levert (se over). Gjenstår: statusvisning i UI.
3. Hub-oppgave → Outlook via app-token (som jobber), bak selskapsflagg AV.
4. Outlook-endringer på Hub-avtaler → Hub med konfliktmodell, bak flagg AV.
5. Kontrollert test på én isolert testpostkasse (krever godkjenning).

## Trenger fra Thomas/Simen (Microsoft-admin)
403 for Eirik, Hans Jakob, Lars Erik og Rune er app-tilgang i Microsoft 365 (sannsynlig Application Access Policy / gruppe som appen får lese kalendere i). De må legges i samme tillatte gruppe som de øvrige montørene. Rune kan ikke få Outlook-avtaler inn i Hub før dette er gjort.
