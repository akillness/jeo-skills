# Higgsfield game source notes

## Source hierarchy

Use sources in this order:

1. the checked-out upstream tree at a recorded commit;
2. the current owner's `SKILL.md` and its referenced files;
3. the generated project's `app/AGENTS.md` and source;
4. current read-only CLI help and account/project status;
5. official repository installation prose;
6. search results or third-party descriptions only as discovery hints.

A lower source cannot override a contradictory higher source without an explicit upstream
migration record.

## Claim ledger

| Claim used by this skill | Evidence | Boundary |
|---|---|---|
| The exact `higgsfield-game-generation` folder is absent at the audited pin | Pinned repository tree at `fb18134b4aabe99c4bf7ff01c8f4883400efc80d` | Re-audit newer commits |
| Installation prose names more skills than the pinned tree contains | Pinned `INSTALL.md` and root `SKILL.md` inventory | Report as drift, do not infer missing content |
| The current checked-in game owner at the pin is `higgsfield-websites` | Pinned `higgsfield-websites/SKILL.md` | Owner can change |
| Game creation uses a website command with `--type game` at the pin | Pinned website skill and `references/game-flow.md` | Re-read live command and categories |
| The generated scaffold defines the game logic boundary | Pinned game-flow reference and generated `app/AGENTS.md` instruction | The generated file is authoritative for that project |
| Deploy and marketplace publish are different actions | Pinned website/game flow | Current CLI/status must confirm targets |
| Asset generation can consume account credits | Upstream generator workflow and account status model | Never invent current pricing or model costs |

## Primary links

- Repository: <https://github.com/higgsfield-ai/skills>
- Pinned tree: <https://github.com/higgsfield-ai/skills/tree/fb18134b4aabe99c4bf7ff01c8f4883400efc80d>
- Installation document: <https://github.com/higgsfield-ai/skills/blob/fb18134b4aabe99c4bf7ff01c8f4883400efc80d/INSTALL.md>
- Current game owner at the pin: <https://github.com/higgsfield-ai/skills/blob/fb18134b4aabe99c4bf7ff01c8f4883400efc80d/higgsfield-websites/SKILL.md>
- Game-flow reference: <https://github.com/higgsfield-ai/skills/blob/fb18134b4aabe99c4bf7ff01c8f4883400efc80d/higgsfield-websites/references/game-flow.md>

## Non-claims

This skill deliberately does not state a fixed model catalog, category list, runtime version,
credit price, generation duration, network capacity, room size, or marketplace moderation
policy. Those are live platform facts and must be inspected when they matter.
