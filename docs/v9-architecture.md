# FixDit Diagnostic Engine V9

## Ontwerpgrens

V8.6.1 in `index.js` blijft de primaire pipeline en het rollbackpad. V9 staat in
`src/v9/` en ontvangt alleen de genormaliseerde V8-uitkomst en gebruikerscontext.
Shadow en canary mogen geen bestaande responsevelden of opgeslagen V8-diagnose
veranderen. Tester voegt uitsluitend `diagnosticV9` toe.

## Beslisvolgorde

1. De Evidence Ledger legt gebruikers-, vision- en genormaliseerde feiten met
   herkomst vast; vervangen evidence blijft auditbaar.
2. De deterministische Safety Kernel beoordeelt alleen vertrouwde evidence en
   behandelt expliciete negatie afzonderlijk.
3. De Contradiction Detector blokkeert strijdige sterke claims.
4. De Hypothesis Engine rangschikt begrensde verklaringen en controleert alle
   evidenceverwijzingen.
5. Next-Best-Test kiest één veilige vraag, observatie of gericht fotoverzoek.
6. De Repair Gate opent pas bij voldoende evidence, een sterke hypothese, een
   bruikbare techniek en — voor modelspecifiek advies — betrouwbare grounding.
7. De planner hergebruikt alleen reeds door V8 vrijgegeven stappen.
8. De Independent Critic beoordeelt een geopend plan opnieuw en faalt gesloten
   wanneer de critic ontbreekt, faalt of afwijst.
9. De comparator legt verschillen met V8 vast zonder de V8-uitkomst te vervangen.

## Vertrouwensgrenzen

- Modelhypotheses mogen geen evidence-ID's verzinnen.
- Vision-output wordt als gestructureerde, begrensde evidence genormaliseerd.
- Research is alleen sterk voor HTTPS-bronnen op expliciet toegestane fabrikant-
  domeinen; elk advies moet naar bron-ID's verwijzen.
- Workers AI voor de critic vereist `V9_ALLOW_AI=true`; standaard zijn er nul extra
  AI-calls. V9-research is nog niet aan live Brave gekoppeld.
- De D1-tabellen zijn append/audit-georiënteerd; migrations worden nooit runtime
  aangemaakt.

## API-compatibiliteit

Het bestaande requestcontract (`problem`, optioneel `image`, `language`, acties
zoals `followup`) blijft gelijk. V8-responses blijven gelijk wanneer V9 uitstaat of
in shadow/canary draait. `diagnosticV9` is een optioneel, additief veld voor testers.
