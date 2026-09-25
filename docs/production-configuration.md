# Productieconfiguratie (niet uitgevoerd)

Deze repository bevat geen actuele Wrangler-configuratie of productie-identifiers.
De V9-implementatie gebruikt daarom lokaal uitsluitend mocks en fixtures.

Voor een latere gecontroleerde deployment moeten de bestaande productie-instellingen
worden opgehaald en door een beheerder worden bevestigd. Vul geen waarden op basis van
aannames in.

## Bestaande bindings en secrets

- `AI`: bestaande Cloudflare Workers AI-binding; exacte configuratie ontbreekt.
- `DB`: bestaande D1-binding; database-ID en database-name ontbreken.
- `ALLOWED_ORIGINS`: huidige productie-originlijst ontbreekt.
- `RATE_SALT`: productiegeheim ontbreekt.
- `AI_GATEWAY_ID`: optionele bestaande gateway-ID is onbekend.
- `BRAVE_SEARCH_API_KEY`: optionele bestaande research-key is onbekend.
- `MAX_FREE_FIXES`, `ANALYSES_PER_HOUR`: actuele productie-overrides zijn onbekend.
- `RESEARCH_ENABLED`, `RESEARCH_CACHE_TTL_SECONDS`, `RESEARCH_MAX_RESULTS`,
  `RESEARCH_COUNTRY`, `RESEARCH_LANGUAGE`: actuele waarden zijn onbekend.

## Nieuwe V9-flags

Deze blijven bij een eerste deployment uitgeschakeld:

- `V9_MODE=off` (`off`, `shadow`, `tester`, `canary`)
- `V9_SHADOW_SAMPLE_RATE=0`
- `V9_CANARY_PERCENT=0`
- `V9_ALLOW_AI=false`
- `V9_ALLOW_RESEARCH=false`

## Verplichte productiehandelingen

1. Exporteer/back-up de bestaande D1-database.
2. Controleer de bestaande tabelschema's en eventuele dubbele repair outcomes.
3. Voer de SQL-migraties eerst uit op een aparte previewdatabase.
4. Draai alle contract-, migratie- en regressietests tegen die previewdatabase.
5. Leg de actuele Worker compatibility date, routes en bindings vast in een echte
   `wrangler.jsonc`; dit bestand is bewust nog niet aangemaakt.
6. Verifieer CORS-origins, secrets en AI Gateway-instellingen zonder secrets te committen.
7. Start alleen met `V9_MODE=off`; activeer shadow/tester/canary pas na aparte goedkeuring.

Geen van deze handelingen is door de lokale implementatie uitgevoerd.

## Privacy- en publicatiepreflight

- Laat de tekst in `privacy.html` juridisch beoordelen en vul contactroute,
  grondslag, verwerkers en definitieve bewaartermijnen aan.
- Verifieer in Cloudflare dat request- of AI-logging niet ongemerkt beeldpayloads
  langer bewaart dan bedoeld; leg de daadwerkelijke instelling vast.
- Controleer dat geen raw image of data-URL in D1, applicatielogs, analytics of
  foutmeldingen terechtkomt. Alleen afgeleide diagnosegegevens mogen worden bewaard.
- Publiceer pas nadat de feitelijke productieconfiguratie overeenkomt met de tekst.
