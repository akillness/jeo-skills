---
name: unity-cli
description: >
  Install, configure, and use the Unity Command Line Interface (CLI) for automated
  production workflows, project management, and cloud integration. Use when setting up
  CLI-based build automation, CI/CD pipelines, Editor/module management, authentication,
  or localhost API calls via the experimental Unity Pipeline package. Designed for
  verifiable, machine-readable game production workflows where the build machine must
  be describable and tests must return evidence.
  Triggers on: Unity CLI, unity command line, unity automation, unity ci/cd, unity build script,
  unity pipeline, unity production workflows.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  macOS, Linux, Windows with .NET 6.0+ runtime. Requires active Unity license or trial account.
  Works with Unity 2020 LTS and later projects. Experimental CLI and Pipeline package as of July 2026.
metadata:
  tags: unity, cli, automation, ci-cd, build, project-management, cloud, licensing, production, pipeline
  version: "1.1.0"
  source: https://unity.com/kr/blog/meet-the-unity-cli
---

# Unity CLI

Streamline Unity project workflows and automation through the command line.

## When to use this skill

- Install and verify the Unity CLI in your environment
- Set up authentication for CI/CD pipelines or automated builds
- Create or manage Unity projects programmatically
- Automate build, test, or project initialization workflows
- Configure cloud save, licensing, or organization settings
- Integrate Unity CLI into GitHub Actions, Jenkins, or similar CI systems

## When not to use this skill

- For interactive game development workflows → use `unity-gamedev-skill-pack`
- For graphics/rendering tasks → use `threejs-*` or engine-specific skills
- For UI design in game context → use `game-studio-harness` or `open-design-game-ui-*`
- For VFX or animation → use `game-vfx` or `video-motion-previs`

## Instructions

### Step 1: Capture the automation intent

Identify:

- **Goal**: build automation, project setup, CI/CD integration, cloud operations, or licensing
- **Environment**: local development, GitHub Actions, Jenkins, GitLab CI, or custom runner
- **Scope**: single project, monorepo, or organization-wide automation
- **Auth**: service account, personal token, or interactive login

### Step 2: Check prerequisites

Verify:

```bash
dotnet --version
which unity-cli || which unity
```

If not installed, proceed to Step 3.

### Step 3: Install Unity CLI

**Local installation:**

```bash
bash .agent-skills/unity-cli/scripts/setup.sh --install
```

**Docker (CI/CD):**

Use official Unity Docker images with CLI pre-installed:

```bash
docker pull unityci/editor:<version>-<platform>-<architecture>
```

**Manual (system-wide):**

Follow [Unity CLI installation](https://unity.com/download) docs and add to PATH.

### Step 4: Authenticate

**Interactive login:**

```bash
unity-cli manage licensing --authenticate
```

**CI/CD token (recommended):**

```bash
export UNITY_SERIAL=<serial>
export UNITY_EMAIL=<email>
export UNITY_PASSWORD=<password>

unity-cli manage licensing --validate
```

For service accounts, use personal access tokens instead of plaintext passwords.

### Step 5: Run common workflows

**Create a new project:**

```bash
unity-cli project create --name myproject --template 3d
```

**Manage Editor installations:**

```bash
# List available Editor versions
unity-cli install --list

# Install exact Editor version with specific modules
unity-cli install 2023.2.10f1 -m android ios webgl --accept-eula --yes

# Open project with auto-detected Editor version
unity-cli open ./MyGame
```

**Build with verifiable output (JSON/TSV):**

```bash
# Machine-readable build output
unity-cli build --project /path/to/project \
  --platform WebGL \
  --output /path/to/build \
  --format json > build-result.json

# Parse results in CI
cat build-result.json | jq '.success'
```

**Invoke the Pipeline package (localhost API):**

```bash
# Requires: com.unity.pipeline experimental package installed
# Requires: Editor running with --api-port flag

# Example: Evaluate C# in running Editor
curl -X POST http://localhost:14000/eval \
  -H "Authorization: Bearer $PIPELINE_TOKEN" \
  -d '{"code": "Debug.Log(Application.version)"}'
```

**Validate setup:**

```bash
unity-cli doctor
```

**Run tests with evidence:**

```bash
unity-cli test --project /path/to/project \
  --results-file test-results.xml \
  --format json > test-output.json
```

### Step 6: Integrate into CI/CD

Example GitHub Actions workflow:

```yaml
name: Unity Build
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: bash .agent-skills/unity-cli/scripts/setup.sh --ci
      - run: unity-cli build --project . --platform WebGL --output ./dist
      - uses: actions/upload-artifact@v3
        with:
          name: build
          path: ./dist
```

See `references/ci-cd-patterns.md` for Jenkins, GitLab CI, and other runners.

### Step 7: Troubleshoot failures

**License validation fails:**

```bash
unity-cli manage licensing --validate --verbose
```

**Build fails with missing dependencies:**

```bash
unity-cli project validate --project /path/to/project
```

**CLI not found:**

```bash
bash .agent-skills/unity-cli/scripts/setup.sh --diagnose
```

Common issues and solutions are in `references/troubleshooting.md`.

## Examples

### Example 1: Set up CI/CD for a WebGL build

A GitHub Actions workflow needs to build a game for WebGL. Use the skill to install the exact Editor version, validate the project, build with structured output, and parse results.

### Example 2: Verify game build in production

An AI agent needs to confirm that a build succeeded and retrieve the output path. Use JSON-formatted build output to parse success/failure and let the agent make decisions based on structured results.

### Example 3: Query running Editor via Pipeline package

A CI job needs to check build info while the Editor is running. Install the `com.unity.pipeline` package, start the Editor with `--api-port`, and query custom CLI commands from the script.

## Best practices

1. **Use tokens in CI/CD**, never plaintext passwords in repo files.
2. **Validate before building** — catch config errors early with `project validate`.
3. **Version your builds** — tag releases explicitly so CI output maps to source.
4. **Cache build artifacts** — reuse editor cache across runs to speed up CI.
5. **Test locally first** — verify CLI commands work on your machine before committing to CI.
6. **Use official Docker images** — pre-built images avoid OS dependency drift.
7. **Keep CLI updated** — periodically refresh to latest stable version for bug fixes and new features.

## References

- [Unity CLI Documentation](https://docs.unity.com/)
- `references/commands.md` — detailed command reference
- `references/ci-cd-patterns.md` — GitHub Actions, Jenkins, GitLab CI examples
- `references/production-workflows.md` — verifiable game production workflows with evidence
- `references/troubleshooting.md` — common errors and solutions
- `scripts/setup.sh` — automated install and verification
