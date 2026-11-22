# SPDX-License-Identifier: Apache-2.0
"""A key given both in a file and as a flag is one answer, `gen.base.flags_over_spec`: the flag wins,
and one stderr line names every flag the file also set. `pixel-draw --spec` refused the pair, and
`prepare --request` let the flag win for some keys and the request for others (`--style`,
`--cell-size`, `--safe-margin`), in silence either way; both now ask it."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import pytest

from sprite_gen import cli
from sprite_gen.gen import pixel_draw, prepare
from sprite_gen.gen.base import flags_over_spec


def test_the_flag_wins_and_one_line_names_every_flag_the_file_set(capsys):
    spec = {"size": 16, "kind": "icon", "cell": {"width": 128, "height": 96}}
    merged = flags_over_spec(spec, {"size": 24, "walk_cycle": True, "cell.width": 64, "fit.resample": "nearest"},
                             verb="pixel-draw", source="--spec", spelled={"cell.width": "--cell-width"})
    assert merged == {"size": 24, "kind": "icon", "walk_cycle": True, "cell": {"width": 64, "height": 96},
                      "fit": {"resample": "nearest"}}
    assert spec == {"size": 16, "kind": "icon", "cell": {"width": 128, "height": 96}}  # the file's own dict is left as it was
    assert capsys.readouterr().err == "[pixel-draw] --size, --cell-width given both as a flag and in --spec: the flag wins\n"


def test_no_key_given_both_ways_says_nothing(capsys):
    assert flags_over_spec({"size": 16}, {"kind": "tile"}, verb="pixel-draw", source="--spec") == {"size": 16, "kind": "tile"}
    assert capsys.readouterr().err == ""


# --- pixel-draw --spec --------------------------------------------------------------------------------


def _pixel_args(*argv: str) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    pixel_draw.add_arguments(parser)
    return parser.parse_args(["--out-dir", "unused", *argv])


def test_a_pixel_draw_flag_wins_over_its_spec_and_says_so(tmp_path, capsys):
    spec = tmp_path / "spec.json"
    spec.write_text(json.dumps({"subject": "a slime", "size": 16, "kind": "icon"}), encoding="utf-8")
    request = pixel_draw.resolve_request(_pixel_args("--spec", str(spec), "--size", "24", "--kind", "icon"))
    assert (request.subject, request.size, request.kind) == ("a slime", 24, "icon")
    assert capsys.readouterr().err == "[pixel-draw] --size, --kind given both as a flag and in --spec: the flag wins\n"


# --- prepare --request ---------------------------------------------------------------------------------


def _prepare(tmp_path: Path, request: dict, **flags) -> dict:
    out = tmp_path / "run"
    assert prepare.run(out_dir=out, character_id="hero", request_json=json.dumps(request), **flags) == 0
    return json.loads((out / "sprite-request.json").read_text(encoding="utf-8"))


STATES = {"idle": {"frames": 4, "fps": 8, "loop": True, "action": "breathing"}}


@pytest.mark.parametrize(("request_keys", "flags", "check", "named"), [
    ({"style": "ink wash"}, {"style": "flat pixel"}, lambda r: r["style"] == "flat pixel", "--style"),
    ({"cell": {"size": 128, "safe_margin": 10}}, {"safe_margin": 5},
     lambda r: (r["cell"]["safe_margin_x"], r["cell"]["safe_margin_y"]) == (5, 5), "--safe-margin"),
    ({"cell": {"size": 128}}, {"cell_size": 64}, lambda r: (r["cell"]["width"], r["cell"]["height"]) == (64, 64),
     "--cell-size"),
    ({"cell": {"size": 128}}, {"cell_width": 96}, lambda r: (r["cell"]["width"], r["cell"]["height"]) == (96, 128),
     "--cell-width"),
    ({"fit": {"resample": "lanczos"}}, {"fit_resample": "nearest"}, lambda r: r["fit"] == {"resample": "nearest"},
     "--fit-resample"),
    ({"subject": "effect"}, {"subject": "character"}, lambda r: r["subject"] == "character", "--subject"),
], ids=["style", "safe-margin", "cell-size", "cell-width", "fit", "subject"])
def test_a_prepare_flag_wins_over_its_request_and_says_so(tmp_path, capsys, request_keys, flags, check, named):
    """`--style`, `--cell-size` and `--safe-margin` lost to the request before; the others won in silence."""
    emitted = _prepare(tmp_path, {"states": STATES, **request_keys}, **flags)
    assert check(emitted)
    assert f"[prepare] {named} given both as a flag and in --request-json: the flag wins" in capsys.readouterr().err


def test_a_request_alone_or_a_flag_alone_says_nothing_and_keeps_its_value(tmp_path, capsys):
    emitted = _prepare(tmp_path, {"states": STATES, "style": "ink wash", "cell": {"size": 128}}, fit_resample="nearest")
    assert emitted["style"] == "ink wash" and emitted["cell"]["width"] == 128 and emitted["fit"] == {"resample": "nearest"}
    assert "given both" not in capsys.readouterr().err


def _sprite_gen_prepare(tmp_path: Path, request: dict, *flags: str) -> dict:
    out = tmp_path / "run"
    assert cli.main(["prepare", "--out-dir", str(out), "--character-id", "hero",
                     "--request-json", json.dumps(request), *flags]) == 0
    return json.loads((out / "sprite-request.json").read_text(encoding="utf-8"))


def test_sprite_gen_prepare_keeps_a_request_it_was_given_no_flag_for(tmp_path, capsys):
    """`sprite-gen prepare` declared its own --style and --cell-size with defaults, so a request's style
    was replaced by the default sentence under a note naming flags nobody gave."""
    emitted = _sprite_gen_prepare(tmp_path, {"states": STATES, "style": "ink wash", "cell": {"size": 128}})
    assert emitted["style"] == "ink wash" and emitted["cell"]["width"] == 128
    assert "given both" not in capsys.readouterr().err


def test_sprite_gen_prepare_lets_a_given_flag_win_and_says_so(tmp_path, capsys):
    emitted = _sprite_gen_prepare(tmp_path, {"states": STATES, "style": "ink wash"}, "--style", "flat pixel")
    assert emitted["style"] == "flat pixel"
    assert "[prepare] --style given both as a flag and in --request-json: the flag wins" in capsys.readouterr().err


def test_sprite_gen_prepare_takes_every_option_prepare_declares():
    """One declaration: the subcommand had lost --directions and --mirror."""
    def options(parser: argparse.ArgumentParser) -> set[str]:
        return {o for action in parser._actions for o in action.option_strings}

    sub = next(a for a in cli._build_parser()._actions if isinstance(a, argparse._SubParsersAction))
    assert options(sub.choices["prepare"]) == options(prepare._build_parser())


def test_a_request_subject_is_carried_and_no_note_says_it_was_dropped(tmp_path, capsys):
    """prepare reads `subject` off the request; its note listed it among the keys it drops."""
    emitted = _prepare(tmp_path, {"states": STATES, "subject": "effect"})
    assert emitted["subject"] == "effect"
    assert "subject" not in capsys.readouterr().err


def test_both_verbs_ask_the_one_function(monkeypatch, tmp_path):
    seen = []

    def spy(spec, flags, **kwargs):
        seen.append((kwargs["verb"], kwargs["source"]))
        return flags_over_spec(spec, flags, **kwargs)

    monkeypatch.setattr(pixel_draw, "flags_over_spec", spy)
    monkeypatch.setattr(prepare, "flags_over_spec", spy)
    spec = tmp_path / "spec.json"
    spec.write_text(json.dumps({"subject": "a slime"}), encoding="utf-8")
    pixel_draw.resolve_request(_pixel_args("--spec", str(spec)))
    _prepare(tmp_path, {"states": STATES})
    assert seen == [("pixel-draw", "--spec"), ("prepare", "--request-json")]
