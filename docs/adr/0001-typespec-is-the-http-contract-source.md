---
status: accepted
---

# TypeSpec — источник HTTP-контракта

Публичное HTTP-поведение сначала изменяется в
`packages/api-contract/main.tsp`, а уже затем в backend и frontend. OpenAPI,
клиентский SDK и типы Fastify генерируются из одного источника: цена в виде
шага генерации принята ради синхронного изменения обеих сторон контракта.
