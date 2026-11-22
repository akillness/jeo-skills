# Compatibility

Compatibility is an observation tied to a version and test, not a promise inferred from the folder format. This foundation does not yet claim end-to-end host certification.

| Surface | Current statement |
| --- | --- |
| Canonical skill folder | Initial portable installation path; verify discovery in your host |
| Codex | First evaluation target; app-specific results still need recorded tests |
| Astra | First model evaluation target; no model-specific runtime dependency required |
| Claude Code | Skill folder route documented, not exercised; plugin manifests pass `claude plugin validate --strict` and a headless session loaded the skill from `--plugin-dir` on a checkout and on the plugin ZIP (2.1.265, macOS, 2026-09-09); marketplace install/update/removal untested |
| Claude app | Separate upload/runtime path; unverified |
| Codex plugin / marketplace | Local archives and official metadata validators passed; actual app installation and marketplace discovery untested; no public listing claimed |
| Claude Code marketplace | `.claude-plugin/marketplace.json` validates and points at the repository itself; needs a published repository before `/plugin marketplace add` works; no public listing claimed |
| Browser 3D output | Depends on the generated artifact, browser, graphics support, and tool access |
| Screen capture (`capture.py`) | Optional; needs `pip install playwright` plus `playwright install chromium`; exits 3 when absent, and no repository check depends on it |
| Skill `templates/` | Text starting files (`.md`, `.js`, `.html`, `.css`) with no dependencies and no build output; copy a scaffold or rig into your own project before running `pnpm install` |

## What your agent needs

The skill itself is guidance and data. Creating a scene needs access to a writable artifact project and appropriate development tools. Inspecting a scene needs a browser or another renderer and a way to observe the output. The agent must report missing capabilities rather than claim a visual pass from source inspection alone.

Developer helpers target Python 3 with the standard library. Scene dependencies are separate: use the existing project stack when suitable. There is no mandatory embedding API, database, or MCP service for the skill's core data workflow.

Blender is optional in the same way. Blender 4.2 LTS or newer is **recommended, not required**: without it every script still runs and the quality ceiling for a kit is T2, the runtime tier that draws its textures and occlusion in the browser. With it, `skills/3dviz-pro-max/scripts/hero-tier.py` bakes a T3 hero GLB from a kit module's own geometry; a missing Blender is reported as `{"status": "unavailable"}` at exit 0 and nothing is faked. The two heroes that ship (`timber-cottage-t3.glb`, `watermill-t3.glb`) were baked with the version each record states in `tiers.T3.blender`. On macOS the binary is usually off PATH at `/Applications/Blender.app/Contents/MacOS/Blender`; `blender_locate.py` searches the standard install paths per platform, so no PATH edit is needed.

New web scenes may use WebGL when appropriate. Check browser graphics availability and the artifact's actual dependencies. Do not assume every host permits local servers, package downloads, browser automation, or external research.

## Factual and computed content

Research access is needed when factual claims require verification beyond the supplied sources. A missing solver, dataset, or external service must remain an explicit limitation. A moving object does not establish a physical simulation; a recorded transition does not establish a general algorithm.

Keep these results separate:

- **Structural checks:** files parse, references resolve, packages contain the intended files.
- **Source checks:** a cited source supports the specific claim within stated assumptions.
- **Behavior checks:** a particular artifact revision ran and the named behavior was observed.
- **Visual checks:** framing, labels, geometry, and interactions were inspected in the actual output.

## Reporting a compatibility result

Record the host/app version, model when relevant, operating system, Python/browser or renderer version, installed skill revision, installation method, exact task, and observed outcome. Include failed and skipped checks. A folder discovery result cannot be promoted to a full scene evaluation.

The [historical Harness Village recording](demos/README.md) predates this skill and contains Vietnamese UI. It supplies visual context, not a compatibility result.
