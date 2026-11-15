# Skills Extension and Providers (FastMCP 4.2 "Mad Skills")

## Architecture Overview

FastMCP 4.2 introduces native support for hosting and distributing Agent Skills directly from MCP servers:

```text
┌───────────────────────┐               ┌────────────────────────┐
│    FastMCP Server     │               │   AI Agent / Client    │
│                       │  skills/list  │                        │
│ SkillCatalogProvider  ├──────────────►│ Client.list_skills()   │
│  - deploy (SKILL.md)  │               │                        │
│  - test (SKILL.md)    │  skills/get   │                        │
│                       ├──────────────►│ Client.read_skill()    │
│  SHA-256 Manifest     │               │  - Digest check (pass) │
└───────────────────────┘               │  - Host Approval (gate)│
                                        │  - Export to directory │
                                        └────────────────────────┘
```

Historically, Agent Skills lived solely in local directories on each developer's machine, causing drift and complex multi-agent synchronization. FastMCP allows servers to serve versioned skills alongside the tools those skills describe.

---

## Server-Side Providers

FastMCP 4.2 offers three primary skill providers in `fastmcp.skills.provider`:

### 1. `SkillCatalogProvider`

Serves an explicit list of loaded `Skill` objects:

```python
from fastmcp import FastMCP, Skill
from fastmcp.skills.provider import SkillCatalogProvider

# Load specific skill from directory
deploy_skill = Skill.from_directory("skills/deploy")
test_skill = Skill.from_directory("skills/test")

mcp = FastMCP("Team DevOps")
mcp.add_provider(SkillCatalogProvider([deploy_skill, test_skill]))
```

### 2. `SkillsDirectoryProvider`

Scans a base directory and automatically mounts every subfolder that contains a valid `SKILL.md`:

```python
from fastmcp import FastMCP
from fastmcp.skills.provider import SkillsDirectoryProvider

mcp = FastMCP("Company Catalog")
mcp.add_provider(SkillsDirectoryProvider("~/.agent-skills"))
```

### 3. `SkillManifestProvider`

Optimized for large catalogs. Serves skill names, descriptions, and SHA-256 manifests to `skills/list` without reading all file bodies into server memory until an individual `skills/get` request arrives.

---

## Client Discovery and Installation

Clients interact with server-hosted skills using FastMCP's `Client`:

```python
from fastmcp import Client

async with Client("http://localhost:8000/mcp") as client:
    # 1. Query available skills
    skills = await client.list_skills()
    for summary in skills:
        print(f"Discovered skill: {summary.name}")
        print(f"Summary: {summary.description}")

    # 2. Fetch full skill with automatic file size & SHA-256 verification
    skill = await client.read_skill("deploy")
    
    # Check verification status
    print(f"Verification passed: {skill.verified}")
    for file in skill.files:
        print(f"File: {file.path} ({file.size_bytes} bytes, sha256: {file.sha256[:8]}...)")

    # 3. Export to local host directory
    target_dir = Path("~/.agents/skills/deploy").expanduser()
    skill.to_directory(target_dir)
```

---

## Security Boundaries: Verification vs Approval

1. **SHA-256 Digest Matching**:
   - `Client.read_skill()` verifies that every received byte exactly matches the server's declared SHA-256 digest and file size.
   - It prevents in-flight byte corruption, stale cache reads, and unexpected auxiliary files.

2. **Host Approval Boundary**:
   - As established in SEP-2640 and source audits, a matching hash proves only that the bytes match the server's manifest. It does **not** prove that the server is trustworthy or that the instructions are safe to execute.
   - FastMCP clients must never automatically execute code or grant broad tool access (`allowed-tools`) based solely on `verified: true`. The host system must maintain independent origin binding and explicit user approval before loading instructions into model context.
