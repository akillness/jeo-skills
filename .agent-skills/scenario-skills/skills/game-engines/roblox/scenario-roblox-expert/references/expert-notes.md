# Expert notes (scenario-roblox-expert)

Principles behind the lead's protocol, by source, with timestamps. Lines marked [added] are this
skill's own additions. Observed facts from the toolkit's live runs are in traps.md and
procedures.md.

## Measure frame time against a budget

- **Andrew (Roblox Learn, XLCZfGEm9tU):** consistent frame times matter more than average FPS; 59
  frames of 10 ms plus one of 410 ms still reads 60 FPS but stutters [00:02:12]. A 60 FPS target is
  16.67 ms per frame [00:02:12].
  - Use: gate on `Stats.frames().p95Ms` and `worstMs`, never on `fpsMean` alone.
- **Peter McNeill and Lynn (RDC 2025, rwLEnBtXr30):** triage order: make the game work, test on a
  real device, check frame rate; if it is bad open the Stats screen for rendering and scene
  complexity; only then the MicroProfiler. Physics-heavy games look at physics first [00:29:19].
- **Peter McNeill (RDC 2024, cWDNVvOh4o0):** the client memory number in Studio "is incorrect", so
  test live or on device [00:28:25]. His client memory target is 1.3 GB, about 66% of a 2 GB phone
  [00:27:53].
  - Use: Studio's 3,800 MB during a small playtest (observed) is never a pass or fail number.
- **Steven (Roblox Learn, n5uOVlCIUjI):** measure network first with the stats overlay and the
  Performance window; no spikes means no change [00:04:24].
- **Neeler, Knight and Hamilton (RDC 2026, 9IqNHhYXK0s):** test Server Authority with the visualizer
  (Ctrl+Shift+F6) for prediction success rate [00:10:06], then add 60 ms latency with 10 ms jitter
  in the Network Simulator; the goal stays 100% success [00:10:40].

## Build in small, tested steps

- **SmartyRBX (0ENeVVC9QT0):** "It is better to do single prompts that build one feature at a time"
  [00:10:26]. Watch the Script Sync icon: a red dot means syncing stopped, common after reopening a
  place [00:12:19]. UI spawned by script is worse than real instances in StarterGui [00:13:25].
- **SimTek (-0H6JRtrA2Y):** always review what the agent produced, then ask it for a security review
  [00:03:53]. A first working sprint set WalkSpeed on the client; the fix made the server
  authoritative. Test death and respawn, not only the happy path [00:06:42].
- **SmartyRBX (da-wHJpNhBo):** give the agent a narrow, specific correction with your own guess at
  the cause [00:06:55]. "AI can make the systems you want, but it doesn't automatically have taste"
  [00:07:35].
- **Sujoy Banerjee (RDC 2024, XrxUy51NsvI):** pseudo-code prompts work: about 10 lines in, 100 lines
  out [00:11:23]. Generative output is a draft for artists and developers to polish [00:14:59].
- **CJ_Oyer (Connect 2023, gapG2tH-etI):** write one unit test first, on a function you use often
  with simple inputs; the best time is just before you optimize a system you trust [00:19:38]. A CI
  gate on type and lint errors catches "90 percent of what breaks a game"; a big release still needs
  a manual playtest [00:12:50 to 00:13:55]. Only the pipeline should publish [00:22:44].

## Verify agent output; never trust it blind

- **Jasmine and Alex (Roblox Learn IAS Q&A, KnFJl6z5UN0):** Assistant and Claude over the Studio MCP
  both scaffold input trees; "audit the results" [00:19:07, 00:21:23].
- **Roblox Learn (v8r1d80DxOY):** Git is "a safety net" against agent mistakes [00:00:45]. The
  Studio MCP server reads the game tree, creates objects, runs and tests the game [00:02:31]. Verify
  the setup with an end-to-end prompt, then commit [02:45 to 03:34].
- **Jim Greer's guests (RDC 2026, vumAuOqSmNA):** a studio uses MCP tools for automated testing, but
  feel cannot be automated: iterate on wind-up timing and hit reactions live [00:29:36].
  - Use: every handoff names what a human must still judge by playing.
- **Karun Shana and Max Ignatyev (RDC 2025, 3h25HUtBHFk):** ask a model for JSON and map a short
  list of fields to actions [00:08:35]; guard generated content with a theme check before spawning
  it [00:31:41]; generated assets are not persisted [00:34:25].

## Files, sync and tools

- **Distracted Games (Zhl_NAPMztY):** without `$ignoreUnknownInstances`, Rojo "is trying to match up
  exactly" the files, so a reconnect deletes Studio-only instances [00:44:28].
- **Distracted Games (xlxnmAFmu6c):** luau-lsp needs a sourcemap from `rojo sourcemap` [00:11:51];
  Rojo can run as a sourcemap generator beside Script Sync [00:12:57].
- **Crusherfire (6kcWSMJFaS4):** a community MCP server serves one agent at a time [00:12:17]. The
  built-in server relays several proxies through the first one (observed).
- **Official docs (Studio MCP, Script Sync, Open Cloud):** Script Sync limits and data loss on
  attributes and tags; Open Cloud Luau Execution has no physics, persists nothing, and allows 5 task
  creations per minute; `StudioTestService` drives multi-client tests that `start_stop_play` cannot.

## Additions from building the toolkit [added]

- One place per agent, opened once, kept open for the run: a closed or signaled window broke the MCP
  server for every agent on 2026-10-18.
- Pass on a parsed payload, never on tool text: `execute_luau` returns only the first return value,
  and RunScript exits 0 on errors.
- Prove every change twice: a number (Audit, Spec, Stats) and a capture that `compare` shows
  changed.
- Write durable work as files; an Edit change is lost unless someone saves.
