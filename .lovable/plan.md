# Individuelle tildelinger – samlet arkitekturreparasjon

## Bekreftet rotårsak

Dette er en strukturell feil, ikke bare pilottekst. Én montørs svar brukes som jobbens samlede tilstand, og eldre kalenderkode bruker én mottakers kalender-ID som bevis for hele jobben.

| Område | Observert feil | Riktig målatferd |
|---|---|---|
| `handle-approval` | Ett avslag setter `events.status=rejected`. Godkjenning kan skrive én persons kalender-ID på jobben. Avslag samler alles kalender-ID-er, forsøker sletting i avsenderens kalender og nullstiller alles godkjenningskoblinger hvis én sletting lykkes. | Svar gjelder bare egen aktive tildeling. Ingen global status-/kalenderendring som bivirkning. |
| Sentral kalender | Både single- og per-day-kjerne likestiller `rejected` med `cancelled`/`archived`. | Aggregate rejected er aldri global avlysning eller slettetillatelse. |
| Personlig fler-dagskalender | Vanlig oppdatering kan slette lagrede dager som mangler i innlest plan; `updateOnly` stanser oppretting, men ikke sletting. | Oppdatering er PATCH-only. Fjerning krever eksplisitt, autorisert person/dag-intent og komplett planlesing. |
| Planendringer | Live tidsendringstrigger skriver samme tildelingstid til alle aktive blokker. Flere dager kan kollapses. Quick Edit fjerner før den legger til og omgår samlet avplanlegging. | Behold hver arbeidsdag, isoler person/dag-endringer, og gjør tildelingsendring atomisk. |
| Svar og skjermer | Opprettingsflyt skriver global svarstatus; skuffen kan vise aggregate avslag som én persons svar; én arbeidsliste utelater rejected-jobber. | Utførelse, individuelle svar og kanalstatus vises separat, fra aktive tildelinger. |
| Eierskap | Felles `microsoft_event_id`, personlig token og kalenderorganisator er blandet som eksistens-/eierskapsbevis. Dagskoblingens postboks kontrolleres ikke alltid ved oppslag. | Kalender-ID eies av bestemt identitet/postboks/person/dag; avsender og organisator gir ikke eierskap til andres tildeling. |

### JOB 60570: faktisk produksjonsgrunnlag nå

- Jobb `0ecc7c59-c231-4102-8f0c-91d2091172e8` / `JOB-000437` har fortsatt `status=rejected` og er ikke slettet.
- **Mats er nå eneste aktive tildelte montør**, pending, med aktive blokker 19. og 20. november 07–15 UTC, altså 08–16 Oslo.
- Emil ble avplanlagt 16. november kl. 09:53 UTC. Hans to blokker er mykslettet, og hans approval er ikke lenger lagret. Historikken dokumenterer hans avslag 12. november og gammel kalender-slettekvittering.
- To kalenderdagskoblinger for Emil står fremdeles som synced. Det er **ikke live Graph-bevis** på at avtalene fortsatt finnes. Ingen Microsoft-kall er gjort.
- Sentral synk er AV, dry-run PÅ, scope-verifisering tom og postbokslisten tom. Fem køelementer er pending; ingen er behandlet i gjennomgangen.
- Ingen faktisk «eier alene bestemmer» er påvist. Den konkrete koblingen gjelder **ethvert avslag**, delt kalender-ID og global status. Historisk eierskap utover dette er ikke bevist.

## Anbefalt policy – godkjennes med planen

1. **Et individuelt avslag beholder planreservasjon og kalender til planlegger eksplisitt avplanlegger.** Avslaget fremheves for oppfølging, men fjerner ikke opplysninger eller andre montører. Dette erstatter den gamle regelen om automatisk kalenderfjerning ved avslag.
2. Aksept og tidsforslag registreres kun på egen tildeling; et tidsforslag flytter ingenting. Alle godkjent er en svaroppsummering, ikke automatisk overstyring av utførelse eller avlysning.
3. Person/dag-endring invaliderer bare berørte svar. En eksplisitt endring av hele arbeidsbesøket kan berøre alle, men må bevare separate dager og tydelig vise omfanget.
4. Global avlysning krever eksplisitt, selskapsautorisert planleggerhandling. Et avplanlagt vanlig prosjekt/jobb beholdes; en Ressursplan-oppgave avsluttes først når siste aktive referanse faktisk er fjernet.
5. Gamle rejected-jobber behandles ikke som kansellerte. Ingen automatisk omskriving av produksjonsstatus eller historiske koblinger.

## Samlet implementering

### 1. Felles beslutningsmodell og sikker svarkommando
- Del en ren beslutningsmodell for global livssyklus, individuell respons, aktiv plan og eksakt fjerning mellom personlig og sentral kalender.
- Fjern direkte Graph-oppretting/sletting og jobbwide kalenderfelt-skriving fra `handle-approval`. Kalenderen forvaltes av eksisterende mottaker/dagsflyt, ikke av svarknappen.
- Legg responsvalidering, compare-and-set og audit i én transaksjon: gyldig/ikke utløpt token, aktiv tildeling og konto/ansettelse i jobbens selskap, ikke avlyst/slettet jobb, riktig planversjon. Eksisterende varslingstrigger beholdes som eneste kilde for fremtidige ordinære svar.
- Fjern global svarstatus-skriving fra `create-approval`; tidsendringer får nye/versjonsbundne forespørsler, slik at gamle e-postlenker ikke kan svare på en ny plan.

### 2. Plan og avplanlegging
- Samle add/remove/reassign og person/dag-reschedule i transaksjonelle selskapsavgrensede kommandoer. Gjenbruk eksakt avplanlegging og bevart uløst slettekø.
- Bytt Quick Edit og relevante Drawer/ResourcePlan-grener til disse kommandoene; fjern doble klientstyrte svarresets.
- Rett tidspropagering slik at hver dato/person bevares, og avklar eksplisitt hele-besøket kontra én dag. Ingen «mest nylig blokk» som skjult identitet.
- Kontroller at full avlysning ikke kan nås via en montørs svar eller en uautorisert global statusoppdatering.

### 3. Begge kalenderveier og legacy-adopsjon
- Fjern rejected som kanselleringssignal i sentral kjerne, dagskjerne og simulering.
- Krev vellykkede, komplette autoritative lesinger før kalenderplanlegging; feil/tomme feilsvar gir reconcile/blocked, aldri implicit delete.
- Oppdatering kan ikke slette. Eksakt person/dag-fjerningsintent, riktig postboks/proveniens og gjeldende plan kontrolleres før sletting.
- Behold legacy-adopsjon uten duplikater; postboksbytte eller ukjent felles ID blir avklaringssak, aldri stille rebinding eller bred markørsletting.
- Revider `calendar-write-sync`, `ms-calendar`, organizer, fjerningskø og app-only-worker mot samme modell. E-postavsender og organisator holdes adskilt fra mottakeridentitet.
- Avgrens også den separate legacy `tasks/task_assignees`-kalenderveien med samme selskapstilgang før alle operasjoner, uten å flytte den eller `planning_tasks` inn i Ressursplan-modellen.
- Behold alle sentrale globale/pilot-/scope-sperrer, separat skrivegodkjenning og HELD-kø; ingen direkte sync- eller køvei får omgå operatørgodkjenning.

### 4. Visning og kommunikasjon
- Mine/Min dag/jobbinfo/admin viser utførelse, egen respons, øvrige aktive mottakeres svar og per-mottaker kalender/e-poststatus separat.
- Fjern aggregate status som falsk personlig svarfallback og som filter som skjuler aktive oppdrag.
- Fremtidige kvitteringer sier «Din tildeling …», ikke «Jobben er avslått». Jobbinfo-lenker beholdes. Graph 202 er bare Microsoft-aksept, aldri levering eller montøraksept.
- Historiske e-poster og kalenderavtaler omskrives ikke.

## Tester og verifikasjon

**Nå:** 74 eksisterende isolerte tester bestod. Dette beviser ikke riktig målatferd: én pilotregresjon tester eksplisitt den nå feilaktige regelen om at rejected blokkerer kalenderen; den må erstattes.

Etter godkjenning legges det til tester som følger reelle kommandoer og delte kjernemodeller:
- Emil avviser, Mats pending, tredje godkjent: alle andre svar/dager/kalenderkoblinger beholdes; ingen global status-/Graph-mutasjon fra svar.
- Replay, samtidige svar, stale token etter tidsendring, fjernet/inaktiv tildeling, kansellert jobb og selskaps-/RLS-nekt.
- Én fjernes, én dag flyttes, reassign siste montør, taskens siste/ikke-siste referanse og autorisert/avvist full cancel.
- Oslo/DST, flere dager, legacy-adopsjon, immutable mailbox identity, ingen dobbeltoppretting, lesefeil, partial failures og ukjent resultat uten blindt replay.
- Mock Graph 204/404/401/403/429/5xx/nettverk; PATCH-only/create-only uten DELETE; beholdte dager og andre montører aldri mål.
- Lokale PostgreSQL/PGlite-transaksjoner med relevante live-funksjoner/triggere, ikke-admin selskaps-RLS og rollback; **ingen produksjonstestrader**.
- UI-interaksjoner på PC/mobil med isolerte data og blokkert utsending/nettverk; opprettelse/endre/svar/Mine/jobbinfo/avplanlegging kontrolleres ende-til-ende.
- Kjør relevant samlet regresjon og kontroller automatisk byggsignal. Ved sikker grønn dekning deployes kontrollerte DDL-endringer og berørte funksjoner; live etterkontroll er SELECT-only og kontrollerer sperrer, kø og urørt JOB 60570.

## Drift og avgrensning

- **Ingen funksjonsendring, migrasjon eller deploy er utført i denne review-pass.** Bare lesekontroll, eksisterende isolerte tester og dokumentert plan.
- Ingen Graph GET/POST/PATCH/DELETE, e-post/push, reelle testjobber, status-/assignment-/approval-/accessendringer eller køfrigivelse.
- Dette berører tidligere rettede kalender-, varslings- og standalone-task-overflater. Eksakt avplanlegging, lukket event_logs-liste, selv-tildelingsmail og duplikatvern skal bevares med regresjoner; ingen parallelle bulk-fikser.
- UI vil kreve publisering etter implementering. Reell montør-/Outlook-brukerflyt gjenstår til separat godkjent operativ pilot; kildekodetester er ikke bevis på faktisk mottatt e-post eller Outlook-body.
- JOB 60570 og gamle slettekøer endres ikke for å demonstrere rettelsen. Ingen automatisk sletting/oppretting når sperrer senere åpnes.

**Godkjenning av planen gjelder arkitekturreparasjon og kontrollerte migrasjoner, ikke produksjonsutsending eller kalenderaktivering.**