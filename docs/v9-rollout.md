# V9 rollout- en rollbackplan

Geen stap in dit document is lokaal op productie uitgevoerd.

## Gates per fase

0. Leg de schone V8-baseline en het API-contract vast.
1. Laat de V8 golden tests slagen en behoud de Worker-versie `8.6.1`.
2. Pas migrations uitsluitend op een aparte preview-D1 toe; controleer eerst
   duplicaten en maak een export/back-up.
3. Draai Evidence Ledger en Safety Kernel lokaal; nul safetyverwachtingen mogen falen.
4. Draai hypotheses, contradictions, state en next-best tests lokaal.
5. Open geen repair gate zonder evidence, techniek, grounding en critic.
6. Draai de volledige V9-pipeline met mocks; externe calls moeten nul blijven.
7. Draai `npm run compare:v8-v9`; adjudiceer ieder safetyverschil handmatig.
8. Deploy eerst met `V9_MODE=off`, alle percentages `0` en AI/research `false`.
9. Activeer na aparte goedkeuring achtereenvolgens tester, laag shadow-percentage en
   pas daarna een lage canary-observatie. Canary vervangt V8 niet.
10. Verhoog alleen na beoordeling van latency, persistencefouten, contradictions,
    critic-uitval en kritieke regressies. Een productiepromotie van V9 naar primaire
    output valt buiten deze implementatie.

## Stopcriteria

- Elke V9-safetyroute die zwakker is dan een correcte V8-route.
- Een repair plan bij een gesloten gate, unresolved blocking contradiction of
  ontbrekende critic.
- Onbekende evidenceverwijzingen, state revision conflicts of D1-schrijfproblemen.
- Extra AI/researchverbruik zonder expliciete flags en budgetgoedkeuring.
- Een wijziging aan het bestaande frontendcontract of de opgeslagen V8-diagnose.

## Rollback

Zet `V9_MODE=off`, `V9_SHADOW_SAMPLE_RATE=0`, `V9_CANARY_PERCENT=0`,
`V9_ALLOW_AI=false` en `V9_ALLOW_RESEARCH=false`. V8.6.1 blijft daardoor zonder
code-rollback de enige gebruikersflow. Verwijder V9-tabellen niet tijdens een
incident; bewaar ze voor audit. Een schema-rollback vereist een afzonderlijk,
goedgekeurd D1-herstelplan vanaf de export.
