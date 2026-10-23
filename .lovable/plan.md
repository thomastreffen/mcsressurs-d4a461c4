# Hvorfor BusBar-testprosjektet ikke vises i Planlegging

## Hva vi fant (målt, ikke gjettet)
Vi åpnet Planlegging i en testnettleser som Thomas og fulgte med på hva siden faktisk henter.

1. Prosjektlisten hentes med et fast selskapsfilter fra **Hub-selskapsvalget øverst**, ikke fra tavlas «Alle selskaper». Spørringen sendes som `company_id = <Hub-valgt selskap>` (usePlanning.ts linje 224). Prosjekter i andre selskaper blir aldri hentet.
2. Tavlas «Alle selskaper» filtrerer bare blant prosjektene som allerede er hentet. Det kan ikke hente inn BusBar-prosjektet.
3. Kontrollmåling: i ny nettleser uten lagret valg valgte Hub automatisk første selskap i Thomas sin liste, som var **MCS BusBar AS**. Da ble testprosjektet hentet og kortet **vises** på tavla. Det betyr:
   - status «early_planning» skjuler det ikke
   - «Periode ikke satt» og uke-/datofilteret skjuler det ikke
   - avdeling, kunde, ansvarlig, synlighet og tilgang skjuler det ikke
4. I Thomas sin egen nettleser er et annet selskap lagret som Hub-valg (sannsynligvis MCS Service AS). Da filtreres BusBar bort før tavla får dataene, uansett hva tavlefilteret står på.
5. Direkte prosjektadresse `/planlegging/025618e0-…` fungerer for Thomas, og prosjektet lastes. Om den nye eksterne meldingen synes i Leverandør-samtalen er ikke sjekket i nettleseren her. Databasen bekrefter at meldingen ligger på prosjektet.

Konklusjon: Årsaken er Hub-selskapsvalget i nettleseren. Den lister du ser på, er allerede filtrert på selskap før tavlefilteret «Alle selskaper» brukes.

## Foreslått rettelse (ved godkjenning)
- Tavlefilteret skal enten styre Hub-valget direkte eller fjernes når Hub står på ett selskap. Da finnes det bare ett «selskapsvalg» brukeren må forholde seg til.
- Hvis Hub står på ett selskap, skal tavla vise det selskapets navn i stedet for «Alle selskaper».
- Beholde meldingen «N prosjekter i andre selskaper er skjult – vis alle selskaper» (finnes allerede).
- Sjekke i nettleseren at den nye eksterne meldingen vises i prosjektets Leverandør-samtale.

## Tekniske detaljer
- `useCompanyContext`: leser `localStorage.mcs_active_company`. Uten lagret valg brukes første selskap fra `my_company_module_access`.
- `usePlanningProjects`: `q.eq("company_id", activeCompanyId)` når valget ikke er «alle».
- Tavlefilteret jobber bare i nettleseren, på resultatet av spørringen.
