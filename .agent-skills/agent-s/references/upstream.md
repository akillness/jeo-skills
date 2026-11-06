# Agent S audited reference

Audit of [`simular-ai/Agent-S`](https://github.com/simular-ai/Agent-S) at commit
[`0fff0e634869dab72027435b4586e62300185d41`](https://github.com/simular-ai/Agent-S/tree/0fff0e634869dab72027435b4586e62300185d41)
(committed 2026-10-21T21:03:57Z, "docs: tidy README highlights banner and clarify OSWorld V2 scoring note"),
observed 2026-11-06, plus the published `gui-agents` 0.3.2 wheel (PyPI upload 2025-12-16). License:
Apache-2.0. `references/source.json` records the SHA-256 of the 8 files this audit read. Benchmark and
"state of the art" claims in the upstream README are the authors' own; this audit did not reproduce them.

## Identity and layout

Agent S is Simular's open-source computer-use agent framework. `README.md` lists versions Agent S4, S3, S2.5, S2 and S1. The agent that the `gui-agents` package ships is **Agent S3** (`gui_agents/s3`), run through the `agent_s` console script (`gui_agents.s3.cli_app:main`). Older generations live in `gui_agents/s1`, `s2`, `s2_5`. `agent_s4/` is a separate distribution (`agent_s4/pyproject.toml`).

## Install

```bash
pip install gui-agents          # published 0.3.2
brew install tesseract          # pytesseract needs the binary (README)
# or, from a checkout:
pip install -e .
```

- **Python range.** `setup.py` sets `python_requires=">=3.9, <=3.12"`, and the PyPI metadata for 0.2.x through 0.3.2 repeats it. By PEP 440, `3.12.1 <= 3.12` is false, so pip rejects every 3.12 patch release after 3.12.0. Reproduced 2026-11-06 with `pip download gui-agents==0.3.2 --no-deps --only-binary=:all: --python-version 3.12.4` (no matching distribution; it lists only versions 0.1.x as compatible), while `--python-version 3.12.0` and `3.11.9` downloaded the 0.3.2 wheel. Use Python 3.9 to 3.11. `--ignore-requires-python` bypasses the check but is untested here.
- **Dependencies** (`install_requires`): `numpy`, `backoff`, `pandas`, `openai`, `anthropic`, `fastapi`, `uvicorn`, `paddleocr`, `paddlepaddle`, `together`, `scikit-learn`, `websockets`, `tiktoken`, `selenium`, `pyautogui`, `toml`, `pytesseract`, `google-genai`, `pyobjc` on macOS, `pywinauto` and `pywin32` on Windows.
- Prerequisites stated upstream: single monitor; "The agent runs Python code to control your computer - use with care".

## Models and grounding

- Providers (`models.md`): OpenAI, Anthropic, Gemini, Azure OpenAI, vLLM, Open Router. Environment names: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` with `GEMINI_ENDPOINT_URL`, `AZURE_OPENAI_API_BASE` with `AZURE_OPENAI_API_KEY`, `vLLM_ENDPOINT_URL`, `OPENROUTER_API_KEY` with `OPEN_ROUTER_ENDPOINT_URL`; the README also exports `HF_TOKEN`. Keys can instead be passed as flags, which puts them in shell history and the process list.
- A **grounding model is required**: `--ground_provider`, `--ground_url`, `--ground_model`, `--grounding_width` and `--grounding_height` are all `required=True` in `cli_app.py`. The README recommends UI-TARS-1.5-7B on a Hugging Face Inference Endpoint (1920x1080 output space) or UI-TARS-72B (1000x1000). A dedicated endpoint is a paid, third-party service that receives screenshots.
- README's recommended pair: `gpt-5-2025-08-07` as main model with UI-TARS-1.5-7B for grounding; defaults for `--provider`/`--model` are `openai` and `gpt-5-2025-08-07`.

Reference invocation (README):

```bash
agent_s --provider openai --model gpt-5-2025-08-07 \
  --ground_provider huggingface --ground_url http://localhost:8080 \
  --ground_model ui-tars-1.5-7b --grounding_width 1920 --grounding_height 1080
```

Other flags: `--model_url`, `--model_api_key`, `--model_temperature`, `--ground_api_key`, `--max_trajectory_length` (default 8 image turns), `--enable_reflection` (default true), `--enable_local_env` (default false), `--task` (run one task and exit; without it the CLI prompts `Query:` in a loop).

## Run loop

`run_agent` in `gui_agents/s3/cli_app.py`:

- Loops `for step in range(15)`: screenshot with `pyautogui.screenshot()`, resize so neither side exceeds 2400 px, send as PNG to the agent, receive a code string.
- Control words in the returned code: `done` or `fail` end the run (a macOS or Linux dialog says "Task Completed"), `next` continues, `wait` sleeps 5 s. Anything else is executed with `exec(code[0])` in the CLI's own Python process after a one-second pause, then another second.
- `Ctrl+C` pauses; `Esc` resumes; a second `Ctrl+C` exits.
- Logging: the module creates `logs/` in the current directory and writes `normal-*`, `debug-*` and `sdebug-*` log files per run. Their contents were not audited; treat them as sensitive.

## Safety findings

All verified by reading the pinned source; the wheel's `cli_app.py` shows the same two facts.

- **No per-action confirmation.** `show_permission_dialog` (an `osascript` dialog on macOS, `zenity` on Linux, `False` elsewhere) is defined in `gui_agents/s3/cli_app.py` and in the s1, s2, s2_5 variants, but nothing calls it. A comment above the `exec` line reads "Ask for permission before executing", and the next statement is `exec(code[0])`. The only brake is the pause key.
- **Local coding environment.** `--enable_local_env` builds `LocalEnv`; the README warns it "executes arbitrary Python and Bash code locally". `LocalController.run_bash_script` runs `/bin/bash -lc <code>` with `timeout=30`; `run_python_script` runs `python -c <code>` with no timeout.
- **Screens leave the machine.** Each step's screenshot goes to the main model endpoint and the grounding endpoint. Notifications, mail, chats and password managers on screen are included.
- **Dependency weight.** `paddleocr` and `paddlepaddle` are large installs; install into a dedicated virtual environment.

## Other upstream surfaces

- **Agent S4** (`agent_s4/`, paper "Evolving Agent Interfaces"): a Builder agent edits a "shadow interface" while a task agent runs benchmark tasks on fresh AWS VMs. It is a research and benchmark pipeline (OSWorld V2, ScienceBoard), not a desktop assistant, and it spends cloud money. Out of scope for this skill.
- **OSWorld, WindowsAgentArena, ScienceBoard**: setup docs under `osworld_setup/`, `WAA_setup.md`, `scienceboard_setup/`. Not audited.
- **OpenClaw wrapper**: `integrations/openclaw/` ships its own `SKILL.md` and `agent_s_wrapper.py` for the OpenClaw skills directory. It is a different agent surface from this catalog skill; do not install both under one name in one root.
- **Hosted products**: the README points to Simular's cloud API and the Sai agent. This skill covers the open-source package only.

## Not verified

No Agent S process, model call, grounding call, screenshot, pip install of the full dependency tree, or
desktop action was run during this audit. The helper's `runtime_verified` is always false.
