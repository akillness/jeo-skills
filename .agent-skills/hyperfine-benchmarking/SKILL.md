---
name: hyperfine-benchmarking
description: Use this skill to benchmark shell commands reliably with warmup runs, statistical summaries, and exportable artifacts using hyperfine.
allowed-tools: Bash Read Write
---

# hyperfine-benchmarking

Benchmark CLI commands with reproducible methodology instead of one-off `time` output.

## When to use this skill
- Compare two or more command variants (`tool-a` vs `tool-b`)
- Validate performance impact before/after script changes
- Attach benchmark evidence to PRs

## Instructions
1. Confirm tool availability.
2. Keep input/workdir/environment stable across compared commands.
3. Run warmups and enough runs for stable variance.
4. Export JSON/markdown outputs for review.
5. Summarize relative speedup + risk notes.

## Examples

### Availability check
```bash
hyperfine --version
```

### Two-command comparison
```bash
hyperfine \
  --warmup 3 \
  --min-runs 10 \
  'cmd_a --with flags' \
  'cmd_b --with flags'
```

### Parameter sweep
```bash
hyperfine \
  --warmup 3 \
  --parameter-list mode fast,balanced,thorough \
  'mytool --mode {mode} input.txt'
```

### Export artifacts
```bash
hyperfine \
  --warmup 3 \
  --min-runs 10 \
  --export-json benchmark.json \
  --export-markdown benchmark.md \
  'cmd_a' 'cmd_b'
```

## Best practices
- Prefer relative speedup and confidence ranges over single-run claims.
- Do not compare commands with different semantics unless outputs are normalized.
- If variance is high, increase runs or reduce background noise before concluding.
- Record dataset/path and exact command strings in PR text.

## References
- hyperfine project: https://github.com/sharkdp/hyperfine
- Docs: https://github.com/sharkdp/hyperfine#readme
