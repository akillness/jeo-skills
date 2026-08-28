---
name: higgsfield-game-generation
description: >
  Compatibility alias and read-only drift auditor for Higgsfield's retired or
  missing `higgsfield-game-generation` name. Use when, and only when, a prompt,
  search result, installed catalog, or stale command explicitly names that skill;
  when
  `higgsfield game ...` conflicts with the checked-in tree; or when ownership
  between the exact skill and `higgsfield-websites --type game` must be resolved.
  Audit the upstream tree, record the commit and evidence, then hand ordinary
  game planning, creation, editing, testing, asset generation, deployment, and
  marketplace publication to the current checked-in owner. Prefer
  `higgsfield-websites` for ordinary Higgsfield game work. Route provider-neutral
  browser games to `web-game-development` and multiplayer authority design to
  `multiplayer-game-architecture`.
allowed-tools: Bash Read Glob Grep WebFetch
compatibility: >
  The bundled audit helper is read-only, Python 3.9-compatible, and uses only the
  standard library plus optional read-only Git commands. Live Higgsfield work
  belongs to the resolved upstream owner and may require its own CLI and account.
metadata:
  version: "1.1"
  source: https://github.com/higgsfield-ai/skills
---

# Higgsfield Game Generation

This name is a compatibility doorway, not a second game builder. At the audited upstream
commit, installation prose advertises `higgsfield-game-generation`, but the folder is absent
and `higgsfield-websites` owns games through `--type game`. Resolve the current owner, then
leave the operational workflow to that owner.

## When to use this skill

Use it only to:

- verify whether an exact `higgsfield-game-generation/SKILL.md` now exists;
- resolve stale `higgsfield game ...` examples against the checked-in upstream tree;
- explain why an installed catalog or search result names a missing skill;
- identify whether `higgsfield-websites` still owns `--type game`;
- produce a recorded, evidence-backed handoff to the current owner.

Do not use this alias to duplicate game planning, scaffold editing, asset generation, room
testing, deployment, or marketplace publication. Ordinary current Higgsfield game requests
go directly to `higgsfield-websites`. Generic media generation goes to
`higgsfield-generate`; provider-neutral browser games go to `web-game-development`; network
authority design goes to `multiplayer-game-architecture`.

## Instructions

### 1. Audit the checked-in owner

Record the repository path and commit, then run the read-only helper:

```bash
python3 "$SKILLS_ROOT/higgsfield-game-generation/scripts/audit-higgsfield-game.py" \
  --repo /path/to/higgsfield-ai-skills \
  --format json
```

When a specific pin matters, add `--expect-commit <sha>`. Verify the helper before relying on
it:

```bash
python3 "$SKILLS_ROOT/higgsfield-game-generation/scripts/audit-higgsfield-game.py" --self-test
```

Trust the tree and checked-in references over installation prose, search snippets, or cached
marketplace listings. Never reconstruct a missing skill from those weaker sources.

### 2. Resolve exactly one owner

Interpret the auditor's `decision`:

- `higgsfield-game-generation`: an exact upstream owner exists; read that upstream skill;
- `higgsfield-websites`: the exact folder is absent and the website skill owns games;
- `unresolved`: stop and report the conflicting or missing evidence.

If both owners advertise games, compare their current instructions and report the collision
instead of silently choosing. This local alias never outranks a newer checked-in upstream
owner.

### 3. Hand off without copying the workflow

Load the resolved owner's `SKILL.md` and its referenced game flow. If it is not installed,
report the exact missing owner and request approval before installing the current upstream
skill collection. Do not paste a frozen copy of its categories, commands, scaffold fields,
model catalog, prices, room limits, or marketplace rules into this alias.

Return a compact handoff record:

```text
- Audited repository and commit:
- Exact skill present:
- Resolved owner:
- Evidence and warnings:
- Owner available locally:
- Next skill:
- Next requested action and approval state:
```

### 4. Preserve side-effect boundaries

Owner resolution is read-only. It does not approve CLI installation, authentication, paid
generation, project creation, secret changes, public deployment, or marketplace publication.
The resolved operational skill must obtain and verify each required approval itself.

## Examples

### Exact legacy name

> 검색 결과의 `higgsfield-game-generation`을 설치해줘.

Audit the current tree first. If the folder is still absent, report the drift and offer the
current `higgsfield-websites` owner instead of fabricating the missing skill.

### Ordinary current game request

> Higgsfield로 카드게임을 만들어줘.

Route directly to `higgsfield-websites`. Do not run this compatibility audit unless the
installed owner or command shape is contradictory.

### Retired command

> 예전 문서의 `higgsfield game init`으로 시작하자.

Audit ownership and hand off to the current checked-in owner. Do not execute the stale command.

### Unresolved tree

> 설치 문서는 게임 스킬이 있다는데 어느 폴더에도 없어.

Return `unresolved` with the inspected commit and missing evidence. Stop before installation or
project mutation.

## Best practices

1. Record the commit and prefer the current checked-in owner over prose or search results.
2. Keep this alias read-only; stop on unresolved or dual ownership instead of growing a runbook.
3. A handoff identifies the owner but never grants operational approval.

## References

- [Upstream drift and resolution algorithm](references/upstream-drift.md)
- [Source hierarchy and claim ledger](references/source-notes.md)
- [Read-only owner auditor](scripts/audit-higgsfield-game.py)
- [Pinned Higgsfield skills tree](https://github.com/higgsfield-ai/skills/tree/fb18134b4aabe99c4bf7ff01c8f4883400efc80d)
