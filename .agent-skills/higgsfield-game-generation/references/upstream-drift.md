# Higgsfield game upstream drift audit

## Audited pin

- Repository: <https://github.com/higgsfield-ai/skills>
- Commit: `fb18134b4aabe99c4bf7ff01c8f4883400efc80d`
- Commit date observed during research: 2026-08-07
- Exact candidate path tested: `higgsfield-game-generation/SKILL.md`
- Result at the pin: absent
- Current checked-in owner of game creation at the pin: `higgsfield-websites`

Pinned evidence:

- [`INSTALL.md`](https://github.com/higgsfield-ai/skills/blob/fb18134b4aabe99c4bf7ff01c8f4883400efc80d/INSTALL.md)
- [`higgsfield-websites/SKILL.md`](https://github.com/higgsfield-ai/skills/blob/fb18134b4aabe99c4bf7ff01c8f4883400efc80d/higgsfield-websites/SKILL.md)
- [`higgsfield-websites/references/game-flow.md`](https://github.com/higgsfield-ai/skills/blob/fb18134b4aabe99c4bf7ff01c8f4883400efc80d/higgsfield-websites/references/game-flow.md)
- [Pinned repository tree](https://github.com/higgsfield-ai/skills/tree/fb18134b4aabe99c4bf7ff01c8f4883400efc80d)

## Observed inconsistency

At the pin, installation prose advertises nine Higgsfield skills and names
`higgsfield-game-generation`, while the checked-in tree contains eight root `SKILL.md` owners
and no folder with that exact name. Game creation is documented inside
`higgsfield-websites` through `website create --type game`, with the detailed scaffold and
room lifecycle in `references/game-flow.md`.

This is an upstream documentation/tree inconsistency, not evidence that the missing file
should be reconstructed. Search indexes, package listings, and screenshots may preserve the
old name after the repository shape changes.

## Resolution algorithm

1. Pin or record the upstream commit before auditing.
2. Inspect the actual tree for `<repo>/higgsfield-game-generation/SKILL.md`.
3. Inspect `<repo>/higgsfield-websites/SKILL.md` for an active `--type game` flow.
4. Inspect its referenced game-flow document and generated scaffold contract.
5. If the exact skill exists, read it and compare current ownership before selecting it.
6. If it is absent and the website skill owns games, use `higgsfield-websites`.
7. If both are absent or contradictory, stop and report the drift instead of guessing.

The bundled auditor automates only the read-only parts of this algorithm.

## What this skill intentionally does not claim

- It does not claim that the missing folder never existed.
- It does not claim that the audited commit is the latest forever.
- It does not invent a standalone `higgsfield game` command family.
- It does not freeze categories, templates, runtime versions, model catalogs, prices, or
  marketplace policy across future releases.
- It does not copy the upstream game skill. It provides only a compatibility audit and
  evidence-backed handoff to the actual current owner.
