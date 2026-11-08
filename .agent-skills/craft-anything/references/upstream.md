# Craft Anything Upstream Evidence & Architecture

Inspection date: **2026-11-08**. All links and facts pin commit [`56aa31976b4ff0950e6b34ba020b0a568d2462fa`](https://github.com/storytold/craft-anything/tree/56aa31976b4ff0950e6b34ba020b0a568d2462fa) rather than floating `main`.

## Provenance and Project Identity

- **Repository:** [`storytold/craft-anything`](https://github.com/storytold/craft-anything/tree/56aa31976b4ff0950e6b34ba020b0a568d2462fa)
- **Version:** `0.4.0` (workspace version in `Cargo.toml`)
- **Rust Toolchain:** Rust `1.97` or newer, 2024 edition (`rust-version = "1.97"`, `edition = "2024"`)
- **Authors & Community:** ArtCraft Team and Craft Anything contributors ([CONTRIBUTORS.md](https://github.com/storytold/craft-anything/blob/56aa31976b4ff0950e6b34ba020b0a568d2462fa/CONTRIBUTORS.md))
- **Official Site:** [getartcraft.com/apps/craft-anything](https://getartcraft.com/apps/craft-anything)
- **Community:** [discord.gg/artcraft](https://discord.gg/artcraft)

## License and Trademark Boundaries

- **Dual License:** Dual-licensed under [MIT](https://github.com/storytold/craft-anything/blob/56aa31976b4ff0950e6b34ba020b0a568d2462fa/LICENSE-MIT) or [Apache-2.0](https://github.com/storytold/craft-anything/blob/56aa31976b4ff0950e6b34ba020b0a568d2462fa/LICENSE-APACHE), at the user's option.
- **Notices:** Mandatory legal notices are recorded in `NOTICE`.
- **Trademarks:** The **ArtCraft** and **Craft Anything** names, wordmarks, and logos in `docs/brand/` are proprietary trademarks of the ArtCraft Team and are **not** covered by the open-source license. They may only be used unmodified within official distributions under `docs/brand/LICENSE-brand.txt`. Forks must remove or replace them.
- **Bundled Assets:** Third-party fonts, icons, and test artifacts retain their respective open licenses as detailed in `ATTRIBUTION.md`.

## Workspace Architecture

The project is structured as a cargo workspace with 14 member crates and 3 apps:

```text
craft-anything/
├── apps/
│   ├── craft-anything        # Desktop GUI application (pure Rust, egui/eframe)
│   ├── craft-anything-cli    # CLI and stdio MCP server (subcommands, triage, rebuild)
│   └── craft-anything-web    # In-browser WebAssembly viewer (trunk-based build)
├── crates/
│   ├── engine                # Central reverse-engineering engine, sessions, projects
│   ├── evidence              # Evidence store, hypotheses, findings, unknown ledgers
│   ├── ai                    # AI hub, coding agent adapters, rebuild engine, check engine
│   ├── mcp                   # Model Context Protocol stdio server implementation
│   ├── setup                 # Agent app setup (Claude Code, Copilot, Cursor, etc.), doctor
│   ├── formats               # Decoders for PE, ELF, Mach-O, WASM, DEX, firmware, pcap
│   ├── disasm                # Disassembly engine (iced-x86, yaxpeax-arm)
│   ├── js                    # JavaScript AST & bundle inspection (oxc parser/semantic)
│   ├── analysis              # Control flow graphs, call graphs, type recovery
│   ├── platform              # OS-level process, filesystem, and window operations
│   ├── engines               # Decompiler plugins (built-in decompiler, Ghidra adapter)
│   ├── ui-egui               # Reusable UI widgets and views for egui
│   └── testkit               # Fixtures and test utilities
└── xtask/                    # Build automation and packaging tasks
```

## Clean Room vs Deep Mode Rules

| Feature | Clean Room (Default) | Deep Mode (`--deep`) |
|---|---|---|
| Target inspection | Outside-in only: layout measurements, screenshots, visible copy, fonts, colors | Full internal examination: bytecodes, disassembler, decompiled pseudo-C, AST |
| Target binary/source | Refused with `details.reason: clean_room` | Unrestricted analysis with built-in decoders and Ghidra |
| Use case | Examining third-party software without license or IP infringement | Authorized security research, interoperability, self-owned software audits |
| Activation | Default state | Passed via `--deep` on CLI or `settings_set deep_mode true` in app |

## Coding Agent Integrations

Craft Anything supports multiple coding agent backends for the Build step:
- **Claude Code (`claude`):** Supported first and tested live. Runs your unmodified local `claude` executable with your own Anthropic credentials; Craft Anything never reads your credentials.
- **GitHub Copilot CLI (`copilot`):** Supported via Agent Client Protocol (ACP); sign in separately with `copilot login`.
- **Grok Build (`grok`):** Supported via ACP (`grok agent stdio`); sign in separately with `grok login`.
- **Codex:** Adapter exists in codebase (`crates/ai/src/cli_agents/`), unverified on live installations.

## Official Platform Releases

| Platform | Format | Architecture | Notes |
|---|---|---|---|
| macOS | Universal DMG / zip | x86_64, arm64 (Apple Silicon) | Code-signed and Apple notarized (`craft-anything-<ver>-macos-universal.dmg`) |
| Windows | MSI installer & portable zip | x64, arm64, x86 | Code-signed executables |
| Linux | AppImage, deb, rpm, tarball, Flatpak | x86_64, aarch64, riscv64 | AppImage embeds CLI (`AppImage --cli <cmd>`); Flatpak is sandboxed |
| FreeBSD | Tarball | x86_64 | Native build |
| Web | Zip (static HTML/WASM) | wasm32-unknown-unknown | Client-side only; file never leaves the browser |
