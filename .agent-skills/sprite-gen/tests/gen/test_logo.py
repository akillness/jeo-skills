# SPDX-License-Identifier: Apache-2.0
"""`sprite-gen logo`: a mood image with the title in it, the lettering redrawn on a key, the key removed.

The provider is a stand-in that paints synthetic pictures and answers the text check from a
script, so the verb's contract is held offline: what each step sends, what it publishes,
what it refuses (no text, a title the model dropped, letters that differ) and what the
report says. Nothing here draws a font: a logo comes from the model or not at all.
"""

from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from logo_lettering import GREEN_PAINTED, MAGENTA_PAINTED, lettering, quilt, walled_patch
from sprite_gen import gen
from sprite_gen.frames import logo_matte
from sprite_gen.gen import base as gen_base
from sprite_gen.gen import logo


def _scene(colour=(30, 40, 90)) -> Image.Image:
    image = Image.new("RGB", (320, 180), colour)
    for x in range(320):
        for y in range(120, 180):
            image.putpixel((x, y), (60, 50, 40))
    return image


class FakeProvider:
    """Paints a scene for the mood step, synthetic lettering for the edit, and reads a script."""

    name = "fake"
    transparency = gen_base.TRANSPARENCY_NATIVE

    def __init__(self, *, reads=(["ION"], ["ION"]), mood=None, letters=None, auth="codex-login") -> None:
        self.reads = list(reads)
        self.mood = mood if mood is not None else _scene()
        self.letters = letters
        self.auth = auth
        self.requests: list[gen_base.GenRequest] = []
        self.looked: list[tuple[Path, str]] = []

    def generate(self, request: gen_base.GenRequest, workdir: Path) -> gen_base.ProviderRun:
        self.requests.append(request)
        if request.refs:
            green = "#00FF00" in request.prompt
            picture = self.letters or lettering(key=GREEN_PAINTED if green else MAGENTA_PAINTED).image
        else:
            picture = self.mood
        picture.save(request.raw)
        return gen_base.ProviderRun(provider=self.name, elapsed_seconds=1.5, model="fake-image",
                                    extra={"auth_source": self.auth, "transport": "fake"})

    def inspect_image(self, path: Path, workdir: Path, prompt: str, *, label: str = "") -> tuple[str, dict]:
        with Image.open(path) as shown:
            shown.load()
            self.looked.append((Path(path), shown.mode))
        lines = self.reads.pop(0)
        if isinstance(lines, Exception):
            raise lines
        return json.dumps({"lines": lines}), {"model": "fake-vision", "effort": "fake-effort", "auth_source": self.auth,
                                              "transport": "fake"}

    def inspect_facing(self, path: Path, workdir: Path):  # pragma: no cover - not used by logo
        raise AssertionError("logo never asks for a facing")


@pytest.fixture
def fake(monkeypatch):
    def install(**kwargs) -> FakeProvider:
        provider = FakeProvider(**kwargs)
        monkeypatch.setattr(gen, "_make_provider", lambda name, *, keep_session=False: provider)
        return provider

    return install


def _run(tmp_path: Path, **overrides):
    kwargs = dict(text="ION", style="painted fantasy", out_dir=tmp_path / "logo", provider="fake")
    kwargs.update(overrides)
    return logo.run(**kwargs)


def _report(tmp_path: Path) -> dict:
    return json.loads((tmp_path / "logo" / "logo.report.json").read_text(encoding="utf-8"))


def test_three_steps_publish_a_transparent_logo_with_its_mood_image_and_report(tmp_path, fake) -> None:
    provider = fake()
    assert _run(tmp_path) == 0
    out = tmp_path / "logo"
    for name in ("mood.png", "lettering.png", "logo.png", "logo.preview.png", "logo.report.json"):
        assert (out / name).is_file(), name
    first, second = provider.requests
    assert first.refs == []
    assert '"ION"' in first.prompt and "painted fantasy" in first.prompt and "title screen" in first.prompt
    assert [Path(r).name for r in second.refs] == ["mood.png"]
    assert '"ION"' in second.prompt and "#FF00FF" in second.prompt
    assert "only the title lettering" in second.prompt
    with Image.open(out / "logo.png") as cut, Image.open(out / "lettering.png") as drawn:
        assert cut.mode == "RGBA"
        assert cut.width < drawn.width and cut.height < drawn.height
        alpha = np.asarray(cut)[..., 3]
    assert alpha.max() == 255 and ((alpha > 0) & (alpha < 255)).any()
    report = _report(tmp_path)
    assert report["kind"] == "sprite-gen-logo-report" and report["status"] == "ok"
    assert report["text"] == "ION" and report["subtitle"] is None
    assert report["steps"]["mood"]["source"] == "generated"
    assert report["steps"]["matte"]["method"] == "logo-unmix" and report["steps"]["matte"]["key"] == "magenta"
    assert report["logo"]["size"] == list(Image.open(out / "logo.png").size)
    assert report["logo"]["alpha"]["partial_pct"] > 0
    assert report["text_check"]["mood"]["verdict"] == "match"
    assert report["text_check"]["logo"] == {**report["text_check"]["logo"], "verdict": "match", "read": ["ION"]}
    assert [c["step"] for c in report["calls"]] == ["mood", "mood-check", "lettering", "logo-check"]
    assert {c["route"] for c in report["calls"]} == {"subscription"}
    assert all(c["elapsed_seconds"] >= 0 for c in report["calls"])


def test_the_text_check_sees_the_logo_on_a_plain_backdrop_not_on_the_key(tmp_path, fake) -> None:
    provider = fake()
    assert _run(tmp_path) == 0
    shown, mode = provider.looked[-1]
    assert shown.name != "logo.png" and mode == "RGB"  # the logo laid on a flat backdrop, not the transparent file


def test_empty_text_is_refused_before_anything_is_bought(tmp_path, fake) -> None:
    provider = fake()
    with pytest.raises(SystemExit, match="empty --text"):
        _run(tmp_path, text="   ")
    assert provider.requests == [] and provider.looked == []


def test_a_title_the_mood_image_dropped_is_refused_before_the_lettering_is_bought(tmp_path, fake) -> None:
    provider = fake(reads=(["IO"], ["IO"]))
    with pytest.raises(SystemExit, match="mood image"):
        _run(tmp_path)
    assert len(provider.requests) == 1
    out = tmp_path / "logo"
    assert (out / "mood.png").is_file()
    assert not (out / "lettering.png").exists() and not (out / "logo.png").exists()
    report = _report(tmp_path)
    assert report["status"] == "refused" and report["refused_at"] == "mood-check"
    assert report["text_check"]["mood"]["verdict"] == "mismatch" and report["text_check"]["mood"]["read"] == ["IO"]


def test_a_logo_whose_letters_differ_from_the_text_is_refused_and_kept_aside(tmp_path, fake) -> None:
    fake(reads=(["ION"], ["I0N"], ["I0N"]))
    with pytest.raises(SystemExit, match="logo reads"):
        _run(tmp_path)
    out = tmp_path / "logo"
    assert not (out / "logo.png").exists() and (out / "logo.rejected.png").is_file()
    report = _report(tmp_path)
    assert report["status"] == "refused" and report["refused_at"] == "logo-check"
    assert report["text_check"]["logo"]["verdict"] == "mismatch"


def test_no_text_read_at_all_is_refused(tmp_path, fake) -> None:
    fake(reads=(["ION"], [], []))
    with pytest.raises(SystemExit, match="logo reads"):
        _run(tmp_path)
    assert _report(tmp_path)["text_check"]["logo"]["verdict"] == "no-text"


def test_a_check_that_could_not_run_is_said_not_passed(tmp_path, fake, capsys) -> None:
    fake(reads=(["ION"], RuntimeError("vision down")))
    assert _run(tmp_path) == 0
    report = _report(tmp_path)
    assert report["status"] == "unverified"
    assert report["text_check"]["logo"]["verdict"] == "unverified"
    assert "vision-call-failed:RuntimeError" in report["text_check"]["logo"]["reason"]
    assert "not verified" in capsys.readouterr().err
    assert (tmp_path / "logo" / "logo.png").is_file()


# A text check reads the image again while it reads other letters (docs/logo.md, the text check): one reading that
# spells the text passes, and only readings that all differ refuse, up to `logo.MAX_READS` readings.
def _readings(check: dict) -> list[tuple]:
    return [(r["reading"], r["verdict"], r.get("read")) for r in check["readings"]]


def test_one_reading_that_matches_is_the_whole_check(tmp_path, fake) -> None:
    provider = fake(reads=(["ION"], ["ION"]))
    assert _run(tmp_path) == 0
    assert len(provider.looked) == 2  # one reading at each check
    report = _report(tmp_path)
    for step in ("mood", "logo"):
        check = report["text_check"][step]
        assert check["verdict"] == "match" and check["max_reads"] == logo.MAX_READS
        assert _readings(check) == [(1, "match", ["ION"])]
    assert [(c["step"], c.get("reading")) for c in report["calls"]] == [
        ("mood", None), ("mood-check", 1), ("lettering", None), ("logo-check", 1)]


def test_a_misreading_read_again_as_asked_passes_at_either_check(tmp_path, fake) -> None:
    provider = fake(reads=(["I0N"], ["ION"], ["IDN"], ["ION"]))
    assert _run(tmp_path) == 0
    assert len(provider.looked) == 4
    report = _report(tmp_path)
    assert report["status"] == "ok" and (tmp_path / "logo" / "logo.png").is_file()
    for step, first in (("mood", ["I0N"]), ("logo", ["IDN"])):
        check = report["text_check"][step]
        assert check["verdict"] == "match" and check["read"] == ["ION"]
        assert _readings(check) == [(1, "mismatch", first), (2, "match", ["ION"])]
    assert [(c["step"], c.get("reading")) for c in report["calls"]] == [
        ("mood", None), ("mood-check", 1), ("mood-check", 2), ("lettering", None), ("logo-check", 1), ("logo-check", 2)]


def test_two_misreadings_refuse_the_mood_image_and_name_both(tmp_path, fake) -> None:
    provider = fake(reads=(["IO"], ["I0"]))
    with pytest.raises(SystemExit, match=r"mood image reads \['IO'\] and then \['I0'\], not"):
        _run(tmp_path)
    assert len(provider.requests) == 1 and len(provider.looked) == 2  # the lettering was not bought
    check = _report(tmp_path)["text_check"]["mood"]
    assert check["verdict"] == "mismatch"
    assert _readings(check) == [(1, "mismatch", ["IO"]), (2, "mismatch", ["I0"])]


def test_two_misreadings_refuse_the_logo_and_keep_it_aside(tmp_path, fake) -> None:
    fake(reads=(["ION"], ["I0N"], ["IDN"]))
    with pytest.raises(SystemExit, match=r"logo reads \['I0N'\] and then \['IDN'\], not"):
        _run(tmp_path)
    out = tmp_path / "logo"
    assert not (out / "logo.png").exists() and (out / "logo.rejected.png").is_file()
    check = _report(tmp_path)["text_check"]["logo"]
    assert check["verdict"] == "mismatch"
    assert _readings(check) == [(1, "mismatch", ["I0N"]), (2, "mismatch", ["IDN"])]


def test_a_check_reads_no_more_than_max_reads(tmp_path, fake, monkeypatch) -> None:
    provider = fake(reads=(["IO"], ["I0"], ["ION"]))
    with pytest.raises(SystemExit, match="mood image"):
        _run(tmp_path)
    assert logo.MAX_READS == 2 and len(provider.looked) == 2
    assert provider.reads == [["ION"]]  # the third answer was never asked for
    monkeypatch.setattr(logo, "MAX_READS", 3)  # the limit is the name, not a number written in the check
    provider = fake(reads=(["IO"], ["I0"], ["ION"], ["ION"]))
    assert _run(tmp_path) == 0
    check = _report(tmp_path)["text_check"]["mood"]
    assert check["max_reads"] == 3
    assert _readings(check) == [(1, "mismatch", ["IO"]), (2, "mismatch", ["I0"]), (3, "match", ["ION"])]


def test_a_call_that_failed_is_not_asked_again(tmp_path, fake) -> None:
    provider = fake(reads=(["ION"], RuntimeError("vision down"), ["ION"]))
    assert _run(tmp_path) == 0
    assert len(provider.looked) == 2 and provider.reads == [["ION"]]
    check = _report(tmp_path)["text_check"]["logo"]
    assert check["verdict"] == "unverified" and _readings(check) == [(1, "unverified", None)]
    assert check["readings"][0]["reason"] == "vision-call-failed:RuntimeError"


def test_a_misreading_stands_when_the_second_call_failed(tmp_path, fake) -> None:
    provider = fake(reads=(["IO"], RuntimeError("vision down")))
    with pytest.raises(SystemExit, match=r"mood image reads \['IO'\], not"):
        _run(tmp_path)
    assert len(provider.requests) == 1  # refused as one misreading was before: the lettering was not bought
    check = _report(tmp_path)["text_check"]["mood"]
    assert check["verdict"] == "mismatch" and check["read"] == ["IO"]
    assert _readings(check) == [(1, "mismatch", ["IO"]), (2, "unverified", None)]
    assert check["readings"][1]["reason"] == "vision-call-failed:RuntimeError"


def test_the_report_names_the_reader_model_and_effort_of_every_reading(tmp_path, fake) -> None:
    fake(reads=(["I0N"], ["ION"], ["ION"]))
    assert _run(tmp_path) == 0
    report = _report(tmp_path)
    checks = [c for c in report["calls"] if c["step"].endswith("-check")]
    assert [(c["step"], c["reading"], c["model"], c["effort"]) for c in checks] == [
        ("mood-check", 1, "fake-vision", "fake-effort"), ("mood-check", 2, "fake-vision", "fake-effort"),
        ("logo-check", 1, "fake-vision", "fake-effort")]
    for step in ("mood", "logo"):
        assert report["text_check"][step]["model"] == "fake-vision"
        assert report["text_check"][step]["effort"] == "fake-effort"
    assert "effort" not in report["calls"][0]  # an image call names no reading effort


def test_subtitle_and_language_reach_the_prompts_and_the_check(tmp_path, fake) -> None:
    provider = fake(reads=(["ION", "Chapter One"], ["ION", "CHAPTER ONE"]))
    assert _run(tmp_path, subtitle="Chapter One", language="Korean") == 0
    for request in provider.requests:
        assert '"Chapter One"' in request.prompt and "Korean" in request.prompt
    report = _report(tmp_path)
    assert report["subtitle"] == "Chapter One" and report["language"] == "Korean"


def test_a_dropped_subtitle_is_a_mismatch(tmp_path, fake) -> None:
    fake(reads=(["ION", "Chapter One"], ["ION"], ["ION"]))
    with pytest.raises(SystemExit, match="logo reads"):
        _run(tmp_path, subtitle="Chapter One")


def test_a_vowel_sign_the_model_dropped_is_refused_at_either_check(tmp_path, fake) -> None:
    asked, read = "\u0915\u093f\u0932\u093e", "\u0915\u0932\u093e"  # किला read as कला: the vowel sign ि dropped
    provider = fake(reads=([read], [read]))
    with pytest.raises(SystemExit, match="mood image"):
        _run(tmp_path, text=asked, language="Hindi")
    assert len(provider.requests) == 1  # the lettering was not bought
    assert _report(tmp_path)["text_check"]["mood"]["verdict"] == "mismatch"
    fake(reads=([asked], [read], [read]))
    with pytest.raises(SystemExit, match="logo reads"):
        _run(tmp_path, text=asked, language="Hindi")
    out = tmp_path / "logo"
    assert not (out / "logo.png").exists() and (out / "logo.rejected.png").is_file()
    assert _report(tmp_path)["text_check"]["logo"]["verdict"] == "mismatch"


def test_a_given_mood_image_skips_the_first_generation(tmp_path, fake) -> None:
    provider = fake(reads=(["ION"], ["ION"]))
    given = tmp_path / "title.png"
    _scene().save(given)
    assert _run(tmp_path, mood=given) == 0
    assert len(provider.requests) == 1 and provider.requests[0].refs
    report = _report(tmp_path)
    assert report["steps"]["mood"]["source"] == "given"
    assert [c["step"] for c in report["calls"]] == ["mood-check", "lettering", "logo-check"]


def test_the_key_is_chosen_from_the_title_box_the_mood_check_reads(tmp_path, fake) -> None:
    mood = _scene((40, 200, 60))  # a forest ...
    for x in range(120, 200):
        for y in range(60, 100):
            mood.putpixel((x, y), (230, 60, 210))  # ... with a pink title in it
    provider = fake(mood=mood)

    def answer(path, workdir, prompt, *, label=""):
        provider.looked.append((Path(path), "RGB"))
        if len(provider.looked) == 1:  # the mood check: it is asked for the title's box
            assert '"box"' in prompt
            return json.dumps({"lines": ["ION"], "box": [0.375, 0.333, 0.625, 0.555]}), {"auth_source": "codex-login"}
        assert '"box"' not in prompt
        return json.dumps({"lines": ["ION"]}), {"auth_source": "codex-login"}

    provider.inspect_image = answer
    assert _run(tmp_path) == 0
    report = _report(tmp_path)
    assert report["text_check"]["mood"]["box"] == [0.375, 0.333, 0.625, 0.555]
    assert report["steps"]["key"]["region"] == "lettering-box" and report["steps"]["key"]["key"] == "green"
    assert "#00FF00" in provider.requests[1].prompt


def test_a_lettering_image_is_cut_again_without_generating(tmp_path, fake) -> None:
    provider = fake(reads=(["ION"],))
    out = tmp_path / "logo"
    out.mkdir()
    lettering(key=GREEN_PAINTED, fill=(255, 214, 40), glow=(255, 120, 20), glow_strength=0.7).image.save(
        out / "lettering.png")
    assert _run(tmp_path, lettering=out / "lettering.png") == 0  # in place: the input is not cleared first
    assert provider.requests == [] and len(provider.looked) == 1
    report = _report(tmp_path)
    assert report["steps"]["lettering"]["source"] == "given" and report["steps"]["mood"]["source"] == "none"
    assert report["steps"]["key"] == {"key": "green", "source": "border"}
    assert [c["step"] for c in report["calls"]] == ["logo-check"]
    assert (out / "logo.png").is_file()


def _ran(tmp_path: Path, **overrides) -> str:
    """`logo` 한 번 — 끝난 모양을 한 줄로(rc, 아니면 멈춘 까닭)."""
    try:
        return f"rc={_run(tmp_path, **overrides)}"
    except (SystemExit, OSError) as stopped:
        return f"{type(stopped).__name__}: {stopped}"


def test_a_given_lettering_spelt_in_capitals_is_its_own_file_and_is_cut_again(tmp_path, fake) -> None:
    """In place again, by another spelling of the same file (a volume that ignores case): the input is the run's
    own `lettering.png`, kept and cut again, not removed as an earlier run's result."""
    fake(reads=(["ION"],))
    out = tmp_path / "logo"
    out.mkdir()
    lettering(key=GREEN_PAINTED, fill=(255, 214, 40), glow=(255, 120, 20), glow_strength=0.7).image.save(out / "lettering.png")
    if not (out / "LETTERING.png").exists():
        pytest.skip("대소문자를 가리는 볼륨 — 철자가 다르면 다른 파일이다")
    said = _ran(tmp_path, lettering=out / "LETTERING.png")
    assert said == "rc=0", f"제 lettering.png 를 다른 철자로 받은 입력을 지웠다 ({said})"
    assert (out / "logo.png").is_file()


def test_a_mood_image_in_a_folder_of_the_old_working_name_is_never_touched(tmp_path, fake) -> None:
    fake(reads=(["ION"], ["ION"]))
    given = tmp_path / "logo" / ".logo-work" / "title.png"
    given.parent.mkdir(parents=True)
    _scene().save(given)
    read = hashlib.sha256(given.read_bytes()).hexdigest()
    said = _ran(tmp_path, mood=given)
    assert given.is_file() and hashlib.sha256(given.read_bytes()).hexdigest() == read, f"out 안 .logo-work 의 --mood 를 지웠다 ({said})"
    assert said == "rc=0", said
    left = sorted(p.name for p in (tmp_path / "logo").iterdir() if p.name.startswith("."))
    assert left == [".logo-work"], f"이 실행의 작업 폴더가 남았다: {left}"


@pytest.mark.parametrize(("flag", "place", "why"), [
    ("lettering", "logo.png", r"--lettering and logo\.png in --out-dir are the same file"),
    ("lettering", "logo.preview.png", r"--lettering and logo\.preview\.png in --out-dir are the same file"),
    ("mood", "lettering.png", r"--mood and lettering\.png in --out-dir are the same file"),
    ("mood", "logo.report.json", r"--mood and logo\.report\.json in --out-dir are the same file"),
])
def test_a_picture_given_as_a_file_the_run_writes_is_refused_before_anything_is_made(tmp_path, fake, flag, place, why) -> None:
    """Only `mood.png` for `--mood` and `lettering.png` for `--lettering` take back a picture the run made; any other
    file the run removes or writes would replace the picture it was given."""
    fake(reads=(["ION"], ["ION"]))
    out = tmp_path / "logo"
    out.mkdir()
    picture = (lettering(key=GREEN_PAINTED).image if flag == "lettering" else _scene())
    picture.save(out / place, format="PNG")
    read, before = hashlib.sha256((out / place).read_bytes()).hexdigest(), sorted(p.name for p in out.iterdir())
    said = _ran(tmp_path, **{flag: out / place})
    assert hashlib.sha256((out / place).read_bytes()).hexdigest() == read, f"--{flag} 로 받은 {place} 를 덮어썼다 ({said})"
    assert re.search(why, said), f"출력 파일인 입력을 거절하지 않았다 ({said})"
    assert sorted(p.name for p in out.iterdir()) == before, f"거절했는데 무엇이 생겼다 ({said})"


def test_a_mood_image_full_of_magenta_moves_the_lettering_to_the_green_key(tmp_path, fake) -> None:
    provider = fake(mood=_scene((220, 50, 200)))
    assert _run(tmp_path) == 0
    assert "#00FF00" in provider.requests[1].prompt and "#FF00FF" not in provider.requests[1].prompt
    report = _report(tmp_path)
    assert report["steps"]["matte"]["key"] == "green"
    assert report["steps"]["key"]["source"] == "auto" and report["steps"]["key"]["key"] == "green"


def test_an_explicit_key_is_kept(tmp_path, fake) -> None:
    provider = fake(mood=_scene((220, 50, 200)))
    assert _run(tmp_path, chroma_key="magenta") == 0
    assert "#FF00FF" in provider.requests[1].prompt
    assert _report(tmp_path)["steps"]["key"]["source"] == "explicit"


# A key in the title's own hue turns those letters see-through (docs/logo.md, which key): patchwork letters in pink and
# plum (magenta's hue) with mint patches (green's) leave neither key, and a see-through inside the letters is refused.
QUILT_STYLE = "patchwork pixel letters of pastel fabric patches (pink, mint, butter yellow, sky blue), a plum outline"


def test_a_title_in_both_keys_hues_is_refused_before_the_lettering_is_bought(tmp_path, fake) -> None:
    provider = fake(mood=quilt(key=(30, 40, 90))[0])
    with pytest.raises(SystemExit, match="both keys' hues") as refusal:
        _run(tmp_path, style=QUILT_STYLE)
    assert "--chroma-key" in str(refusal.value) and "mint" in str(refusal.value)
    assert len(provider.requests) == 1  # the mood image only: the lettering was not bought
    assert not (tmp_path / "logo" / "lettering.png").exists()
    report = _report(tmp_path)
    assert report["status"] == "refused" and report["refused_at"] == "key"
    key = report["steps"]["key"]
    assert key["key"] is None and key["source"] == "auto"
    assert key["scores"]["green"]["clashes"] and key["scores"]["magenta"]["clashes"]
    assert key["scores"]["green"]["named"] == ["mint"] and key["scores"]["magenta"]["named"] == ["pink", "plum"]


def test_a_key_named_in_the_titles_hue_is_kept_and_said(tmp_path, fake, capsys) -> None:
    provider = fake(mood=quilt(key=(30, 40, 90))[0])
    assert _run(tmp_path, style=QUILT_STYLE, chroma_key="magenta") == 0
    assert "#FF00FF" in provider.requests[1].prompt
    report = _report(tmp_path)
    assert report["steps"]["key"]["key"] == "magenta" and report["steps"]["key"]["source"] == "explicit"
    assert any("magenta key named is one of the title's colours" in warning for warning in report["warnings"])
    assert "see-through" in capsys.readouterr().err


def test_see_through_inside_the_letters_is_refused_and_kept_aside(tmp_path, fake) -> None:
    provider = fake(reads=(["ION"],))
    out = tmp_path / "logo"
    out.mkdir()
    quilt()[0].save(out / "lettering.png")  # on green: the mint patches are cut see-through
    with pytest.raises(SystemExit, match="see-through inside") as refusal:
        _run(tmp_path, lettering=out / "lettering.png")
    assert "--chroma-key magenta" in str(refusal.value)
    assert provider.looked == []  # refused before the text check
    assert not (out / "logo.png").exists() and (out / "logo.rejected.png").is_file()
    assert (out / "logo.preview.png").is_file()
    report = _report(tmp_path)
    assert report["status"] == "refused" and report["refused_at"] == "matte"
    inside = report["logo"]["see_through_inside"]
    assert inside["pct_of_visible"] >= logo_matte.INSIDE_MAX_PCT and inside["wide"]


@pytest.mark.parametrize("holes", [(), ((96, 156, 9),)], ids=["no-hole", "key-island"])
def test_a_hole_cut_in_a_see_through_patch_does_not_let_it_through(tmp_path, fake, holes) -> None:
    # the end validator's counterexample: a navy letter on green with a mint patch walled in it, with or without a 9x9
    # square of the key in the patch's middle; the square is cut to nothing and opens no way out of the letter
    provider = fake(reads=(["I"],))
    out = tmp_path / "logo"
    out.mkdir()
    walled_patch(holes=holes).save(out / "lettering.png")
    with pytest.raises(SystemExit, match="see-through inside"):
        _run(tmp_path, text="I", lettering=out / "lettering.png")
    assert provider.looked == []  # refused before the text check
    assert not (out / "logo.png").exists() and (out / "logo.rejected.png").is_file()
    report = _report(tmp_path)
    assert report["status"] == "refused" and report["refused_at"] == "matte"
    inside = report["logo"]["see_through_inside"]
    assert inside["wide"] and inside["glow_reach_px"] == logo_matte.INSIDE_EDGE_PX


def test_a_glowing_title_is_not_see_through_inside(tmp_path, fake) -> None:
    fake()
    assert _run(tmp_path) == 0
    report = _report(tmp_path)
    assert report["status"] == "ok" and not report["logo"]["see_through_inside"]["wide"]


def test_no_font_is_ever_drawn(tmp_path, fake, monkeypatch) -> None:
    from PIL import ImageDraw, ImageFont

    def forbidden(*_args, **_kwargs):
        raise AssertionError("a font was drawn")

    for name in ("truetype", "load_default", "load"):
        monkeypatch.setattr(ImageFont, name, forbidden)
    monkeypatch.setattr(ImageDraw.ImageDraw, "text", forbidden)
    fake()
    assert _run(tmp_path) == 0


def test_a_failed_lettering_generation_publishes_nothing_in_its_place(tmp_path, fake) -> None:
    provider = fake()

    def broken(request, workdir):
        if request.refs:
            raise SystemExit("fake-gen: the provider refused")
        return FakeProvider.generate(provider, request, workdir)

    provider.generate = broken
    with pytest.raises(SystemExit, match="refused"):
        _run(tmp_path)
    out = tmp_path / "logo"
    assert not (out / "logo.png").exists() and not (out / "lettering.png").exists()


def test_a_painted_checkerboard_is_refused(tmp_path, fake) -> None:
    board = Image.new("RGB", (320, 160))
    for y in range(160):
        for x in range(320):
            board.putpixel((x, y), (204, 204, 204) if (x // 16 + y // 16) % 2 else (255, 255, 255))
    fake(letters=board)
    with pytest.raises(SystemExit, match="checkerboard"):
        _run(tmp_path)
    assert not (tmp_path / "logo" / "logo.png").exists()


def test_the_report_names_a_per_call_route(tmp_path, fake) -> None:
    fake(auth="codex-api-key")
    assert _run(tmp_path) == 0
    assert {c["route"] for c in _report(tmp_path)["calls"]} == {"per-call"}


def test_an_answer_names_its_lines_and_may_name_a_box() -> None:
    assert logo.parse_answer('```json\n{"lines": ["ION"], "box": [0.1, 0.2, 0.9, 0.6]}\n```') == (["ION"], [0.1, 0.2, 0.9, 0.6])
    assert logo.parse_answer('{"lines": ["ION"], "box": [0.9, 0.2, 0.1, 0.6]}') == (["ION"], None)
    assert logo.parse_answer('{"lines": "ION"}') == (None, None)
    assert logo.parse_answer("ION") == (None, None)


@pytest.mark.parametrize("asked, read, same", [
    ("Hero's Quest", ["HERO’S", "QUEST!"], True),
    ("ION", ["I O N"], True),
    ("ION", ["I0N"], False),
    ("ION", ["IONS"], False),
    ("별빛 기사", ["별빛", "기사"], True),
    ("별빛 기사", ["별빛 기시"], False),
])
def test_the_text_is_compared_letter_for_letter(asked, read, same) -> None:
    check = logo.compare_text(read, asked, None)
    assert (check["verdict"] == "match") is same


# What a script spells is its letters and the marks written on them. The strings are synthetic, escaped where a
# code point matters; each id names what the reading dropped, changed or only wrote another way.
@pytest.mark.parametrize("asked, read, same", [
    pytest.param("\u0915\u093f\u0932\u093e", ["\u0915\u0932\u093e"], False, id="devanagari-vowel-sign-dropped"),
    pytest.param("\u0915\u094d\u0937", ["\u0915\u0937"], False, id="devanagari-virama-dropped"),
    pytest.param("\u095b\u092e\u0940\u0928", ["\u091c\u092e\u0940\u0928"], False, id="devanagari-nukta-dropped"),
    pytest.param("\u0e44\u0e01\u0e48", ["\u0e44\u0e01"], False, id="thai-tone-mark-dropped"),
    pytest.param("\u0639\u064e\u0644\u064e\u0645", ["\u0639\u0650\u0644\u0652\u0645"], False,
                 id="arabic-vowel-marks-changed"),
    pytest.param("O\u0323\u0300sun", ["O\u0323sun"], False, id="latin-accent-with-no-precomposed-letter-dropped"),
    pytest.param("Caf\u00e9", ["CAFE"], False, id="latin-accent-dropped"),
    pytest.param("Caf\u00e9", ["CAFE\u0301"], True, id="latin-accent-precomposed-or-combining"),
    pytest.param(unicodedata.normalize("NFD", "별빛 기사"), ["별빛 기사"], True, id="hangul-jamo-or-syllables"),
    pytest.param("ドラゴン", ["ﾄﾞﾗｺﾞﾝ"], True, id="half-width-katakana"),
    pytest.param("QUEST \u2163", ["Quest IV"], True, id="roman-numeral-form"),
    pytest.param("I \u2764\ufe0f NY", ["I \u2764 NY"], True, id="variation-selector-on-a-symbol"),
    pytest.param("1\ufe0f\u20e3UP", ["1UP"], True, id="keycap-enclosing-mark"),
    pytest.param("\u0915\u094d\u200d\u0937", ["\u0915\u094d\u0937"], True, id="zero-width-joiner"),
])
def test_marks_written_on_a_letter_are_its_spelling(asked, read, same) -> None:
    assert (logo.compare_text(read, asked, None)["verdict"] == "match") is same


def test_the_subtitle_may_be_read_before_or_after_the_title() -> None:
    assert logo.compare_text(["Chapter One", "ION"], "ION", "Chapter One")["verdict"] == "match"


def test_the_cli_lists_the_verb() -> None:
    from sprite_gen import cli

    assert "logo" in cli.COMMANDS
    parser = cli._build_parser()
    args = parser.parse_args(["logo", "--text", "ION", "--out-dir", "x"])
    assert args.command == "logo" and args.composition == "title-screen" and args.chroma_key == "auto"
