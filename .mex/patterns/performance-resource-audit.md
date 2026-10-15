---
name: performance-resource-audit
description: Measure executable latency, allocation and resource cleanup before optimizing this catalog's tooling.
triggers:
  - performance
  - memory
  - resource lifecycle
edges:
  - target: ../context/conventions.md
    condition: when validating catalog or frontmatter safety
  - target: jev-control-plane.md
    condition: when reviewing Jev transport or host callbacks
grounds_to: []
last_updated: 2026-10-14
---

# Performance and resource audit

## Steps
1. Separate catalog governance, router/install copying, Jev transport, and media/support helpers. Capture original source and comparable workloads before editing; source under `.agent-skills/` is not covered by the current mex graph.
2. Distinguish cold CLI startup from repeated matching, Python traced allocation from whole-process RSS, and temporary high-water retention from a leaked PID/file descriptor. Record the metric type and workload for each comparison.
3. Preserve output bytes, parser semantics, source/destination verification and failure precedence. Safe YAML acceleration requires the safe loader plus a pure-Python fallback; streaming must not silently omit large inputs.
4. Delegate regression authoring to Tester. Exercise real child/socket ownership where available; label fake-browser lifecycle evidence separately from real application capture.
5. Run the focused suites below and catalog gates. Keep developer-machine snapshots out of committed tests; use observed fixture expectations and temporary hermetic tools. Installer CI installs pinned PyYAML/Pillow, and Python CI runs reject skips.

## Verified local measurements (2026-10-14)

| Workload / metric | Original | Optimized |
|---|---:|---:|
| Catalog validator, warm median | 268.69 ms | 126.49 ms |
| Frontmatter `--check`, warm median | 372.96 ms | 107.30 ms |
| 40 queries in one handler, five-run median | 1134.76 ms | 157.30 ms |
| 32 MiB file hashing/copy, traced peak | 32.03 MiB | 2.03 MiB |
| 64 MiB multiline `.env` audit, peak RSS | 242.92 MiB | 20.72 MiB |
| 67 MiB GLB complete merge/write, peak RSS | 208.05 MiB | 80.36 MiB |
| URL before 128 MiB trailing log, RSS delta | 258.73 MiB | 1.84 MiB |

These are local paired fixtures, not production SLAs. Small-file copy timing was cache-sensitive, including one slower comparison; hashing is primarily an allocation improvement. The rejected native-controller chunk-array candidate was slower and retained more heap, so native helpers were left unchanged.

## Gotchas
- A fixed log overlap is not equivalent to regexes with unbounded whitespace/digits. The shared `open-design-game-ui-concept/scripts/daemon-log.mjs` preserves complete matches and newest-URL behavior with a reusable scan buffer.
- `readinto` avoids a temporary bytes-to-bytearray BIN copy. Clamp attacker-declared GLB chunk lengths to physical remaining bytes, trim short reads, preserve return types, and test writer header/padding bytes and coercion subclasses.
- Python text-file iteration does not reproduce every `str.splitlines()` separator. Split each physical line too; otherwise VT/FF/NEL and Unicode separators can hide later `.env` keys.
- Parallel agents share persistent eval globals. Prefix benchmark/report variables per lane; before filing evidence, check lane identity and label interim versus final test counts. Preserve raw observations immutably and create an explicit superseding record for corrections.
- Scoring caches must include every cached dependency and refresh after record/alias/stopword mutation without retaining old generations or transient records.
- A `finally` close can mask a primary failure; a swallowed cleanup-only failure can falsely report success. Test both, including launch failure, no targets, final encoder-wait interruption and cleanup failure.

## Verify
- `CI=true python3 scripts/test_performance_regressions.py -v`: current local suite passes 31 tests without skips.
- `CI=true node --test .agent-skills/open-design-game-ui-concept/scripts/performance.test.mjs`: current local suite passes 28 tests without skips. It also passes with workstation `cwebp` absent from PATH.
- `python3 scripts/validate-catalog-projections.py`: 367 skills / 10 categories / 367 TOON records / 3 README tables; Rule F archived hash verified.
- `python3 scripts/repair-skill-frontmatter.py --check`: 367 documents load and match; real-tree mutating mode is never used.
- `python3 scripts/generate-catalog-projections.py --check`: all four projections match.
- `python3 flatten_skills.py --dry-run`: no pending moves.
- `python3 scripts/validate-catalog-projections.py --self-test-rule-f`: lifecycle branches pass.
- `python3 scripts/frontmatter_boundary.py --self-test`: six fixtures / 367 documents pass.
- Check syntax of owned Python, Node and shell changes; inspect CI configuration separately. Adding CI steps does not prove a remote Actions run.

## Limits and debug
Actual model/GPU inference and authenticated full Playwright capture were not exercised. The local server's 10-second setting bounds socket I/O operations, not total inference duration or a continuously progressing slow client. A single arbitrarily long `.env` line still allocates that line; two upstream audit readers still materialize large source files. Strict link mode still has 64 pre-existing broken links and is not a default gate. An ancillary native Jev run observed 11 `--host-models` failures with an external `jev-plugin.mjs` change present; that change and full existing CI-suite success are outside this audit's pass claim.

## Update scaffold
Update `.mex/ROUTER.md`, relevant context, this measurement record and the decision log after meaningful changes. Do not rebuild persistent graphs or update installed/global runtimes as part of a source-only performance audit.
