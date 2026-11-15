# Upstream Sources and Licensing

## Pinned Release

- **Repository**: [PrefectHQ/fastmcp](https://github.com/PrefectHQ/fastmcp)
- **Tag**: `v4.2.0` ("Mad Skills")
- **Commit SHA**: `5e71792d8daf499325e3b747cc44cb04d4544119`
- **Release Date**: 2026-11-13
- **License**: Apache-2.0
- **Documentation**: [gofastmcp.com](https://gofastmcp.com)
- **TypeScript Counterpart**: [@prefecthq/fastmcp-ts](https://github.com/PrefectHQ/fastmcp-ts)

## Upstream Components Evaluated

1. **`fastmcp_slim/fastmcp`**:
   - `FastMCP`: Main server container and decorator registrar (`@mcp.tool`, `@mcp.resource`, `@mcp.prompt`).
   - `Client`: In-process and transport-connected client implementing protocol lifecycle, `call_tool`, `read_resource`, `get_prompt`, and `read_skill`.
   - `Context`: Request context for logging, progress reporting, elicitation, and sampling.
   - `Depends`: Parameter-level dependency injection with `CallArgument`.

2. **`fastmcp.skills` (v4.2.0 Skills Architecture)**:
   - `Skill`: Storage-neutral representation of an Agent Skill with files, frontmatter, and digests.
   - `SkillCatalogProvider`: Serves explicit collections of `Skill` objects over MCP.
   - `SkillsDirectoryProvider`: Scans filesystem directories and serves valid `SKILL.md` folders.
   - `SkillManifestProvider`: Lightweight provider serving skill manifests without loading file bytes in advance.
   - `SEP-2640 Skills Extension`: Implements `skills/list` and `skills/get` protocol endpoints with SHA-256 digests.

3. **`fastmcp.cli`**:
   - `fastmcp run`: Run server script directly with auto-reloading and environment configuration.
   - `fastmcp dev`: Launch live developer server with interactive inspector UI.
   - `fastmcp list`: Query and inspect tools, resources, prompts, and skills on any server target.
   - `fastmcp call`: Invoke tools from command line with automated type coercion.
   - `fastmcp discover`: Locate MCP servers declared in Claude Desktop, Claude Code, Cursor, Gemini, Goose, and `mcp.json`.
   - `fastmcp install`: Register server configuration into client applications.

4. **Bundled Upstream Skills**:
   - Evaluated `skills/fastmcp-server/SKILL.md` (authoring and evaluation patterns).
   - Evaluated `skills/fastmcp-client-cli/SKILL.md` (CLI list/call operations).
   - Unified and upgraded both into the comprehensive `jeo-skills` catalog skill standard.
