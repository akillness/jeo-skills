---
name: agent-s
description: >
  Operate simular-ai/Agent-S, the Apache-2.0 open-source computer-use agent framework whose
  Agent S3 (`gui-agents` 0.3.2, `agent_s` CLI) screenshots the desktop, asks a multimodal model
  plus a grounding model what to do, and executes generated pyautogui code to click, type and
  scroll on macOS, Windows or Linux. Use when the user names Agent S, Agent-S, Simular,
  `gui-agents`, `agent_s`, UI-TARS grounding, or an OSWorld-style GUI agent and needs a fit
  check, install, model and grounding setup, an offline preflight, a supervised run, or
  troubleshooting. Do not use for ordinary browser automation, tasks with a CLI or API,
  unsupervised runs on a personal machine, or Agent S4's AWS benchmark evolution. Triggers on:
  Agent S, Agent-S, gui-agents, agent_s, computer use agent, 컴퓨터 사용 에이전트, 화면 보고 PC 조작하는 AI.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Agent S3 needs Python 3.9 to 3.12.0 for pip (the published Requires-Python is '>=3.9, <=3.12',
  which excludes 3.12.1 and later), the tesseract binary, a single monitor, a multimodal model
  API key, and a reachable grounding model endpoint. Every screenshot leaves the machine for the
  configured endpoints. Use a disposable desktop for anything sensitive.
license: Apache-2.0
metadata:
  version: "1.0.0"
  source: https://github.com/simular-ai/Agent-S
  upstream_commit: 0fff0e634869dab72027435b4586e62300185d41
---

# Agent S operator

Operate Agent S3 from the `gui-agents` package as a supervised tool, never as an unattended one. This
skill was audited against commit `0fff0e634869dab72027435b4586e62300185d41` (2026-10-21) and the
published `gui-agents` 0.3.2 wheel; audited facts, hazards and the pin are in
[`references/upstream.md`](references/upstream.md).

## When to use this skill

- Fit-check, install, configure, preflight, run, or troubleshoot Agent S3 and its `agent_s` CLI.
- Choose providers, set up a grounding model (UI-TARS), or explain `--ground_*` and `--grounding_*` flags.
- Decide whether `--enable_local_env` is acceptable (it runs arbitrary Python and Bash).
- Not for Playwright or Selenium test automation, tasks with a CLI or API (`browser-harness`, `stagehand`), or Agent S4's AWS-VM evolution loop.

## Instructions

### 1. Freeze the surface

Record one mode (`orient`, `install`, `configure`, `run`, `troubleshoot`), one concrete task, and the
machine it will run on. Prefer a disposable VM, a separate OS user, or a cleared desktop. The model
sees the whole screen on every step.

### 2. Run the offline gate first

The helper reads host facts and, with `--repo`, a checkout. It never starts Agent S, pip, a model
call or a screenshot, opens no sockets, and writes nothing:

```bash
python3 .agent-skills/agent-s/scripts/preflight.py --json
python3 .agent-skills/agent-s/scripts/preflight.py --repo /path/to/Agent-S --expect-commit 0fff0e634869dab72027435b4586e62300185d41 --json
```

An installed skill uses `python3 "$SKILLS_ROOT/agent-s/scripts/preflight.py"`. Read the `python`
check carefully: pip refuses `gui-agents` 0.3.2 on Python 3.12.1 and later, so the environment needs
3.9 to 3.11 (or exactly 3.12.0). `audit:*` lines report what the checkout's `cli_app.py` actually does.

### 3. Gate every side effect

Require separate explicit approval for each:

1. `pip install gui-agents` (or `pip install -e .`), which pulls heavy dependencies such as `paddleocr` and `paddlepaddle`, plus `brew install tesseract`.
2. Creating or using a grounding endpoint (UI-TARS on Hugging Face Inference Endpoints or another provider; paid, and it receives every screenshot).
3. Exporting provider keys; never paste them into chat or logs.
4. The first run: the agent clicks and types on the real desktop and executes model-generated code.
5. `--enable_local_env`: arbitrary Python and Bash with the user's permissions. Allow it only inside a disposable VM or container.
6. Any task that sends messages, spends money, deletes data, or touches credentials: require a human confirmation step the tool itself does not provide.

### 4. Follow the matching reference branch

- Install, Python range, dependencies → **Install** in `references/upstream.md`.
- Models, grounding, flags, coordinates → **Models and grounding**.
- What the run loop does, logs, pause keys → **Run loop**.
- Safety and the unused permission dialog → **Safety findings**.
- Agent S4, OSWorld, OpenClaw wrapper → **Other upstream surfaces**.

### 5. Verify narrowly

Start with a harmless task such as opening a calculator or a blank text editor, with `--task "<one sentence>"`
and a person watching. Ctrl+C pauses the run, Esc resumes, a second Ctrl+C quits. Report what the agent
did from the screen and the run's `logs/` files, not from the model's claim of success.

## Examples

### Fit check before installing

Run the preflight, report the Python verdict and the `tesseract` result, list the model and grounding
endpoints the user must supply, and state that screenshots go to them. Do not install.

### "Let it clean my downloads folder"

Decline an unattended run on the personal machine. Offer a VM, a one-folder task with
`--task`, no `--enable_local_env`, and a human watching with Ctrl+C ready.

## Best practices

- Treat the generated code as untrusted input: this version executes it directly with `exec()`.
- Do not assume a confirmation dialog exists: `show_permission_dialog` is defined in `cli_app.py` but never called.
- Match `--grounding_width` and `--grounding_height` to the grounding model's output space (1920x1080 for UI-TARS-1.5-7B, 1000x1000 for UI-TARS-72B).
- Close password managers, chats and mail before a run; the model reads whatever is on screen.
- Keep the helper offline and honest: a tool on PATH is not a working model endpoint or screen permission.

## References

- [Audited Agent S facts, hazards and pin](references/upstream.md)
- [Pinned source manifest](references/source.json)
- [Agent S3 README at the audited commit](https://github.com/simular-ai/Agent-S/blob/0fff0e634869dab72027435b4586e62300185d41/gui_agents/s3/README.md)
- [Supported model APIs](https://github.com/simular-ai/Agent-S/blob/0fff0e634869dab72027435b4586e62300185d41/models.md)
- [Apache-2.0 license at the pin](https://github.com/simular-ai/Agent-S/blob/0fff0e634869dab72027435b4586e62300185d41/LICENSE)
- [Offline helper](scripts/preflight.py)
