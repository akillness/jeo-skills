# Expert notes

Principles and judgment calls, by topic, with source and timestamp. "Live" marks a claim checked in
Studio 0.743 on 2026-10-18 (see `procedures.md`); [added] marks this skill's own additions.

## Task scheduler

- `task.spawn` runs the function body synchronously up to its first yield, then returns to the
  caller; it is not concurrency, and an error inside it does not stop the caller (Crusherfire, task
  library, [00:13:33] to [00:14:06]). Live: order `spawn:body, caller:afterSpawn`.
- `task.defer` queues the function at the end of the current resumption point; several defers keep
  call order and show in MicroProfiler under deferred threads (Crusherfire [00:10:55], [00:14:39];
  scheduler docs). BrawlDev calls defer "lower priority" ([00:15:42]); that reading is wrong.
- `task.wait()` and `task.delay(0, f)` resume at the next Heartbeat: the same frame when called from
  PreRender or PreSimulation, the next frame when called from Heartbeat (Crusherfire [00:16:48] to
  [00:24:56]). Live: 0.07 ms from PreSimulation, 16.42 ms from Heartbeat.
- `wait`, `spawn` and `delay` are legacy and throttled (scheduler docs). ByteBlox reaches "use
  task.wait" but blames precision (wait vs task.wait, whole video); the reason is throttling.
- Evidence recipe: `debug.profilebegin("tag")` / `debug.profileend()` around work, then
  MicroProfiler (Cmd+F6, Cmd+P to pause) and search the tag; put a frame counter in the tag
  (Crusherfire [00:10:22], [00:19:31]).
- `RenderStepped` and `Stepped` are superseded by `PreRender` and `PreSimulation`; `PreSimulation`
  passes only the delta (Crusherfire [00:27:29]; RunService reference).
- Under Server Authority, `task.defer` moves work out of the simulation step, where only Simulation
  Access properties are writable; play effects that way or they replay on resimulation (RDC 2026
  Server Authority, Drew Hamilton and Jason Knight, [00:22:19]).

## Deferred events

- Deferred is the template default and the documented recommendation; `Default` still means
  Immediate in older places; Server Authority forces Deferred (deferred events docs; version history
  2023-04 opt-in, 2023-11 templates).
- Adopting Deferred alone cut one game's frame time from about 6 to 8 ms to about 4 to 5 ms (Drew
  Hamilton, RDC 2026, [00:17:31]). It is the first migration step before Server Authority
  ([00:16:57]).
- A handler connected inside another handler can miss a fire made in the same step: Immediate
  catches both, Deferred one (Crusherfire, deferred events, [00:04:43] to [00:05:51]). Live: 0
  calls.
- Nested fires reorder: Immediate runs A, C, B (depth first); Deferred runs A, B, C (queue)
  (Crusherfire [00:06:06] to [00:08:52]). Live: A, B, C on Server and Client.
- Removal handlers (`Destroying`, `CharacterRemoving`) run after the instance is gone: `Parent` is
  nil (Crusherfire [00:08:54] to [00:13:17]; docs). Live: `Destroying` saw nil.
- Docs: re-entrancy is limited to depth 10. Live: a BindableEvent handler that re-fires its own
  event reached depth 50 with no error; do not rely on the limit as a guard.
- `:Once()` replaces connect-then-disconnect; `Disconnect` drops queued invocations, `Destroy` still
  runs them (docs). Live: 1 run after Disconnect, 2 runs after Destroy.

## Yields and coroutines

- Luau cannot yield across a metamethod or C-call boundary: `__index` functions, `table.sort`
  comparators and `string.gsub` callbacks [added, verified with luau, Lune and Studio]. `pcall` is
  yieldable.
- A failed `task.wait` under `pcall` leaves the thread registered with the task scheduler: the next
  `task.wait` raised "already 'waiting'" (live, first run) [added]. Never probe this in a shared
  Studio.
- Coroutines suit hand-over-hand control (generators, state machines); `task.spawn` and `task.defer`
  suit scheduled work (BrawlDev coroutines vs Crusherfire). Deciding condition: does your code
  resume it manually later.
- `coroutine.resume` returns `true` plus yielded values, or `false` plus the error; `coroutine.wrap`
  rethrows; a finished coroutine is `dead` (BrawlDev coroutines [00:15:04], [00:25:14]; luau CLI).
  Coroutines are cooperative: real parallelism needs Actors (BrawlDev's "multithreading" wording is
  wrong).
- Do not block the main thread with a long loop (BrawlDev [00:12:15]; [00:12:54] task functions). A
  yielding per-frame handler piles up threads instead (live: 16 concurrent threads in 1 s with
  `task.wait(0.25)` in Heartbeat) [added].

## Types

- New type solver: general release 2025-11-20 for `--!nocheck` and `--!nonstrict`; strict opts in
  through `Workspace.UseNewLuauTypeSolver` (NotScriptable, RolloutState);
  `Workspace.LuauTypeCheckMode` sets the project default (DevForum releases; Workspace reference).
  Live: `LuauTypeCheckMode` reads Default; the other two are unreadable from scripts.
- `local y = 5; y = "hello"` errors on the old solver, not on the new one: annotate locals that must
  keep a type (Suphi Kaner, type checking, re-tested with luau-lsp).
- Nonstrict gives `any` for untyped table fields and unannotated returns; declare field and return
  types, or go strict (Suphi Kaner [00:09:21] to [00:15:32]).
- Typed class: `export type C = typeof(setmetatable({} :: Fields, C))` with explicit `self: C`
  (Roblox Learn, OOP in Luau, [00:09:08]). Tested: colon methods let field typos through on both
  solvers; dot-typed `self` catches them [added].
- Typed metatable inheritance gives false "does not have key" errors on both solvers (OOP in Luau
  [00:09:08] hinted it; tested: 2 errors old, 9 new) [added]. Prefer composition.
- Strict over nonstrict for new modules and shared libraries; nonstrict for prototypes and large
  legacy code (Suphi Kaner).

## Classes and cleanup

- Class table is its own metatable with `__index` set to a table, never a function; avoid deep
  chains (Luau performance page, "Fast method calls"). Call methods with `obj:Method()`; caching
  methods in locals does not help.
- Give every class a `Destroy` that disconnects and destroys what it created (Roblox Learn OOP
  [00:10:32]).
- Add cleanup on the creation line (`trove:Add(...)`, `trove:Connect(...)`) so Destroy is one call
  (B Ricey, Trove, Maid, Janitor, [00:07:20] to [00:12:55]). Library choice is per codebase: Janitor
  (features), Trove (ergonomics), Maid (oldest). Cleanup frameworks belong to
  scenario-roblox-architecture.
- Forgotten connections leak at scale in production, not in a short Studio test (B Ricey
  [00:10:01]).

## Memory

- Growth is normal; only memory that never comes down is a leak. Look for a sawtooth (Roblox Learn,
  memory leaks, Andrew, [00:05:58]). Server budget about 6.25 GB; a low-end phone about 2 GB with
  700 MB taken by the OS ([00:00:43], [00:01:17]).
- Server leaks matter more: a server lives through hundreds or thousands of players (Crusherfire,
  Luau Heap, [00:02:48]).
- Leak hunt: snapshot in Luau Heap, play a cycle, return to the same state, snapshot, compare; trust
  only entries that keep rising across several diffs; many unique references with similar paths mean
  connections keep instances alive (Crusherfire [00:04:36], [00:07:53], [00:09:05]).
- Characters and players can outlive the player: enable `Workspace.PlayerCharacterDestroyBehavior`
  or destroy on `CharacterRemoving` (Roblox Learn [00:06:58]). Live: at Default the old character
  was unparented but its connection stayed connected; `task.defer(character.Destroy, character)` on
  `CharacterRemoving` disconnected it.
- Roblox scripts may only call `collectgarbage("count")`; `gcinfo()` returns the same KB [added,
  luau-lsp flags `collectgarbage` as deprecated].

## Parallel Luau

- Scripts under the same Actor never run in parallel with each other; parallelism needs several
  Actors (docs; Suphi Kaner, MicroProfiler and parallel, [00:13:10] to [00:14:54]).
- `ConnectParallel` without an Actor ancestor errors and that handler never runs (Suphi Kaner
  [00:12:06]).
- Serial, parallel, serial: set up serially, compute after `task.desynchronize()`, write after
  `task.synchronize()`; re-check `Parent` for racing hits (docs; Stewiepfing, Parallel Luau,
  [00:12:35]). Live: write before synchronize refused, after it landed.
- No `require` in the parallel phase; Instance writes and most Instance methods are unsafe there;
  members without a thread-safety tag count as Unsafe (docs). Live error texts: "require can not be
  used during the parallel phase", "Property BasePart.Transparency is not safe to write in
  parallel", "Function Instance.SetAttribute is not safe to call in parallel".
- Each Actor is its own Luau VM: module state is not shared (docs). Live: Actors saw 0 where the
  main VM had 41.
- Many Actors (64 and more, even on 4 cores) for independent units such as per-player validation;
  keep connected logic in one Actor (docs; Stewiepfing [00:19:58]). Terrain pattern: a manager
  messages chunk coordinates to 32 Actors, workers compute noise in parallel, `WriteVoxels` runs
  serially (Stewiepfing [00:13:01]; docs).
- Synchronized-phase order across Actors varies per frame (Suphi Kaner [00:18:44]).
- SharedTable: keys are strings or non-negative integers below 2^32; values booleans, numbers,
  vectors, strings, SharedTables; use `update` or `increment` for read-modify-write (Stewiepfing,
  SharedTables, [00:01:27], [00:08:33]). Live: plain `+= 1` from 8 Actors lost 127,107 of 160,000
  increments; `increment` lost none.

## Native code generation

- Server scripts only; helps numeric work on numbers, vectors and buffers, not code dominated by API
  or library calls (docs; Roblox Learn, native codegen, [00:03:54]).
- Annotate `Vector3` parameters or native code assumes a table (docs). Live: typed vectors kernel
  4.9x faster native; the same kernel untyped gained nothing (0.96x).
- Do not make every script native: it slows server startup and spends a global native memory budget
  (Roblox Learn [00:07:55]). `@native` per hot function when `--!native` hits size limits.
- Limits: 64K instructions per block, 32K blocks per function, 1M instructions per script, plus a
  global memory cap (docs).
- Outer-scope code is not compiled natively; breakpoints, `getfenv` and `setfenv` deoptimize (Roblox
  Learn [00:07:23]; docs).
- `debug.dumpcodesize()` runs only in the Command Bar, Server view (Roblox Learn [00:04:59] to
  [00:06:06]). Live: `execute_luau` gets "dumpcodesize can only be called from CommandBar".
- Practitioners saw about 4x to 6x on some code (RDC23 panel, [00:25:02]). Live: 3.3x on a numeric
  loop, 4.9x on a typed Vector3 loop.

## Buffers

- Gate: buffers pay off when sustained inbound passes about 50 KB/s, or for per-entity replication;
  otherwise skip (Crusherfire, buffers, [00:01:04]).
- Sizes over remotes: a number costs 9 bytes, a Color3 13 bytes vs 5 packed; 100 u16 ids 900 bytes
  vs 203 (Crusherfire [00:16:42] to [00:34:14]). Wire formats belong to scenario-roblox-networking.
- Buffer identity is not preserved through Roblox APIs (Crusherfire [00:03:12]). Live: a
  BindableEvent delivered a copy with the same bytes.
- Integer writes wrap and fractions truncate silently [added, luau and Studio: u8 300 stored 44, u16
  70000 stored 4464, 3.7 stored 3].
- `HttpService:JSONEncode` writes a buffer as `{"m":null,"t":"buffer","base64":...}` (live) [added].
