# The GameFlowAgentAPI contract

WAI Play can drive a game as a black box, but everything downstream — flow
modeling, key-node routing, evidence quality, replanning after failure — gets
better when the page exposes a structured agent API.

Upstream ships two template generations. Both mount `window.GameFlowAgentAPI`.

## v1 vs v2

| | v1 (`gameflow_standard_v1`) | v2 (`gameflow_standard_v2`) |
|---|---|---|
| Shape | One self-contained IIFE you edit in place | A thin API layer over a `window.GameFlowIntegration` bridge you implement |
| Unimplemented behavior | `console.warn` and continue | `throw new Error(...)` |
| Scenario judging | Hand-written per-scenario `evaluateScenario` | Driven by the type profile's `success_any` rules |
| Baseline tracking | None | Snapshots state on `checkScenarioPreconditions` / `jumpToScenario` so `changed` / `increased` / `decreased` operators work |

**Prefer v2.** Its refusal to return plausible-looking fake state is the whole
point: a bridge that invents data produces a report about the bridge.

## Required methods

Mounted on `window.GameFlowAgentAPI`:

| Method | Returns | Notes |
|---|---|---|
| `getGameInfo()` | Title, type, goal, controls, `api_version`, capability flags | Placeholder text here means the model is guessing |
| `observe()` | Live structured state | Must reflect the real game every call |
| `availableActions()` | Legal action strings **now** | Remove actions that are currently invalid |
| `step(action)` | Post-action observation | Must invoke the same code path a human input would |
| `evaluate()` | `{ done, success, failed, score, reason }` | Falls back to `status.*` if the bridge omits it |
| `reset()` | Post-restart observation | v2; must call the game's real restart |
| `listTestScenarios()` | Key nodes for this game type | Main path for key-node testing |

Optional but high-value:

| Method | Purpose |
|---|---|
| `checkScenarioPreconditions(id)` | Report which judgement fields are unreadable, and snapshot a baseline |
| `repairScenario(id, plan)` | Apply whitelisted precondition fill-in, then re-validate |
| `jumpToScenario(id)` | Safe entry into a key node |
| `evaluateScenario(id)` | Per-scenario verdict; defaults to the profile's `success_any` rules |

## The bridge (v2)

```js
window.GameFlowIntegration = {
  observe()           { /* return REAL live state */ },
  availableActions()  { /* optional: dynamic legal actions */ },
  step(action)        { /* call the same logic a keypress calls */ },
  evaluate()          { /* optional: { done, success, failed, reason } */ },
  reset()             { /* call the game's real restart */ },
  // optional
  repairScenario(id, plan) {},
  jumpToScenario(id) {},
  evaluateScenario(id) {}
};
```

Rules the API enforces or expects:

- `step()` rejects any action not in `availableActions()`.
- `observe()` must return an object; the API stamps `game_type` onto it.
- Path lookup in scenario rules is dotted (`player.hp`), with a fallback that
  searches the `player`, `world`, `combat`, `resources`, `target`, `goal`, and
  `status` groups for a bare key.

## Status block

Every type needs a readable terminal state:

```js
status: { done: Boolean, success: Boolean, failed: Boolean }
```

Without it, `evaluate()`, the `ending_result` key node, and the core-flow
dimension all degrade to guesswork.

## Per-type state shapes

Minimum structures the templates expect. Extra fields are fine; missing ones
show up as `missing` in `checkScenarioPreconditions`.

**survivor_like** — `player{hp,max_hp,level,exp,position}`, `world{elapsed,enemy_count,current_phase}`, `combat{kills}`, `resources{exp_orbs}`, `upgrade{is_selecting_upgrade,options}`, `boss{exists,hp}`, `status`

**arcade_shooter** — `player{hp,max_hp,position}`, `enemies[]`, `bullets{player,enemy}`, `world{stage,wave,enemy_count}`, `combat{score,kills}`, `boss{exists,hp}`, `status`

**platformer** — `player{hp,x,y,on_ground}`, `world{stage,checkpoint}`, `platforms[]`, `obstacles[]`, `holes[]`, `goal{reached,x,y}`, `score`, `status`

**puzzle_card** — `board[]`, `hand[]`, `valid_actions[]`, `target{description,completed}`, `turn`, `score`, `status`

**visual_novel** — `scene{chapter,scene_id,speaker,text}`, `choices[]`, `flags{}`, `relationships{}`, `ending{reached,ending_id}`, `status`

## Failure codes

Returned by jump / repair paths. Each maps to exactly one correct response —
see Step 7 of `SKILL.md`.

- `SCENARIO_PRECONDITION_MISSING` — required judgement fields unreadable
- `SCENARIO_LOADER_NOT_IMPLEMENTED` — no initializer for this node
- `SCENARIO_UNSAFE_TO_JUMP` — jumping would leave state incoherent
- `UNKNOWN_SCENARIO` — id is not in this type's profile
- `SERVER_AUTHORITATIVE_STATE` — server owns state; frontend cannot fill in
- `INVALID_REPAIR_PLAN` — repair plan was not an array
- `REPAIRER_NOT_IMPLEMENTED` — no safe repair path exists

## Anti-patterns

1. **Fabricated state.** Returning constants from `observe()` scores the stub.
2. **Simulated steps.** `step()` that mutates a copy instead of calling real
   game logic makes every input-feedback finding meaningless.
3. **Single-field scenario entry.** Setting `elapsed = 360` to "reach" the
   boss phase without level, gear, map, spawn pool, and boss AI.
4. **Leftover placeholders.** `请在这里填写...` in `getGameInfo()` means the
   planner is modeling a template, not your game.
5. **Static `availableActions()`.** Returning the full action list while the
   game is in an upgrade-selection modal misroutes the whole attempt.
