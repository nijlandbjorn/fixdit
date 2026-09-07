# Fixdit V7 — oplevering en testverslag

Datum: 7 september 2026.

## Resultaat

350 automatische tests uitgevoerd op de bestanden in dit downloadpakket: 350 geslaagd, 0 mislukt, 0 overgeslagen. De goedgekeurde hero-HTML en alle bestaande CSS-blokken zijn ongewijzigd; dit wordt automatisch vergeleken met de oorspronkelijke frontend. De bestaande logo- en hero-afbeelding zijn meegeleverd.

Deze oplevering bevat een nieuwe, conservatieve diagnosekern en een daarop aangesloten frontend. De bestanden zijn lokaal getest en zijn niet naar GitHub of Cloudflare gepubliceerd.

## Wat is veranderd

- Het systeem legt eerst het genoemde symptoom vast, los van een mogelijke oorzaak. Geen koffie uit een Senseo wordt bijvoorbeeld geen lekkage.
- Objecten hebben eigen toegestane symptomen. Niet-passende combinaties, ontkenningen, vragen en vermoedens leveren geen bewezen defect op.
- Fotoherkenning levert alleen gestructureerde waarnemingen. Claims moeten positief, voldoende zeker en inhoudelijk passend zijn. Vrije AI-tekst bepaalt geen reparatie, vakman of zichtbare resultaattekst.
- `more_info` bevat uitsluitend vooraf gecontroleerde inspectievragen en diagnostische stappen. Onbevestigde reparaties, materialen en oorzaken worden niet vooruit ingevuld.
- Gereedschap en materialen komen uit afzonderlijk getypeerde catalogusitems.
- Veiligheidsmeldingen volgen uit relevante aanwijzingen. Algemene lijsten met gas, lithium, koelmiddel en elektriciteit worden niet bij ieder resultaat getoond.
- `nl`, `en` en `de` zijn verplichte contractwaarden. Analyse, vervolgfoto, feedback, resultaat, vakmanbericht en Fixpaspoort gebruiken dezelfde taalkeuze. Systeemteksten komen uit volledige taalcatalogi; opgeslagen V7-resultaten kunnen opnieuw worden weergegeven in een andere taal.
- Oude paspoorten zonder V7-taalgegevens krijgen een vertaalde melding om opnieuw te analyseren. De oorspronkelijke tekst van de gebruiker blijft gebruikersinhoud en wordt niet automatisch vertaald.
- Vakmanselectie is deterministisch, met specialistische routes voor onder andere asbest en koelmiddel.
- Vervolgfoto's hebben afzonderlijke camera- en galerijknoppen. Merk, model en foutcode verschijnen alleen wanneer de bewijscontrole ze accepteert.
- Verzoeken worden gecontroleerd op eigendom, herhaling en gelijktijdige verwerking om dubbel afboeken te voorkomen. Een veranderde aanvraag mag geen eerder resultaat onder dezelfde aanvraagcode hergebruiken.

## Automatische verificatie

Omgeving: Node.js 24.19.0, ingebouwde test runner en SQLite. Geen aanvullende npm-pakketten nodig. De databaseadapter voert echte SQL uit in een lokale SQLite-database; de Workers AI-antwoorden zijn gesimuleerd.

Getest zijn onder meer:

- NL/EN/DE-symptomen, alle combinaties van invoertaal en weergavetaal, taalwissels in resultaat, vakmanbericht en paspoort;
- koffiemachine zonder doorstroming, losse schoenzool, aquariumlekkage en object/symptoom-conflicten;
- ontkende, hypothetische en onbewezen schade, ongeldige fotoclaims en identiteitsbewijs;
- veilige `more_info`, gescheiden benodigdheden, escalatie en de voorwaarden voor toegestane zelfhulp;
- eerste analyse, twee vervolgfoto's, credits, testgebruikers, sessie-eigendom, foutafhandeling, herhaalde en gelijktijdige aanvragen;
- ongeldige taalwaarden, JSON, afbeeldingen en te grote verzoeken;
- frontendstart, vertalingen, camera-/galerijkoppeling en behoud van hero en CSS.

Het volledige testresultaat staat in `test-output.txt`. Herhalen: open de pakketmap met Node.js 24 of nieuwer en voer `npm test` uit.

## Browsercontrole

De frontend is ook in de browser gebruikt met de lokale Worker en gesimuleerde fotoherkenning:

- Engelse interface met Nederlandse Senseo-klacht: geen doorstroming, passende inspectie, geen verzonnen lek of gereedschap.
- Duitse interface met Nederlandse klacht over een losse zool: passende vraag en vervolgfoto, geen onbevestigde lijmstappen.
- Vervolgfoto via de camera-bestandskiezer: verwerkt zonder extra eerste-analysecredit.
- Duits resultaat opgeslagen en daarna in het Engelse Fixpaspoort geopend: resultaat en systeemtekst in het Engels.
- Mobiele breedte 390 × 844: visueel gecontroleerd, geen horizontale pagina-overloop.

## Grenzen van deze oplevering

De kern ondersteunt 19 benoemde objecttypen plus een onbekende categorie. Hij bevat bewust slechts drie gecontroleerde zelfhulproutines: een losse ladegreepschroef bij intact hout, een loslatende schoenzool met bevestigde intacte hechtvlakken en geschikte lijm, en een vlek op een intacte geglazuurde beker. Andere situaties blijven inspectie of worden naar een vakman geleid. Dit is geen onbeperkte reparatiegenerator.

Een hoge zekerheid uit een fotomodel is een modelinschatting, geen onafhankelijk bewijs dat een foto correct is gelezen. De live Cloudflare Workers AI-inferentie en productie-D1 zijn nog niet getest. Werkelijke camerakeuze op Android/iOS is niet getest; de browser en het besturingssysteem bepalen hoe het camera-attribuut wordt aangeboden. Externe pagina's zoals privacy en voorwaarden vallen buiten deze frontendwijziging.

## Bestanden en in gebruik nemen

`worker.js` is de complete Worker. `index.html` is de bijbehorende frontend. Behoud de bestaande Cloudflare-bindings `AI` en `DB` en de bestaande instellingen voor toegestane origins. De Worker maakt aanvullende tabellen `v7_requests` en `v7_leases` automatisch aan; de bestaande gebruikers-, sessie- en creditgegevens worden niet gewist.

Plaats eerst de Worker en daarna de frontend als één versie-upgrade. Zet `index.html`, `hero-fixdit.webp` en `logo.svg` in dezelfde frontendmap; behoud de overige bestaande sitebestanden. Controleer vervolgens in de echte omgeving een analyse en vervolgfoto in elke taal. Dit laatste is een nog uit te voeren productiecontrole, geen onderdeel van de 350 lokale tests.

Bronbasis: frontend van `nijlandbjorn/fixdit`, Git-blob `6fd5aa5b134369c6af7783483961072c51cea564`, en de door de gebruiker aangeleverde Worker V6. De oorspronkelijke frontend staat uitsluitend als vergelijkingsbestand in `tests/baseline-index.html`.

Bij de modelintegratie geraadpleegd: [Cloudflare Gemma 4-modeldocumentatie](https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/) en [Cloudflare-modelaankondiging](https://developers.cloudflare.com/changelog/post/2026-04-04-gemma-4-26b-a4b-workers-ai/).
