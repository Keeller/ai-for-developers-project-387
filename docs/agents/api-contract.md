# Design-first API contract

## Source of truth

`packages/api-contract/main.tsp` is the only hand-written HTTP contract. The
OpenAPI document, frontend Fetch SDK, and backend Fastify handler types are
derived files. Generate them with `npm run contract:generate`; never edit them
directly.

Generated outputs are:

- `packages/api-contract/generated/openapi.yaml` — OpenAPI 3.0 document;
- `apps/web/src/api/generated` — Hey API Fetch client, SDK operations, and
  request/response types;
- `apps/api/src/generated` — Fastify `RouteHandlers` and transport types.

## Change sequence

1. Agree on externally observable behavior, status codes, payloads, validation
   constraints, and error shapes.
2. Change TypeSpec before frontend or backend implementation.
3. Run `npm run contract:generate` and review every generated diff.
4. Implement backend handlers against the generated `RouteHandlers` interface.
   Routes and wire-format validation come from generated OpenAPI through
   `fastify-openapi-glue`.
5. Implement frontend calls through `apps/web/src/api/client.ts`. Use generated
   SDK functions and payload types; do not duplicate URLs or DTOs.
6. Update contract tests and both adapters in the same change, then run
   `npm run contract:check` and `npm run check`.

## Ownership

- TypeSpec owns HTTP paths, methods, parameters, bodies, responses, status
  codes, and transport-level constraints.
- Backend handlers own business rules and persistence behind the HTTP seam.
- Frontend modules own presentation and interaction; they only know the
  generated client interface, not backend implementation details.
- A breaking contract change must be explicit in the specification and updated
  on both sides before merge.
