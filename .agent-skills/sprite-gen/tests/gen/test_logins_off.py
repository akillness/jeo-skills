# SPDX-License-Identifier: Apache-2.0
"""`SPRITE_GEN_LOGINS=off` (docs/gen.md "Subscription logins off"): no subscription login is read — the grok login
file, `codex login status`, `claude auth status` — and every provider call runs on its API key, which keeps its
own rule (set but empty is refused). Unset or empty is `on`, the order as it was. No binary, no network."""
from __future__ import annotations

import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import pytest

from sprite_gen import gen
from sprite_gen.gen import claude_login, codex_provider, facing_vision, xai
from sprite_gen.gen.base import CodexUnavailableAsk, GenRequest
from sprite_gen.workflow.access import probe_access

NOW = datetime(2026, 9, 8, 12, 0, tzinfo=timezone.utc)


def _grok_login(tmp_path: Path) -> Path:
    home = tmp_path / "grokhome"
    home.mkdir()
    entry = {"key": "login-token", "expires_at": "2026-09-08T18:00:00Z"}
    (home / "auth.json").write_text(json.dumps({"https://auth.x.ai::client": entry}), encoding="utf-8")
    return home


def _never(*args, **kwargs):
    pytest.fail(f"no login may be asked about: {args[0] if args else kwargs}")


# --- xAI: the grok login file ------------------------------------------------------------------------------------


@pytest.mark.parametrize("logins", [None, "", "on"])
def test_logins_on_reads_the_grok_login_before_the_key_as_before(tmp_path, monkeypatch, logins) -> None:
    monkeypatch.setenv("GROK_HOME", str(_grok_login(tmp_path)))
    env = {"XAI_API_KEY": "key", **({} if logins is None else {"SPRITE_GEN_LOGINS": logins})}
    assert xai.resolve_credential(env=env, now=NOW).source == xai.AUTH_SOURCE_GROK_LOGIN


def test_logins_off_runs_on_the_key_with_a_login_file_present(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("GROK_HOME", str(_grok_login(tmp_path)))
    credential = xai.resolve_credential(env={"SPRITE_GEN_LOGINS": "off", "XAI_API_KEY": "door-token"}, now=NOW)
    assert credential == xai.Credential("door-token", xai.AUTH_SOURCE_API_KEY)


def test_logins_off_never_looks_at_the_grok_home(monkeypatch) -> None:
    monkeypatch.setenv("GROK_HOME", "  ")  # read, this is refused (`xai.grok_home`)
    credential = xai.resolve_credential(env={"SPRITE_GEN_LOGINS": "off", "XAI_API_KEY": "door-token"}, now=NOW)
    assert credential.source == xai.AUTH_SOURCE_API_KEY


def test_logins_off_keeps_the_empty_key_refusal(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("GROK_HOME", str(_grok_login(tmp_path)))
    with pytest.raises(SystemExit, match="XAI_API_KEY is set but empty"):
        xai.resolve_credential(env={"SPRITE_GEN_LOGINS": "off", "XAI_API_KEY": " "}, now=NOW)


def test_logins_off_without_a_key_names_both(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("GROK_HOME", str(_grok_login(tmp_path)))
    with pytest.raises(SystemExit) as refused:
        xai.resolve_credential(env={"SPRITE_GEN_LOGINS": "off"}, now=NOW)
    said = str(refused.value)
    assert "no xAI credential" in said and "SPRITE_GEN_LOGINS=off" in said and "XAI_API_KEY" in said


@pytest.mark.parametrize("value", ["0", "false", "OFF", "no"])
def test_another_value_is_refused_not_read_as_on(tmp_path, monkeypatch, value) -> None:
    monkeypatch.setenv("GROK_HOME", str(_grok_login(tmp_path)))
    with pytest.raises(SystemExit, match=f"SPRITE_GEN_LOGINS={value!r}"):
        xai.resolve_credential(env={"SPRITE_GEN_LOGINS": value, "XAI_API_KEY": "k"}, now=NOW)


def test_a_grok_vision_check_with_logins_off_runs_on_the_key(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("GROK_HOME", str(_grok_login(tmp_path)))
    monkeypatch.setenv("SPRITE_GEN_LOGINS", "off")
    monkeypatch.setenv("XAI_API_KEY", "door-token")
    asked = []

    def call(method, url, token, body, *, deadline=None):
        asked.append(token)
        return 200, {"output": [{"type": "message", "content": [{"type": "output_text", "text": "right"}]}]}

    image = tmp_path / "still.png"
    image.write_bytes(b"\x89PNG\r\n\x1a\n")
    _text, metadata = facing_vision.grok_inspect(image, call=call)
    assert asked == ["door-token"] and metadata["auth_source"] == xai.AUTH_SOURCE_API_KEY


# --- Anthropic: `claude auth status` -----------------------------------------------------------------------------


def test_logins_off_never_asks_claude_and_runs_on_the_key() -> None:
    credential = claude_login.resolve_credential(env={"SPRITE_GEN_LOGINS": "off", "ANTHROPIC_API_KEY": "door-token"},
                                                 run=_never)
    assert credential == claude_login.Credential(claude_login.AUTH_SOURCE_API_KEY, token="door-token")


def test_logins_on_asks_claude_first_as_before() -> None:
    signed_in = subprocess.CompletedProcess(["claude"], 0, stdout=json.dumps(
        {"loggedIn": True, "authMethod": "claude.ai", "subscriptionType": "max"}), stderr="")
    credential = claude_login.resolve_credential(env={"ANTHROPIC_API_KEY": "key"}, run=lambda *a, **k: signed_in)
    assert credential.source == claude_login.AUTH_SOURCE_LOGIN


def test_logins_off_keeps_the_empty_anthropic_key_refusal() -> None:
    with pytest.raises(SystemExit, match="ANTHROPIC_API_KEY is set but empty"):
        claude_login.resolve_credential(env={"SPRITE_GEN_LOGINS": "off", "ANTHROPIC_API_KEY": ""}, run=_never)


def test_logins_off_without_an_anthropic_key_names_both() -> None:
    with pytest.raises(SystemExit) as refused:
        claude_login.resolve_credential(env={"SPRITE_GEN_LOGINS": "off"}, run=_never)
    said = str(refused.value)
    assert "no Claude credential" in said and "SPRITE_GEN_LOGINS=off" in said and "ANTHROPIC_API_KEY" in said


# --- OpenAI: codex ------------------------------------------------------------------------------------------------


@pytest.fixture
def codex_off(monkeypatch):
    monkeypatch.setenv("SPRITE_GEN_LOGINS", "off")
    monkeypatch.setattr(codex_provider.subprocess, "run", _never)
    monkeypatch.setattr(subprocess, "run", _never)


def test_logins_off_codex_is_not_usable_and_says_why(codex_off) -> None:
    assert codex_provider.codex_login() == codex_provider.CodexLogin(
        None, "subscription logins are off here (SPRITE_GEN_LOGINS=off)")


def test_logins_off_the_default_codex_asks_what_the_user_chose(codex_off, monkeypatch) -> None:
    monkeypatch.delenv(gen.DEFAULT_PROVIDER_ENV, raising=False)
    monkeypatch.delenv(gen.CODEX_UNAVAILABLE_ENV, raising=False)
    monkeypatch.setenv("SPRITE_GEN_CONFIG_DIR", "/nonexistent-sprite-gen-config")
    with pytest.raises(CodexUnavailableAsk) as asked:
        gen.resolve_default_provider()
    assert "SPRITE_GEN_LOGINS=off" in asked.value.question["reason"]


def test_logins_off_codex_generation_and_its_vision_check_refuse(codex_off, tmp_path) -> None:
    with pytest.raises(SystemExit, match=r"codex-gen: subscription logins are off here \(SPRITE_GEN_LOGINS=off\)"):
        codex_provider.CodexProvider().generate(GenRequest("x", tmp_path / "raw.png"), tmp_path)
    with pytest.raises(SystemExit, match=r"subscription logins are off here \(SPRITE_GEN_LOGINS=off\)"):
        facing_vision.codex_inspect(tmp_path / "raw.png", tmp_path)


def test_logins_off_the_access_check_names_it_for_codex_and_the_key_for_grok(codex_off, monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("GROK_HOME", str(_grok_login(tmp_path)))
    monkeypatch.setenv("XAI_API_KEY", "door-token")
    codex = probe_access("codex")
    assert codex["login"] == "unavailable" and "SPRITE_GEN_LOGINS=off" in codex["reason"]
    assert probe_access("grok")["billing"] == "api-credit"
