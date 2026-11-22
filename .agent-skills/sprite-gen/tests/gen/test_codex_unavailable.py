# SPDX-License-Identifier: Apache-2.0
"""A call that names no provider runs on codex. When codex cannot run — no login, or the codex usage of the
account used up — it turns into what the user chose for that (`sprite-gen defaults save --codex-unavailable`,
SPRITE_GEN_CODEX_UNAVAILABLE): `ask` (the default) ends with one question and nothing generated, `grok` and
`openai` run with the switch said on stderr and kept in the report. A named `--provider` runs as named. A batch
verb whose child asked stops with the same question. A guided request asks the choice once and saves it.

Nothing is generated or billed here: codex's answers are the messages its source writes for its usage-limit errors
(docs/gen.md "When codex cannot run"), synthesized; OpenAI's transport is fake; grok is a painter.
"""
from __future__ import annotations

import base64
import io
import json
import os
import subprocess
import sys
import urllib.request
from pathlib import Path
from types import SimpleNamespace

import pytest
from PIL import Image

from conftest import REPO_ROOT, run_script
from http_answer import Answer
from sprite_gen import gen
from sprite_gen.cli import _build_parser
from sprite_gen.gen import base, codex_provider
from sprite_gen.video import batch
from sprite_gen.workflow import guide, preferences

# What `codex exec --json` says when the codex usage of the account is used up, as codex-rs writes it (2026-10-16):
# the Display text of the three errors codex itself classes as its usage limit, each sentence as codex's own unit
# tests pin it (codex-rs/protocol/src/error_tests.rs at rust-v0.160.1 and rust-v0.153.4).
USAGE_LIMIT_SAID = [
    # 0.160.1 writes the apostrophe as U+2019 ...
    "You’ve hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit "
    "https://chatgpt.com/codex/settings/usage to purchase more credits or try again later.",
    # ... and 0.153.4 as an ASCII one
    "You've hit your usage limit. Try again later.",
    "Your workspace is out of credits. Ask your workspace owner to refill in order to continue.",
    "You hit your spend cap set in your workspace. Increase your spend cap to continue.",
    "Quota exceeded. Check your plan and billing details.",
    "To use Codex with your ChatGPT plan, upgrade to Plus: https://chatgpt.com/explore/plus.",
]
NOT_SIGNED_IN = "codex not logged in (codex login status exit 1)"


def _cli(*args: str, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run([sys.executable, "-m", "sprite_gen.cli", *args], capture_output=True,
                          encoding="utf-8", env=env, cwd=REPO_ROOT)


def _without_codex(tmp_path: Path) -> dict[str, str]:
    """The environment with a PATH that holds no `codex` (its login cannot be asked), and no Grok login or API key
    anywhere: a call that went on to another provider instead of asking would fail here, never reach one."""
    for name in ("no-codex-bin", "no-grok-home"):
        (tmp_path / name).mkdir(exist_ok=True)
    env = {key: value for key, value in os.environ.items() if key not in ("XAI_API_KEY", "OPENAI_API_KEY")}
    return {**env, "PATH": str(tmp_path / "no-codex-bin"), "GROK_HOME": str(tmp_path / "no-grok-home")}


def _choose(choice: str) -> dict:
    return preferences.save_settings(None, {}, general={"codex_unavailable": choice},
                                     expected_revision=preferences.read_settings()["revision"])


@pytest.fixture
def codex(monkeypatch, tmp_path):
    """codex signed in with ChatGPT, whose `codex exec` ends the way `state["said"]` says, as codex prints it."""
    home = tmp_path / "codex-home"
    home.mkdir()
    monkeypatch.setenv("CODEX_HOME", str(home))
    state = {"said": USAGE_LIMIT_SAID[0], "execs": 0}

    def run(cmd, **kwargs):
        if list(cmd[1:3]) == ["login", "status"]:
            return SimpleNamespace(returncode=0, stdout="Logged in using ChatGPT", stderr="")
        assert cmd[1] == "exec", cmd
        state["execs"] += 1
        said = json.dumps(state["said"], ensure_ascii=False)
        stdout = "\n".join(['{"type":"thread.started","thread_id":"t-1"}', '{"type":"turn.started"}',
                            f'{{"type":"error","message":{said}}}',
                            f'{{"type":"turn.failed","error":{{"message":{said}}}}}'])
        return SimpleNamespace(returncode=1, stdout=stdout, stderr="")

    monkeypatch.setattr(codex_provider.subprocess, "run", run)
    return state


class _Painter:
    """A provider that draws a plain PNG: grok, wherever it is reached."""

    transparency = base.TRANSPARENCY_CHROMA

    def __init__(self, name: str) -> None:
        self.name = name

    def generate(self, request, workdir):
        Image.new("RGB", (8, 8), (200, 40, 40)).save(request.raw)
        return base.ProviderRun(provider=self.name, elapsed_seconds=0.1, model=request.model)


@pytest.fixture
def made(monkeypatch):
    """The providers a call builds, in order: codex and openai are the real adapters, grok a painter."""
    names: list[str] = []
    real = gen._make_provider

    def make(name, *, keep_session):
        names.append(name)
        return _Painter(name) if name == "grok" else real(name, keep_session=keep_session)

    monkeypatch.setattr(gen, "_make_provider", make)
    return names


@pytest.fixture
def openai_api(monkeypatch):
    """OPENAI_API_KEY set and the Images endpoint answered offline: every request is kept, none leaves."""
    from sprite_gen.gen import openai_provider

    monkeypatch.setenv("OPENAI_API_KEY", "synthetic-key")
    png = io.BytesIO()
    Image.new("RGB", (8, 8), (30, 90, 200)).save(png, format="PNG")
    calls: list[urllib.request.Request] = []

    def answer(request, *, timeout):
        calls.append(request)
        return Answer({"data": [{"b64_json": base64.b64encode(png.getvalue()).decode()}]})

    monkeypatch.setattr(openai_provider.urllib.request, "urlopen", answer)
    return calls


def _codex_down(monkeypatch, reason: str = NOT_SIGNED_IN) -> None:
    monkeypatch.setattr(gen, "_codex_available", lambda: (False, reason))


# --- ask: the question, nothing generated ---------------------------------------------------------------------


def test_no_codex_login_and_nothing_chosen_ends_with_the_question_and_draws_nothing(tmp_path):
    out, report = tmp_path / "out.png", tmp_path / "out.json"
    run = _cli("gen", "--prompt", "a red apple", "--out", str(out), "--report", str(report),
               env=_without_codex(tmp_path))
    assert run.returncode == base.CODEX_UNAVAILABLE_EXIT == 75, run.stderr
    assert run.stdout == ""
    assert [line for line in run.stderr.splitlines() if line.startswith(base.CODEX_UNAVAILABLE_ASK)] != []
    question = base.asked_codex_unavailable(run.stderr)
    assert question["cause"] == "login" and question["reason"] == "codex CLI not found on PATH"
    assert question["choices"] == {"openai": "--provider openai", "grok": "--provider grok", "stop": None}
    assert list(question["choices"]) == ["openai", "grok", "stop"]  # the line's order: dict == does not see it
    assert "OpenAI API" in question["question"] and "Grok" in question["question"] and "stop" in question["question"]
    assert not out.exists() and not report.exists()


@pytest.mark.parametrize("said", USAGE_LIMIT_SAID, ids=["0.160.1", "0.153.4", "workspace-credits", "spend-cap",
                                                         "quota-exceeded", "usage-not-included"])
def test_codex_usage_used_up_and_nothing_chosen_asks_the_same_question(tmp_path, codex, made, said, capsys):
    codex["said"] = said
    with pytest.raises(base.CodexUnavailableAsk) as asked:
        gen.run(prompt="a red apple", out=tmp_path / "out.png", report=tmp_path / "out.json")
    assert asked.value.code == base.CODEX_UNAVAILABLE_EXIT and codex["execs"] == 1 and made == ["codex"]
    question = base.asked_codex_unavailable(capsys.readouterr().err)
    assert question == asked.value.question
    assert question["cause"] == "usage-limit" and question["reason"] == said
    assert not (tmp_path / "out.png").exists() and not (tmp_path / "out.json").exists()


def test_a_codex_failure_that_is_not_its_usage_limit_is_a_failure_not_a_question(tmp_path, codex, made):
    _choose("grok")
    codex["said"] = "The model is not supported."
    with pytest.raises(SystemExit) as failed:
        gen.run(prompt="a red apple", out=tmp_path / "out.png")
    assert not isinstance(failed.value, base.CodexUnavailableAsk)
    assert "The model is not supported." in str(failed.value.code)
    assert made == ["codex"]  # the choice is for codex that cannot run, not for any failure


def test_the_usage_limit_is_read_only_from_codexs_own_sentences():
    for said in USAGE_LIMIT_SAID:
        assert codex_provider.usage_limit(["Model metadata for `x` not found.", said]) == said
        # remote compaction puts its own words before the message
        assert codex_provider.usage_limit([f"Error running remote compact task: {said}"]) is not None
    for other in ("The model is not supported.", "Selected model is at capacity. Please try a different model.",
                  "usage limit", "exceeded retry limit, last status: 429 Too Many Requests"):
        assert codex_provider.usage_limit([other]) is None


# --- grok and openai: run, said and reported ------------------------------------------------------------------


def test_saved_grok_runs_grok_and_says_whose_choice_it_was(tmp_path, monkeypatch, made, capsys):
    _choose("grok")
    _codex_down(monkeypatch)
    report = tmp_path / "out.json"
    assert gen.run(prompt="a red apple", out=tmp_path / "out.png", report=report) == 0
    assert made == ["grok"]
    payload = json.loads(report.read_text(encoding="utf-8"))
    assert payload["provider"] == "grok" and payload["provider_resolved_from"] == "fallback-from-codex"
    assert payload["provider_fallback"] == {"from": "codex", "to": "grok", "cause": "login", "reason": NOT_SIGNED_IN,
                                            "default_source": "hard-default", "chosen_by": "saved"}
    err = capsys.readouterr().err
    switch = [line for line in err.splitlines() if base.PROVIDER_SWITCH_WORDS in line]
    assert len(switch) == 1 and "'grok'" in switch[0] and "saved" in switch[0] and NOT_SIGNED_IN in switch[0]
    assert base.CODEX_UNAVAILABLE_ASK not in err


def test_saved_openai_runs_the_api_with_its_charge_line_and_reports_the_choice(tmp_path, monkeypatch, made,
                                                                               openai_api, capsys):
    _choose("openai")
    _codex_down(monkeypatch)
    report = tmp_path / "out.json"
    assert gen.run(prompt="a red apple", out=tmp_path / "out.png", report=report) == 0
    assert made == ["openai"] and len(openai_api) == 1
    payload = json.loads(report.read_text(encoding="utf-8"))
    assert payload["provider"] == "openai"
    assert payload["provider_fallback"]["to"] == "openai" and payload["provider_fallback"]["chosen_by"] == "saved"
    err = capsys.readouterr().err.splitlines()
    assert len([line for line in err if base.API_CHARGE_WORDS in line and "OPENAI_API_KEY" in line]) == 1
    assert len([line for line in err if base.PROVIDER_SWITCH_WORDS in line and "'openai'" in line]) == 1


def test_codex_usage_used_up_with_saved_grok_runs_grok_after_codex(tmp_path, codex, made, capsys):
    _choose("grok")
    report = tmp_path / "out.json"
    assert gen.run(prompt="a red apple", out=tmp_path / "out.png", report=report) == 0
    assert made == ["codex", "grok"] and codex["execs"] == 1
    payload = json.loads(report.read_text(encoding="utf-8"))
    assert payload["provider"] == "grok" and payload["provider_resolved_from"] == "fallback-from-codex"
    assert payload["provider_fallback"] == {"from": "codex", "to": "grok", "cause": "usage-limit",
                                            "reason": USAGE_LIMIT_SAID[0], "default_source": "hard-default",
                                            "chosen_by": "saved"}
    assert "'grok'" in capsys.readouterr().err


def test_the_environment_answers_before_the_saved_choice(monkeypatch, capsys):
    _choose("grok")
    _codex_down(monkeypatch)
    monkeypatch.setenv(gen.CODEX_UNAVAILABLE_ENV, "ask")
    with pytest.raises(base.CodexUnavailableAsk):
        gen.resolve_default_provider()
    monkeypatch.setenv(gen.CODEX_UNAVAILABLE_ENV, "openai")
    provider, fallback = gen.resolve_default_provider()
    assert provider == "openai" and fallback["chosen_by"] == gen.CODEX_UNAVAILABLE_ENV
    monkeypatch.setenv(gen.CODEX_UNAVAILABLE_ENV, "gemini")
    with pytest.raises(SystemExit, match=gen.CODEX_UNAVAILABLE_ENV):
        gen.resolve_default_provider()


def test_a_codex_that_can_run_reads_no_choice(tmp_path, monkeypatch, made):
    path = preferences.settings_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("not json", encoding="utf-8")  # a broken settings file is read only when the choice is needed
    monkeypatch.setattr(gen, "_codex_available", lambda: (True, ""))
    assert gen.resolve_default_provider() == ("codex", None)
    _codex_down(monkeypatch)
    with pytest.raises(SystemExit, match="invalid preferences"):
        gen.resolve_default_provider()


def test_logo_resolves_the_same_way(tmp_path, monkeypatch, made):
    from sprite_gen.gen import logo

    _codex_down(monkeypatch)
    out_dir = tmp_path / "logo"
    with pytest.raises(base.CodexUnavailableAsk):
        logo.run(text="STARFALL", style="painted fantasy", out_dir=out_dir)
    assert made == [] and not out_dir.exists()


# --- a named provider runs as named ---------------------------------------------------------------------------


def test_a_named_provider_runs_as_named_whatever_was_chosen(tmp_path, codex, made, monkeypatch):
    _choose("openai")
    with pytest.raises(SystemExit) as failed:
        gen.run(provider="codex", prompt="a red apple", out=tmp_path / "out.png")
    assert not isinstance(failed.value, base.CodexUnavailableAsk) and USAGE_LIMIT_SAID[0] in str(failed.value.code)
    assert made == ["codex"]
    monkeypatch.setattr(gen, "_codex_available", lambda: pytest.fail("a named provider resolves no default"))
    report = tmp_path / "grok.json"
    assert gen.run(provider="grok", prompt="a red apple", out=tmp_path / "grok.png", report=report) == 0
    payload = json.loads(report.read_text(encoding="utf-8"))
    assert payload["provider_resolved_from"] == "explicit" and "provider_fallback" not in payload


# --- batch verbs stop with the same question ------------------------------------------------------------------


def _prepared_run(tmp_path: Path) -> Path:
    out_dir = tmp_path / "run"
    states = {"idle": {"frames": 4, "fps": 6, "loop": True, "action": "standing"},
              "walk": {"frames": 6, "fps": 8, "loop": True, "action": "walking"}}
    result = run_script("prepare_sprite_run.py", "--out-dir", str(out_dir), "--character-id", "askbot",
                        "--request-json", json.dumps({"states": states}))
    assert result.returncode == 0, result.stdout + result.stderr
    Image.new("RGB", (64, 64), (255, 0, 255)).save(out_dir / "base-source.png")
    return out_dir


def test_gen_set_whose_rows_asked_stops_with_the_same_question(tmp_path):
    run_dir = _prepared_run(tmp_path)
    run = _cli("gen-set", "--run-dir", str(run_dir), env=_without_codex(tmp_path))
    assert run.returncode == base.CODEX_UNAVAILABLE_EXIT, run.stdout + run.stderr
    # each row's own question stays in its log; the set asks once
    assert len([line for line in run.stderr.splitlines() if line.startswith(base.CODEX_UNAVAILABLE_ASK)]) == 1
    question = base.asked_codex_unavailable(run.stderr)
    assert question["cause"] == "login" and question["choices"]["openai"] == "--provider openai"
    reports = run_dir / "reports" / "gen-set"
    payload = json.loads((reports / "set.report.json").read_text(encoding="utf-8"))
    assert payload["asked"] == question and payload["ok"] == 0
    assert all(item["asked"] == question for item in payload["items"])
    assert "| idle | - | - |" in (reports / "table.md").read_text(encoding="utf-8")
    assert "ASKED" in (reports / "table.md").read_text(encoding="utf-8")
    assert not (run_dir / "raw" / "idle.png").exists() and not (run_dir / "raw" / "walk.png").exists()


def test_gen_set_takes_the_providers_gen_takes():
    """The question's answer is rerun with --provider openai, so gen-set must take it (and runs it as named)."""
    args = _build_parser().parse_args(["gen-set", "--run-dir", "run", "--provider", "openai"])
    assert args.provider == "openai"


def test_video_set_whose_mid_step_redraw_asked_stops_with_the_same_question(tmp_path, monkeypatch):
    hermetic = _without_codex(tmp_path)
    for name in ("PATH", "GROK_HOME"):
        monkeypatch.setenv(name, hermetic[name])
    for name in ("XAI_API_KEY", "OPENAI_API_KEY"):
        monkeypatch.delenv(name, raising=False)
    still = Image.new("RGB", (96, 128), (0, 255, 0))
    for y in range(20, 110):
        for x in range(36, 60):
            still.putpixel((x, y), (120, 60, 40))
    still.save(tmp_path / "front.png")
    root = tmp_path / "set"
    with pytest.raises(base.CodexUnavailableAsk) as asked:
        batch.run_set(bases={"front": tmp_path / "front.png"}, states=["walk"], root=root, character=None,
                      duration=3, resolution="720p", key="green", concurrency=1, force=False, gap=0,
                      video_runner=lambda *a, **k: pytest.fail("no clip is filmed from a start still never drawn"),
                      align_cycles="off")
    question = asked.value.question
    assert asked.value.code == base.CODEX_UNAVAILABLE_EXIT and question["cause"] == "login"
    assert question["choices"] == {"openai": "--still-provider openai", "grok": "--still-provider grok", "stop": None}
    assert list(question["choices"]) == ["openai", "grok", "stop"]
    payload = json.loads((root / "set.report.json").read_text(encoding="utf-8"))
    assert payload["asked"] == question and payload["items"][0]["asked"]["cause"] == "login"


# --- the guided request asks once and saves it ----------------------------------------------------------------


@pytest.fixture
def ready_login(monkeypatch):
    monkeypatch.setattr(guide, "probe_access", lambda provider: {
        "provider": provider, "login": "ready", "subscription": "unknown", "quota": "unknown",
        "billing": "subscription", "reason": "unverified media access"})


def test_the_guide_reports_the_choice_under_the_name_the_setting_is_saved_by(ready_login, monkeypatch):
    monkeypatch.setattr(guide, "CODEX_UNAVAILABLE_SETTING", "renamed")
    monkeypatch.setattr(guide, "GENERAL_FIELDS", {"renamed": guide.GENERAL_FIELDS[gen.CODEX_UNAVAILABLE_SETTING]})
    view = guide.guide("image", choices={"image_provider": "codex"}, confirmed_access=("codex",))
    assert view["renamed"] == {"choice": "ask", "source": "default"}


def test_the_guide_asks_what_to_do_when_codex_cannot_run_once_and_the_answer_is_saved(ready_login, monkeypatch):
    request = dict(choices={"image_provider": "codex"}, confirmed_access=("codex",))
    view = guide.guide("image", **request)
    asked = [q for q in view["questions"] if q["field"] == "codex_unavailable"]
    assert view["status"] == "needs-input" and len(asked) == 1
    assert list(asked[0]["options"]) == ["ask", "grok", "openai"] and "과금" in asked[0]["options"]["openai"]
    assert view["codex_unavailable"] == {"choice": "ask", "source": "default"}
    saved = preferences.save_settings(None, {}, general={"codex_unavailable": "ask"},
                                      expected_revision=view["settings_revision"])
    assert saved["general"] == {"codex_unavailable": "ask"} and saved["profiles"] == {}
    view = guide.guide("image", **request)
    assert view["status"] == "ready" and view["questions"] == []
    assert view["codex_unavailable"] == {"choice": "ask", "source": "saved"}
    monkeypatch.setenv(gen.CODEX_UNAVAILABLE_ENV, "grok")
    assert guide.guide("image", **request)["codex_unavailable"] == {"choice": "grok",
                                                                    "source": gen.CODEX_UNAVAILABLE_ENV}


def test_the_choice_is_kept_beside_the_profiles_in_the_one_settings_file():
    first = preferences.save_settings("image", {"image_provider": "grok"}, expected_revision="missing")
    second = preferences.save_settings(None, {}, general={"codex_unavailable": "openai"},
                                       expected_revision=first["revision"])
    assert second["profiles"] == first["profiles"] and second["general"] == {"codex_unavailable": "openai"}
    third = preferences.save_settings("image", {}, expected_revision=second["revision"], clear=True)
    assert third["profiles"] == {} and third["general"] == {"codex_unavailable": "openai"}
    for bad in ({"codex_unavailable": "gemini"}, {"default_provider": "grok"}):
        with pytest.raises(ValueError):
            preferences.save_settings(None, {}, general=bad, expected_revision=third["revision"])
    assert json.loads(preferences.settings_path().read_text(encoding="utf-8"))["version"] == 2


def test_a_version_1_settings_file_still_reads_with_nothing_chosen():
    path = preferences.settings_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text('{"version":1,"profiles":{"image":{"curation":"skip"}}}', encoding="utf-8")
    settings = preferences.read_settings()
    assert settings["profiles"] == {"image": {"curation": "skip"}} and settings["general"] == {}


def test_the_defaults_cli_saves_and_shows_the_choice(tmp_path):
    saved = _cli("defaults", "save", "--codex-unavailable", "grok", "--expected-revision", "missing")
    assert saved.returncode == 0, saved.stderr
    shown = json.loads(_cli("defaults", "show").stdout)
    assert shown["general"] == {"codex_unavailable": "grok"} and shown["profiles"] == {}
    refused = _cli("defaults", "save", "--codex-unavailable", "gemini", "--expected-revision", shown["revision"])
    assert refused.returncode != 0


def test_skill_names_the_exit_code_the_line_and_the_three_choices():
    skill = (REPO_ROOT / "SKILL.md").read_text(encoding="utf-8")
    assert f"exit {base.CODEX_UNAVAILABLE_EXIT}" in skill and base.CODEX_UNAVAILABLE_ASK.strip() in skill
    for words in ("OpenAI API", "그록", "멈추기", "--codex-unavailable"):
        assert words in skill
