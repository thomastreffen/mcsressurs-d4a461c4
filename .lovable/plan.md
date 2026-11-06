# Varslingsrevisjon v4 – hvem som får varsel i Hub, og når

Dette er bare plan. Ingen endringer i produksjon, ingen e-post og ingen testvarsler er sendt.

Planen bygger på v3, der eiers beslutninger om status, lukking og idempotens står fast. V4 avklarer hvem som skal få varsel inne i Hub.

## Tre kanaler som holdes strengt adskilt

| # | Kanal | Mottaker | Endring |
|---|---|---|---|
| 1 | E-post til Postkontoret ved ny bestilling | Malens `send_email_to` eller postkontoret@ | Fortsetter uendret |
| 2 | E-post til bestiller | Bestiller | Obligatorisk etter v3: Mottatt, Planlagt, Utført eller Avsluttet uten utførelse, og Avvist |
| 3 | Varsel i Hub (varsellampen) | Bestillingsansvarlige, og senere den faktiske ansvarlige | Endres slik det er beskrevet nedenfor |

## Slik fungerer det i dag (lest i databasen)

- **Databaseregelen** `notify_new_order_submission` utløses ved hver ny bestilling. Den varsler alle som returneres av `_notif_admin_user_ids()`.
- Den funksjonen tar med alle som har den gamle `admin`- eller `super_admin`-rollen, og alle med rollene «Planlegger/Admin» eller «Superadmin». Selskap og ansvar for bestillinger spiller ingen rolle.
- **Følgen:** 10 bestillinger på 90 dager ga 80 varsler i Hub til 8 personer. Varselet går til alle med adminrolle, også i andre selskaper, uansett om de har ansvar for bestillinger.
- Det finnes **ingen egen rettighet for ansvar for bestillinger**.
  - Rettighetene `postkontor.view`, `postkontor.admin` og `module.inbox` har de samme 8 personene, fordi de følger adminrollene. De skiller derfor ikke ut hvem som faktisk har ansvar.
  - `company_module_access` har ingen bestillingsmodul.
  - Bestillingsmalen har bare `send_email_to`, som er kanal 1.
- **Tildeling:** Hub lager varselet i nettleseren til den som blir tildelt. Det skjer bare når tildelingen gjøres gjennom én bestemt dialog.
- **Svar fra bestiller:** varsler `assigned_to` og `submitted_by`. Hvis meldingen også er rettet til en deltaker, lager en egen databaseregel et varsel til, så samme person kan få to.
- **3 nye bestillinger står i dag uten ansvarlig.** De får ingen nye påminnelser.

## Slik skal det fungere

### Hvem som er bestillingsansvarlig (gjenbruker dagens tilgangsmodell)
- Hub får **én ny rettighet: «Ansvarlig for innkommende bestillinger» (`orders.intake`)**. Den legges i det eksisterende rettighetssystemet, ikke som en ny type rolle.
  - Den kan gis gjennom en rolle eller som en personlig overstyring.
  - Den kan begrenses til ett selskap, slik det allerede fungerer i dag.
  - Den administreres i den vanlige Rettigheter-visningen i Admin → Personer. Endringene logges på samme måte som andre rettigheter.
- Rettigheten følger **ikke** automatisk med en adminrolle. En administrator får den bare hvis noen gir den uttrykkelig.
- Grunnen til at den gamle `postkontor.view` ikke brukes: den er i dag knyttet til adminrollene, og ville gitt nøyaktig det samme resultatet som nå.

### Hvem som får varsel
| Hendelse | Mottaker i Hub | Standard |
|---|---|---|
| Ny bestilling, ennå ikke tildelt | Alle med `orders.intake` i bestillingens selskap, og bare aktive medlemmer der | På |
| Bestillingen tas over eller tildeles | Den nye ansvarlige. Varselet om den nye bestillingen markeres som håndtert hos de andre bestillingsansvarlige. | På |
| Oppfølging: svar fra bestiller, nytt felt, statusendring | Den faktiske ansvarlige, deltakere meldingen er rettet til, og den interne innsenderen | På. Hver person får høyst ett varsel per hendelse. |
| Bestillingen er fortsatt ikke tildelt | Bestillingsansvarlige i selskapet | Varselet står som ubehandlet til noen tar saken |
| Valgfrie ekstra interne e-poster | Samme mottakere | På, men kan aktivt skrus av i selve handlingen |

### Ingen bestilling skal bli uten mottaker
- En ny bestilling havner aldri hos «ingen».
  - Finnes ingen bestillingsansvarlig i selskapet, varsles Hub-eier og IT-ansvarlig (global superadmin).
  - Kontrollpanelet for avvik viser i tillegg «Selskapet mangler bestillingsansvarlig».
- Kanal 1, e-posten til postkontoret, går uansett.

### Varsellampen
- Tittelen viser bestillingsnummer, kunde og hvor viktig saken er. Varselet lenker til `/orders/:id`.
- Det står «Ny – ikke tildelt» frem til noen tar saken.
- Når saken er tildelt, forsvinner varselet fra listen over ubehandlede hos de andre. Historikken blir liggende.

## Felles varslingskilde (utvidet fra v3)
```text
Hendelse → server: endringssjekk → hendelseslogg (idempotensnøkkel)
  → regeltabell: hendelse × mottakerregel × kanal × standard × låst
  → mottakerregler: requester | postkontor | orders_intake(company) | assignee
                    | addressed_participant | internal_submitter | fallback_superadmin
  → dedupe på (hendelse, mottaker, kanal) → leveringslogg
```
Databaseregelen `notify_new_order_submission` og de to reglene for meldinger erstattes av mottakerreglene i denne kilden. Varsler som allerede er opprettet, blir liggende.

## Faser (venter på godkjenning)
0. **Kartlegging uten endringer**
   - Skyggeliste per selskap: hvem som får varsel i Hub i dag, og hvem som vil få det.
   - Eier bestemmer hvem som skal ha `orders.intake` i MCS Service, BusBar og Elektrotavler. Henning er en naturlig kandidat, men det må bekreftes.
1. **Regeltabell, hendelseslogg og rettigheten `orders.intake`**
   - Rettigheten legges til uten at noen får den.
   - Mottakerreglene lages, og utsendingen holdes av.
   - Alt testes mot en etterligning av utsendingen.
2. **Skjermbilder**
   - Rettigheten vises i Rettigheter-visningen, med forklaring.
   - Varsellampen får visningen «ubehandlet» og «håndtert».
   - Skjermbildet for tildeling viser hvem som blir varslet.
3. **Bytte**
   - Rettigheten gis til personene eier har godkjent i en egen før/etter-diff.
   - Deretter stoppes databaseregelen som varsler alle administratorer, og de doble meldingsreglene slås sammen.
4. **Ressursplan, prosjektmeldinger og HMS** tas inn i samme kilde.

## Tester (uten ekte utsending)
- En ny bestilling varsler bare de som har `orders.intake` i bestillingens selskap. Administratorer uten rettigheten får ingenting.
- En administrator med `orders.intake` blir varslet.
- Rettigheten begrenset til BusBar gir ikke varsel for bestillinger i MCS Service.
- Når ingen er bestillingsansvarlig, går varselet til global superadmin, og avviket vises på kontrollpanelet.
- Ved tildeling får den ansvarlige ett varsel, og de andre bestillingsansvarlige får sitt varsel markert som håndtert.
- En deltaker som både er ansvarlig og adressert, får ett varsel per hendelse.
- E-posten til postkontoret er uendret, og bestiller får aldri varsel i Hub.
- Å gjenta samme hendelse gir ingen nye varsler.
- Alle varsler lenker til riktig bestilling.

## Gjenstår før bygging
- Godkjenning av hele planen.
- Hvem som skal ha `orders.intake` per selskap, i fase 0, med egen diff.
