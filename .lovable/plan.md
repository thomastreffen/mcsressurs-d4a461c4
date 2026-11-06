# Varslingsrevisjon – bestillingsløsningen (kun analyse, til godkjenning)

Ingen kode er endret, ingen e-post er sendt og ingen oppdrag er opprettet. Alle tall er lest direkte fra databasen (siste 90 dager).

## 1. Dokumentert faktisk tilstand

Dette er bekreftet i koden og databasen:
- 10 bestillinger. Hver av dem fikk nøyaktig én e-post om ny bestilling og én bekreftelse til bestiller. Ingen leveringsfeil er registrert.
- 20 statusendringer ga bare 6 e-poster med statusoppdatering til bestiller. Resten gikk uten e-post fordi avkrysningen er av som standard.
- 2 tildelinger. Ingen av dem ga e-post, og bare intern varselboks ble brukt.
- E-postene for «mangler info», feltforespørsel og delte meldinger er ikke logget sendt en eneste gang.

## 2. Funn (rangert)

**HØY – Avkrysninger av som standard, uten at noen merker det**
- `OrderFormDetailPage`: varsling ved statusendring, ved tildeling og e-post ved delt melding står alle av som standard.
- `AssignResourceTaskDialog`: «varsle bestiller» står av som standard.
- `RequestFieldsDialog` står derimot *på* som standard. Det er inkonsekvent.
- Følgen er at bestiller sjelden får statusoppdateringer, og at intern ansvarlig ikke får e-post ved tildeling.

**HØY – Varsler sendes fra nettleseren, uten kø og uten idempotens**
- Ny bestilling og bekreftelse utløses av nettleseren med «send og glem» (`OrderFormSubmitPage`, `OrderFormPublicPage`). Lukker brukeren fanen, eller kallet feiler, får ingen beskjed om det.
- Feil havner bare i konsollen og i `notification_error`.
- Det finnes ingen nøkkel som hindrer dobbel sending, så et nytt forsøk eller dobbeltklikk kan gi duplikater.
- Systemet bruker egen Graph-sending i stedet for den felles køen (`m365-dispatch`) som ble bygget for postkontoret.

**HØY – Grensesnittet sier mer enn det som faktisk skjer**
- Bekreftelsen sier «Bestilling sendt inn» før e-postene er bekreftet sendt.
- Aktivitetsloggen lagrer `notified_requester` som det brukeren *ønsket*, ikke om e-posten faktisk ble sendt. Den viser altså en hensikt, ikke et resultat.
- Graph svarer 202 når meldingen er tatt imot. Det logges som «sendt», ikke som «akseptert».

**MIDDELS – Varsler lages i flere lag som overlapper**
- En databasetrigger (`notify_new_order_submission`) varsler alle administratorer i varselboksen *i tillegg til* e-posten til postkontoret. Det blir dobbel kanal og støy.
- Tildeling lager varsel i varselboksen fra nettleseren, mens meldinger får varsel fra to triggere (`notify_order_message_customer` og `notify_order_message_participant`). Samme hendelse kan dermed gi to varsler i varselboksen hvis mottakeren både er tildelt og adressert.
- `order-message-email-send` respekterer `receives_notifications`. De andre veiene gjør det ikke.

**MIDDELS – Uklart hvem som mottar**
- Bestillers e-postadresse finnes via en kjede av reserveløsninger: `notification_recipient_email`, så `submitter_email`, så felt med prefiks. Hvem som faktisk mottar blir derfor uforutsigbart.
- `new_order` går til `send_email_to` i malen eller til postkontoret. Sjekken av «Kritisk stopp» har ingen virkning når malen har egne mottakere og postkontoret allerede står på listen.

**Usikkert (ikke verifisert):** hvordan Ressursplanens ekstra e-poster og varslene for prosjektmeldinger og HMS slås av. Her er bare mønsteret identifisert (`notifyParticipants` er på som standard). Hendelsesmatrisen for disse kartlegges i fase 0.

## 3. Ønsket matrise (forslag for bestilling)

| Hendelse | Mottaker | Kanal | Standard | Kan slås av |
|---|---|---|---|---|
| Ny bestilling | Bestiller | E-post (kvittering og sporingslenke) | På | Nei (transaksjon) |
| Ny bestilling | Postkontoret / malens mottakere | E-post | På | Nei |
| Ny bestilling | Ansvarlige for bestilling i selskapet | Varselboks | På | Ja, per bruker |
| Statusendring | Bestiller | E-post | På for viktige statuser (mottatt, planlagt, utført, avvist) | Ja, per endring (valgfri tekst) |
| Tildeling | Ny ansvarlig | Varselboks og e-post | På | E-post kan slås av |
| Tildeling | Bestiller | E-post | Av (støy) | Kan slås på |
| Mangler info / feltforespørsel | Bestiller | E-post | På | Nei (selve handlingen) |
| Delt melding | Bestiller | E-post | På | Ja |
| Svar fra bestiller | Ansvarlig og adressert person | Varselboks (én, uten duplikat) | På | Nei |
| Intern melding adressert | Deltaker | Varselboks og e-post | Etter `receives_notifications` | Ja |

Bestiller får alt på e-post og er aldri avhengig av varselboksen. Montørens mobil får bare varsler som gjelder egne oppdrag.

## 4. Design: én autoritativ kilde

```text
Handling i Hub → RPC/edge: registrer hendelse (order_notification_events, idempotency_key)
             → ruter: policy-tabell (hendelse × mottaker × kanal × default × låst)
             → utsending: varselboks (én rad per bruker) + e-post via m365-dispatch-køen
             → leveringslogg per mottaker: queued / accepted / failed / skipped(reason)
```
- Policyen ligger i kode og i én tabell. Grensesnittet leser standardvalg og låser fra samme kilde, så avkrysningen speiler det som faktisk skjer.
- Grensesnittet viser faktisk resultat i etterkant, for eksempel «E-post akseptert til x@…» eller «Ikke sendt: mangler adresse».
- Idempotens: nøkkelen `submission_id + event + recipient + version` hindrer dobbel sending ved nye forsøk.

## 5. Faser

0. **Fullfør kartleggingen (kun lesing):** Ressursplan, prosjektmeldinger og HMS skal inn i samme matrise. Svar på de åpne spørsmålene nedenfor.
1. **Første implementeringssteg (anbefalt):**
   - Flytt «ny bestilling» og «bekreftelse» fra nettleseren til serveren. Det gjøres med én innsendingsfunksjon som registrerer hendelsen idempotent og legger e-posten i køen.
   - Logg faktisk resultat, og vis «akseptert» eller «feilet» på bestillingen.
   - Teknisk utsending skrus ikke på i produksjon. Den bak en bryter som er av, og testes med mock av Graph.
2. **Felles policy og ruter:** Standardvalgene i grensesnittet hentes fra policyen. Statusendring og tildeling går over til matrisen over.
3. **Fjern dobbel sending:** Triggeren som varsler alle administratorer erstattes av ruteren, og meldingstriggerne slås sammen til én varselrad per mottaker.
4. **Ressursplan, prosjektmeldinger og HMS:** De flyttes til samme motor etter egen diff.

## 6. Testplan (uten ekte utsending)
- Enhetstester av policyen. Én test per regel: at transaksjonsvarsler ikke kan slås av, og hva som er standard per hendelse.
- Idempotens: samme hendelse sendt to ganger gir én e-post i køen og én varselrad.
- Routing: bestiller nås bare via e-post. En adressert deltaker som også er ansvarlig gir ett varsel, ikke to. `receives_notifications=false` respekteres.
- Graph mockes. Statusene 202, 4xx og 5xx skal gi riktig loggstatus og nytt forsøk.
- Grensesnittet: viser faktisk resultat, ikke intensjon.

## Åpne spørsmål til godkjenning
1. Hvilke statusendringer skal alltid gi e-post til bestiller?
2. Skal ny bestilling varsle alle administratorer i varselboksen, eller bare dem med bestillingsansvar i selskapet?
3. Er fase 1 godkjent som første steg, med utsendingsbryteren av til du gir eksplisitt klarsignal?
