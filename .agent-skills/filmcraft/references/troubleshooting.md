# Troubleshooting and limitations

Sources are pinned at `1fdfd8324db4aa23b08c69f518b086e632f75f84` and were inspected on 2026-10-12. See [`docs/agents.md`](https://raw.githubusercontent.com/storytold/filmcraft/1fdfd8324db4aa23b08c69f518b086e632f75f84/docs/agents.md), [`docs/control-protocol.md`](https://raw.githubusercontent.com/storytold/filmcraft/1fdfd8324db4aa23b08c69f518b086e632f75f84/docs/control-protocol.md), [`README.md`](https://raw.githubusercontent.com/storytold/filmcraft/1fdfd8324db4aa23b08c69f518b086e632f75f84/README.md), and [`ROADMAP.md`](https://raw.githubusercontent.com/storytold/filmcraft/1fdfd8324db4aa23b08c69f518b086e632f75f84/ROADMAP.md).

## Failure signatures

| Symptom | Evidence-backed response |
|---|---|
| `--bridge` combined with `--project`/`--demo` | In the `mcp` branch, the bridge backend wins and project/demo flags are silently ignored. Do not combine them; verify the running desktop app's current project instead. |
| Unknown CLI/MCP option or argument | The `mcp` subcommand rejects unknown options with exit 2; other CLI subcommands may silently ignore typo options. MCP rejects unknown tool arguments with JSON-RPC `-32602`. Re-read `help`, `commands`, or tool schemas; do not invent flags. |
| Bridge connection closes after a bad line | Reconnect. The control server closes on malformed/non-object JSON, missing/non-string `method`, invalid UTF-8, or >4 MiB lines. |
| Screenshot/render has no frame | `ui.screenshot` fails after 10 seconds if no frame is presented (hidden window, asleep display, or equivalent). Bring the app/display into a renderable state and retry only after checking state. |
| Export reports `offlineMedia` or exit 1 | Media was missing, offline, or unreadable and placeholders were drawn. Relink/restore media; only use `--allow-offline` when the caller explicitly accepts placeholders. |
| Windows app exits before a window appears | Upstream documents `WGPU_BACKEND=vulkan` or `dx12` as troubleshooting overrides; do not use `gl` on affected drivers. |
| Headless MCP path is unclear | Use `filmcraft-cli mcp --demo`, `--project /abs/p.fcproj`, or an empty session. For bridge mode, verify the running desktop app and do not pass `--project`/`--demo` alongside `--bridge`; the MCP branch ignores them. The docs verify no hosted MCP endpoint and no folder-confinement flags. |

## Capability limits to state plainly

- The current upstream stage is alpha; the roadmap says it is not yet ready for all real work.
- `.prproj` opening is not supported. Documented alternatives are FCP7 XML, AAF, and OTIO interchange.
- There is no VST3, Audio Unit, or OpenFX plugin hosting. AV1 export is not available; HEVC export is hardware-only in the documented status.
- Speech-to-text is optional and off by default in release builds. Real-world camera/phone media and Windows/Linux receive less testing than macOS.
- FilmCraft's MCP/control paths are local automation surfaces. No remote service, external provider orchestration, or production SLA is verified by these sources.

Do not turn roadmap entries or README claims into guarantees for a particular media file, platform, or release. Recheck upstream sources at a new pin when the task depends on a changed capability.
