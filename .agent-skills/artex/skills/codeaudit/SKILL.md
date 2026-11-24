---
name: codeaudit
description: "Invoke this skill when the task is a white-box audit of source code the operator provided or fetched (a plugin, an application, a repository). Attacker-first forward analysis from every user-controllable input to dangerous sinks, adversarial verification, PoC with measured impact."
---

# Code Audit (white-box source review)

Under an **authorized** engagement, audit first-party production source code the way an attacker reads it: enumerate every user-controllable input, trace each one forward to dangerous sinks, keep only findings that pass the gates, and prove each one with a PoC and a measured impact. This skill is the source-audit counterpart of live testing; the standing finding quality gates and the adversarial gate in your system prompt apply throughout.

## Scope rules (production code only)

Never report findings in, and never trace through: test code, build and packaging scripts, vendored or third-party code, generated code, documentation. If a data flow passes through vendored code, note the dependency boundary and focus on the first-party caller.

**Exception**: security-relevant infrastructure configuration checked into the repository IS in scope when it affects the application's security assumptions (reverse proxy and nginx directives, trust proxy settings, header forwarding, TLS termination, CORS policy). A directive that promotes a normally trusted value to attacker-controllable is a deployed vulnerability, not an operational note.

## Phase 1: input inventory and partitioning

Enumerate **every** user-controllable input: HTTP routes and their parameters, headers, cookies, request bodies, REST and RPC methods, queue and event consumers, CLI arguments, configuration and environment values read at request time, file uploads, import and export endpoints, webhooks and callbacks, scheduled jobs with externally influenced inputs. For each entry point record the handler file:line.

Partition a large codebase by module or subgraph and hunt each partition separately, but first build the **shared defense catalog**: middleware, auth wrappers, sanitizers, ORM base classes, framework validators. Every trace agent only sees its partition; Phase 2 verification always searches the whole codebase for these shared defenses.

Write the inventory to the work dir as an artifact. Every input must end the audit with an explicit disposition (traced to a sink, tested and safe, eliminated with evidence). Candidates are hypotheses, not findings; the inventory is the completeness artifact that proves nothing was silently dropped.

## Phase 2: forward hunt, per vulnerability class

For each input, trace **forward** (entry point to sink), one vuln class at a time (injection, navigation and XSS, business logic and authorization, file operations, deserialization, cryptography, SSRF). Tool-first order per input:

1. Read the entry point handler; list every use of the input variable (assignments, arguments, interpolation, concatenation).
2. Trace forward function by function until a sink, a sanitizer, or the codebase boundary.
   - **Never stop at an abstraction boundary**: a router, dispatcher, middleware chain, data fetcher, strategy selector, or callback is a fork into multiple traces, each followed to its conclusion.
   - **Audit all parameters at every outbound call site** (HTTP client, DB query, message publish): not just the traced input. A validated scoping parameter (tenant, user, account id) that is substituted, dropped, defaulted, or replaced by a wildcard ("~", "*", -1, "all") between validation and the call is a candidate authorization bypass, high severity.
   - **Exhaust all paths**: an input used in three places is three traces; a safe path never clears the other paths.
   - **Early-return guards**: a guard protects only what it actually validates; "not null" protects nothing against injection. Verify the check matches the sink context.
   - **Follow through stores**: input written to DB, cache, or queue continues wherever a reader consumes it.
   - **Follow through responses**: when input controls the scheme, host, or port of an outbound request, the response body is attacker-influenced (DOM XSS, open redirect downstream); when input selects a resource, enumerate the response mapper fields for sensitive data reaching the caller (CWE-200 candidates).
   - **Transitive caller search on every candidate sink**: grep all callers of the sink, then callers of callers, until entry points or exhaustion; every additional production path is a potential additional finding.
3. Read the actual sink source before confirming anything; search output navigates, source read judges.

## Gates (a candidate must pass all three)

1. **Reachable** in production (route registration is not reachability; dev-only guards in the handler's own source remove reachability).
2. **Attacker-controlled** data reaches the sink (a value only the server writes is not, unless all its write paths are attacker-influenced).
3. **New capability** for the attacker (a privilege they lack, another user's data, code execution, or a state change beyond their rights).

A candidate failing any gate is a hardening note, never a finding. Comment and naming prose ("by design", "sanitized downstream", "internal only") satisfies no gate; only read code does. A sanitizer whose scope does not match the sink context (an HTML encoder guarding a URL, URL-encoding guarding SQL) is itself a finding.

## Verification (beyond the standing adversarial gate)

- Search the **whole** codebase for shared defenses the partition hunt could not see, and verify each defense actually blocks the attack by reading it.
- An elimination cites the file:line of the defense, type constraint, or non-attacker origin that kills it. No citation, no elimination.
- Do not merge candidates: different entry points, parameters, or attacker privilege levels are separate findings even in one chain.
- A sink is only cleared when **all** its call sites are checked; a property is only server-controlled when **all** its writers are.

## PoC and measured impact

Prefer executing the PoC against a real instance of the component: deploy it locally (work dir compose, a lab instance, a local CMS install for a plugin) and demonstrate the attacker's goal achieved end to end. Executed beats static.

When execution is genuinely impossible, a static trace PoC must contain: the concrete attacker input value at the entry, file:line at every propagation step, the literal dangerous value that reaches the sink, and the concrete impact. Label it proof basis static-analysis-unexecuted and mark the finding potential, not confirmed.

Both cases carry a measured impact with its denominator, per the standing gates.

## Sweep and count cross-check

For each confirmed root cause, grep the whole codebase for the same pattern; every instance gets its own disposition (confirmed as its own finding, or eliminated with cited evidence). Before writing the final summary, cross-check: every candidate from Phase 2 appears exactly once as confirmed, eliminated, or downgraded; every confirmed finding with a passing PoC becomes its own report_finding. Silent drops are audit failures.

## Recording

- Inventory, dispositions, and the sweep table land as artifacts in the task work dir; key conclusions become facts so later intents inherit them.
- Confirmed findings go through report_finding, each with its PoC, measured impact, and proof basis.
- Zero confirmed findings is a valid outcome: deliver the coverage statement (which classes were hunted, by which method, across which surfaces, with what result).

---

Methodology adapted from VulnHunter (Capital One, Apache-2.0, maintained fork by Neal Bridges) and bug-bounty-hunting-prompts (MIT).
