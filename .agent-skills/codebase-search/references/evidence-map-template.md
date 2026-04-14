# Evidence map template

Use this when reporting search findings.

```markdown
## Search brief
- Goal: [what I searched for]
- Lane used: exact-text | symbol/indexed | structural | file discovery | mixed
- Scope: [subdirs, file types, exclusions]

## Best entry points
- `path/to/file`: definition / router / loader / entry point
- `path/to/file`: important consumer / adapter / test

## Key evidence
- `path:line` — what it proves
- `path:line` — why it matters

## Likely flow / ownership
- entry → service → adapter → test/config

## Must inspect next
- `path/to/file`
- `path/to/file`

## Route-out
- `debugging` if diagnosis starts now
- `code-refactoring` if structure change starts now
- `graphify` if persistent architecture mapping is needed
```

## Notes
- Group by subsystem in monorepos.
- Separate **must-update** from **maybe-affected** when doing impact analysis.
- Avoid dumping raw search output unless exhaustive results were explicitly requested.
