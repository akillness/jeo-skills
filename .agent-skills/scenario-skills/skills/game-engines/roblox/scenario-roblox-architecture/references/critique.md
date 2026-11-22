# Critique rubric: Roblox code architecture

Use it on your own output before calling an architecture task done. Blockers first: any blocker
means the work is not done. Then score each line 0 to 2 and fix every 0.

## Blockers

- An entry script runs twice: a Client Script in a Starter container, or BootCount 2.
- The client entry is a LocalScript outside the Starter containers (Rojo `emitLegacyScripts` left at
  its default), so it never runs.
- Server-only code or secrets in a replicated container: ArchAudit `server-api-replicated` or
  `client-requires-server`, or AgentKit Audit server findings.
- A require cycle, or "Requested module was required recursively" in the console.
- A boot report with BootOk false or BootErrors above 0 on either side.
- A state service that requires a UI module (`service-requires-ui`).
- A table keyed by Player or character with no removal path (`player-table-no-cleanup`,
  `character-table-no-cleanup`).
- A claim of "tested" with no `results.json` entry, capture or console line behind it.

## Scored items (0, 1, 2)

**Structure**

- One entry Script per side; everything else is a ModuleScript that follows the Init and Start
  contract.
- Every module has one purpose its name states (Crusherfire); no module above 500 lines without a
  reason (MrAsync).
- Dependencies point from services to shared modules; the module map in the answer matches
  `ArchAudit.graph`.
- Requires resolve: 0 unresolved in ArchAudit, relative or `@self` paths inside a relocatable
  system.

**State**

- Truth lives in server modules; clients read attributes or replicated properties written only by
  the server.
- Timers replicate as absolute server times, not a per-second remote.
- UI reads state and calls services; it owns none.
- No handler depends on a property or attribute arriving before a remote: the state is in the
  payload, or it is attributes only (P8).

**Behavior by tag**

- Many instances of one behavior use one Binder, not a script per instance.
- The binder filters by ancestor, so templates in ServerStorage stay unbound.
- Setup returns its cleanup; unbind leaves 0 bound (L8 shape).

**Lifetimes**

- Each connection is stored in a cleanup with an owner, or dies with its instance.
- PlayerCharacterDestroyBehavior Enabled, set in the project or Properties.
- Removal handlers only clear; nothing reads Parent after a destroy.
- Round items survive a respawn (re-given on CharacterAdded).
- Every listener is connected before the first fire (Init), never inside another handler (L13).
- HUD and shop: `ResetOnSpawn` false, direct children of StarterGui or built in code; no run-once
  controller holds a screen that resets (L12, ArchAudit `reset-ignored-nested`).

**Round content**

- Maps live in ServerStorage; one clone per round, destroyed on the way back to Lobby (ArchAudit
  `maps-replicated`).
- Per-map behavior is bound by tag, so destroying the map is the cleanup: Lobby shows 0 maps, 0
  bound hazards and the instance count back within 10 (L11).
- The round loop meets the frame gate of scenario-roblox-expert across a map load: p95 at most 20
  ms, worst at most 33.3 ms at 60 fps.

**Project setup** (project-setup.md)

- Client start: one self-contained loading screen in ReplicatedFirst; `RemoveDefaultLoadingScreen`
  after it shows; it waits for `Loaded` and a ready flag with a timeout, never for a Workspace part.
- Streaming: client code waits with a timeout or checks nil; models scripts need whole are Atomic;
  Persistent is rare; distant hit checks run on the server.
- Teams: one source of truth per folder (Rojo, Script Sync or a Package); the reusable core is a
  Package with Auto Update and group ownership; server modules sit outside replicated folders from
  the start.
- Two-client tests: the answer names `StudioTestService:ExecuteMultiplayerTestAsync` or the Server &
  Clients menu, and says whether it ran.

**Agent verification**

- Offline: `rbx_check` 0 errors, Lune unit tests for pure modules (state machines, loaders),
  ArchAudit on the built place.
- Live: boot report on both sides, the round loop observed in the Server and Client data models, a
  capture opened and judged.
- State observed through Studio-only attributes, not through `require` from `execute_luau`.
- Latency: say that Studio playtests run at 0 ms, and name the Network Simulation step for a human.

**Current Roblox**

- No `wait`, `spawn`, `delay`, `_G` registries or pre-2026 yielding names (`LoadCharacter`).
- Deferred signals assumed; `:Once()` for single-shot handlers.
- Packages: AutoUpdate on, group ownership in teams; Wally for third-party code.
- No reliance on `CreateCollection` until a probe shows it enabled.

## Severity guide

- Blocker: breaks at runtime, leaks server code, or claims a test that did not run.
- 0: the expert rule is absent or contradicted.
- 1: present but untested, or tested only offline when a live run was possible.
- 2: present, tested, and the evidence is named.
