# Fixdit

Fixdit is een Nederlandstalige reparatie-assistent met een statische webfrontend en
een Cloudflare Worker-backend. De Worker gebruikt Cloudflare Workers AI voor beeld-
en tekstanalyse, kan Brave Search gebruiken voor selectieve brononderbouwing en
houdt sessies, verbruik, feedback en reparatie-uitkomsten bij in D1.

## Huidige architectuur

- `index.html` en de versiegebonden frontendbestanden vormen de GitHub Pages-client.
- `index.js` bevat de bestaande V8.6.1 Worker en blijft de standaardproductieflow.
- `src/v9/` bevat Diagnostic Engine V9 als afzonderlijke, standaard uitgeschakelde
  pipeline: evidence ledger, hypotheses, next-best tests, contradiction detection,
  deterministische safety kernel, repair gate, critic en shadow comparator.
- `migrations/` bevat alleen handmatig te beoordelen D1-migraties; niets wordt
  automatisch of vanuit tests op productie toegepast.
- `tests/` gebruikt uitsluitend lokale fixtures en mocks. De tests maken geen echte
  Workers AI-, Brave- of D1-calls.

V9 vervangt V8.6.1 niet. `V9_MODE` is standaard `off`; shadow en canary veranderen
de gebruikersresponse niet. Alleen een geregistreerde tester kan in `tester`-modus
het optionele `diagnosticV9`-veld ontvangen.

## Lokaal testen

Vereist Node.js 24 of nieuwer:

```sh
npm test
npm run compare:v8-v9
```

De frontend kan statisch worden geopend voor visuele inspectie. Voor een volledige
lokale Worker-preview ontbreken in deze repository bewust de echte Wrangler-
bindings en secrets; zie `docs/production-configuration.md`.

## Foto's en privacy

Na bevestiging in de frontend wordt een foto in de browser verkleind en als JPEG
naar de Cloudflare Worker verzonden voor analyse met Workers AI. FixDit slaat de
foto zelf niet permanent op. Afgeleide diagnose-, sessie- en gebruiksgegevens kunnen
wel in D1 worden opgeslagen. Upload geen onnodige persoonsgegevens of herkenbare
personen. Zie `privacy.html` voor de gebruikersgerichte tekst.

## Productie

Deze branch voert geen deployment, echte D1-migratie, push of publicatie uit. De
ontbrekende bindings, secrets, preflightcontroles en rollbackstappen staan in:

- `docs/production-configuration.md`
- `docs/v9-rollout.md`
- `docs/v9-architecture.md`
