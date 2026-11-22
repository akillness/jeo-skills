---
name: scenario-roblox-gameplay
description: "Use when building Roblox gameplay systems: NPC or enemy AI that patrols, chases and attacks, state machines or behavior trees, 'NPC pathfinding stuck', 100 zombies lag the server, hitboxes, melee combos, M1 combat, 'hits register twice', raycasts, Spherecast, Shapecast, guns and projectiles, 'bullets go through walls', knockback and stun, LinearVelocity, VectorForce or AlignPosition movers, replacing BodyVelocity, cars and vehicles with suspension, 'car flips', VehicleSeat, network ownership of NPCs and vehicles, round loops, BindToSimulation logic."
license: MIT
---

# Roblox gameplay systems (gameplay systems programmer)

Target line: Roblox Studio (October 2026 build) on macOS, driven through the scenario-roblox-expert
toolkit.

At expert level, a gameplay system is a pure rule tested in Lune, wired to the engine by one server
scheduler, and proven in a playtest with measured server cost. The core stance: the client sends
intent, the server decides every hit with a spatial query, and no number ships unmeasured. If a
sibling skill named here is missing from your available skills, load it with `skill_get` (Scenario
MCP) or ask the user to install it (https://github.com/scenario-labs/skills#install); unattended,
proceed from tool schemas and flag the gap.

**REQUIRED BACKGROUND:** scenario-roblox-expert (channels, review loop, toolkit, current-Roblox
traps).

**Status (2026-10-19):** 23 live tests pass in Studio 0.743 (Edit probes, NPC bench, hunt, debug
drawings, combo, remote flood, car and its exit with the throttle held, movers, every doc snippet in
the playtest Server); 6 offline checks pass (23 Lune specs, luau-lsp on both type solvers over 15
kit files and 12 snippets). Not yet run: two-player combat (each test client opens a Studio window),
a touch device, a route through a pathfinding modifier and link.

## Stance (the expert delta)

1. **Intent up, hits decided on the server.** The client fires `Attack` with no arguments; the
   server picks the combo step from its own clock and queries a box in front of the root. Spatial
   queries replace `Touched` (Ludius, gmz904QpfxU 00:01:15): a client-owned part can fire `Touched`
   on the server anywhere (Network ownership doc). Validation and rate limits:
   scenario-roblox-networking.
2. **Know what a query skips.** Spherecast, Blockcast and Shapecast ignore parts they start inside
   (veraktt, GtqFcyFgIXQ 00:19:33). Check the start with an overlap query. A Shapecast's final
   position is `origin + direction.Unit * Distance`; `Position` is the contact point (Crusherfire,
   EIOwGMZYidw 00:07:12). Use `ExcludeInstances` or `IncludeInstances`, never
   `FilterDescendantsInstances`, and build the list per shot (BrawlDev, u6I17z6ggUg 00:28:41).
3. **Sweep, then move; step by dt.** Cast the whole step before committing it (veraktt 00:12:22).
   Trapezoid displacement makes the path independent of frame rate (BrawlDev, 0Dt-Ab8czPw 00:33:08);
   measured in Lune: 30, 60 and 240 Hz agree within 0.001 studs, Euler drifts 0.5.
4. **One scheduler for every NPC, measured at the target count.** One Heartbeat thinks one bucket
   per frame, one worker computes paths on a budget, perception is distance first and one raycast
   against static geometry [added]. Measured with 100 R15 NPCs: server 60 fps, frame p95 17.6 ms, AI
   0.14 ms per frame patrolling and 0.26 ms chasing; the physics step grew to 1.8 ms. Humanoid
   physics costs more than the brain, so measure at your count with the AgentKit `Stats`, and cut
   the per-Humanoid cost: unused states disabled, `BreakJointsOnDeath` false, no state machine on
   static NPCs, models pooled across waves ([P5](references/procedures.md)).
5. **Pin NPC roots to the server.** An unanchored NPC near a player is simulated, and movable, by
   that client (measured: an unpinned NPC 6 studs away belonged to the player);
   `SetNetworkOwner(nil)` after parenting (Network ownership doc). Purely decorative crowds can run
   as client Humanoids fed by one attribute per NPC every 5 s (Suphi Kaner, JyMxrcqEzu8 00:13:50).
6. **The brain is data with hysteresis.** States with `onEnter`, `onStay`, `onExit` and transitions
   as a list (Miller, Roblox Learn, nlVpAZEkxgo 00:00:57). Enter Attack at 5 studs, leave above 6.5,
   give up 4 s after losing sight [added]. Pathfinding success is `pcall` AND `Status == Success`
   (BrawlDev, ckA4fVkAjIA 00:15:48); recompute on `Blocked` only when the index is at or after the
   next waypoint (Pathfinding doc). Re-issue `MoveTo`, because it gives up after 8 s. Price routes
   in one `Costs` table (materials, `PathfindingModifier` and `PathfindingLink` labels) instead of
   special-case code; compute only on the ground, in a loaded world, under 3,000 studs; a failed
   move snaps to that waypoint, never the goal ([P12](references/procedures.md)).
7. **Stun cancels pending hits.** A hit victim's queued swing is dropped and its requests refused
   for a bounded stun (ArTheDev, Aoc9HkGHu_8 00:02:57). One hit per character per swing, never per
   limb (Ludius 00:04:06). Knock a Humanoid back with a `LinearVelocity` held 0.2 s: one
   `ApplyImpulse` moved a standing dummy 1.2 studs, the `LinearVelocity` 10.5 [measured].
8. **Cars are constraints plus ownership.** Per wheel one CylindricalConstraint and one
   SpringConstraint on the same attachments, upper limit below 0 (Suphi Kaner, FVOowr2DXbM
   00:10:19). The driver owns the car while seated (Network ownership doc) and the server keeps a
   speed check; competitive racing goes to Server Authority. Check the steer sign live: this kit's
   first build turned left on D. Keep the center of mass low: dense low chassis, light body, seat
   low and central (FVOowr2DXbM 00:54:05). On exit, release the motors, give loose parts the same
   owner, leave through the highest exit point ([P9, P14](references/procedures.md)).

## Establish first

- NPC count, and whether NPCs deal or take damage (server) or only decorate (client crowd).
- Hit model: melee box, hitscan ray, or projectile with travel time and drop (Weapons kit doc).
- Competitive or casual: competitive movement and vehicles go to Server Authority
  (scenario-roblox-networking).
- Platforms: phones are the most common device, so every combat action gets a key, a gamepad button
  and an on-screen touch button bound through `InputBinding.UIButton`
  ([P7](references/procedures.md)).

Defaults when unanswered: NPCs on the server, 6 buckets, 30 paths per second; melee box 5 by 5 by 5
studs at 3.5 studs; a 0.25-stud sphere sweep for projectiles; the car numbers below.

## Procedure

Full code and test results: [procedures.md](references/procedures.md). Modules:
[scripts/agentkit/gameplay/](scripts/agentkit/gameplay/); Python:
[scripts/rbx_gameplay.py](scripts/rbx_gameplay.py).

1. **Install.** Goal: kit, boot scripts and Input Action instances in the open place. How:
   `rbx_gameplay.install(studio)` writes `Source` in Edit (P1). GATE: the playtest Server sees the
   hook and remotes; the Client sees `GameplayInputs.Combat.Attack`; no boot error in the console.
2. **Probe the queries.** Goal: facts for this build. How: the Edit probes (P2). GATE: Spherecast
   from inside returns the far part; Shapecast distance within 0.05 studs of the expected travel.
3. **Brain in Lune.** Goal: a readable, tested decision table. How: `StateMachine` plus `NpcBrain`
   (P4). GATE: `lune run lune_unit.luau` passes.
4. **Crowd and cost.** Goal: a known server cost. How: `NpcService` and the bench (P5). GATE: 0 of
   100 roots client-owned; server fps and p95 recorded at each count; budget agreed with
   scenario-roblox-performance.
5. **Hunt.** Goal: perception, path and melee together. How: `walk_to` drives the player in sight,
   then behind a wall (P6); path failure rules and route pricing (P12). GATE: the NPC reaches the
   player behind the wall and lands a hit; capture.
6. **Combat.** Goal: a combo that resists spam and stun. How: Input Action, intent remote, `Combo`
   and `Hitbox.box` (P7); projectiles with `Projectile` (P8). GATE: two front dummies at 58 health,
   the one behind untouched; under spam, no accepted swing closer than 0.24 s to the previous one; a
   0.2-stud wall stops every projectile. `user_keyboard_input` delivers presses 0.13 to 0.20 s apart
   whatever the waits: flood tests fire the remote from a client script (P7).
7. **Vehicle.** Goal: drives, steers, stays upright. How: `Car.build`, `Car.serve`, `Car.controller`
   (P9). GATE: driver owns the chassis; W for 3 s moves it forward more than 30 studs; W plus D
   turns right more than 20 degrees; `UpVector.Y` stays above 0.8; ownership returns to automatic on
   exit; leaving with the throttle held stops the car (P14); capture before and after.
8. **Audit and review.** How: `GameplayAudit` plus the lead's `Audit` (P3), the
   [critique](references/critique.md), one contact sheet. GATE: 0 errors.

## Numbers

| Value                             | Default                                                                       | Relative to                                                                       |
| --------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Think rate                        | 10 per NPC per second                                                         | 6 buckets at 60 fps                                                               |
| Path budget                       | 30 per second                                                                 | whole server                                                                      |
| Detect, attack, leave range       | 60, 5, 6.5 studs                                                              | target root; chase range 1.5 times detect                                         |
| Lose sight                        | 4 s                                                                           | last time seen                                                                    |
| Humanoid `MoveTo` timeout         | 8 s                                                                           | re-issue every think                                                              |
| Path limits                       | 3,000 studs, 20,000 nodes; both fail as a bad `Status`                        | start to goal (P12)                                                               |
| Route costs                       | 1 default, 20 to 1,000 last resort, `math.huge` never                         | `Costs` keys: materials, modifier and link labels (P12)                           |
| Touch button                      | 72 px, bottom right, clear of jump                                            | shown only while `PreferredInput` is Touch; layout check: scenario-roblox-ui (P7) |
| Combo damage                      | 10, 12, 20                                                                    | steps 1 to 3                                                                      |
| Combo gaps                        | 0.30, 0.30, 0.45 s with 0.8 tolerance                                         | previous accepted swing                                                           |
| Finisher knockback                | `LinearVelocity` 45 studs/s for 0.2 s, `MaxForce` mass times gravity times 20 | away from the attacker                                                            |
| Chain window, finisher lock, stun | 0.9, 0.6, 0.35 s                                                              | last swing or hit                                                                 |
| Cast reach                        | 1,024 studs (shape casts), 15,000 (ray)                                       | per call                                                                          |
| Suspension                        | Stiffness 3500, Damping 200, FreeLength 2.8                                   | Suphi Kaner                                                                       |
| Slide limits                      | upper -1, lower -2                                                            | along Attachment0 X (up)                                                          |
| Drive                             | `MaxSpeed / radius`, torque 5000, idle 2000                                   | rear wheels                                                                       |
| Steer                             | 30 degrees over 0.4 s                                                         | front body attachments                                                            |
| Car speed check                   | 1.5 times `MaxSpeed`, twice in 1 s                                            | server, while a driver owns it                                                    |
| 100 NPCs, measured                | 60 fps, p95 17.6 ms, heartbeat 0.27 ms, physics 1.8 ms, 21.5 kbps sent        | patrolling, server, Studio 0.743                                                  |
| One path, measured                | 65 ms wall time (yields), 0 failures                                          | `ComputeAsync`, open baseplate                                                    |
| Casts, measured                   | Spherecast 0.46, Raycast 0.30 microseconds                                    | 50 studs, small include list                                                      |
| Car, measured                     | 177.9 studs in 3 s, top 51.0 studs/s; 112 degrees in 2.5 s                    | W, then W plus D                                                                  |

## Quality gates

- Measurable: Lune specs; `rbx_check` 0 errors; `GameplayAudit` 0 errors; `NpcService.stats()`
  (states, client-owned roots, AI ms, paths); AgentKit `Stats` in the Server; dummy health and hit
  counts; car samples (distance, heading, `UpVector.Y`).
- Visual: captures of the crowd, the hunt behind the wall, dummies after the finisher, the car
  before and after a drive, read through `rbx_review.contact_sheet` (1,600 px or less). Turn on
  Navigation mesh or Network owners in Visualization Options, and draw waypoints and query boxes
  with `DebugDraw` adornments, depth-tested so captures show them (P13).
- Key tests record client input and rerun when it differs from the keys sent (P7).

## Common mistakes

| Mistake                                       | Symptom                                      | Fix                                                  |
| --------------------------------------------- | -------------------------------------------- | ---------------------------------------------------- |
| `Touched` deals damage                        | hits through walls, exploit damage           | box query on the server                              |
| One result per limb                           | 3 to 5 hits per swing                        | key results by character model                       |
| Projectile starts inside a wall               | shot passes through                          | overlap query before the first sweep                 |
| Teleport by `Position` per frame              | tunneling at speed                           | sweep, then move                                     |
| `FilterDescendantsInstances`                  | superseded API in new code                   | `ExcludeInstances`, `IncludeInstances`               |
| Debug parts queryable                         | casts stop at your own markers               | `CanQuery` false (Crusherfire 00:10:42)              |
| `MoveToFinished:Wait()`                       | NPC freezes after 8 s                        | re-issue `MoveTo`; handle `reached == false`         |
| Path computed mid-air or before the map loads | bad `Status`, NPC stands still               | wait for `FloorMaterial`, gate on load (P12)         |
| Snap to the goal after a failed move          | NPCs pop through walls                       | snap to that waypoint (P12)                          |
| Hazards avoided in code                       | brittle special cases                        | modifier label priced in `Costs` (P12)               |
| Every Humanoid fully enabled                  | physics step grows per NPC                   | trim states, pool, no state machine when static (P5) |
| `ComputeAsync` without `pcall`                | script dies on a bad path                    | `pcall` plus `Status`                                |
| NPC root unpinned                             | the nearest client moves NPCs                | `SetNetworkOwner(nil)`                               |
| One loop per NPC                              | cost grows with scripts                      | one scheduler, buckets                               |
| BodyVelocity                                  | deprecated mover                             | LinearVelocity, VectorForce, AlignPosition           |
| Constraint without `Attachment0`              | nothing moves, no error                      | GameplayAudit `constraint-no-attachment`             |
| Suspension upper limit 0                      | spring bottoms out, car bounces              | upper -1                                             |
| Reading `Throttle`                            | no analog gamepad or touch                   | `ThrottleFloat`, `SteerFloat`                        |
| Passenger owns the car                        | lag for the driver                           | reassign on `Occupant` change                        |
| One fixed exit side                           | a flipped car drops the player under the map | highest exit point (P14)                             |
| Motor values left on exit                     | the empty car drives on                      | release the motors on exit (P14)                     |
| Keyboard-only combat                          | phones cannot attack                         | touch `UIButton` binding (P7)                        |

## Handoffs

- Receives from scenario-roblox-architecture: the RoundMachine round loop, the Binder for tagged
  weapons and hazards, the DamageService slot.
- Delivers to scenario-roblox-networking: hitbox, projectile and ability rules to validate
  (`HitCheck` with rewind), the car speed flag for the suspicion score, Server Authority settings.
- Delivers to scenario-roblox-animation: NPC `State` and `Action` attributes and combo steps to
  drive tracks; under Server Authority, no cached tracks.
- Delivers to scenario-roblox-vfx-audio: hit position, normal and step for impact effects.
- Delivers to scenario-roblox-ui: the `GameplayInputs` contexts and actions for prompts and
  remapping.
- Delivers to scenario-roblox-performance: the NPC bench numbers and budgets.
- Shares with scenario-roblox-luau: fixed-step code (`BindToSimulation`) and Deferred event rules.

## Current Roblox notes

- `RaycastParams` and `OverlapParams`: `ExcludeInstances` and `IncludeInstances` supersede
  `FilterDescendantsInstances` and `FilterType` (2026-04-07). `RaycastParams.Margin` and
  `SizeGradient` are in the reference, but setting either raises "not enabled yet" in 0.743 (P2):
  keep `Spherecast` for thick rays.
- Collision groups live on `workspace` (`RegisterCollisionGroup`, `CollisionGroupSetCollidable`);
  the `PhysicsService` methods are deprecated.
- `PathfindingService:CreatePath` plus `Path:ComputeAsync`; `FindPathAsync` and
  `ComputeRawPathAsync` are deprecated. PathfindingModifier and PathfindingLink need no beta.
- `RunService:BindToSimulation` is documented as needing `Workspace.UseFixedSimulation`. In 0.743 it
  ran in Edit and Play on a place that never set it (P11); scripts cannot read the property from the
  Studio MCP context, so set it explicitly in the Rojo project.
- Creator Store models are sandboxed (2026-05-13): vendor libraries such as FastCast as source.

## References

- [references/expert-notes.md](references/expert-notes.md): principles by expert, with timestamps.
- [references/procedures.md](references/procedures.md): P1 to P14 with full code and test results.
- [references/critique.md](references/critique.md): the self-review rubric.
- [references/gui-paths.md](references/gui-paths.md): Studio menus and the scripted substitutes.
- [references/sources.md](references/sources.md): every source and the live measurement setup.
- [scripts/rbx_gameplay.py](scripts/rbx_gameplay.py): install, fixtures, hook, keyboard sequences,
  audits.
- [scripts/agentkit/gameplay/](scripts/agentkit/gameplay/): the Luau modules and Lune runners.
