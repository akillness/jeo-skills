---
name: edr-bypass-re
description: "Invoke this skill for authorized adversary-simulation work that must understand and evaluate endpoint defense telemetry: mapping what an EDR or AV actually monitors (user-mode hooks, kernel callbacks, ETW providers, AMSI), surveying installed hooks from memory, and evaluating countermeasure combinations in an isolated lab, mapped to MITRE ATT&CK T1562."
---

# EDR Bypass RE (defense telemetry analysis for authorized adversary simulation)

Reverse the defender's implementation first, then reason about countermeasures. This skill covers the RE half (what the EDR monitors and how its components are built) and the evaluation half (which countermeasure classes defeat which telemetry, verified in an isolated lab). It maps to MITRE ATT&CK T1562 (Impair Defenses), T1562.001 and T1562.006, with T1055 and T1027 adjacent.

Attribution: adapted from the `edr-bypass-re` playbook of [zhaoxuya520/reverse-skill](https://github.com/zhaoxuya520/reverse-skill) (MIT License).

## Boundaries (read first)

- Authorized environments only: your own lab machines and VMs, or hosts covered by written engagement scope (SoW, test contract, program scope statement). Nothing here may ever be applied to an unowned or out-of-scope system.
- The deliverable is measurement and a report: which telemetry sources detected which technique, at what stage, with what fidelity. Findings go to the engagement's responsible-disclosure channel.
- ARTEX tasks run in a Linux container. Every step here needs an authorized Windows lab VM reachable from the task environment; if none is provisioned, report the gap and stop. Never simulate observations you did not make.
- Report placeholders only: `{target_ip}`, `{hostname}`, `{user}`. Anonymize before anything leaves the lab.

## Applicable task types

1. Purple-team and detection-gap assessment: measure what the deployed EDR actually catches.
2. Product security evaluation: test your own endpoint product against known technique classes.
3. CTF or exercise scenarios requiring execution on hardened hosts, within the exercise rules.

Not applicable: evasion against systems outside written authorization; building mass-distributed malware; any engagement where the objective is intrusion rather than measurement.

## The four telemetry surfaces and the countermeasure classes

```text
EDR monitoring surface             countermeasure class (lab evaluation)
──────────────────────             ─────────────────────────────────────
user-mode ntdll inline hooks   ◄─► fresh ntdll copy from disk (unhook)
                                   direct or indirect syscall stubs with
                                   dynamically resolved SSNs
                                   hardware-breakpoint redirection

kernel callbacks (process,     ►─► call-stack spoofing; routing through
thread, image, registry)           legitimate trigger chains instead of
                                   direct invocation

ETW telemetry (Threat-         ◄─► EtwEventWrite patching; provider
Intelligence and others)           teardown via NtTraceControl

AMSI scanning (amsi.dll)       ◄─► AmsiScanBuffer patching; hardware-
                                   breakpoint redirection; loading a
                                   clean amsi.dll copy
```

Working knowledge:

- An EDR is not a black box. Its user-mode DLLs and providers can be loaded into IDA or Ghidra and read like any other binary; rea can assist with static structure on host-side copies.
- Countermeasure classes must be combined: each surface needs its own answer, and ordering matters. Silencing telemetry before unhooking avoids the unhook alert arriving first.
- Modern EDRs treat ETW plus kernel callbacks as the primary battlefield; user-mode unhooking alone is a dated answer.

## Workflow

**Step 1: identify the defenses on the lab host.**

```powershell
Get-Service | Where-Object {$_.Name -match 'CSAgent|SentinelAgent|elasticendpoint|esets|ekrn|MsMpEng|wdsvc|cyserver|sysmon|aswbidsagent'}
fltmc filters
```

Kernel-callback enumeration needs kernel debugging (windbg) or a driver-inspection tool. Record every callback class you can observe; the inventory is the baseline artifact.

**Step 2: survey user-mode hooks.** Dump the in-memory `ntdll.dll` `.text` section from a process carrying the EDR's injected DLL, diff it against the on-disk `C:\Windows\System32\ntdll.dll`, and treat every divergence as a hook site. `pe-sieve64.exe /pid <pid> /shellc 3 /modules 3 /dir hooks_dump` automates the sweep. The dump is the artifact; the report cites hook offsets.

**Step 3: select the countermeasure combination to evaluate.**

| Telemetry surface | Countermeasure class under test |
|---|---|
| ntdll inline hooks | indirect syscall with dynamic SSN resolution |
| ETW-TI provider | EtwEventWrite head patch |
| AMSI (PowerShell, .NET) | AmsiScanBuffer patch or HWBP redirection |
| kernel callbacks | call-stack spoofing via legitimate gadgets |
| Sysmon ProcessCreate | PPID spoofing plus unbacked memory |

**Step 4: implement in the test harness.** Reference implementations for each technique class are public: SysWhispers3 for syscall stub generation, the Hell's Gate and Halo's Gate writeups for dynamic SSN resolution, Ekko for sleep-time memory obfuscation. Cite the exact references used, and never paste unvetted code into the lab host.

**Step 5: verify in the isolated lab.** Stand up the target EDR trial (Defender is the default baseline) with Sysmon in an isolated VM, run the harness, and record every alert source that fires: AMSI, ETW-TI, Sysmon events 1/7/8/10, the EDR console. Negative results are results; telemetry that catches the technique belongs in the report.

**Step 6: write the evaluation.** Map every observed detection to MITRE ATT&CK (T1562.001, T1562.006, T1055, T1027) and hand the detection-gap list to the engagement owner.

## Tools

| Tool | Use | Install |
|---|---|---|
| pe-sieve | in-memory hook and injection survey | github.com/hasherezade/pe-sieve |
| SysWhispers3 | syscall stub generation | git clone plus python |
| API Monitor | dynamic API observation | manual download |
| windbg plus IDA or Ghidra | static analysis of EDR DLLs and drivers | manual |
| Sysmon | lab telemetry baseline | official download |

Verify availability in the lab environment before promising a step, and report gaps instead of improvising downloads from unverified sources.

## Completion self-check

- [ ] every technique run in the lab has a recorded observation (alert fired or did not fire) with the telemetry source named.
- [ ] the report contains placeholders only, never real hostnames or IPs.
- [ ] nothing was executed outside the authorized lab VMs.
