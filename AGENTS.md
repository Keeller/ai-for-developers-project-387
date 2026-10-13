# Project guide

## Commands

- Install: `npm ci`
- Develop: `npm run dev`
- Test: `npm test`
- Format: `npm run format`; check only: `npm run format:check`
- Lint: `npm run lint`; auto-fix: `npm run lint:fix`
- Build: `npm run build`
- Build Docker image: `npm run docker:build`
- Run Docker image: `npm run docker:run`
- Full check: `npm run check`
- All advisory reports: `npm run report`
- Type-aware ESLint/SonarJS: `npm run report:eslint`
- Unused code and dependencies: `npm run report:dead-code`
- Duplication: `npm run report:duplicates`
- Coverage: `npm run test:coverage`
- Generate API contract artifacts: `npm run contract:generate`
- Check generated API artifacts: `npm run contract:check`

## Structure

- `apps/api` — Fastify API; public routes use the `/api` prefix.
- `apps/web` — React, Vite and Mantine frontend.
- `packages/api-contract` — TypeSpec source and generated OpenAPI/TypeScript
  artifacts shared by frontend and backend.
- `product` — product research and business requirements.
- `.github/workflows` — CI, releases and the protected Hexlet check.

## Agent skills

### Issue tracker

Issues, specifications, and tickets live in this repository's GitHub Issues.
See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default five-role triage vocabulary. See
`docs/agents/triage-labels.md`.

### Domain docs

Use the single-context domain layout at the repository root. See
`docs/agents/domain.md`.

### API contract

Use the design-first workflow in `docs/agents/api-contract.md` whenever public
HTTP behavior, frontend data access, or backend routes change.

## Design-first API workflow

- Agree on behavior and change `packages/api-contract/main.tsp` before editing
  frontend or backend implementation.
- Generate and review OpenAPI and TypeScript artifacts with
  `npm run contract:generate`; generated files are never hand-edited.
- Frontend calls the backend only through `apps/web/src/api/client.ts` and
  generated contract types. Backend handlers and validation derive from the
  same OpenAPI contract.
- Keep the TypeSpec change, generated artifacts, backend handler, frontend
  consumer, and contract tests in one pull request.
- Run `npm run contract:check` to reject stale generated artifacts.

## Git workflow

- Start each task from the latest target branch in a dedicated
  `codex/<type>-<short-slug>` branch; use `main` as the default target.
- Keep one coherent task in each branch and pull request. Leave unrelated
  changes for a separate branch.
- Push the branch and open a pull request; do not commit directly to `main`.
- For work that depends on an unmerged branch, create a stacked branch and
  target its pull request at the parent branch. Retarget it to `main` after the
  parent merges.
- Merge only after required CI checks pass, then delete the merged branch.
- Use Conventional Commits: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`,
  `chore:` or `ci:`.

## Rules

- Use Node.js 24, npm, strict TypeScript and ESM.
- During implementation, format changed code and run `npm run lint:fix`, then
  rerun the relevant tests after each meaningful change.
- Before every commit, run both `npm run check` and `npm run report`.
- Read `reports/README.md` after `npm run report`. Fix new SonarJS/type-aware
  ESLint findings, unused code, and duplication introduced by the change; do not
  reduce coverage without explaining why. Existing unrelated findings are not
  blockers.
- Quality reports remain advisory and do not gate CI; a tool failure must still
  be investigated and must not be hidden by the report-only exit code.
- Rebuild and smoke-test the Docker image when changing dependencies, build
  configuration, server startup, static delivery, or container files.
- The production Docker image must serve both the web app and API on port 3000.
- Do not edit `.github/workflows/hexlet-check.yml` unless explicitly asked.
- Keep this scaffold infrastructure-only until a feature is requested.
