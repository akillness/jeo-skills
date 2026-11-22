# Expert notes: gameplay systems

Principles and judgment by expert, with source and timestamp. [added] marks this skill's own
additions. "Measured" points to a live result in [procedures.md](procedures.md).

## NPC AI

- **State machine as data** (Miller, Roblox Learn, nlVpAZEkxgo 00:00:57). A context table (the
  blackboard), states with `onEnter`, `onStay`, `onExit`, test functions, and transitions as a list.
  Tick it from one loop. One transition can list several source states (00:06:55). A test may write
  to the context, for example `isPlayerNearby` sets `targetPlayer` (00:06:22).
- **Behavior trees when variants share structure** (pluggnsb, TxdnHeH1iYc 00:04:18). Task nodes have
  `start`, `run`, `finish`; stop pathfinding in `finish` (00:05:41). A finite state machine is
  enough for one or two behaviors [added, from the digest's deciding condition].
- **Where NPCs live** (Suphi Kaner, JyMxrcqEzu8 00:00:23). Ambient crowds can run as client-side
  Humanoids. The server owns the data and writes one Position attribute per NPC every 5 s
  (00:13:50). Clients cull by reparenting out of Workspace, with a cull radius larger than the
  movement radius (00:25:58). Deciding condition: an NPC that deals or takes damage runs on the
  server; a purely decorative one can run on clients.
- **Stuck crowds** (Suphi, JyMxrcqEzu8 00:38:26). On `MoveToFinished(false)`, snap to the current
  waypoint, not the final goal. `Humanoid:MoveTo` gives up after 8 s (Humanoid reference), so
  re-issue it or treat `reached == false` as normal.
- **Scheduler, not one script per NPC** [added]. One Heartbeat connection thinks a fixed share of
  NPCs per frame (buckets) and one worker computes paths at a fixed budget. Measured: P5.
- **Humanoids are the bill** (Crusherfire, YWyJHwynM1M 00:26:38, 00:27:11; Improve performance doc,
  Humanoids). Moving NPCs: disable the HumanoidStateTypes they never use. Static NPCs:
  `EvaluateStateMachine = false` or an AnimationController. `BreakJointsOnDeath = false` keeps a
  corpse from becoming loose parts [added]. Measured: P5 (physics step 1.8 ms against 0.14 ms of AI
  at 100 NPCs).
- **Pool NPCs across waves** [added]. One R15 was about 214 instances (P5). A Humanoid in the Dead
  state stays dead, so a pooled NPC disables Dead and ends in code; the same switch stops a client
  that owns an NPC from killing it (Suphi Kaner, hr_8svt1n1E 00:05:10).
- **Pin NPC roots to the server** (Network ownership doc, Security). An unanchored NPC near a player
  is simulated by that player's client, which can then move it. `SetNetworkOwner(nil)` after
  parenting. Measured: P5 ownership control.

## Pathfinding

- **Success is two checks** (BrawlDev, ckA4fVkAjIA 00:15:48): `pcall` returned true AND
  `path.Status == Enum.PathStatus.Success`.
- **Agent radius** (BrawlDev, ckA4fVkAjIA 00:20:34). Raise `AgentRadius` (default 2) to keep paths
  off hazards. Too large (20) closes valid gaps.
- **Costs** (BrawlDev, ckA4fVkAjIA 00:24:33; Pathfinding doc, Material costs). One Costs table
  prices materials and `PathfindingModifier` labels; the cheapest path wins over the shortest.
  `math.huge` means never. A finite 100 to 1000 means last resort. BrawlDev's "1000 means blocked"
  is wrong; the doc wins.
- **Blocked** (Pathfinding doc, Blocked paths). Recompute only when the blocked index is at or after
  the next waypoint index. BrawlDev's script does not handle it at all (ckA4fVkAjIA note).
- **Links** (Pathfinding doc, Pathfinding links). A `PathfindingLink` label must cost less than the
  alternative (UseBoat 2 against Water 20) or it is never chosen.
- **Limits** (Pathfinding doc, Limitations): 3,000 studs, 20,000 nodes, Y within plus or minus
  65,536. Both fail as a bad `Status`. Wait for ground (`FloorMaterial` not Air) before computing.
  Client pathfinding to streamed-out geometry fails: compute on the server, or wait for
  `Workspace.PersistentLoaded` and target persistent models (Pathfinding doc, Streaming).
- **World ready first** (Suphi Kaner, JyMxrcqEzu8 00:46:46). Refuse to place or path an NPC until
  the terrain or map around both ends exists; NPCs placed early float or fail. P12.
- **PassThrough** (Pathfinding doc, Modifiers). A modifier with `PassThrough = true` lets a path go
  through a solid obstacle such as a door.

## Hit detection

- **Spatial queries, not Touched** (Ludius, gmz904QpfxU 00:01:15; B Ricey, mJZWY3G7wa4 00:03:12). A
  client-owned part can fire `Touched` on the server anywhere (Network ownership doc, Security).
- **Melee boxes** (Ludius, gmz904QpfxU 00:02:20). `GetPartBoundsInBox` in front of the attacker.
  Dedupe by character, because one swing overlaps several limbs (00:04:06).
- **Per-shot exclude lists** (BrawlDev, u6I17z6ggUg 00:28:41). A module-level list that grows each
  shot leaks. Draw the visualizer first (00:08:18).
- **Debug parts** (Crusherfire, EIOwGMZYidw 00:10:42). Markers need `CanQuery = false` or they block
  the next cast.
- **Combat state** (ArTheDev, Aoc9HkGHu_8 00:02:57, 00:03:28). Knockback or stun cancels the
  victim's pending hitbox; one hitbox per swing; stun is always bounded. Measured: P7.
- **Knockback on a standing Humanoid** [added, measured]. One `ApplyImpulse` of 45 studs/s times
  mass moved a dummy 1.2 studs: the Humanoid's ground controller cancels it. A `LinearVelocity` held
  for 0.2 s moved it 10.4 studs (`Hitbox.knockback`, P7).
- **Touch from the start** (Marcos Mendoza, qx7T7EDPqPA 00:04:23; IAS walkthrough, Fg-Ksoa7b-s
  00:03:27). One InputContext per mode, and every action gets keyboard, gamepad and touch bindings;
  the touch binding is an `InputBinding.UIButton` pointing at a button you build. P7.
- **The client sends intent** [added, consistent with every combat source's security gap]. No
  target, damage or hit position from the client. Validation and rate limits:
  scenario-roblox-networking.

## Projectiles and casts

- **Shapecast final position** (Crusherfire, EIOwGMZYidw 00:07:12) is
  `origin + direction.Unit * result.Distance`. `result.Position` is the contact point.
- **Start overlap** (veraktt, GtqFcyFgIXQ 00:19:33; WorldRoot reference). Blockcast, Spherecast and
  Shapecast ignore parts the shape already intersects. Query the start (`GetPartBoundsInRadius`,
  `GetPartsInPart`) before the first sweep. Measured: P2, P8.
- **Sweep, then move** (veraktt, GtqFcyFgIXQ 00:12:22, 00:17:55). Cast the whole step's
  displacement; commit the move only without a hit.
- **Frame-rate independence** (veraktt, GtqFcyFgIXQ 00:07:31; BrawlDev, 0Dt-Ab8czPw 00:33:08). Step
  by `dt`. Trapezoid displacement is exact under constant gravity. A gravity multiplier beats
  editing `Workspace.Gravity` (0Dt-Ab8czPw 00:37:35).
- **Hitscan or projectile** (Weapons kit doc). The kit emulates hitscan with `BulletSpeed` 20000.
  Choose projectiles when travel time or drop matters.
- **Cosmetics** (B Ricey, mJZWY3G7wa4 00:08:54, 00:19:51). Muzzle origin from
  `Attachment.WorldPosition`; offset the cosmetic bullet by half a segment so it stops at the wall.
  Hit VFX: orient to `result.Normal` and offset 0.125 studs (veraktt, GtqFcyFgIXQ 00:24:07).
  Cylinder tracers need a 90-degree turn because their length axis is X (BrawlDev, u6I17z6ggUg
  00:42:06).
- **Cost of shape casts** (Crusherfire, EIOwGMZYidw 00:03:37). Large shapes against dense worlds are
  slow; use a ray when a line is enough. Measured: P8.

## Movers and physics

- **Pick the mover by job** (SimTek, ArNJwChSU8Q 00:01:07). `LinearVelocity` holds a speed,
  `VectorForce` accelerates (scale by mass), an impulse or `AssemblyLinearVelocity` write is one
  shot that friction and gravity eat. Measured: P10 (a block on the ground: the impulse stopped
  within 1 s, the `LinearVelocity` held 20 studs/s).
- **Silent failures** (BrawlDev, 0Dt-Ab8czPw 00:07:51, 00:16:40). A constraint without `Attachment0`
  does nothing; `MaxTorque` must exceed what the spin needs.
- **Ragdoll** (BrawlDev, 0Dt-Ab8czPw 00:19:09). Ball sockets for limbs, a Weld for the neck,
  `BreakJointsOnDeath = false`.
- **LookVector is length 1** (SimTek, ArNJwChSU8Q 00:08:22): multiply it by a speed.
- **BodyMovers are deprecated** (Mover constraints doc). BodyPosition and BodyVelocity map to
  `ForceLimitMode` per axis or `VelocityConstraintMode` Line, Plane, Vector; RocketPropulsion maps
  to LineForce plus AlignOrientation.

## Vehicles

- **One CylindricalConstraint plus one SpringConstraint per wheel** (Suphi Kaner, FVOowr2DXbM
  00:05:36, 00:13:10). Body attachment turned so its X axis points up (the slide axis);
  `InclinationAngle` 90 so the wheel spins on its axle (00:08:23, 00:09:42).
- **Numbers** (FVOowr2DXbM 00:10:19, 00:13:43). Limits upper -1, lower -2: the upper limit stays
  below 0 so the spring never reaches zero length. Spring Damping 200, FreeLength 2.8,
  Stiffness 3500.
- **Drive** (FVOowr2DXbM 00:44:30). Wheel `AngularVelocity = MaxSpeed / radius`. `MotorMaxTorque`
  rejects negatives, so use the absolute throttle, plus 2000 idle torque as an engine brake.
- **Input** (FVOowr2DXbM 00:31:20). Read `ThrottleFloat` and `SteerFloat` (analog), not `Throttle`
  and `Steer`.
- **Steer** by rotating the two front body attachments about the up axis, 30 degrees, eased over 0.4
  s (FVOowr2DXbM 00:47:52, 00:52:59). The sign depends on how the attachments are built: check that
  `SteerFloat` +1 turns right in a playtest (P9 caught an inverted sign).
- **Stability** (FVOowr2DXbM 00:21:37, 00:54:05). A low center of mass is the main anti-flip lever.
  Exit through the highest exit attachment so a flipped car does not drop the player under the map
  (01:04:02).
- **Ownership** (Network ownership doc, Setting ownership). The first to sit owns the car, even a
  passenger. Reassign to the driver on `Occupant` change and call `SetNetworkOwnershipAuto` on exit.
  Setting one assembly sets its whole mechanism; loose parts on the vehicle need the same owner too.
- **Release on exit** [added]. Each machine simulates with its own copy of the motor values: zero
  them when the driver leaves, so whoever owns the car next sees a stopped car. P14.
- **Client-driven is fast and forgeable** (FVOowr2DXbM note against the docs). Keep a server speed
  check, or use Server Authority for competitive racing (scenario-roblox-networking).

## Debug views

- **Studio views first** (Pathfinding doc; Network ownership doc, Visualizing). Visualization
  Options: Navigation mesh (arrows mark jumps), Pathfinding modifiers and links, Network owners
  (green: this client; red: buffer zone; white or gray: another machine; black: nobody, no physics).
  Older videos call these Studio settings "Show Owners" and "Show Regions" (JyMxrcqEzu8 00:01:54).
- **Draw what the code tested** (BrawlDev, u6I17z6ggUg 00:08:18; FastCast debug cast, mJZWY3G7wa4
  00:09:26; waypoint balls, ckA4fVkAjIA 00:07:51). Adornments draw without joining physics or
  queries; debug Parts need `CanQuery` false (Crusherfire, EIOwGMZYidw 00:10:42). P13.

## Loops, tags and cameras

- **Tags plus one system script** (BrawlDev, POsw3BZH-bc 00:05:15). Also connect
  `GetInstanceAddedSignal` for late and streamed instances (00:18:08).
- **Round loop** (GnomeCode, oEWoyT-GBZY 00:08:15, 00:11:35). Maps stored outside Workspace, one
  clone per round, destroyed after. Call the status update once on load or attribute-driven UI
  starts blank (00:19:38). The production loop is scenario-roblox-architecture's RoundMachine.
- **Core loop gate** (Roblox Learn, gkFKF9A-snY 00:00:08). Three verbs plus a named progression
  engine that feeds the loop.
- **Top-down camera** (Marcos Mendoza, qx7T7EDPqPA 00:00:31, 00:04:23). `CameraType` Scriptable,
  bound to render step, default controls off while active, an enable and disable pair. Input Action
  System from the start, a `Direction2D` action for panning (00:07:21).

## Server Authority (docs only; no video covers it)

- `RunService:BindToSimulation` runs a fixed-step function only when `Workspace.UseFixedSimulation`
  is enabled (RunService reference). Measured: P11, where it ran in Edit and Play in 0.743 on a
  place that never set the property.
- Do not cache AnimationTracks under Server Authority; query `Animator:GetTrackByAnimationId` each
  tick (Server authority techniques, Avoid track caching).
- Render effects from attribute state and gate one-shot effects with a short timer so a rollback
  does not replay them (Server authority techniques, Playing sounds and VFX).
