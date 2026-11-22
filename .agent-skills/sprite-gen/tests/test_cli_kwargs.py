# SPDX-License-Identifier: Apache-2.0
"""A verb's `run(**kwargs)` reads its keyword arguments through one function,
`sprite_gen.util.cli_kwargs.namespace_from_kwargs`: a flag left out takes the parser's default, a
required one left out or a keyword the parser does not know is a TypeError naming it. Every verb whose
`run` takes the flags of its parser calls it, with that parser — a second copy of the reading, or a
reading that drops the required check, is what this file catches."""
from __future__ import annotations

import argparse
import ast
import importlib
from pathlib import Path

import pytest

from sprite_gen.util.cli_kwargs import namespace_from_kwargs

ROOT = Path(__file__).resolve().parents[1]


def parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("--names", nargs="*")
    parser.add_argument("--hidden", default=argparse.SUPPRESS)
    parser.add_argument("--ref", action="append", default=[])
    parser.add_argument("--size", type=int, default=7)
    return parser


def test_a_flag_left_out_takes_the_parsers_default():
    args = namespace_from_kwargs(parser(), {"out": "x"})
    assert vars(args) == {"out": "x", "names": [], "hidden": None, "ref": [], "size": 7}


def test_a_required_flag_left_out_and_an_unknown_keyword_are_type_errors():
    with pytest.raises(TypeError, match="missing required argument: out"):
        namespace_from_kwargs(parser(), {"size": 3})
    with pytest.raises(TypeError, match=r"unexpected keyword argument\(s\): colour, shade"):
        namespace_from_kwargs(parser(), {"out": "x", "shade": 1, "colour": 2})


# (module, run function, the parser it reads its keywords by)
VERBS = [
    ("sprite_gen.compose.compose_atlas", "run", "_build_parser"),
    ("sprite_gen.compose.compose_cycle", "run", "_build_parser"),
    ("sprite_gen.compose.compose_gif", "run", "_build_parser"),
    ("sprite_gen.compose.export_pngs", "run", "_build_parser"),
    ("sprite_gen.frames.check_visible_magenta", "run", "_build_parser"),
    ("sprite_gen.frames.extract", "run", "_build_parser"),
    ("sprite_gen.frames.unpack_atlas", "run", "_build_parser"),
    ("sprite_gen.gen", "run", "_build_parser"),
    ("sprite_gen.gen.prepare", "run", "_build_parser"),
    ("sprite_gen.gen.video", "run", "_build_parser"),
    ("sprite_gen.gen.video", "run_extend", "_build_extend_parser"),
    ("sprite_gen.gen.video", "run_edit", "_build_edit_parser"),
    ("sprite_gen.gen.video", "run_resume", "_build_resume_parser"),
    ("sprite_gen.gen.pixel_draw", "run", None),
    ("sprite_gen.qa.correction_loop", "run", "_build_parser"),
    ("sprite_gen.qa.inspect", "run", "_build_parser"),
    ("sprite_gen.qa.motion", "run", None),
    ("sprite_gen.qa.preview", "run", "_build_parser"),
    ("sprite_gen.qa.score", "run", "_build_parser"),
]


class Asked(Exception):
    pass


@pytest.mark.parametrize(("module", "run", "build"), VERBS, ids=[f"{m.rsplit('.', 1)[-1]}.{r}" for m, r, _ in VERBS])
def test_every_verb_reads_its_keywords_through_it(monkeypatch, module, run, build):
    mod = importlib.import_module(module)
    seen = []

    def spy(parser, kwargs):
        seen.append((parser, dict(kwargs)))
        raise Asked

    monkeypatch.setattr(mod, "namespace_from_kwargs", spy)
    with pytest.raises(Asked):
        getattr(mod, run)(some_flag=1)
    ((asked_parser, kwargs),) = seen
    assert kwargs == {"some_flag": 1}
    wanted = getattr(mod, build)() if build else None
    if wanted is not None:
        assert [a.dest for a in asked_parser._actions] == [a.dest for a in wanted._actions]


def test_inspect_run_reads_its_keywords_through_it(monkeypatch, tmp_path):
    from sprite_gen.qa import inspect

    seen = []

    def spy(parser, kwargs):
        seen.append(dict(kwargs))
        raise Asked

    monkeypatch.setattr(inspect, "namespace_from_kwargs", spy)
    with pytest.raises(Asked):
        inspect._inspect_run_impl(tmp_path, states="idle")
    assert seen == [{"run_dir": tmp_path, "states": "idle", "no_write": True}]


@pytest.mark.parametrize(("module", "run", "required"), [
    ("sprite_gen.gen", "run", "out"),
    ("sprite_gen.gen.video", "run", "out"),
    ("sprite_gen.gen.pixel_draw", "run", "out_dir"),
    ("sprite_gen.qa.motion", "run", "source"),
])
def test_a_verb_called_without_a_required_flag_names_it(module, run, required):
    """These four read their keywords by hand before: a required flag left out went on as None."""
    with pytest.raises(TypeError, match=f"missing required argument: {required}"):
        getattr(importlib.import_module(module), run)()


def test_no_function_reads_a_parsers_actions_but_these():
    """`parser._actions` read anywhere else in the engine is a second reading of keyword arguments,
    the copy this file exists to keep out. `extract._nondefault_args` asks another question of its
    parser: which flags a run set off their defaults, for the manifest. `capabilities._parser` asks
    what each verb's parser declares, for a machine to read (docs/capabilities.md)."""
    readers = set()
    for path in sorted((ROOT / "sprite_gen").rglob("*.py")):
        for function in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            if isinstance(function, (ast.FunctionDef, ast.AsyncFunctionDef)) and any(
                    isinstance(node, ast.Attribute) and node.attr == "_actions" for node in ast.walk(function)):
                readers.add((path.relative_to(ROOT).as_posix(), function.name))
    assert readers == {("sprite_gen/util/cli_kwargs.py", "namespace_from_kwargs"),
                       ("sprite_gen/frames/extract.py", "_nondefault_args"),
                       ("sprite_gen/workflow/capabilities.py", "_parser")}
