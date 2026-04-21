# Trust, Precedence, and Freshness

Use this when OpenContext has to answer **which memory artifact the next agent should trust** instead of just listing every note that exists.

## Fast trust order
Prefer this order unless the repo/team has a stronger explicit convention:
1. **Canonical repo doc for the current branch** — the source of truth if it is clearly maintained for the active workflow.
2. **Current handoff / decision / acceptance note tied to the active branch or incident** — strongest operational note when the task is in flight.
3. **Previous agent summary that cites exact docs, files, or commands** — useful if provenance is explicit.
4. **Uncited summary or inferred heuristic** — lowest confidence; treat as a lead, not a rule.

## Provenance labels
When returning or storing a brief, name the origin:
- `canonical-doc`
- `current-handoff`
- `decision-log`
- `agent-summary`
- `inferred-heuristic`

If provenance is weak, say so directly.

## Freshness checks
Before trusting a saved note, ask:
- Is it for the **current branch** or a previous branch?
- Did a release, migration, rollback, or incident change the expected workflow?
- Does the note predate the most recent canonical doc update?
- Does it describe an in-flight temporary exception rather than the stable rule?

## Conflict resolution packet
When notes disagree, return the smallest honest answer:
- highest-confidence source
- why it wins
- what still needs verification
- whether to update an existing note or store a new handoff

## Good storage pattern
A post-task note should capture:
- which source won
- the branch/release scope
- any temporary exception
- the next verification step

## Anti-patterns
- flattening conflicting notes into one blended answer
- treating stale branch notes as universal truth
- presenting an agent summary without naming its source or confidence
- storing another duplicate note when the right move is updating the canonical active-memory doc