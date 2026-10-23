# ChatGPT-koblingen og kompetanse-PDF-er

## Svar
Nei. Opplastingen for kompetansedokumenter kan ikke brukes av ChatGPT-koblingen slik den er bygget i dag.

- Opplastingen krever at innloggingen til en Hub-bruker følger med hver forespørsel. Rettighetene sjekkes mot den brukeren. ChatGPT-koblingen har ikke en slik innlogging.
- Koblingen kan skrive i databasen, men den kan ikke legge en fil i den private lagringen. Den kan heller ikke kjøre den lukkede funksjonen som kobler dokumentet til kompetanseposten, fordi den bare kan kjøres fra serveren.
- Å la koblingen få bruke en kopi av en brukers innlogging er ikke trygt. Det skal ikke gjøres.

## Minste sikre løsning: koble ChatGPT til Hub med egen innlogging
Hub får en egen tilkobling som ChatGPT kan bruke, med ett verktøy: **«Last opp kompetansedokument»**. Det tar imot kompetansepostens ID og PDF-filen.

1. **Første gang:** når ChatGPT kobles til, logger du inn i Hub og godkjenner tilkoblingen på en egen godkjenningsside.
2. **Etterpå:** ChatGPT handler som deg. Det får de samme rettighetene som du har i Hub, og ingenting mer.
3. **Samme regler som før:** verktøyet gjenbruker reglene i dagens opplasting. Kun PDF, maks 10 MB, du må ha rett til å redigere HMS-kompetanse i det riktige selskapet, filen lagres privat, og hver opplasting føres i historikken. Ingen ekstra tilgang og ingen nøkkel som gjelder for alle.

### Alternativ
En egen integrasjonsnøkkel som bare gjelder ett selskap og bare opplasting. Den er raskere å lage, men ChatGPT-chatten ville da måtte bruke nøkkelen direkte, og opplastinger ville ikke vært knyttet til en person i historikken. Anbefales ikke.

### Begrensning
Det er uvisst om ChatGPT kan sende en PDF fra chatten videre gjennom et verktøy. Det må testes. Hvis det ikke går, må verktøyet ta imot filen som en lenke eller som innhold kodet som tekst, med de samme sjekkene.

## Tekniske detaljer
- Slå på innloggingstjenesten for eksterne apper (OAuth) i backend, og lag godkjenningssiden på `/.lovable/oauth/consent`.
- Lag tilkoblingen for eksterne verktøy (MCP) med verktøyet `upload_competence_document`.
- Verktøyet videresender ChatGPT-brukerens egen innlogging til den eksisterende funksjonen `competence-document-upload`. Samme sjekker og samme lagringsfunksjon gjelder, uten nøkler med full tilgang.
- Endringene virker først etter at appen er publisert på nytt.
