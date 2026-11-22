# Critique rubric (scenario-godot-gameplay)

The agent scores its own output against this before calling a gameplay task done. Each line is pass
or fail; a fail names the fix. Numbers come from a run, never from memory.

## A. Evidence (any task)

- [ ] Every claim about cost has a measured number from a headless `--fixed-fps 60` run, median of
      3, with the machine noted. No numbers from `Performance.TIME_*` under fixed fps (they read 0).
- [ ] Every job's result was asserted on payload keys, not just `ok` (an aborted `run()` reports
      ok).
- [ ] project.godot checked: `3d/physics_engine="Jolt Physics"` for 3D, renderer stated, unique
      `config/name` per project when tests write to `user://`.
- [ ] `gd_run.check_all(P)`: 0 parse errors.
- [ ] Visual results (crowds, dungeons, debug overlays) captured windowed and the image opened, not
      just checked by numbers.

## B. Navigation and crowds

- [ ] Navmesh baked from a group of static colliders, not "Both from root" (NPCs carve holes).
- [ ] No path query before the mesh is applied: `wait_applied` (region id, then map sync) after any
      assign or rebake.
- [ ] Steering on XZ (the navmesh floats 0.3 m above the floor at default cell height).
- [ ] Avoidance on for crowds, and `velocity_computed` drives the move. With 200 agents and
      avoidance off, more than a hundred pairs overlap.
- [ ] Agent count scaling measured at three or more counts. `scaling_verdict` reports an exponent
      under 1.3.
- [ ] Server mode plus MultiMesh is considered when the agents need no per-agent nodes (about 7
      times cheaper at 200).

## C. AI

- [ ] The tier is chosen by the deciding condition: an enum brain for crowds, a node FSM for a hero
      or player, a BT when designers author behavior, GOAP only for recombining generic actions.
- [ ] Thinking is budgeted (Hz plus a max per tick) and the perception order is cheap first
      (distance, cone, ray).
- [ ] Hysteresis on every threshold pair. The transition table is unit-tested.
- [ ] Ray hits on a target just moved this frame are not trusted (stale broadphase).
- [ ] Selectors have no always-succeeding first branch (starvation), or it is wrapped in
      Probability.

## D. Combat and projectiles

- [ ] Hitbox mask only, hurtbox layer only, layers named in project settings. No area left on layer
      1 and mask 1.
- [ ] One HitLog per swing shared by all its shapes.
- [ ] No `monitoring` or shape change inside area signals without `set_deferred`.
- [ ] Fast bullets are data with ray sweeps, or bodies with `continuous_cd`. Bullet bodies never
      collide with each other (own layer).
- [ ] Speeds above 500 m/s are not requested from Jolt bodies (clamped).

## E. Save, inventory, quests, dialogue

- [ ] Saves under `user://`, written atomically (temp file plus rename).
- [ ] Untrusted `.tres` scanned before load (embedded or foreign scripts refused), or saved as JSON
      with `from_native`.
- [ ] Load with `CACHE_MODE_IGNORE`; versioned save with `migrate()` and a fixture of every past
      version.
- [ ] Typed arrays filled with `assign()`.
- [ ] Shared `.tres` inventories duplicated per holder (`duplicate(true)`); items stay shared.
- [ ] Quest giver order: turn in, continue, offer.
- [ ] Every `.dialogue` file compiles (0 errors) and every jump target exists (offline lint plus
      compile).

## F. Input

- [ ] Gameplay bound to physical keys and handled in `_unhandled_input`.
- [ ] Remaps saved to a ConfigFile and restored at boot; defaults with
      `load_from_project_settings()`.
- [ ] UI blocking tested with `push_input(event, true)`.

## G. Procedural generation

- [ ] Seeded RNG, layout hash equal for the same seed, generation time measured.
- [ ] Validators (connected, boss distance, loot at dead ends) run on 1000 seeds with 0 failures.
- [ ] The built level is baked and a path from start to boss exists.

## Severity

A fail in A, or any measured claim without a run, blocks delivery. A fail elsewhere is fixed or
reported with its reason. Do not dramatize: name the condition under which the problem shows.
