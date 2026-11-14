# CLI Workflow & Execution Reference

## Invocations

### 1. Search

Use 2–5 word action queries focusing on the user-visible capability or HTML/CSS primitive.

```sh
# Remote / npm
npx -y modern-web-guidance@latest search "accessible modal dialog"

# Bundled local fallback
bash .agent-skills/modern-web-guidance/scripts/modern-web-guidance.sh search "accessible modal dialog"
```

Output is a JSON array:
```json
[
  {
    "id": "ui-components/modal-dialog",
    "description": "Accessible modal dialog using native HTML <dialog> element with backdrop and focus trap."
  }
]
```

### 2. Retrieve

Retrieve one or more guides by ID:

```sh
# Remote
npx -y modern-web-guidance@latest retrieve "ui-components/modal-dialog"

# Multiple IDs
npx -y modern-web-guidance@latest retrieve "ui-components/modal-dialog,accessibility/focus-management"

# Local script
bash .agent-skills/modern-web-guidance/scripts/modern-web-guidance.sh retrieve "ui-components/modal-dialog"
```

### 3. Legacy Scan

Detect legacy patterns (e.g. jQuery animations, outdated date parsing, non-semantic div modals):

```sh
npx -y modern-web-guidance@latest legacy-scan ./src --json
```

## Offline & Sandbox Environment Guidance

1. **Local Bundled Guides**:
   All guides are mirrored locally in `.agent-skills/modern-web-guidance/guides/`.
2. **Offline Python Search**:
   If internet access or `npx` is unavailable in the execution environment, run:
   ```sh
   python3 .agent-skills/modern-web-guidance/scripts/local-search.py search "<query>"
   python3 .agent-skills/modern-web-guidance/scripts/local-search.py retrieve "<id>"
   ```
