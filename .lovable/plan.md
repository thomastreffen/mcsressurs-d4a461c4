# Revisjon av tilgangsstyring i MCS Hub

Mål: Vi kartlegger først uten å endre noe, og lager en rapport med funn rangert etter alvorlighetsgrad. Deretter retter vi i koden bare de funnene som er entydige, og dekker dem med sikkerhetstester. Ingen faktiske rolle- eller rettighetstildelinger i produksjon endres uten at du skriftlig godkjenner en vist før/etter-diff.

## Det vi allerede vet (bekreftet i tidligere arbeid)
- Feilmeldingen om duplikatnøkkel (duplicate key) kom fra personsiden. Lagringen kopierte globale overstyringer inn i valgt selskap. Feilen er rettet i koden: lagringen sender nå bare endrede nøkler, atomisk og idempotent. Rettingen er ikke publisert.
- Marcus har rollen Montør alene. Emil har Montør + Ressursplan. Forskjellen kommer altså fra roller, ikke fra overstyringer. Overstyringene deres er kontrollert og uendret.
- Montørens innsyn i egne jobber, godkjenning og jobbinfo skal ikke kreve global ressursplanrettighet. Tidligere arbeid har lagt inn lesetilgang ved aktiv tildeling. Dette må bekreftes med tester for hele kjeden.

Alt annet nedenfor regnes som ubekreftet til fase 1 er gjort.

## Fase 1 – Kartlegging uten endringer
1. **Identitet:** Kobling mellom innlogging og person (user_accounts), ansettelser og montørdata. Vi finner personer uten innlogging, dobbeltkoblinger, inaktive personer som fortsatt har tilgang, og innlogginger uten person.
2. **Roller og pakker:** Hva hver rolle gir (user_roles, rolle-/tilgangspakker og role_permissions), per selskap. Vi lister brukere med samme rolle som likevel har ulike effektive rettigheter, og finner kilden til hvert avvik.
3. **Overstyringer:** Gammel og ny overstyringstabell (v1/v2), om de er i bruk samtidig, rester etter gamle migreringer, globale mot selskapsbundne overstyringer, og hvilken regel som vinner (nekt/tillat/arv).
4. **Serverkontroll:** Hvordan check_permission_v2, has_company_access og my_company_module_access faktisk avgjør tilgang, sammenlignet med menyen i frontend. Vi lister skjermbilder der menyen viser noe serveren nekter, og omvendt.
5. **RLS og serverfunksjoner:** Tabeller med svake regler (vi gjenbruker de 25 kritiske funnene fra sikkerhetsskanningen), funksjoner som bruker service-rolle uten sjekk av den som kaller, og mulig lekkasje mellom selskaper.
6. **Spesielle flyter:** Montørmobil, godkjenningslenker, vedlegg (offentlig `job-attachments` mot privat lagring), meldinger, HMS-selvbetjening, eksterne i Planlegging, kundeportal og prosjektinvitasjoner (utløp og tilbaketrekking).
7. **Leveranse:** Tilstandsrapport på norsk med funn rangert Kritisk / Høy / Middels / Lav, og effektive rettigheter med kilde per rettighet for Marcus og Emil.

## Fase 2 – Versjonert rettighetsmatrise for MCS Service (v1)
Matrisen skiller tre lag:
- organisatorisk rolle
- tilgangspakke
- individuell overstyring

| Rolle | Ressursplan | Egne jobber/vedlegg/meldinger | Andres oppdrag | Planlegge | Styre tilgang |
|---|---|---|---|---|---|
| Montør | Valgfri lesing | Ja, ved tildeling | Nei | Nei | Nei |
| Prosjektleder | Eget selskap | Ja | Eget selskap | Eget selskap | Nei |
| Admin (selskap) | Ja | Ja | Eget selskap | Ja | Eget selskap |
| Ekstern | Nei | Kun inviterte prosjekter | Nei | Nei | Nei |

Matrisen legges fram for godkjenning før den brukes som fasit i tester eller i integritetsdashbordet.

## Fase 3 – Trygge kodefikser (bare entydige funn)
- Én felles serverfunksjon som returnerer effektiv rettighet med kilde (rolle, selskap, individuell, regel). Både admin-visning og tester bruker den, så det finnes bare én sannhet.
- Tilgangsoversikt per ansatt:
  - arvet mot overstyrt, med forklaring
  - forhåndsvisning av endringer som før/etter-diff
  - tilbakestilling til rollestandard, også vist som diff
  - endringslogg (hvem endret hva og når)
- «Slik ser montøren det»: vises ved at serveren beregner rettighetene for den valgte personen. Det er ingen innlogging som en annen bruker og ingen omgåelse av sikkerheten.
- Integritetsdashbord under /admin, bare for superadmin og bare til lesing. Det viser:
  - avvik innen samme rolle
  - dubletter og personer uten kobling
  - forskjell mellom meny og server
  - rester av v1-overstyringer
  - utløpte eksterne tilganger som fortsatt er aktive
- Montørmobilen endres ikke, utover feilrettinger.

## Fase 4 – Akseptansetester (sikkerhetstester med isolerte testdata)
- Marcus- og Emil-lignende testbrukere: samme rolle gir samme effektive rettigheter, og forskjellen forklares med kilde.
- Montøren ser egne jobber og vedlegg både før og etter godkjenning, uten ressursplanrettighet.
- Montøren nektes andres oppdrag og andre selskaper. Planleggeren får bare tillatt omfang.
- Admin kan gi og fjerne rettigheter uten duplikatfeil. Flere endringer i samme skjema lagres. Lagringen er idempotent, og andre brukeres rettigheter røres ikke.
- Et manipulert API-kall gir ingen ekstra rettigheter.
- Eksterne lenker trekkes tilbake når de skal.
- Godkjenning og Outlook/e-post krever ikke global ressursplanrettighet.

## Sikkerhetsregler under arbeidet
- Ingen endring av produksjonsbrukeres roller eller rettigheter. Eventuelle dataendringer leveres som et diff-forslag som må godkjennes.
- Bare additive databaseendringer (nye visninger og funksjoner). Ingen sletting.
- Ingen publisering, ingen e-post og ingen Microsoft-aktivering.
- Arbeidet koordineres med rettingen av duplikatfeilen og pågående Outlook-/jobbinfo-arbeid. Ingen av delene overskrives.

## Teknisk
- Funksjonen for effektiv rettighet: SECURITY DEFINER, avgrenset til den som kaller (admin i samme selskap eller superadmin). Den returnerer `{permission_key, allowed, source, source_ref}`.
- Endringslogg: additiv tabell eller gjenbruk av `access_audit_log`. Dette avklares i fase 1.
- Tester kjøres mot isolert testdatabase (PGlite), samme oppsett som m365-schema-testene, med RLS-scenarier.
