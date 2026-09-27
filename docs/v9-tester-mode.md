# V9 Tester Mode

Tester Mode is een interne, mobile-first diagnostische interface op
`/v9-tester`. De route bestaat alleen wanneer `V9_TESTER_ENABLED=true`. Deze
variabele staat uitsluitend onder `previews.vars` in `wrangler.jsonc`; productie
heeft daardoor geen testerroute en krijgt voor dit pad een 404.

De bijbehorende API staat op `/v9-tester/api` en accepteert alleen same-origin
verzoeken. Zij forceert uitsluitend voor dat request de al bestaande synchrone
V9-testeruitvoer. De normale Worker-root, V8-responses, shadowinstelling en
productieconfiguratie veranderen niet.

## Gebruikersflow

- probleemtekst en optionele foto;
- concrete actieve user/vision-evidence uit de V9-ledger;
- maximaal drie hypotheses, duidelijk als mogelijke oorzaken;
- één centrale next-best-test;
- ja, nee, weet ik niet of vrije tekst als vervolgantwoord;
- dezelfde V8-sessie en hetzelfde analysis-ID voor vervolgbeurten;
- zichtbare safety- en Repair-Gate-status;
- reparatiestappen alleen wanneer de gate open én de critic akkoord is.

Het inklapbare tester-paneel toont de technische auditinformatie en kan deze
kopiëren of als JSON exporteren. Deze informatie staat niet in de primaire
consumentenweergave.

## Grenzen

Foto's gebruiken de bestaande Worker-flow: de browser verstuurt een data-URL,
V8 verwerkt de foto en V9 ontvangt uitsluitend afgeleide gestructureerde
vision-evidence. De foto zelf wordt niet in D1 opgeslagen.

Manual lookup, onderdelen, reparateur-leads, accounts, betalingen en voice zijn
niet geïmplementeerd en worden daarom niet in Tester Mode aangeboden. Research
blijft uit. Tester Mode is geen canary en geen publieke productierelease.
