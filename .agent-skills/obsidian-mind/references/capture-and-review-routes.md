# Capture Routes, Subagents, Performance Graph, and Bases

## Subagents

Specialized agents that run in isolated context windows, handling heavy
operations without polluting the main conversation. Defined in
`.claude/agents/`; you can add your own for domain-specific workflows.

| Agent | Purpose | Invoked by |
|-------|---------|------------|
| `brag-spotter` | Finds uncaptured wins and competency gaps | `/om-wrap-up`, `/om-weekly` |
| `context-loader` | Loads all vault context about a person, project, or concept | Direct |
| `cross-linker` | Finds missing wikilinks, orphans, broken backlinks | `/om-vault-audit` |
| `people-profiler` | Bulk creates/updates person notes from Slack profiles | `/om-incident-capture` |
| `review-prep` | Aggregates all performance evidence for a review period | `/om-review-brief` |
| `slack-archaeologist` | Full Slack reconstruction — every message, thread, profile | `/om-incident-capture` |
| `vault-librarian` | Deep vault maintenance — orphans, broken links, stale notes | `/om-vault-audit` |
| `review-fact-checker` | Verify every claim in a review draft against vault sources | `/om-self-review`, `/om-review-peer` |
| `vault-migrator` | Classify, transform, and migrate content from a source vault | `/om-vault-upgrade` |

## Capture walkthrough example (from the README)

```bash
/om-dump Just had a 1:1 with Sarah. She's happy with the auth work but wants
us to add error monitoring before release. Also, Tom mentioned the cache
migration is deferred to Q2 — we decided to focus on the API contract first.
Decision: defer Redis migration. Win: Sarah praised the auth architecture.
```

Produces, in one pass:
```
→ Updated org/people/Sarah Chen.md with meeting context
→ Created work/1-1/Sarah 2026-03-26.md with key takeaways
→ Created Decision Record: "Defer Redis migration to Q2"
→ Added to perf/Brag Doc.md: "Auth architecture praised by manager"
→ Updated work/active/Auth Refactor.md with error monitoring task
```

Incident example:
```bash
/om-incident-capture https://slack.com/archives/C0INCIDENT/p123456
# → slack-archaeologist reads every message, thread, and profile
# → people-profiler creates notes for new people involved
# → Full timeline, root cause analysis, brag doc entry
```

## Performance graph

The vault doubles as a career/performance-tracking system:

1. **Competency notes** in `perf/competencies/` define the org's competency
   framework — one note per competency (these are link targets).
2. **Work notes** link to competencies in their `## Related` section,
   annotated with what was demonstrated.
3. **Backlinks accumulate automatically** — review prep becomes reading the
   backlinks panel on each competency note.
4. **Brag Doc** (`perf/Brag Doc.md`) aggregates wins per quarter with links
   to evidence notes.
5. **`/om-peer-scan`** deep-scans a colleague's GitHub PRs and writes
   structured evidence to `perf/evidence/`.
6. **`/om-review-brief`** generates a full review brief by aggregating
   everything: brag entries, decisions, incidents, competency evidence, and
   1:1 feedback.

To get started: create competency notes from the template, then link work
notes to them as you go — the graph does the rest.

## Bases (`bases/` folder)

Database views that query note frontmatter and update automatically as
notes change. `Home.md` embeds these views as the vault's dashboard.

| Base | Shows |
|------|-------|
| Work Dashboard | Active projects filtered by quarter, grouped by status — plus a Stale Actives view (active but untouched 14+ days) |
| Recently Touched | Every note by real modified time — the correct answer to "what did I work on recently" (filename dates lie for living notes) |
| Incidents | All incidents sorted by severity and date |
| People Directory | Everyone in `org/people/` with role, team |
| 1:1 History | All 1:1 notes sortable by person and date |
| Review Evidence | PR scans and evidence grouped by person and cycle |
| Competency Map | Competencies with evidence counts from backlinks |
| Templates | Quick access to all templates |
