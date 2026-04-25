---
name: ghgrab
description: >
  Search and download specific files/folders from GitHub repositories directly from
  terminal using ghgrab, without full clone. Covers install, interactive browsing,
  release asset download, and automation-safe usage patterns.
allowed-tools: Bash Read Write Edit Glob Grep
license: MIT
metadata:
  tags: ghgrab, github, cli, file-download, developer-productivity
  version: "1.0"
  source: https://github.com/abhixdd/ghgrab
---

# ghgrab

Use this skill when users need to quickly fetch selected files/folders/release assets from GitHub in terminal workflows.

## When to use
- "GitHub에서 파일 몇 개만 가져오고 싶다"
- Full clone is too heavy for one-off extraction
- Need interactive repository navigation/search from CLI
- Need release artifact download without browser

## Instructions

### Step 1: Verify availability and install path

```bash
command -v ghgrab || true
```

If missing, choose one installer:

```bash
# npm
npm install -g @ghgrab/ghgrab

# cargo
cargo install ghgrab

# pipx
pipx install ghgrab
```

Then verify:

```bash
ghgrab --help
```

### Step 2: Start in interactive mode or open a target repo directly

```bash
# interactive home
ghgrab

# open repo directly
ghgrab https://github.com/OWNER/REPO
```

### Step 3: Use selective download flow

- Navigate/search inside repository tree
- Select only required files/folders
- Download into current working directory (or tool prompt target)
- Prefer small, explicit selections over bulk pulls

### Step 4: Release artifact mode

When user needs binary assets from GitHub Releases, use ghgrab release selection mode (OS/arch-aware options if shown by tool).

### Step 5: Automation guardrails

- Confirm destination path before writing files
- Prefer non-destructive paths (new folder) when unsure
- Log selected source repo and destination in run notes for reproducibility

## Examples

```bash
# Browse then cherry-pick files
ghgrab https://github.com/rust-lang/rust

# Start home and search repos interactively
ghgrab
```

## Pitfalls
- Installing multiple package-manager variants can shadow binary paths; check `which ghgrab`.
- Private repositories require valid GitHub auth/session context.
- Avoid using ghgrab as a substitute for full repo history operations (use git clone when history/branch operations are required).
