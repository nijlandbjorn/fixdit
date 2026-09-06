# Fixdit

**Fixdit — Fix het zelf.**

Nederlandse reparatie-assistent voor huishoudelijke apparaten.

## Wat staat live in deze repository

- premium responsive landingspagina
- logo concept 1 als SVG
- foto-uploadpreview
- interactieve voorbeelddiagnose
- lokale demo-creditlimiet van 3 fixes
- prijsstructuur met credits en jaarabonnement
- privacy- en voorwaardenpagina
- GitHub Pages deploy-workflow

## Belangrijk: productie-backend

De huidige publieke versie is een front-end MVP. Foto's worden in deze versie niet naar een server gestuurd en er is nog geen echte beeld-AI gekoppeld.

Voor productie zijn nog nodig:

1. AI-backend (bijv. Cloudflare Workers AI)
2. server-side credits en accountdatabase
3. e-mailverificatie
4. Stripe/Mollie checkout + webhooks
5. productieprivacy/voorwaarden en analytics

## Lokale test

Open `index.html` in een browser.

## Verwachte Pages-URL

https://nijlandbjorn.github.io/fixdit/
