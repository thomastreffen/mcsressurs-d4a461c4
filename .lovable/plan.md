# Automatisk Ressursplan → Outlook i ordinær drift (faset)

## Mål
Nye, fremtidige tildelinger i Ressursplan gir automatisk Outlook-avtale hos aktive montører via sentral kalenderapp, uten personlig Microsoft-innlogging. Ingen historisk utsending, ingen kø-frigivelse, ingen e-post.

## Leveranse 1 – ferdigstille koden (ingen aktivering)
1. **Per-postkasse aktivering**: ny tabell for aktiverte postkasser (mailbox, person, selskap, aktivert av/tid, `effective_from`). Kun tildelingsdager med Oslo-dato ≥ aktiveringsdag og opprettet/endret etter aktivering behandles. Uavhengig av globalt `enabled`; kalenderdelen gates av denne listen + scope-attestasjon.
2. **Konflikthåndtering**: annen Outlook-opptatt tid → status «Konflikt – venter godkjenning» i Ressursplan; ressursplanansvarlig kan trykke «Opprett likevel» (auditert, re-GET + hash). Samme Hub-oppdrag eller ukjent identitet → hard stopp.
3. **Endring og avplanlegging**: tidsendring → PATCH med eksakt Graph-ID + If-Match; ekte avplanlegging/avlysning → DELETE kun av Hubs egen kopi. Aldri private avtaler.
4. **Feilhåndtering**: 401/403/404/409/412/429/timeout klassifiseres; ukjent utfall → GET-avstemming på transaksjons-ID, aldri blind ny POST.
5. **Adopsjon**: Mats' to eksisterende engangskopier (JOB60570, JOB60576) kobles inn som eksisterende sentral kopi, ikke ny POST.
6. **Statusvisning** per montør/dag: Planlagt / I Outlook (Graph-verifisert) / Konflikt / Feil / Uavklart – separat fra e-post.
7. **Ingen dobbeltskriving**: aktivert postkasse bruker kun sentral app; ikke-aktivert bruker dagens personlige vei.
8. **Tester**: Rune+Thomas samme jobb, flere dager, omfordeling, avslag, avlysning, alle feilkoder, samtidighet. Hele testsuiten grønn før deploy.

## Leveranse 2 – aktiveringsdialog (Admin → Microsoft)
- «Aktiver automatisk kalender for én montør»: viser eksakt postkasse, tenant/app, fersk GET200, effekter («kun nye tildelinger fra nå, ingen eksisterende jobber, kø urørt, ingen e-post»), og krever avkrysninger + eksakt frase.
- «Aktiver for alle aktive montører»: tilgjengelig først etter én bekreftet pilotkopi; Ståle Roar Jensen, Andre Midtgard og inaktive alltid utelatt.
- Stoppknapp: deaktiverer umiddelbart, rører ikke eksisterende avtaler.

## Aktivering
Jeg aktiverer ingenting selv. Etter leveranse: Thomas publiserer, åpner Admin → Microsoft, velger Rune og trykker «Aktiver automatisk kalender». Første ekte skriving skjer først ved Runes neste ordinære tildeling.

## Kjente forutsetninger
- Skrivetilgang for kalenderappen er bevist for Mats (POST201) og lesetilgang for Rune (GET200); Runes skrivetilgang bevises først ved første ekte tildeling – dialogen viser dette eksplisitt.
- De åtte ventende køelementene forblir holdt permanent.
