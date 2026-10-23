# Ekstern livsløp – bekreftet årsak og plan for bygging

Denne runden er kun lesing. Ingenting er endret, sendt eller opprettet.

## A. Hvorfor BusBar-prosjektet ikke vises, selv med «Alle selskaper»

Lest direkte i koden og databasen:

1. Siden Planlegging har **to selskapsfiltre som ser like ut**:
   - Det **globale selskapsvalget** øverst i Hub bestemmer hva som hentes fra databasen. Bare prosjekter i aktivt selskap hentes, med mindre det globale valget står på «alle».
   - Nedtrekkslisten **«Alle selskaper» på selve tavla** sorterer bare i det som allerede er hentet. Den henter aldri noe nytt.
   - «Alle selskaper» i skjermbildet er derfor tavlefilteret. Det kan ikke vise et prosjekt som det globale valget allerede har holdt utenfor.
2. Thomas er bare medlem av **MCS Service AS**. Han har ikke medlemskap i BusBar.
3. Testprosjektet ligger i **MCS BusBar AS**. Han kan likevel åpne det direkte fordi han er oppretter, og databasen lar oppretteren se sitt eget prosjekt.
4. Resultat: listen henter Service-prosjekter, og BusBar-prosjektet blir aldri hentet. Tavlefilteret «Alle selskaper» endrer ikke det. Prosjektet er levende, men usynlig.

Ett punkt gjenstår å bekrefte, kun lesing: om BusBar i det hele tatt finnes i hans globale selskapsvalg. Er det fraværende, kan han aldri få prosjektet frem i listen. Det bekreftes som første steg ved bygging, med en innlogget sjekk i nettleseren uten å skrive data.

Integritetshull dette avslører: man kan i dag opprette et prosjekt i et selskap man ikke er medlem av. Etterpå ser man det bare via direkte adresse.

## B. Bestemt livsløp for eksterne

| Prosjektstatus | Ekstern lese | Skrive, laste opp, endre oppgaver | Ny lenke | Eksisterende økter |
|---|---|---|---|---|
| Aktive statuser | Ja | Ja | Ja | Gyldige |
| Fullført, inntil 30 dager etter fullføring | Ja: meldinger og allerede delte filer | Nei | Ja, kun for lesing | Gyldige, kun lesing |
| Fullført, mer enn 30 dager | Nei, «Tilgangen er avsluttet» | Nei | Nei | Ugyldige |
| Kansellert eller arkivert | Nei | Nei | Nei | Ugyldiggjøres med en gang |
| Slettet eller finnes ikke | Nei, «Prosjektet eksisterer ikke lenger, eller tilgangen er avsluttet» | Nei | Nei | Ugyldige |

Gjenoppretting eller gjenåpning aktiverer aldri eksterne automatisk. De settes til «Satt på pause» til en ansvarlig aktiverer dem.

## C. Hva som bygges (når du godkjenner)

**Server (kildekontroll)**
1. Nytt felt for når prosjektet ble fullført, satt automatisk ved statusskifte, og én felles livsløpssjekk med tre utfall: skrive, lese eller ingen.
2. Sjekken brukes i ekstern identitet, prosjektvisning, kanaler, fillenker, meldinger, oppgavefullføring og lenkebestilling.
3. En databaseregel avviser eksterne meldinger, opplastinger og oppgaveendringer når modus ikke er skrive. Det gjelder også direkte kall.
4. Når status blir Kansellert eller prosjektet slettes, avsluttes eksterne økter og lenker i samme transaksjon, og det logges.
5. Samme nøytrale feiltekst for «finnes ikke», «ingen tilgang» og «slettet».
6. Prosjekter kan bare opprettes eller flyttes til selskap der brukeren har planleggingsrett.

**Ekstern visning**
7. Banner «Prosjektet er fullført – kun lesing til {dato}». Skriveboks og opplasting er skjult og låst.
8. Egen side for avsluttet tilgang, og stengte prosjekter merkes slik i «Mine prosjekter».

**Intern visning**
9. Tavla viser «N prosjekter du har tilgang til i andre selskaper er skjult – vis», så filteret aldri skjuler noe i stillhet.
10. Tydelig skille mellom globalt selskapsvalg og tavlefilter, med fanene Aktive, Fullført og Arkiv.
11. Prosjektkortet viser «Eksterne har tilgang (N)».

**Tester**
- Én test per regel: aktiv skriver; fullført dag 29 leser men kan ikke skrive; fullført dag 31 stenges; kansellert stenges og ugyldiggjør økter; slettet gir nøytral tekst; gjenoppretting gir pause.
- Kun isolerte testprosjekter. Ingen e-post, ingen varsler, ingen ekte deltakere.

## Teknisk
- `planning_projects.completed_at` settes av en trigger ved status `completed` og nullstilles ved gjenåpning.
- `planning_project_external_mode(project_id)` returnerer `write`, `read` eller `none`, og kalles fra `planning_external_identity` og fra hver ekstern RPC.
- Trigger på `planning_messages`, `planning_files` og `planning_tasks` for ekstern forfatter eller aktør.
- Statustrigger setter `expires_at = now()` på eksterne økter og lenker ved `cancelled` og soft-delete.
- Siden `usePlanningProjects` får en ekstra telling av prosjekter utenfor aktivt selskap, som fortsatt avgrenses av databasens tilgangsregler.
