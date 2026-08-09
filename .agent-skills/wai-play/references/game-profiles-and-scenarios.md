# Game type profiles and key nodes

`game_profiles.py` upstream is the single source for actions, required state,
key nodes (scenarios), and completion signals. Five types are supported; a
game outside them is routed to the closest profile with an explicit caveat.

## Type keys and aliases

| Internal key | Covers | Recommended max steps |
|---|---|---|
| `survivor_like` | Vampire-Survivors-likes, roguelike survival, kill-and-level games | 80 |
| `arcade_shooter` | Shmups, tank/brick/bullet-dodge arcade action | 60 |
| `platformer` | Side-scrolling jump and run, endless runners | 80 |
| `puzzle_card` | Sokoban, match/merge, tile puzzles, light card battlers | 50 |
| `visual_novel` | Branching story, interactive fiction, text adventure | 40 |

Aliases normalize case-insensitively: `roguelike` / `survivor-like` → `survivor_like`,
`arcade` / `shooter` → `arcade_shooter`, `platform` → `platformer`,
`puzzle` / `card` → `puzzle_card`, `interactive fiction` → `visual_novel`.
Chinese aliases (`肉鸽`, `街机射击`, `平台跳跃`, `解谜`, `视觉小说`, …) resolve
to the same keys. An unrecognized string passes through unchanged and gets an
empty profile — check the type before running.

## Default action sets

| Type | Actions |
|---|---|
| `survivor_like` | `MOVE_UP` `MOVE_DOWN` `MOVE_LEFT` `MOVE_RIGHT` `ATTACK` `PICK_UP` `COLLECT_EXP` `CHOOSE_UPGRADE_1..3` `WAIT` |
| `arcade_shooter` | `UP` `DOWN` `LEFT` `RIGHT` `SHOOT` `ATTACK` `DODGE` `WAIT` |
| `platformer` | `LEFT` `RIGHT` `JUMP` `ATTACK` `DUCK` `WAIT` |
| `puzzle_card` | `SELECT` `PLAY_CARD` `MATCH` `MOVE_TILE` `CONFIRM` `UNDO` `WAIT` |
| `visual_novel` | `CHOOSE_1..3` `CONTINUE` `CONFIRM` `WAIT` |

Each profile also carries `action_aliases` (so `UP` / `MOVE_UP` / `MOVE UP`
resolve together) and `action_priorities` keyed by situation — for example
`survivor_like` prioritizes dodging and movement under `high_pressure` and
`low_hp`, and upgrade selection under `upgrade`. Honour the situational
priority instead of hammering the `normal` list.

## Required key nodes

Priorities: **P0** blocks a meaningful verdict; **P1** is expected coverage;
**P2** is completeness.

### survivor_like
| id | Name | Priority | Verifies |
|---|---|---|---|
| `early_core_loop` | Opening core loop | P0 | Move → attack → kill → EXP drop actually closes |
| `first_upgrade` | First upgrade | P0 | EXP collection triggers the level-up choice |
| `enemy_pressure` | Enemy wave pressure | P1 | Mid-game density rises and still leaves room to move |
| `low_hp_danger` | Low-HP danger | P1 | Danger is legible and recoverable |
| `boss_phase` | Boss phase | P1 | Boss appears with clear feedback and objective |
| `ending_result` | Result screen | P2 | Win/lose settlement and restart are clear |

### arcade_shooter
`basic_shooting` (P0) · `enemy_encounter` (P0) · `bullet_dodge` (P1) ·
`boss_phase` (P1) · `ending_result` (P2). The type profile additionally
requires `basic_movement`, `enemy_avoidance`, and `score_result` checks.

### platformer
`basic_movement` (P0) · `jump_gap` / `jump_test` (P0) · `obstacle_enemy` /
`hazard_avoidance` (P1) · `goal_reach` (P1).

### puzzle_card
`first_decision` / `basic_choice` (P0) · `resource_use` / `state_progress`
(P0) · `combo_or_solution` (P1) · `failure_feedback` (P1) ·
`success_result` (P1).

### visual_novel
`opening_context` (P0) · `first_choice` / `story_choice` (P0) ·
`story_progress` (P0) · `branch_change` (P1) · `ending_result` (P1).

## Success operators

Key nodes pass when **any** rule in `success_any` holds. Operators:

| Operator | True when |
|---|---|
| `truthy` | Value is truthy |
| `exists` | Path resolves to anything defined |
| `non_empty` | Array has length, or object has keys |
| `gt` / `gte` | Numeric comparison against `value` |
| `equals` | Strict equality against `value` |
| `changed` | Differs from the baseline snapshot |
| `increased` / `decreased` | Numeric move against the baseline |

`changed`, `increased`, and `decreased` need a baseline, which is captured by
`checkScenarioPreconditions()` or `jumpToScenario()`. Evaluating a delta
operator without one always returns false — call the precondition check first.

## Completion signals

Each profile lists `success_signals` and `failure_signals` (for example
`goal.reached`, `status.success`, `world.elapsed` for platformer/survivor
success; `status.failed`, `dead`, `game_over`, `player.hp` for failure), plus
`evidence_state_fields` — the fields the evidence chain preserves for problem
cards. If a game exposes none of its type's completion signals, treat the run
as flow-incomplete rather than reporting a failure the game never declared.
