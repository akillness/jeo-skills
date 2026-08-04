# Unity CLI Production Workflows

Based on the July 2026 Unity CLI announcement and production-grade practices, this guide covers verifiable, machine-readable game production workflows.

## Core Design Principle: Describable Machines

A build machine should be:

- **Describable**: You can query which Editor version is installed, which platform modules exist, and what the running project expects
- **Verifiable**: Tests return structured evidence (JSON/TSV, exit codes); an AI assistant can parse results rather than ask a developer to copy console lines
- **Reproducible**: The same script produces identical output across runs without manual UI interactions

## The Three Layers

```
Script / CI Job / AI Agent
    ↓
Unity CLI (Editor management, modules, projects, auth)
    ↓
Unity Editor or dev Player
    ↓
Unity Pipeline Package (localhost API, token-gated command eval)
    ↓
Registered CliCommand methods + Structured output
```

## Layer 1: CLI – Editor and Module Management

### Inspect available Editor versions

```bash
unity-cli install --list
unity-cli install --list | grep 2023
```

### Install exact Editor + modules (pinned, reproducible)

```bash
# Install specific version with only needed modules
unity-cli install 2023.2.10f1 \
  -m android ios webgl \
  --accept-eula --yes

# Verify installation
unity-cli doctor
```

### Open project with auto-detected Editor

```bash
# Let the Editor version from ProjectSettings/ProjectVersion.txt be used
unity-cli open ./MyGame

# Or explicitly specify
unity-cli open ./MyGame --editor-version 2023.2.10f1
```

## Layer 2: CLI – Verifiable Build Output

### Machine-readable build results (JSON)

```bash
unity-cli build \
  --project /path/to/project \
  --platform WebGL \
  --output /path/to/build \
  --format json > build-result.json

# Parse in CI
cat build-result.json | jq '.success'
cat build-result.json | jq '.errors[]'
```

### Exit codes matter

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Build error |
| 130 | User cancelled |

```bash
unity-cli build --project . --platform WebGL --output ./dist
BUILD_EXIT=$?
if [ $BUILD_EXIT -eq 0 ]; then
  echo "Build succeeded"
elif [ $BUILD_EXIT -eq 130 ]; then
  echo "Build cancelled"
else
  echo "Build failed: $BUILD_EXIT"
fi
```

### Test results with evidence

```bash
# Run tests and capture structured output
unity-cli test --project . \
  --results-file test-results.xml \
  --format json > test-output.json

# AI agents can parse this:
# - Which tests passed/failed?
# - What was the execution time?
# - Any assertion errors or log output?
cat test-output.json | jq '.tests[] | select(.result == "Failed")'
```

## Layer 3: Pipeline Package – In-Editor Automation

The experimental `com.unity.pipeline` package enables localhost API calls to a running Editor.

### Prerequisites

1. Install the Pipeline package in your project:
   ```bash
   cd /path/to/project
   # Add via manifest or:
   unity-cli project add-package com.unity.pipeline
   ```

2. Start Editor with API port:
   ```bash
   unity-cli open ./MyGame --api-port 14000
   ```

3. Generate or retrieve access token (set by Editor on startup):
   ```bash
   export PIPELINE_TOKEN=$(cat ~/.unity/pipeline-token.txt)
   ```

### Registered CLI commands in Editor

Define custom commands in your project:

```csharp
using UnityEngine;
using Unity.Pipeline;

public class GameCommands {
  [CliCommand("game/version")]
  public static string GetVersion() => Application.version;

  [CliCommand("game/scene-list")]
  public static string[] ListScenes() => /* ... */;

  [CliCommand("game/build-info")]
  public static BuildInfo GetBuildInfo() => /* ... */;
}
```

Invoke from CLI:

```bash
curl -X POST http://localhost:14000/invoke \
  -H "Authorization: Bearer $PIPELINE_TOKEN" \
  -d '{"command": "game/version"}'

# Response:
# {
#   "result": "1.2.3",
#   "exitCode": 0
# }
```

### Token-gated C# evaluation

For advanced workflows, evaluate C# directly in the running Editor:

```bash
curl -X POST http://localhost:14000/eval \
  -H "Authorization: Bearer $PIPELINE_TOKEN" \
  -d '{"code": "Debug.Log(Application.version); return Application.version;"}'
```

**Security note**: The token is single-use or time-limited. Never commit it; always retrieve fresh for each workflow.

## Production Workflow Patterns

### Pattern 1: Reproducible CI Build

```bash
#!/bin/bash
set -e

# 1. Ensure exact Editor version
EDITOR_VERSION=$(cat ProjectSettings/ProjectVersion.txt | grep "m_EditorVersion:" | cut -d' ' -f2)
echo "Using Editor $EDITOR_VERSION"

# 2. Install if not present
unity-cli install "$EDITOR_VERSION" -m webgl --accept-eula --yes

# 3. Validate project state
unity-cli project validate --project . --format json > validate.json
cat validate.json | jq '.valid' || exit 1

# 4. Build with structured output
unity-cli build \
  --project . \
  --platform WebGL \
  --output ./dist \
  --format json > build-result.json

# 5. Parse and report
if cat build-result.json | jq -e '.success' > /dev/null; then
  echo "Build succeeded"
  cat build-result.json | jq '.warnings[]'
else
  echo "Build failed"
  cat build-result.json | jq '.errors[]'
  exit 1
fi
```

### Pattern 2: In-Editor Verification

Start a headless Editor, run custom checks, return structured evidence:

```bash
#!/bin/bash

# Start Editor with Pipeline support
unity-cli open ./MyGame \
  --headless \
  --api-port 14000 &
EDITOR_PID=$!

sleep 5  # Wait for Editor to start

# Run in-Editor checks via Pipeline
RESULT=$(curl -s -X POST http://localhost:14000/invoke \
  -H "Authorization: Bearer $PIPELINE_TOKEN" \
  -d '{"command": "game/build-info"}')

echo "Build Info: $RESULT"

# Kill Editor
kill $EDITOR_PID
```

### Pattern 3: Multi-Platform Matrix (Documented)

```bash
#!/bin/bash

PLATFORMS=("StandaloneWindows" "StandaloneLinux64" "WebGL")
EDITOR_VERSION="2023.2.10f1"

for PLATFORM in "${PLATFORMS[@]}"; do
  echo "=== Building for $PLATFORM ==="
  
  # Install modules
  MODULE_MAP=(
    "StandaloneWindows:windows"
    "StandaloneLinux64:linux"
    "WebGL:webgl"
  )
  MODULE=$(echo "${MODULE_MAP[@]}" | grep "$PLATFORM" | cut -d: -f2)
  
  unity-cli install "$EDITOR_VERSION" -m "$MODULE" --accept-eula --yes
  
  # Build
  unity-cli build \
    --project . \
    --platform "$PLATFORM" \
    --output "./builds/$PLATFORM" \
    --format json > "builds/$PLATFORM/result.json"
  
  # Log results
  if cat "builds/$PLATFORM/result.json" | jq -e '.success' > /dev/null; then
    echo "✓ $PLATFORM succeeded"
  else
    echo "✗ $PLATFORM failed"
    cat "builds/$PLATFORM/result.json" | jq '.errors[]'
  fi
done
```

### Pattern 4: AI Agent Verification Loop

An agent can:

1. Query Editor state via Pipeline
2. Run a build with structured output
3. Parse results and decide next steps
4. Return evidence to the human reviewer

```python
# Example: AI agent workflow
import subprocess
import json

def get_game_version():
    result = subprocess.run(
        ["curl", "-s", "-X", "POST", "http://localhost:14000/invoke",
         "-H", "Authorization: Bearer $PIPELINE_TOKEN",
         "-d", '{"command": "game/version"}'],
        capture_output=True, text=True
    )
    return json.loads(result.stdout)

def build_and_verify():
    # 1. Check current version
    version = get_game_version()
    print(f"Building version {version['result']}")
    
    # 2. Run build
    result = subprocess.run(
        ["unity-cli", "build", "--project", ".", 
         "--platform", "WebGL", "--output", "./dist",
         "--format", "json"],
        capture_output=True, text=True
    )
    build_info = json.loads(result.stdout)
    
    # 3. Verify results
    if build_info.get("success"):
        print("✓ Build succeeded")
        return {"status": "success", "output": "./dist"}
    else:
        print("✗ Build failed")
        print(json.dumps(build_info.get("errors", []), indent=2))
        return {"status": "failed", "errors": build_info.get("errors")}

result = build_and_verify()
```

## Best Practices

1. **Pin Editor versions explicitly** — Use ProjectSettings/ProjectVersion.txt as source of truth.
2. **Always capture structured output** — Use `--format json` or `--format tsv` for machine parsing.
3. **Test locally before CI** — Verify commands on your machine match CI expectations.
4. **Validate before building** — Run `unity-cli project validate` first to catch config errors early.
5. **Treat exit codes as contracts** — Don't just check stderr; rely on documented exit codes.
6. **Rotate tokens frequently** — Pipeline tokens should be time-limited and rotated per workflow.
7. **Log everything for audit** — Preserve build logs, test results, and CLI output for verification.
8. **Separate concerns** — Use CLI for Editor management, Pipeline for in-Editor state queries.

## Troubleshooting Production Issues

### "Editor version mismatch in CI"

```bash
# CI environment doesn't match local
LOCAL_VERSION=$(cat ProjectSettings/ProjectVersion.txt)
echo "Local: $LOCAL_VERSION"

# In CI, install the same version
unity-cli install "$LOCAL_VERSION" --accept-eula --yes
```

### "Build output not JSON"

```bash
# Ensure --format json is used
unity-cli build --project . --platform WebGL --output ./dist --format json

# Not:
# unity-cli build --project . --platform WebGL --output ./dist  # Missing --format
```

### "Pipeline token invalid"

```bash
# Token may be time-limited; generate fresh
export PIPELINE_TOKEN=$(cat ~/.unity/pipeline-token.txt)

# Or use environment variable from Editor startup
curl -H "Authorization: Bearer $PIPELINE_TOKEN" http://localhost:14000/status
```

## References

- [Official Unity CLI announcement (July 2026)](https://unity.com/blog)
- [Production Workflows deep-dive](https://akillness.github.io/posts/unity-cli-production-workflows/)
- [Unity CLI experimental features](https://docs.unity.com/)
