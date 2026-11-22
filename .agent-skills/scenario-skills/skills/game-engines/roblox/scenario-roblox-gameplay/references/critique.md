# Critique rubric: gameplay systems

Judge your own output with this list before you report. Each line is pass or fail with a number or a
capture behind it. A system that was not run in a playtest fails the rubric, whatever the code looks
like.

## Authority and security

- The client sends intent only: no damage, target, hit position or speed in a remote payload.
- Every hit is decided on the server by a spatial query or a cast; no `Touched` handler deals
  damage.
- Remote validation and rate limits exist (scenario-roblox-networking `Net.bind` or equivalent).
- NPC roots: `GetNetworkOwner()` is nil (server) for every NPC during a playtest (P5: 0 of 100).
- Vehicles: the driver owns the car while seated; ownership returns to automatic on exit; the server
  has a speed check or the place uses Server Authority (P9).

## NPC AI

- The brain is pure and unit-tested (Lune) with a transition table you can read.
- Hysteresis between Attack and Chase (enter at one range, leave at a larger one).
- Losing a target has a timeout; a chase behind a wall still reaches the target (P6).
- One scheduler for all NPCs, not one loop per NPC; think rate and path budget are config values.
- Humanoid cost levers applied: unused states disabled, `BreakJointsOnDeath` false, static NPCs
  without a state machine, models pooled when waves respawn (P5).
- Measured at the target count in a playtest: server fps, frame p95, heartbeat and physics step, AI
  milliseconds per frame, paths per second (P5). Never a guessed number.
- Two-player combat (one player hitting another) is not covered by a one-client playtest:
  `StudioTestService:ExecuteMultiplayerTestAsync` runs it from a plugin (see gui-paths.md).

## Pathfinding

- `pcall` around `ComputeAsync` and a `Status == Success` check.
- `Blocked` handled with the index rule; `MoveTo` re-issued (8 s timeout); a failed move snaps to
  that waypoint, never to the goal (P12).
- Paths computed on the ground, in a loaded world, inside 3,000 studs (P12).
- Agent parameters set (radius, height, jump); costs use `math.huge` only for never; hazards and
  shortcuts are modifier and link labels in `Costs`, not special-case code.

## Hit detection and projectiles

- Query params use `ExcludeInstances` or `IncludeInstances`, never `FilterDescendantsInstances`.
- Melee results deduped by character; at most one hit per target per swing (P7).
- A stun or knockback cancels the victim's pending hit (P7).
- Knockback on a Humanoid is a short `LinearVelocity`, not one impulse (P7: 10.4 against 1.2 studs).
- Projectiles sweep before they move, check the start overlap, step by `dt`; a 0.2-stud wall stops
  them at every tested speed and rate (P8).
- Debug parts: `Anchored`, `CanCollide`, `CanTouch` and `CanQuery` false.

## Physics and vehicles

- No BodyMovers; every constraint has its attachments; movers have nonzero force or torque limits.
- Suspension: limits on, upper limit below 0, spring on the same attachments (GameplayAudit clean).
- The car moves forward on throttle, turns the right way on steer, `UpVector.Y` stays above 0.8
  (P9).
- Low center of mass: heavy low chassis, light body, seat low and central (P9).
- Leaving the car with the throttle held: it stops, the owner settles, the player exits through the
  highest exit point; loose parts share the driver's owner (P14).
- Analog input: `ThrottleFloat` and `SteerFloat`.
- Every combat action has key, gamepad and touch bindings; touch buttons show only for touch (P7).
- Input tests state their limit: `user_keyboard_input` spam arrives 0.13 to 0.20 s apart; floods
  come from a client script; client input is recorded and compared with the keys sent (P7).

## Evidence

- `GameplayAudit.run(game)` has 0 errors; the lead's `Audit` has no deprecated-API findings.
- `rbx_check` 0 errors on every module and snippet; Lune specs pass.
- Captures: NPC crowd, hunt behind the wall, combo result, car before and after a drive, read from
  one contact sheet; Navigation mesh or Network owners on, or waypoints and query boxes drawn (P13).
