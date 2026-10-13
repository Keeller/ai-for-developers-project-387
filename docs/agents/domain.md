# Domain docs

The repository uses a single-context domain-documentation layout.

## Before exploring

- Read `GLOSSARY.md` at the repository root when it exists.
- Read relevant decisions under `docs/adr/` when the directory exists.
- If either is absent, proceed silently. Domain-modeling skills create these
  documents lazily when terminology or decisions are resolved.

## Layout

```text
/
├── GLOSSARY.md
├── docs/adr/
└── apps/
```

## Vocabulary

Use terms exactly as defined in `GLOSSARY.md` in issues, specifications, code,
tests, and documentation. If a needed term is absent, reconsider whether it
belongs to the product vocabulary or note the gap for `/domain-modeling`.

## Architecture decisions

Surface conflicts with an existing ADR explicitly instead of silently
overriding the recorded decision.
