# Mobil-UX-audit – MCS Kontrollsenter (kun analyse)

Ingen kode er endret. Funnene bygger på gjennomlesing av koden. Punkter merket «verifiser» må sjekkes på en ekte telefon før de rettes.

## P0 – hindrer arbeid på telefon

1. **Ressursplanen er en matrise på 920 px** – `resource-plan/TeamView.tsx:308` (`min-w-[920px]`), brukt fra `pages/ResourcePlan.tsx`.
   Problem: på telefon får du 7 dagskolonner, horisontal scrolling og små kort. Sveip for å bytte uke (`ResourcePlan.tsx:943`) kan komme i konflikt med den horisontale scrollingen.
   Konsekvens: prosjektledere ser verken én dag eller én montør samlet, og trykker lett feil.
   Anbefaling: lag en egen mobilvisning med én dag og liste per montør (eller én montør per uke). Sveip bør bare bytte dag. `MobileResourceHeader` finnes allerede og kan brukes som ramme.

2. **Sideskuffene dekker bare 3/4 av skjermen** – `ui/sheet.tsx:39-41` (`w-3/4 sm:max-w-sm`). Gjelder blant annet `EventDrawer.tsx:1576`, `JobQuickEditSheet.tsx:198`, `ProjectPlanTab.tsx:448` og `ConversationDetailPage.tsx:202` (fast `w-[340px]`).
   Problem: «Nytt oppdrag»-skjemaet i EventDrawer (2 666 linjer) får omtrent 290 px bredde. Tidsvelgerne har fast bredde (`w-[100px]`, linje 2111/2129), og det er 30 forekomster av tekst på 10–11 px.
   Konsekvens: planlegging på telefon blir trang, og mye må scrolles sidelengs eller zoomes.
   Anbefaling: full bredde under `sm`, eller en `Drawer` fra bunnen (vaul) på mobil, med en fast lagre-linje nederst som tar hensyn til safe area.

3. **Postkontoret har en fast liste på 420 px** – `pages/InboxPage.tsx:750` (`w-[420px] shrink-0`), og nøkkeltallene ligger i `grid-cols-4` (linje 720) (verifiser om dette er skjult på mobil).
   Konsekvens: listen og lesevisningen kan ikke brukes side om side på en telefon på 390 px.
   Anbefaling: vis liste og detalj som to separate trinn på mobil (liste → åpne → tilbake), og sett nøkkeltallene i `grid-cols-2`.

4. **Bunnmenyen dekker innhold i PWA-modus** – `AppLayout.tsx:140/145`. Innholdet har `pb-16` og bunnteksten `mb-16`, men bunnmenyen (`MobileTabBar.tsx:216`) har i tillegg `safe-area-bottom`.
   Konsekvens: på iPhone med hjem-indikator blir nederste knapp eller felt delvis skjult bak menyen.
   Anbefaling: bruk `pb-[calc(4rem+env(safe-area-inset-bottom))]`. Fjern også bunnteksten med versjonsnummer på mobil, eller flytt den til «App-status».

## P1 – tydelig dårlig opplevelse

5. **Toppmenyen på mobil** – `AppLayout.tsx:62-129`. Selskapsvelgeren har fast bredde (`w-[200px]`, `CompanySelector.tsx:32`), og «App» og «Logg ut» ligger ved siden av som ikoner på 32 px. «Logg ut» er altså én tommel unna hele tiden. Toppmenyen tar ikke hensyn til safe area øverst i frittstående PWA-modus.
   Anbefaling: flytt «Logg ut», «Installer app» og «App-status» inn i «Mer»-skuffen. La selskapsvelgeren bruke tilgjengelig bredde, og legg til `pwa-safe-auto-top`.

6. **Breakpointene stemmer ikke overens** – `useIsMobile` slår inn under 768 px, mens `MobileTabBar` bruker `lg:hidden` (under 1024 px).
   Konsekvens: på nettbrett (768–1023 px) får man skrivebordsmenyen og ingen bunnmeny. Det rammer montører med nettbrett.
   Anbefaling: velg én grense og bruk den overalt, enten et felles `useIsCompact` (under 1024 px) eller bare `useIsMobile`.

7. **Bunnmenyen er lik for alle roller** – `MobileTabBar.tsx:210-212`.
   - Montører ser «Min dag», men verken «Varsler» eller «Samtaler» som egne faner. Varsler ligger bak «Mer».
   - Ledelsen har ikke «Lederoversikt» som fane.
   - Pluss-knappen viser «Nytt prosjekt», «Ny lead», «Nytt tilbud» og «Ny kontrakt» for alle. For montører er det bare to HMS-handlinger som er relevante.
   - «Planlegging» (`/planning`) mangler helt i «Mer»-listen.
   Anbefaling: lag fanesett per rolle (montør: Min dag, Prosjekter, +, Varsler, Mer; prosjektleder: Oversikt, Prosjekter, +, Plan, Mer). Pluss-knappen bør bare vise handlinger rollen faktisk har bruk for.

8. **Prosjektlisten er en tabell** – `pages/JobsPage.tsx:290-313`. Kolonner skjules med `hidden md/lg`, men det er fortsatt en tabell med avkrysningsbokser og en fast kolonne for jobbnummer.
   Konsekvens: montøren ser ikke hvem som er satt på jobben, når den er eller hvor den er.
   Anbefaling: bruk kort under `md` med nummer · tittel, kunde, sted, tid, montører og status. Det samme gjelder de andre 26 sidene med `<Table>`. Prioriter `HmsPeoplePage`, `EmployeesPage`, `PeoplePage`, `CustomersPage` og `OffersPage`.

9. **Planleggingstavlen** – `pages/planning/PlanningBoardPage.tsx:63/209` har kolonner på 300 px med horisontal scrolling, og `PlanningProjectPage.tsx:102` har en velger på `w-[210px]`.
   Anbefaling: på mobil kan statusen velges med segmentknapper, slik at én kolonne vises om gangen.

10. **Samtaledetaljer** – `ConversationDetailPage.tsx:129-305` bruker hardkodede farger (`#F6F7F9`, `#E6E8EC`), `min-h-screen` og `100vh`.
    Konsekvens: når tastaturet åpnes på iOS, hopper skrivefeltet. Mørk modus fungerer ikke.
    Anbefaling: bruk `dvh` og designfargene, og la skrivefeltet ligge fast nederst med safe area, slik `ThreadDetail.tsx` allerede gjør.

11. **`h-screen` brukes i 37 filer**, blant annet `InboxPage`, `ConversationDetailPage`, `RegulationPage`, `FormBuilderPage` og `PortalLayout`.
    Anbefaling: bytt til `h-dvh`/`min-h-dvh` i alle fullskjermvisninger.

12. **Små trykkflater og knapper som bare vises ved musepeker**:
    - Ikonknapper på 24–28 px (`h-6/h-7`) i `MessageActions`, `JobsPage`, `LeadsPage`, `ProjectRooms`, `HmsHandbookDetailPage` og `MobileResourceHeader` (`h-7 w-7`, filterknapper på `h-7` med tekst på 11 px).
    - `opacity-0 group-hover` gjør at handlinger aldri vises på berøringsskjerm (`DocsFilesRoom`, `ChatMediaGrid`, `CalcEngineListPage`, `HmsHandbookDetailPage`).
    Anbefaling: minst 44 × 44 px trykkflate på mobil, og handlingene alltid synlige eller lagt i en «…»-meny.

## P2 – finpuss

13. **Dialogvinduer** – 69 filer bruker `<Dialog>`, mens bare 5 bruker `<Drawer>`. Store skjema i dialogvinduer, som `EditJobDialog` (`sm:max-w-[720px] max-h-[90vh]`), `CreateJobDialog` og `PlanJobDialog`, bryter med regelen om å unngå dialogvinduer. På mobil bør de bli bunnskuff eller egen side.
14. **Liten tekst**: tekst på 10–11 px er utbredt (`OrderFormDetailPage` 39, `RegulationPage` 34, `ServiceJournal` 24, `OrderTrackingPage` 20). Tekst under 12 px gir dårlig lesbarhet ute.
15. **Varsler**: `NotificationDrawer` er full bredde (bra), men åpnes bare fra skrivebordets toppmeny. På mobil går det via «Mer» → `/notifications`. Det er greit, men varselsmerket bør stå på en egen fane for montører (se 7).
16. **Fanerader** på prosjektdetalj og planlegging scroller horisontalt uten tegn på at det finnes flere faner. Legg til en fade-kant og scroll den aktive fanen inn i synsfeltet.
17. **Appmanifest**: `orientation: portrait` låser nettbrett i stående modus, noe som er uheldig for ressursplanen i liggende format. `theme_color` er hardkodet mørk.
18. **Hjelpeklassene for safe area** (`pwa-safe-*`, `index.css:447`) finnes, men brukes knapt. Bare Min dag, HMS-avvik, Regelverk, ThreadDetail og bunnmenyen tar hensyn til safe area.

## Mobilkomponenter som finnes, men ikke brukes fullt ut

- **`components/MobileActionBar.tsx`** (11 kB): brukes ingen steder. Den kan bli den faste handlingslinjen nederst på prosjektdetalj og jobbkort.
- **`components/TopBar.tsx`**: brukes bare i den gamle `Dashboard.tsx`, og har egen mobillogikk som `AppLayout` ikke bruker. Den bør enten fjernes eller slås sammen med `AppLayout`.
- **`MobileResourceHeader` / `MobileFilterSheet`**: brukes, men styrer fortsatt den brede matrisen. Det mangler en mobil innholdsvisning under dem (se 1).
- **`ui/drawer` (vaul)**: brukes bare 5 steder. Det er riktig byggekloss for mobilskjema i stedet for `Sheet`/`Dialog`.
- **`ThreadDetail.tsx`**: har riktig fast skrivefelt med safe area og bør gjenbrukes i `ConversationDetailPage`.
- **Min dag (`MyDayPage.tsx`)**: er den beste mobilsiden i dag (safe area, fast handlingsfelt). Den bør være mønsteret for de andre montørsidene.

## Anbefalt rekkefølge (når det skal bygges)

1. Safe area og avstand til bunnmenyen, og én felles mobilgrense (punkt 4 og 6).
2. Sideskuffer i full bredde eller bunnskuff, og mobiltilpasset EventDrawer (punkt 2).
3. Ressursplanen i mobilvisning med dag- eller montørliste (punkt 1).
4. Fanesett per rolle og opprydding i toppmenyen (punkt 5 og 7).
5. Kort i stedet for tabeller på Prosjekter og HMS-personer, og liste/detalj i Postkontoret (punkt 3 og 8).
6. Trykkflater, knapper som bare vises ved musepeker, `dvh` og dialogvinduer (punkt 10–13).

## Tekniske notater

- Statiske funn: `min-w-[920px]` i TeamView, `w-3/4` i sheet.tsx, `w-[420px]` i InboxPage, 37 filer med `h-screen`, 69 med Dialog mot 5 med Drawer, 27 sider med Table, og MobileActionBar uten importer.
- Ikke verifisert på enhet: konflikten mellom sveip og scrolling i ressursplanen, om nøkkeltallene i Postkontoret er skjult på mobil, og hopping ved tastatur i samtaler. Neste steg bør være Playwright-skjermbilder på 390 × 844 og 768 × 1024, innlogget som montør og som prosjektleder.
