---
name: patch-diff
description: "Invoke this skill when the task is recovering a vulnerability from a vendor fix: a CVE with a patch but no public PoC, Patch Tuesday triage, a distribution backport gap, or a closed-source security patch that needs root-cause analysis. Diff the patched and unpatched builds, infer the bug class from the added guards, and verify with a PoC that crashes only the unpatched build."
---

# Patch Diff (N-day recovery from vendor fixes)

Under an **authorized** engagement, recover a vulnerability from the fix that closed it: obtain the before and after builds, align symbols, diff the binaries, read the added checks to infer the bug class, then prove the bug with a PoC that reproduces on the unpatched build and runs clean on the patched one. The standing finding quality gates and the adversarial gate in your system prompt apply throughout: a crash you cannot reproduce on demand is a hypothesis, not a finding.

Attribution: adapted from the `patch-diff-exploit` playbook of [zhaoxuya520/reverse-skill](https://github.com/zhaoxuya520/reverse-skill) (MIT License).

## Boundaries and authorization

| Allowed | Prohibited |
|---|---|
| Diffing and testing builds in your own lab, on machines covered by written engagement scope, or inside CTF and benchmark ranges | Running a recovered PoC against systems you do not own, even when a program covers the underlying bug |
| Writing PoCs that demonstrate the bug (crash, hang, memory-corruption evidence) | Turning a PoC into a deliverable payload |
| Publishing or reporting with `{target}`, `{host}`, `{user}` placeholders | Publishing unredacted hostnames, IPs, or usernames |

If the environment lacks a tool a step needs (see Environment notes), report the gap and stop. Never simulate diff output or fabricate crash evidence.

## When to use

1. **Known CVE, no public PoC.** The advisory names the component and bug class but ships only the fix.
2. **Patch Tuesday triage.** Rank the month's kernel and driver fixes by likely exploitability before committing to deep analysis.
3. **Backport gap.** The mainline fix is merged but a distribution, LTS branch, or OEM kernel has not picked it up.
4. **Closed-source security patches.** Drivers, engines, virtualization components where the advisory is the only documentation.

## Core method

```text
patched build (after)            unpatched build (before)
        │                               │
        └───────── binary diff ─────────┘
                      │
    function-level diff (matched / unmatched / changed)
                      │
  focus on functions with moderate match scores (0.5 to 0.95)
                      │
  read the new guards: bounds checks, locks, zeroing, refcounts
                      │
   infer the bug class: OOB, race, UAF, info leak, int overflow
                      │
        PoC on the unpatched build
                      │
 verify: unpatched crashes, patched runs clean → bug confirmed
```

Patch pattern to bug class lookup:

| New guard in the patched build | Likely bug class |
|---|---|
| `if (a + b < a)`, `__builtin_add_overflow` | integer overflow |
| `KeAcquireSpinLock`, `mutex_lock` | race condition (TOCTOU, double free) |
| `if (idx >= MAX)`, `if (len > buf_size)` | out-of-bounds read or write |
| `RtlZeroMemory`, `memset(struct, 0, ...)` | uninitialized memory info leak |
| `InterlockedDecrement` plus refcount check | UAF, reference-count bug |
| `ProbeForRead` / `ProbeForWrite` | unvalidated user-mode pointer |
| `SeAccessCheck`, capability checks | missing permission check |
| removed or tightened IOCTL codes | attack-surface reduction (study the old path) |

## Workflow

**Step 1: obtain before and after builds.**

- Windows: Microsoft Update Catalog for the MSU packages of two builds (last unpatched, first patched); unpack with `expand.exe pkg.msu -F:* out\`, then the inner `.cab`; extract `ntoskrnl.exe`, `win32kfull.sys`, and the affected drivers.
- Linux: `apt download linux-image-<version>` for both builds, `dpkg-deb -x` each; restore the vmlinux ELF from `boot/vmlinuz` with extract-vmlinux; fetch the matching dbgsym package.
- Third-party software: vendor archives for the N-1 and N installers.

Record sha256 for every artifact; the report cites hashes, not filenames.

**Step 2: align symbols.**

- Windows: `symchk /v module.dll /s SRV*c:\sym*https://msdl.microsoft.com/download/symbols`.
- Linux: vmlinux plus `System.map` or dbgsym for both builds.

**Step 3: diff.**

- Preferred in this environment: `ghidriff old_build new_build -o out/` (Ghidra headless, pip-installable, markdown report).
- BinDiff or Diaphora only where an IDA/Ghidra toolchain with exports already exists.

**Step 4: locate the change.** Filter to functions with similarity roughly 0.5 to 0.95: identical functions are noise, completely different ones are usually new or renamed. Read the added conditions, loop bounds, and deleted blocks (a deletion is also a clue). Judge by control flow and data flow, not token-level diffs; patches carry unrelated cleanup and renames.

**Step 5: write and verify the PoC.**

- Integer overflow: boundary values (`INT_MAX-1`, `0xFFFFFFFF`).
- Race: concurrent threads hammering the open/close plus ioctl path.
- UAF: spray, free, reuse.
- OOB: length or index just past the guard.

Run the same harness against the patched build and confirm the clean result; an untested patched build proves nothing, since the crash could be environmental.

## Warnings

- **A patch can shrink the attack surface instead of fixing the bug.** The original flaw may still be reachable from another path; treat the fix as a lead, not ground truth.
- **Mitigations are not fixes.** CFG/XFG instrumentation such as `_guard_xfg_dispatch_icall_fptr` is hardening, not a root-cause fix.
- **Compiler churn is diff noise.** Compare builds from the same toolchain; never diff across major compiler versions.
- **Anonymize before anything leaves the lab.**

## Environment notes for this platform

- The rea MCP server (`mcp__rea__*`) opens files read-only on the host and never executes targets. Use it for structure, strings, and symbol questions on either build; files must live under the shared data mount and rea takes host-side paths.
- `ghidriff` needs Java plus a Ghidra install. Verify availability before promising a diff; if no diff toolchain exists, say so and stop.
- PoC execution belongs in an authorized lab VM, never in the task container.

## Completion self-check

- [ ] every workflow step was executed, not just read
- [ ] the diff, the inferred bug class, and the PoC artifacts are in the work dir with hashes
- [ ] the patched build was actually tested and its clean result recorded
