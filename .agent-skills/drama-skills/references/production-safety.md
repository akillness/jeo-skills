# Drama Skills production safety

## Boundary

Normal work is provider-neutral and file-first. Only
`short-drama-produce/scripts/production_tool.py` may execute external media
adapters. Writing prompts, accepting an artifact, reviewing a budget, viewing a
preview, or saying "continue" does not authorize a paid call.

## Required state machine

```text
draft job
   |
prepare -> immutable preview + fingerprint + exact confirmation string
   |
user reviews exact count/content/references/params/outputs/adapter
   |
explicit confirmation for that fingerprint
   |
confirm -> one-use authorization
   |
run -> adapter execution -> outputs + compact run record
```

Hard rules:

1. Show the full material consequence before confirmation: count, prompts,
   reference inputs, model/provider, parameters, output paths, and known cost or
   quota effects.
2. Never synthesize, auto-fill, or infer the
   `CONFIRM <job_id> <fingerprint12>` string for the user. The suffix is the
   first 12 characters of the prepared fingerprint; use only the exact string
   returned by the current tool.
3. Any material job change invalidates the confirmation.
4. A confirmation is consumed by one started run.
5. While one attempt remains `running`, do not call `prepare`, `confirm`, or
   `run` again for that job.
6. A failed started run needs a fresh prepare/confirm cycle before retry.
7. Do not interpret project acceptance/review status as production approval.
8. Never batch in extra jobs beyond the reviewed preview.
9. Report `prepared`, `confirmed`, `running`, `failed`, and `completed` as
   distinct states.

## Commands

Resolve `PRODUCE` from the installed `short-drama-produce` skill:

```bash
PRODUCE=/absolute/path/to/drama-skills/skills/short-drama-produce

python3 "$PRODUCE/scripts/production_tool.py" \
  prepare /path/to/project --job /path/to/temporary-job.json

python3 "$PRODUCE/scripts/production_tool.py" \
  confirm /path/to/project --job-id <id> \
  --confirmation "CONFIRM <id> <fingerprint12>"

python3 "$PRODUCE/scripts/production_tool.py" \
  run /path/to/project --job-id <id> \
  --adapter-config /path/outside/project/adapter-config.json

python3 "$PRODUCE/scripts/production_tool.py" \
  status /path/to/project --job-id <id>

python3 "$PRODUCE/scripts/production_tool.py" audit /path/to/project
```

Read the current command help and upstream adapter contract before running.
`adapter-config.json` must live outside the project so project content cannot
inject an executable adapter command.

## Optional providers

| Adapter | Default endpoint | Credential |
|---|---|---|
| Seedance / Volcengine | `https://ark.cn-beijing.volces.com/api/v3` | `ARK_API_KEY` |
| GPT Image 2 / OpenAI | `https://api.openai.com/v1` | `OPENAI_API_KEY` |
| MiniMax Music | `https://api.minimax.io/v1` | `MINIMAX_API_KEY` |

Provider use is optional. Normal creative work and offline validators need none
of these keys.

Credential rules:

- read secrets from environment or an approved secret manager;
- keep them out of project files, prompt specs, logs, and chat output;
- report variable names and presence only, never values;
- do not commit adapter configuration containing secrets;
- use HTTPS endpoints without embedded user information;
- do not add a provider or override endpoint without inspecting the current
  adapter contract.

The bundled helper reports only presence:

```bash
bash .agent-skills/drama-skills/scripts/drama-skills.sh doctor /path/to/drama-skills
```

## Adapter execution contract

The upstream production tool executes adapter commands as an argument vector,
not through a shell, passes job JSON on stdin, and enforces a bounded timeout.
Preserve those properties when adding an adapter:

- no `shell=True` or string-concatenated commands;
- validate adapter config outside the project root;
- validate provider output schema before publishing;
- use HTTPS-only downloads with size limits;
- remove partial downloads after failure;
- publish outputs atomically where supported;
- never let provider output rewrite creator documents.

## Preview checklist

Before asking for confirmation, show:

```yaml
production_preview:
  job_id: "..."
  fingerprint: "..."
  task_count: 0
  media_types: [image, video, tts, music]
  provider_and_model: "..."
  source_prompts: ["project-relative paths"]
  input_references: ["project-relative paths"]
  parameters: {}
  outputs: ["project-relative paths"]
  estimated_cost_or_quota: "known amount or explicitly unknown"
  adapter_config_path: "/outside/project/..."
  retry_policy: "fresh confirmation after any started failure"
```

If any field changes after review, regenerate the preview and ask again.

## Dashboard is not production authorization

The local Dashboard is an editor and project-status surface. Opening it,
editing a prompt, accepting a file, or clicking through a preview does not
replace the production tool's fingerprinted confirmation state.
