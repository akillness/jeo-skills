# Runtime adapters and truthful portability

## Common portability contract

The common skill discovery surface is the supported portability surface for **jeopi, jeo, Codex, Antigravity, GJC, and Claude Code**. Every runtime can read this package and execute the same file-backed artifacts, typed contracts, phase dependencies, ownership boundaries, immutable versioning, vetoes, and re-entry rules under `<repo-root>/.harness/abyssal-game-studio/<run-id>/`.

The harness does not require a runtime-specific install copy, configuration copy, custom command, or unknown CLI invocation. It does not infer engine support from an agent runtime.

## Adapter matrix

| Runtime | Supported harness behavior | Collaboration boundary |
|---|---|---|
| jeopi | Discover and consume the common skill; create and review file-backed artifacts and gates. | Use available orchestration if present; otherwise direct roles sequentially through the artifact dependency graph. |
| jeo | Discover and consume the common skill; maintain the same immutable artifact and gate contract. | Use the host orchestrator when available; otherwise use file-backed sequential role execution. |
| Codex | Discover and consume the common skill; execute the shared P0–P5 workflow and validate artifacts. | An orchestrator may coordinate roles, but the durable interface is files and contracts, not a claimed native team feature. |
| Antigravity | Discover and consume the common skill and execute its file-backed workflow. | Do **not** claim native custom subagent spawning or custom-team capability. Run roles sequentially or through an available external orchestrator. |
| GJC | Discover and consume the common skill and execute its file-backed workflow. | Do **not** claim native custom subagent spawning or custom-team capability. Run roles sequentially or through an available external orchestrator. |
| Claude Code | Discover and consume the common skill and execute the shared artifacts/gates. | Native Claude Agent Teams are optional, not required. If unavailable or unsuitable, use the same file-backed sequential/orchestrated fallback. |

## Execution modes

1. **Optional native collaboration:** only where the current runtime actually provides it. Assign the eight portable role profiles and preserve the director-only coordination rule.
2. **Orchestrated collaboration:** a capable host schedules independent P1 work then honors typed dependencies and artifact ownership.
3. **Sequential fallback:** run each role only after required immutable inputs exist; P1 survey and experience may be serialized. This mode is fully conformant.

No mode changes the quality threshold: P2 requires evidence-ready survey and immutable PM policy before systems; P4 requires 20 adversarial iterations; P5 requires QA PASS and operations ready. Vetoes remain non-overridable in every mode.
