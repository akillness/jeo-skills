# Unity CLI Command Reference

## Project Management

### Create a new project

```bash
unity-cli project create --name <project-name> --template <template>
```

**Templates:**
- `3d` — 3D project with built-in render pipeline
- `2d` — 2D project
- `urp` — 3D Universal Render Pipeline
- `hdrp` — 3D High Definition Render Pipeline
- `vr` — VR template
- `mobile` — Mobile optimized

### Validate project

```bash
unity-cli project validate --project /path/to/project
```

Checks:
- Project structure integrity
- Missing dependencies
- Configuration errors

### List project info

```bash
unity-cli project info --project /path/to/project
```

Outputs:
- Unity version
- Target platforms
- Installed packages
- Build settings

## Build Operations

### Build for a platform

```bash
unity-cli build \
  --project /path/to/project \
  --platform <platform> \
  --output /path/to/output
```

**Supported platforms:**
- `StandaloneWindows`
- `StandaloneLinux64`
- `StandaloneOSX`
- `WebGL`
- `iOS`
- `Android`
- `UWP`

**Options:**
- `--development` — Build with dev symbols and slow optimization
- `--headless` — Run without graphics output
- `--verbose` — Detailed build logs

### Incremental build

```bash
unity-cli build \
  --project /path/to/project \
  --platform WebGL \
  --output /path/to/output \
  --incremental
```

## Testing

### Run tests

```bash
unity-cli test --project /path/to/project
```

**Filters:**
- `--test-category <category>` — Run only specific test category
- `--test-filter <pattern>` — Match test names

### Test results output

```bash
unity-cli test \
  --project /path/to/project \
  --results-file results.xml
```

## Licensing

### Validate license

```bash
unity-cli manage licensing --validate
```

### Return license

```bash
unity-cli manage licensing --return
```

### Check license status

```bash
unity-cli manage licensing --status
```

## Cloud Operations

### Save to cloud

```bash
unity-cli cloud save \
  --project /path/to/project \
  --message "Auto-save from CI"
```

### Load from cloud

```bash
unity-cli cloud load \
  --project /path/to/project \
  --revision <revision-id>
```

## Asset Management

### Import assets

```bash
unity-cli assets import \
  --project /path/to/project \
  --path /path/to/assets
```

### Export assets

```bash
unity-cli assets export \
  --project /path/to/project \
  --output /path/to/export
```

## Organization & Admin

### List organizations

```bash
unity-cli org list
```

### Create team

```bash
unity-cli org create --name <team-name>
```

### Manage members

```bash
unity-cli org members add --email <email> --role developer
unity-cli org members remove --email <email>
```

## Version & Help

### Check CLI version

```bash
unity-cli --version
```

### Get help

```bash
unity-cli --help
unity-cli <command> --help
```

## Exit Codes

| Code | Meaning |
|------|----------|
| 0 | Success |
| 1 | General error |
| 2 | License error |
| 3 | Build failed |
| 4 | Test failed |
| 5 | Network error |
| 127 | Command not found |

## Environment Variables

```bash
UNITY_SERIAL          # License serial number
UNITY_EMAIL           # Account email
UNITY_PASSWORD        # Account password (use token in CI)
UNITY_CLI_LOG_LEVEL   # debug, info, warn, error
UNITY_PROJECT_PATH    # Default project path
```
