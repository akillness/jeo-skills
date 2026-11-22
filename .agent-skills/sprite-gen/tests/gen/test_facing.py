# SPDX-License-Identifier: Apache-2.0
"""Facing regression contracts; all generation and vision calls are offline."""
import argparse
import json
import shutil
from pathlib import Path
from types import SimpleNamespace

import pytest
from PIL import Image, ImageOps

from sprite_gen import gen
from sprite_gen.gen import codex_provider, facing, facing_vision, openai_provider, grok_provider, xai
from sprite_gen.gen.base import ProviderRun

FIXTURES = Path(__file__).parents[1] / "fixtures" / "facing"


class Backend:
    name = "openai"
    transparency = "native"

    def __init__(self, direction="left", failure=None, regenerated_direction="right", image_direction=None):
        self.image_direction = image_direction or direction
        self.regenerated_direction = regenerated_direction
        self.direction, self.failure = direction, failure
        self.generations, self.inspections = [], []

    def generate(self, request, workdir):
        self.generations.append(request)
        source = self.regenerated_direction if len(self.generations) > 1 else self.image_direction
        if source == "unknown":
            source = "front"
        shutil.copyfile(FIXTURES / f"{source}.png", request.raw)
        return ProviderRun(self.name, 2, model="test-image", extra={"usage": {"output_tokens": 10}})

    def inspect_facing(self, path, workdir):
        self.inspections.append(path)
        if self.failure:
            raise self.failure
        direction = self.regenerated_direction if len(self.generations) > 1 else self.direction
        return json.dumps({"direction": direction, "confidence": 0.95}), {"model": "test-vision", "usage": {"input_tokens": 4}}


def generate(tmp_path, monkeypatch, backend, **kwargs):
    monkeypatch.setattr(gen, "_make_provider", lambda *a, **kw: backend)
    return gen.generate_image("openai", "a toy robot", tmp_path / "out.png",
                              refs=[FIXTURES / "left.png"], **{"facing": "right", **kwargs})


def test_video_loop_takes_the_facings_declared_here():
    from sprite_gen.video import loop

    parser = argparse.ArgumentParser()
    loop.add_arguments(parser)
    assert next(a for a in parser._actions if "--facing" in a.option_strings).choices is facing.FACINGS


@pytest.mark.parametrize("direction", ["left", "right", "front"])
def test_three_fixture_directions_only_opposite_is_mirrored(tmp_path, monkeypatch, direction):
    backend = Backend(direction)
    result = generate(tmp_path, monkeypatch, backend, facing_fix="mirror")
    original = Image.open(FIXTURES / f"{direction}.png")
    expected = ImageOps.mirror(original) if direction == "left" else original
    assert Image.open(result.out).tobytes() == expected.tobytes()
    assert Image.open(result.raw).tobytes() == original.tobytes()
    assert len(backend.inspections) == len(backend.generations) == 1
    assert "facing right" in backend.generations[0].prompt
    report = result.to_dict()["extra"]["facing"]
    assert report["direction"] == direction and report["confidence"] == 0.95
    assert report["action"] == ("mirror" if direction == "left" else "none")


def test_left_request_mirrors_right_and_preserves_alpha_and_preview(tmp_path, monkeypatch):
    result = generate(tmp_path, monkeypatch, Backend("right"), facing="left", facing_fix="mirror",
                      transparent=True, alpha_mode="native", white_check=tmp_path / "white.png")
    original = Image.open(FIXTURES / "right.png")
    assert Image.open(result.out).tobytes() == ImageOps.mirror(original).tobytes()
    expected = Image.new("RGBA", original.size, "white")
    expected.alpha_composite(ImageOps.mirror(original))
    assert Image.open(tmp_path / "white.png").convert("RGBA").tobytes() == expected.tobytes()
    assert result.extra["facing"]["final_direction"] == "left"


def test_default_and_none_preserve_bytes_despite_wrong_observation(tmp_path, monkeypatch):
    # the default is `none`, so an explicit `facing_fix="none"` runs the same code
    backend = Backend("left", image_direction="right")
    result = generate(tmp_path, monkeypatch, backend)
    assert result.out.read_bytes() == result.raw.read_bytes() == (FIXTURES / "right.png").read_bytes()
    report = result.extra["facing"]
    assert report["fix"] == "none" and report["action"] == "none"
    assert report["reason"] == "correction-disabled"
    assert report["direction"] == report["final_direction"] == "left"
    assert report["final_direction_source"] == "observation"
    assert report["requested"] == "right" and report["model"] == "test-vision"
    assert len(backend.generations) == len(backend.inspections) == 1
    assert "facing right" in result.prompt


@pytest.mark.parametrize("failure", [RuntimeError("private"), SystemExit("private")])
def test_failed_vision_is_unknown_and_preserves_file(tmp_path, monkeypatch, failure, capsys):
    result = generate(tmp_path, monkeypatch, Backend(failure=failure))
    report = result.extra["facing"]
    assert report["direction"] == "unknown" and report["confidence"] is None
    assert report["action"] == "none" and "vision-call-failed" in report["reason"]
    assert "private" not in json.dumps(report)
    assert "facing unknown" in capsys.readouterr().err
    assert result.out.read_bytes() == (FIXTURES / "left.png").read_bytes()


@pytest.mark.parametrize("rechecked", ["right", "left", "front", "unknown"])
def test_regen_rechecks_once_and_mirrors_only_a_known_opposite(tmp_path, monkeypatch, rechecked):
    backend = Backend(regenerated_direction=rechecked)
    result = generate(tmp_path, monkeypatch, backend, facing_fix="regen")
    report = result.extra["facing"]
    assert len(backend.generations) == len(backend.inspections) == 2
    assert "CORRECTION REQUIRED" in backend.generations[1].prompt
    assert "facing right" in backend.generations[1].prompt
    expected = "right" if rechecked in ("left", "right") else "front"
    assert Image.open(result.out).tobytes() == Image.open(FIXTURES / f"{expected}.png").tobytes()
    assert result.elapsed_seconds == 4
    assert result.extra["usage"] == report["regeneration"]["extra"]["usage"] == {"output_tokens": 10}
    assert report["action"] == "regen"
    assert report["regeneration"]["recheck"]["direction"] == rechecked
    assert report["regeneration"]["recheck"]["usage"] == {"input_tokens": 4}
    assert report.get("fallback") == ("mirror" if rechecked == "left" else None)
    assert report["final_direction"] == ("right" if rechecked in ("left", "right") else rechecked)
    assert report["final_direction_source"] == ("mirror-of-recheck" if rechecked == "left" else "regeneration-recheck")
    if rechecked in ("unknown", "front"):
        assert report["reason"].startswith("regeneration-facing-unresolved:")


def test_regen_failure_is_terminal_and_never_reuses_stale_output(tmp_path, monkeypatch):
    backend = Backend()
    original_generate = backend.generate
    def fail_second(request, workdir):
        if backend.generations:
            raise SystemExit("regeneration failed")
        return original_generate(request, workdir)
    backend.generate = fail_second
    out = tmp_path / "out.png"
    out.write_bytes(b"existing-output")
    with pytest.raises(SystemExit, match="regeneration failed"):
        generate(tmp_path, monkeypatch, backend, facing_fix="regen")
    assert out.read_bytes() == b"existing-output"


def test_no_ref_does_not_inspect_or_change_prompt(tmp_path, monkeypatch):
    backend = Backend()
    monkeypatch.setattr(gen, "_make_provider", lambda *a, **kw: backend)
    result = gen.generate_image("openai", "a toy robot", tmp_path / "out.png")
    assert not backend.inspections and "facing" not in result.extra
    assert backend.generations[0].prompt == "a toy robot"


@pytest.mark.parametrize("text", ['{}', 'null', '[]', 'left or right', '{"direction":"left","confidence":true}',
                                 '{"direction":"left","confidence":2}', '{"direction":"right","confidence":NaN}',
                                 '{"direction":"back","confidence":0.9}'])
def test_malformed_observation_is_unknown(text):
    assert facing.parse_observation(text)["reason"] == "invalid-vision-response"


def test_one_word_never_invents_confidence():
    assert facing.parse_observation(" LEFT ") == {"direction": "left", "confidence": None,
                                                "confidence_source": "not-reported"}


@pytest.mark.parametrize("text,direction,confidence", [
    (' {"direction":"left","confidence":0.9} ', "left", 0.9),
    (' \n```json\n{"direction":"right","confidence":1}\n```\n ', "right", 1),
    ('```\n{"direction":"front","confidence":0.8}\n```', "front", 0.8),
    ('left', "left", None),
    ('The character faces RIGHT.', "right", None),
    ('unreadable garbage', "unknown", None),
])
def test_provider_response_formats(text, direction, confidence):
    observed = facing.parse_observation(text)
    assert observed["direction"] == direction
    assert observed["confidence"] == confidence
    if direction == "unknown":
        assert observed["reason"] == "invalid-vision-response"


def vision_response():
    return {"model": "test-vision", "status": "completed", "usage": {"input_tokens": 4},
            "output": [{"type": "message", "content": [{"type": "output_text", "text": '```json\n{"direction":"left","confidence":0.9}\n```'}]}]}


@pytest.mark.parametrize("provider", ["openai", "grok"])
def test_rest_vision_uses_same_provider_credential_once(monkeypatch, tmp_path, provider):
    seen = []
    if provider == "openai":
        monkeypatch.setattr(openai_provider, "resolve_credential", lambda: "synthetic")
        def http(url, token, data, content_type, **kw):
            seen.append((url, token, json.loads(data)))
            return 200, vision_response(), {}
        monkeypatch.setattr(openai_provider, "http_image", http)
        backend = openai_provider.OpenAIProvider()
    else:
        monkeypatch.setattr(xai, "resolve_credential", lambda: xai.Credential("synthetic", "grok-login"))
        def http(method, url, token, body, **kw):
            seen.append((url, token, body))
            return 200, vision_response()
        monkeypatch.setattr(xai, "http_json", http)
        backend = grok_provider.GrokProvider()
    report = facing.inspect(backend, FIXTURES / "left.png", tmp_path)
    assert len(seen) == 1 and seen[0][1] == "synthetic"
    assert seen[0][0] == ("https://api.openai.com/v1/responses" if provider == "openai" else "https://api.x.ai/v1/responses")
    body = seen[0][2]
    assert body["store"] is False
    assert body["input"][0]["content"][1]["image_url"].startswith("data:image/png;base64,")
    assert report["direction"] == "left" and report["usage"] == {"input_tokens": 4}
    assert report["auth_source"] == ("OPENAI_API_KEY" if provider == "openai" else "grok-login")


def test_rest_rejection_is_unknown_without_retry(monkeypatch, tmp_path):
    calls = []
    monkeypatch.setattr(openai_provider, "resolve_credential", lambda: "synthetic")
    def http(*a, **kw):
        calls.append(1)
        return 403, {"error": "sensitive"}, {}
    monkeypatch.setattr(openai_provider, "http_image", http)
    report = facing.inspect(openai_provider.OpenAIProvider(), FIXTURES / "left.png", tmp_path)
    assert len(calls) == 1 and report["direction"] == "unknown"
    assert "sensitive" not in json.dumps(report)


def test_codex_vision_reads_new_answer_and_scrubs_identity(monkeypatch, tmp_path):
    seen = []
    monkeypatch.setenv("ORCHESTRATOR_MEMBER_ID", "synthetic")
    def run(command, **kwargs):
        seen.append((command, kwargs))
        Path(command[command.index("-o") + 1]).write_text('right')
        return SimpleNamespace(returncode=0)
    monkeypatch.setattr(facing_vision.subprocess, "run", run)
    monkeypatch.setattr(codex_provider, "codex_login", lambda: codex_provider.CodexLogin(codex_provider.AUTH_SOURCE_LOGIN))
    text, metadata = facing_vision.codex_inspect(FIXTURES / "left.png", tmp_path)
    assert text == "right" and metadata["auth_source"] == "codex-login"
    assert len(seen) == 1 and "--ephemeral" in seen[0][0] and "read-only" in seen[0][0]
    assert "ORCHESTRATOR_MEMBER_ID" not in seen[0][1]["env"]
    assert not list(tmp_path.iterdir())


def test_cli_options_reach_report(tmp_path, monkeypatch):
    # `--facing-fix` defaults to `none`, so passing it runs the same code
    backend = Backend("right")
    monkeypatch.setattr(gen, "_make_provider", lambda *a, **kw: backend)
    report = tmp_path / "report.json"
    assert gen.main(["--provider", "openai", "--prompt", "robot", "--ref", str(FIXTURES / "right.png"),
                     "--out", str(tmp_path / "out.png"), "--report", str(report),
                     "--facing", "left"]) == 0
    facing_report = json.loads(report.read_text())["extra"]["facing"]
    assert facing_report["requested"] == "left" and facing_report["action"] == "none"
    assert facing_report["fix"] == "none"
    assert (tmp_path / "out.png").read_bytes() == (FIXTURES / "right.png").read_bytes()


def test_regeneration_recheck_failure_preserves_regenerated_image(tmp_path, monkeypatch):
    backend = Backend()
    inspect = backend.inspect_facing
    def fail_second(path, workdir):
        if backend.inspections:
            backend.inspections.append(path)
            raise TimeoutError("synthetic")
        return inspect(path, workdir)
    backend.inspect_facing = fail_second
    result = generate(tmp_path, monkeypatch, backend, facing_fix="regen")
    report = result.extra["facing"]
    assert len(backend.generations) == len(backend.inspections) == 2
    assert report["final_direction"] == "unknown" and "TimeoutError" in report["reason"]
    assert "fallback" not in report
    assert result.out.read_bytes() == (FIXTURES / "right.png").read_bytes()


def test_gen_cli_preserve_default_leaves_reference_prompt_unchanged(tmp_path, monkeypatch):
    backend = Backend()
    monkeypatch.setattr(gen, "_make_provider", lambda *a, **kw: backend)
    gen.main(["--provider", "openai", "--prompt", "front-facing robot", "--ref", str(FIXTURES / "front.png"),
              "--out", str(tmp_path / "out.png")])
    assert backend.generations[0].prompt == "front-facing robot" and not backend.inspections


def test_gen_set_reference_row_keeps_its_prompt(tmp_path, monkeypatch):
    from sprite_gen.gen import gen_set
    backend = Backend()
    monkeypatch.setattr(gen, "_make_provider", lambda *a, **kw: backend)
    prompt = tmp_path / "prompt.txt"
    prompt.write_text("a front-facing robot animation row")
    monkeypatch.setattr(gen_set, "run_logged", lambda command, log: gen.main(command[4:]))
    assert gen_set.run_gen_cli(prompt, tmp_path / "out.png", [FIXTURES / "front.png"],
                              tmp_path / "report.json", provider="openai", model=None,
                              log=tmp_path / "log.txt") == 0
    assert backend.generations[0].prompt == prompt.read_text() and not backend.inspections


def test_reroll_reference_row_keeps_its_prompt(tmp_path, monkeypatch):
    from sprite_gen.effects import reroll
    backend = Backend()
    monkeypatch.setattr(gen, "_make_provider", lambda *a, **kw: backend)
    monkeypatch.setattr(reroll, "load_request", lambda *a: {"fit": {"pixel_unfake": True}, "states": {"idle": {"frames": 2}}})
    monkeypatch.setattr(reroll, "identity_ref", lambda *a, **kw: FIXTURES / "front.png")
    monkeypatch.setattr(reroll, "prompt_rel", lambda *a: "prompt.txt")
    monkeypatch.setattr(reroll, "guide_rel", lambda *a: "guide.png")
    monkeypatch.setattr(reroll, "take_raw_rel", lambda *a: "out.png")
    monkeypatch.setattr(reroll, "record_take", lambda *a: None)
    (tmp_path / "prompt.txt").write_text("a back-facing robot animation row")
    reroll.reroll_state(tmp_path, "idle", provider="openai")
    assert backend.generations[0].prompt == "a back-facing robot animation row" and not backend.inspections


def test_interpolation_references_keep_their_prompt(monkeypatch):
    from sprite_gen.effects.interpolate import gen_interpolator
    backend = Backend()
    monkeypatch.setattr(gen, "_make_provider", lambda *a, **kw: backend)
    with Image.open(FIXTURES / "front.png") as im:
        gen_interpolator("codex")(im, im, 0.5, "front-facing robot, halfway pose")
    assert backend.generations[0].prompt == "front-facing robot, halfway pose" and not backend.inspections
