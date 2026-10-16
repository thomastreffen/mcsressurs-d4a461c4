# Stoppe tap av upplagret arbeid ved fanebytte

## Problemet (bekreftet i koden)

- Hovedoppsettet for datahenting (`QueryClient` i `App.tsx`) bruker standardinnstillinger, som betyr at React automatisk henter data på nytt hver gang nettleserfanen får fokus igjen.
- To steder i Planlegging (`usePlanning.ts`) har eksplisitt slått PÅ "hent på nytt ved fokus".
- To steder (Ressursplan sine kalenderblokker, varsel-telleren for ordremeldinger) har egne lyttere som henter på nytt ved fokus/fanebytte — disse er lette "i bakgrunnen"-oppdateringer, ikke full sidelasting, men bekrefter mønsteret er utbredt.
- Det finnes ingen felles mønster i appen for "denne siden har upplagrede endringer" — hvert skjema håndterer det på egen hånd, de fleste ikke i det hele tatt.
- Ingen steder ble funnet som bytter nøkkel (`key=`) på rute/layout eller nullstiller aktivt-firma-kontekst ved fokus — det er bra, selve siden "hopper" ikke, men dataene inni den byttes ut under brukeren.

## Hva som gjøres

### 1. Global innstilling (påvirker hele appen, lav risiko)
Endre standardoppsettet slik at data IKKE hentes automatisk bare fordi fanen får fokus igjen, men fortsatt holdes ferske når noe faktisk endres eller ved gjenoppkobling til internett. Data regnes som "ferske nok" i et kort tidsrom per modul, så man slipper unødvendige nettverkskall rett etter en vanlig navigering.

### 2. Fjerne/dempe fokus-triggere
Planlegging sine to steder med "hent på nytt ved fokus" fjernes (60-sekunders bakgrunnsoppdatering er nok). De to andre (kalenderblokker, meldingsteller) beholdes siden de kun oppdaterer et tall/ikon i bakgrunnen uten å forstyrre noe skjema.

### 3. Felles mønster for "upplagrede endringer" (ny, gjenbrukbar byggekloss)
En felles liten funksjon som et skjema kan ta i bruk for å si "jeg har upplagrede endringer":
- Advarsel vises KUN hvis brukeren faktisk prøver å navigere bort i appen eller lukke/laste om fanen — aldri bare fordi fanen mister fokus.
- Hvis ferske data kommer fra tjeneren mens brukeren har upplagrede endringer, overskrives ikke det brukeren har skrevet. Det vises i stedet en lavterskel melding om at nyere data finnes, med mulighet til å oppdatere manuelt.

### 4. Bruke mønsteret i de viktigste skjemaene
Prioritert etter hvor mye tid brukeren legger ned før lagring:
1. Roller og ansvar (Organisasjon)
2. HMS-håndbok (redigering av kapitler)
3. Avvik/RUH-rapportering
4. Nytt prosjekt / ny arbeidspakke i Planlegging

For disse legges i tillegg et enkelt mellomlager (utkast) i nettleseren, knyttet til riktig bruker + firma + skjema, slik at tekst overlever et fanebytte eller en pause på noen minutter. Utkastet slettes automatisk når brukeren lagrer, og blandes aldri mellom firmaer eller brukere.

SJA og lengre skjemaer for øvrig går gjennom det samme "skjema-utfylling"-systemet (`FormFillPage`) — denne får samme beskyttelse ett sted, som dekker alle skjematyper der.

### 5. Rolig oppdatering i bakgrunnen
De sidene som allerede bruker det sentrale datahentingssystemet (blant annet Ressursplan, HMS, Planlegging) stilles inn til å vise eksisterende data mens noe oppdateres i bakgrunnen, i stedet for å blanke siden og bygge den opp på nytt.

### 6. Testing
Kjører gjennom de fem scenarioene i testlisten (nytt skjema + fanebytte, HMS-håndbok + fanebytte, Ressursplan + fanebytte, 10 minutter inaktiv, bytte aktivt firma) i nettleser og rapporterer resultat.

## Avgrensning

- Appen har også ca. 180 sider/komponenter som henter data på sin egen måte (ikke via det sentrale datahentingssystemet). Disse endres ikke om til det sentrale systemet i denne runden — det ville vært en mye større ombygging. Der det finnes egne fokus-lyttere som faktisk blanker siden (ikke bare oppdaterer et tall), rettes de underveis når de dukker opp i testingen.
- Ingen ny funksjonalitet legges til utover dette — kun stabilitet, slik som ønsket.
