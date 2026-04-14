# Private Auth and CI Notes

## Prefer explicit auth choice
Choose one path and say it clearly:
- **SSH-based Git auth** when developer machines and CI already have key/discoverability support
- **HTTPS token auth** when the environment is standardized around tokens/secrets managers
- **Registry token auth** when the package is durable enough that a private registry is the cleaner answer

## Rules
- Do not recommend embedding secrets directly into committed manifests, example code, or docs.
- If the dependency must work on teammate machines and CI, call out that **credential parity** is part of the task.
- If auth friction is already dominating the problem, recommend a private registry or artifact-based distribution instead of doubling down on raw Git URLs.

## CI checklist
- Git host access is available on the runner
- the chosen auth method is injected through the platform's secret mechanism
- host key / SSH known-host setup is handled if SSH is used
- the runner has any toolchain needed by install-time build/prepare steps
- the dependency ref is pinned strongly enough for incident/debug reproduction

## Exit heuristic
If the package is shared, private, and expected to persist, registry-based auth usually ages better than repeated Git credential setup.
