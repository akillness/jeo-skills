# SPDX-License-Identifier: Apache-2.0
"""`sprite-gen unpack-atlas` 가 입력을 지키는 계약 — 런 폴더를 만들고 `--force` 로 덮어쓰는 길.

지키는 것 (구현이 아니라 계약):
  1. 입력(`--pngs-dir` 폴더, `--atlas`·`--manifest` 와 그 폴더의 다른 파일)은 한 바이트도 바뀌지 않는다 —
     입력이 옛 임시 폴더 이름(`.<out>.sg-staging`)에 있어도, 링크로 그 이름에 걸려 있어도
  2. 지우는 것은 이 실행이 만든 것과 `--force` 가 갈아 끼우는 런 폴더의 옛 내용뿐이다 — out 옆에 남이 둔
     `.<out>.sg-staging` 은 그대로 남는다
  3. 입력과 out 이 같거나 한쪽이 다른 쪽 안에 들면 `--force` 여도 아무것도 만들기 전에 거절한다 — 실경로와
     폴더 동일성 기준이라 링크로 돌아 들어와도, 대소문자만 다른 철자여도 같은 폴더로 읽는다. 매니페스트가
     가리키는 아틀라스도, `--pngs-dir` 안에서 찾아 읽는 것(칸 PNG, 그룹 폴더, `_base`, `_refs`, meta.json)도
     입력이다 — 그것이 링크로 out 이나 그 하위 폴더에 닿아도, 링크의 링크로 닿아도
  4. 내놓다가 못 끝내면 옛 런은 한 바이트도 바뀌지 않고, 이 실행의 임시 폴더만 치운다
  5. out 이 빈 폴더로 가는 링크면 링크가 가리키는 자리에 내놓고 링크는 그대로 둔다
  6. 내놓은 런은 런 폴더의 이름을 단다 — 캐릭터 id 와 매니페스트의 run_dir 은 임시 폴더가 아니라 런 폴더다
  7. 입력 경로가 지나는 것도 입력이다 — 운영체제처럼 한 칸씩 따라가며 찾아보는 항목(링크, 뒤의 `..` 로 다시
     나오는 폴더)이 out 안에 있으면 `--force` 여도 만들기 전에 그 항목을 대며 거절한다. 거절하지 않은 실행은 어떤
     입력 경로도 끊거나 바꾸지 않고 런 폴더 밖을 건드리지 않는다. 고리 링크는 문구로 거절하고, 락 이름 자리의
     링크는 따라가지 않고 거절한다
"""

from __future__ import annotations

import json
import os
import pathlib
import re
import time
from pathlib import Path
from typing import NamedTuple

import pytest
from PIL import Image

FRAMES = ["1-a.png", "2-b.png"]
NOTE = b"source notes, not a frame\n"
CELL = 8
RWLOCK = ".run.sg-rwlock"   # 런 폴더 옆 읽기·쓰기 락(runio.publish_guard) — 런 폴더의 영구 동반 파일이다


def _cell(i: int) -> Image.Image:
    return Image.new("RGBA", (CELL, CELL), (40 + 90 * i, 80, 160, 255))


def _pngs(folder: Path, given: Path | None = None) -> list[str]:
    """PNG 둘과 PNG 가 아닌 파일 하나가 든 입력 폴더 — `--pngs-dir` 인자."""
    folder.mkdir(parents=True, exist_ok=True)
    for i, name in enumerate(FRAMES):
        _cell(i).save(folder / name)
    (folder / "notes.txt").write_bytes(NOTE)
    return ["--pngs-dir", str(given or folder)]


def _sheet(folder: Path, given: Path | None = None) -> list[str]:
    """두 칸 아틀라스와 PNG 가 아닌 파일 하나가 든 폴더 — `--atlas … --grid 2x1` 인자."""
    folder.mkdir(parents=True, exist_ok=True)
    sheet = Image.new("RGBA", (2 * CELL, CELL), (0, 0, 0, 0))
    for i in range(2):
        sheet.paste(_cell(i), (i * CELL, 0))
    sheet.save(folder / "sheet.png")
    (folder / "notes.txt").write_bytes(NOTE)
    return ["--atlas", str((given or folder) / "sheet.png"), "--grid", "2x1"]


def _manifest(path: Path, atlas: str) -> list[str]:
    rects = [{"x": i * CELL, "y": 0, "w": CELL, "h": CELL} for i in range(2)]
    path.write_text(json.dumps({"cell": {"width": CELL, "height": CELL}, "game_input": atlas,
                                "frame_layout": {"rows": {"idle": rects}}}), encoding="utf-8")
    return ["--manifest", str(path)]


SOURCES = {"pngs": _pngs, "atlas": _sheet}


def _tree(folder: Path) -> dict[str, object]:
    """폴더 안 모든 것 — 상대 경로 → 파일 바이트 · "dir" · 링크 대상. 링크 안으로는 들어가지 않는다."""
    got: dict[str, object] = {}
    for root, dirs, files in os.walk(folder):
        for name in dirs + files:
            path = Path(root) / name
            got[path.relative_to(folder).as_posix()] = (f"link:{os.readlink(path)}" if path.is_symlink()
                                                        else "dir" if path.is_dir() else path.read_bytes())
    return got


def _names(folder: Path) -> list[str]:
    return sorted(p.name for p in folder.iterdir())


def _unpack(*argv: str) -> int:
    from sprite_gen import cli

    return cli.main(["unpack-atlas", *argv])


def _published(run: Path) -> None:
    assert (run / "sprite-request.json").is_file() and (run / "unpack-source.json").is_file()
    assert sorted(p.name for p in (run / "frames").rglob("frame-*.png")) == ["frame-0.png", "frame-1.png"]


# ── 1·2. 입력과 남의 폴더는 그대로 ──────────────────────────────────

@pytest.mark.parametrize("kind", SOURCES)
def test_a_source_kept_under_the_old_staging_name_is_kept(tmp_path, kind) -> None:
    src = tmp_path / ".run.sg-staging"
    argv = SOURCES[kind](src)
    before = _tree(src)
    assert _unpack(*argv, "--out-dir", str(tmp_path / "run")) == 0
    assert _tree(src) == before, "입력 폴더(입력과 그 옆 파일)가 바뀌었다"
    _published(tmp_path / "run")
    assert _names(tmp_path) == sorted([".run.sg-staging", RWLOCK, "run"]), "이 실행의 임시 폴더가 남았다"


@pytest.mark.parametrize("kind", SOURCES)
def test_a_source_linked_under_the_old_staging_name_is_kept(tmp_path, kind) -> None:
    real = tmp_path / "source"
    link = tmp_path / ".run.sg-staging"
    argv = SOURCES[kind](real, given=link)
    link.symlink_to(real, target_is_directory=True)
    before = _tree(real)
    assert _unpack(*argv, "--out-dir", str(tmp_path / "run")) == 0
    assert _tree(real) == before, "링크 너머의 입력이 바뀌었다"
    assert link.is_symlink() and link.resolve() == real.resolve()
    _published(tmp_path / "run")


def test_a_staging_folder_someone_else_left_is_not_touched(tmp_path) -> None:
    argv = _pngs(tmp_path / "pngs")
    stale = tmp_path / ".run.sg-staging"
    stale.mkdir()
    (stale / "keep.txt").write_bytes(b"not this run's\n")
    assert _unpack(*argv, "--out-dir", str(tmp_path / "run")) == 0
    assert _tree(stale) == {"keep.txt": b"not this run's\n"}, "이 실행이 만들지 않은 폴더를 지웠다"
    assert _names(tmp_path) == sorted([".run.sg-staging", RWLOCK, "pngs", "run"])


# ── 3. 겹치는 입력은 --force 여도 아무것도 만들기 전에 거절 ───────────

def _prior(run: Path) -> None:
    """--force 가 갈아 끼울 옛 런 폴더."""
    run.mkdir(parents=True, exist_ok=True)
    (run / "old.txt").write_bytes(b"the prior run\n")


def _pngs_is_out(root: Path) -> list[str]:
    return [*_pngs(root / "pngs"), "--out-dir", str(root / "pngs")]


def _out_inside_pngs(root: Path) -> list[str]:
    return [*_pngs(root / "pngs"), "--out-dir", str(root / "pngs" / "run")]


def _pngs_inside_out(root: Path) -> list[str]:
    _prior(root / "run")
    return [*_pngs(root / "run" / "pngs"), "--out-dir", str(root / "run")]


def _out_links_to_pngs(root: Path) -> list[str]:
    argv = _pngs(root / "pngs")
    (root / "run").symlink_to(root / "pngs", target_is_directory=True)
    return [*argv, "--out-dir", str(root / "run")]


def _out_under_a_link_into_pngs(root: Path) -> list[str]:
    argv = _pngs(root / "pngs")
    (root / "alias").symlink_to(root / "pngs", target_is_directory=True)
    return [*argv, "--out-dir", str(root / "alias" / "run")]


def _pngs_through_a_link_inside_out(root: Path) -> list[str]:
    _prior(root / "run")
    argv = _pngs(root / "run" / "pngs", given=root / "in")
    (root / "in").symlink_to(root / "run" / "pngs", target_is_directory=True)
    return [*argv, "--out-dir", str(root / "run")]


def _out_inside_pngs_spelt_in_capitals(root: Path) -> list[str]:
    argv = _pngs(root / "pngs")
    if not (root / "PNGS").exists():
        pytest.skip("대소문자를 가리는 볼륨 — 철자가 다르면 다른 폴더다")
    return [*argv, "--out-dir", str(root / "PNGS" / "run")]


def _atlas_inside_out(root: Path) -> list[str]:
    _prior(root / "run")
    return [*_sheet(root / "run"), "--out-dir", str(root / "run")]


def _atlas_through_a_link_inside_out(root: Path) -> list[str]:
    _prior(root / "run")
    _sheet(root / "run")
    (root / "sheet.png").symlink_to(root / "run" / "sheet.png")
    return ["--atlas", str(root / "sheet.png"), "--grid", "2x1", "--out-dir", str(root / "run")]


def _out_is_the_atlas(root: Path) -> list[str]:
    return [*_sheet(root / "sheets"), "--out-dir", str(root / "sheets" / "sheet.png")]


def _manifest_inside_out(root: Path) -> list[str]:
    _prior(root / "run")
    _sheet(root / "run")
    return [*_manifest(root / "run" / "sheet.json", "sheet.png"), "--out-dir", str(root / "run")]


def _manifest_names_an_atlas_inside_out(root: Path) -> list[str]:
    _prior(root / "run")
    _sheet(root / "run")
    return [*_manifest(root / "sheet.json", "run/sheet.png"), "--out-dir", str(root / "run")]


def _out_inside_a_linked_group_folder(root: Path) -> list[str]:
    argv = _pngs(root / "pngs")
    _pngs(root / "elsewhere")
    (root / "pngs" / "idle").symlink_to(root / "elsewhere", target_is_directory=True)
    return [*argv, "--out-dir", str(root / "elsewhere" / "run")]


OVERLAPS = [
    (_pngs_is_out, "--pngs-dir and --out-dir are the same"),
    (_out_inside_pngs, "--out-dir lies inside --pngs-dir"),
    (_pngs_inside_out, "--pngs-dir lies inside --out-dir"),
    (_out_links_to_pngs, "--pngs-dir and --out-dir are the same"),
    (_out_under_a_link_into_pngs, "--out-dir lies inside --pngs-dir"),
    (_pngs_through_a_link_inside_out, "--pngs-dir lies inside --out-dir"),
    (_out_inside_pngs_spelt_in_capitals, "--out-dir lies inside --pngs-dir"),
    (_atlas_inside_out, "--atlas lies inside --out-dir"),
    (_atlas_through_a_link_inside_out, "--atlas lies inside --out-dir"),
    (_out_is_the_atlas, "--atlas and --out-dir are the same"),
    (_manifest_inside_out, "--manifest lies inside --out-dir"),
    (_manifest_names_an_atlas_inside_out, "the atlas the manifest names lies inside --out-dir"),
    (_out_inside_a_linked_group_folder, "--out-dir lies inside idle in --pngs-dir"),
]


@pytest.mark.parametrize("layout,why", OVERLAPS, ids=[layout.__name__.strip("_") for layout, _ in OVERLAPS])
def test_overlapping_inputs_are_refused_before_anything_is_made(tmp_path, layout, why) -> None:
    argv = layout(tmp_path)
    before = _tree(tmp_path)
    with pytest.raises(SystemExit, match=why):
        _unpack(*argv, "--force")
    assert _tree(tmp_path) == before, "거절했는데 무엇이 생기거나 바뀌었다"


# --pngs-dir 안에서 찾아 읽히는 자리 → 거기 둔 링크가 닿을 옛 런 안의 원본("" 은 원본이 든 폴더 — 그룹 폴더)
FOUND = {
    "frame": ("1.png", "original.png"),
    "group": ("walk", ""),
    "base": ("_base/identity.png", "original.png"),
    "ref": ("_refs/anchor-source.png", "original.png"),
    "group-frame": ("idle/1.png", "original.png"),
    "group-ref": ("idle/_refs/anchor-source.png", "original.png"),
    "meta": ("meta.json", "meta.json"),
}
# 링크가 원본에 닿는 길 — 곧장, out 의 하위 폴더로, 링크의 링크로, 대문자 철자로(대소문자를 가리지 않는 볼륨)
ROUTES = ["straight", "subfolder", "chain", "capitals"]


def _found_input_linked_into_out(root: Path, kind: str, route: str) -> tuple[list[str], str]:
    """`--pngs-dir in`(칸 `0.png`, 그룹 `idle/0.png`)에서 찾아 읽힐 자리 하나가 링크로 옛 런 `run` 안의 원본 — 칸
    PNG 나 meta.json, 그룹 폴더면 그 둘이 든 폴더 — 에 닿는 배치. argv 와 기대하는 거절 문구를 돌려준다."""
    place, target = FOUND[kind]
    prior = root / "run" / ("sub" if route == "subfolder" else "")
    prior.mkdir(parents=True)
    _cell(0).save(prior / "original.png")
    (prior / "meta.json").write_text('{"items": {}}\n', encoding="utf-8")
    src = root / "in"
    (src / "idle").mkdir(parents=True)
    _cell(1).save(src / "0.png")
    _cell(1).save(src / "idle" / "0.png")
    reach = prior / target
    if route == "capitals":
        reach = root / "RUN" / reach.relative_to(root / "run")
        if not reach.exists():
            pytest.skip("대소문자를 가리는 볼륨 — 철자가 다르면 다른 폴더다")
    if route == "chain":
        (root / "hop").symlink_to(reach, target_is_directory=not target)
        reach = root / "hop"
    link = src / place
    link.parent.mkdir(parents=True, exist_ok=True)
    link.symlink_to(reach, target_is_directory=not target)
    why = f"{re.escape(place)} in --pngs-dir (lies inside|and) --out-dir"
    return ["--pngs-dir", str(src), "--out-dir", str(root / "run")], why


@pytest.mark.parametrize("route", ROUTES)
@pytest.mark.parametrize("kind", FOUND)
def test_force_preserves_input_reached_through_a_link(tmp_path, kind, route) -> None:
    argv, why = _found_input_linked_into_out(tmp_path, kind, route)
    before = _tree(tmp_path)
    try:
        said = f"rc={_unpack(*argv, '--force')}"
    except SystemExit as refusal:
        said = str(refusal)
    assert _tree(tmp_path) == before, f"--force 가 링크로 닿은 입력을 지웠다 ({said})"
    assert re.search(why, said), f"링크로 out 에 닿은 입력을 거절하지 않았다 ({said})"


# ── 4. 못 끝낸 내놓기 ───────────────────────────────────────────────

def test_a_force_reimport_that_cannot_publish_leaves_the_whole_prior_run(tmp_path, monkeypatch) -> None:
    argv = _pngs(tmp_path / "pngs")
    run = tmp_path / "run"
    assert _unpack(*argv, "--out-dir", str(run)) == 0
    (run / ".sg-backup").mkdir()                                   # 옛 런에 든, 이 실행이 만들지 않은 폴더
    (run / ".sg-backup" / "keep.txt").write_bytes(b"not this run's\n")
    before = _tree(run)
    _cell(1).save(tmp_path / "pngs" / "3-c.png")                   # 다시 들일 새 내용
    rename = pathlib.Path.rename
    failed = []

    def the_first_move_into_the_run_fails(self, target):
        if Path(target).parent == run.resolve() and not failed:  # 새 내용을 런 폴더로 옮기는 첫 걸음
            failed.append(self)
            raise OSError("injected publish failure")
        return rename(self, target)

    monkeypatch.setattr(pathlib.Path, "rename", the_first_move_into_the_run_fails)
    with pytest.raises(OSError, match="injected"):
        _unpack(*argv, "--out-dir", str(run), "--force")
    assert failed, "내놓기까지 가지 않았다"
    assert _tree(run) == before, "옛 런이 바뀌었다"
    assert _names(tmp_path) == sorted([RWLOCK, "pngs", "run"]), "이 실행의 임시 폴더가 남았다"


# ── 5. 링크 out 은 가리키는 자리에 ───────────────────────────────────

def test_an_output_link_to_an_empty_folder_publishes_where_it_points(tmp_path) -> None:
    argv = _pngs(tmp_path / "pngs")
    target = tmp_path / "target"
    target.mkdir()
    link = tmp_path / "run"
    link.symlink_to(target, target_is_directory=True)
    assert _unpack(*argv, "--out-dir", str(link)) == 0
    assert link.is_symlink() and link.resolve() == target.resolve(), "out 링크가 바뀌었다"
    _published(target)
    assert _names(tmp_path) == sorted([".target.sg-rwlock", "pngs", "run", "target"]), "임시 폴더가 남았다"


# ── 6. 런은 런 폴더의 이름을 단다 ─────────────────────────────────────

@pytest.mark.parametrize("kind", SOURCES)
def test_a_run_is_named_after_its_run_dir_not_its_staging_folder(tmp_path, kind) -> None:
    argv = SOURCES[kind](tmp_path / "source")
    run = tmp_path / "hero-curator"
    assert _unpack(*argv, "--out-dir", str(run)) == 0
    request = json.loads((run / "sprite-request.json").read_text(encoding="utf-8"))
    manifest = json.loads((run / "frames" / "frames-manifest.json").read_text(encoding="utf-8"))
    assert request["character"]["id"] == "hero-curator", "임시 폴더 이름이 캐릭터 id 가 됐다"
    assert manifest["run_dir"] == str(run.resolve()), "매니페스트가 지워진 임시 폴더를 가리킨다"


# ── 7. 입력 경로가 지나는 것도 입력이다 ─────────────────────────────────
# --force 는 out 안의 항목을 이름째 지운다 — 링크는 링크째로. 입력 경로가 out 안의 링크나 폴더를 지나면 그 경로가
# 끊긴다. 배치마다 단언은 하나다: 만들기 전에 거절했거나, 모든 입력 경로가 같은 파일·폴더·바이트로 열리고 런 폴더
# 밖이 그대로다. 배치 이름(N1…W1)은 진단 행렬(dispatch eve-20261023-120717)의 것이다.

class Bed(NamedTuple):
    argv: list[str]
    reads: list[Path]          # 입력 경로 — 받은 그대로, import 가 여는 것 전부
    cwd: Path | None = None


def _bed(root: Path) -> tuple[Path, Path, Path]:
    """밖 원본 `external/original.png`, --force 가 갈아 끼울 옛 런 `run`, 빈 `incoming`."""
    ext, run, inc = root / "external", root / "run", root / "incoming"
    ext.mkdir()
    _cell(0).save(ext / "original.png")
    _prior(run)
    inc.mkdir()
    return ext, run, inc


def _aged(path: Path) -> None:
    """한 시간 전에 바뀐 파일 — 락으로 읽히면 주인을 확인할 수 없는 오래된 락이라 회수 대상이다."""
    old = time.time() - 3600
    os.utime(path, (old, old))


def _pngs_dir_is_a_link_in_out(root: Path) -> Bed:                    # run/input -> external/
    ext, run, _ = _bed(root)
    given = run / "input"
    given.symlink_to(ext, target_is_directory=True)
    return Bed(["--pngs-dir", str(given), "--out-dir", str(run)], [given, given / "original.png"])


def _atlas_is_a_link_in_out(root: Path) -> Bed:                       # run/input.png -> external/original.png
    ext, run, _ = _bed(root)
    given = run / "input.png"
    given.symlink_to(ext / "original.png")
    return Bed(["--atlas", str(given), "--grid", "1x1", "--out-dir", str(run)], [given])


def _frame_through_a_link_in_out(root: Path) -> Bed:                  # incoming/1.png -> run/hop.png -> external/original.png
    ext, run, inc = _bed(root)
    (run / "hop.png").symlink_to(ext / "original.png")
    (inc / "1.png").symlink_to(run / "hop.png")
    return Bed(["--pngs-dir", str(inc), "--out-dir", str(run)], [inc, inc / "1.png"])


def _group_through_a_link_in_out(root: Path) -> Bed:                  # incoming/walk -> run/hop -> external/
    ext, run, inc = _bed(root)
    (run / "hop").symlink_to(ext, target_is_directory=True)
    (inc / "walk").symlink_to(run / "hop", target_is_directory=True)
    return Bed(["--pngs-dir", str(inc), "--out-dir", str(run)], [inc, inc / "walk", inc / "walk" / "original.png"])


def _frame_through_three_links_one_in_out(root: Path) -> Bed:         # 1.png -> ../mid/1.png -> ../run/hop.png -> ../external/original.png
    _, run, inc = _bed(root)
    (run / "hop.png").symlink_to("../external/original.png")
    (root / "mid").mkdir()
    (root / "mid" / "1.png").symlink_to("../run/hop.png")
    (inc / "1.png").symlink_to("../mid/1.png")
    return Bed(["--pngs-dir", str(inc), "--out-dir", str(run)], [inc, inc / "1.png"])


def _frame_through_a_folder_link_in_out(root: Path) -> Bed:           # 1.png -> ../run/hopdir/original.png, run/hopdir -> ../external
    _, run, inc = _bed(root)
    (run / "hopdir").symlink_to("../external", target_is_directory=True)
    (inc / "1.png").symlink_to("../run/hopdir/original.png")
    return Bed(["--pngs-dir", str(inc), "--out-dir", str(run)], [inc, inc / "1.png"])


def _frame_through_a_link_in_out_spelt_in_capitals(root: Path) -> Bed:  # 1.png -> ../RUN/hop.png
    _, run, inc = _bed(root)
    if not (root / "RUN").exists():
        pytest.skip("대소문자를 가리는 볼륨 — 철자가 다르면 다른 폴더다")
    (run / "hop.png").symlink_to("../external/original.png")
    (inc / "1.png").symlink_to("../RUN/hop.png")
    return Bed(["--pngs-dir", str(inc), "--out-dir", str(run)], [inc, inc / "1.png"])


def _base_through_a_link_in_out(root: Path) -> Bed:                   # _base -> ../run/hopbase -> ../external/base
    ext, run, inc = _bed(root)
    (ext / "base").mkdir()
    _cell(1).save(ext / "base" / "identity.png")
    (run / "hopbase").symlink_to("../external/base", target_is_directory=True)
    (inc / "_base").symlink_to("../run/hopbase", target_is_directory=True)
    _cell(1).save(inc / "1.png")
    return Bed(["--pngs-dir", str(inc), "--out-dir", str(run)], [inc, inc / "1.png", inc / "_base" / "identity.png"])


def _refs_through_a_link_in_out(root: Path) -> Bed:                   # _refs -> ../run/hopr -> ../external/refs
    ext, run, inc = _bed(root)
    (ext / "refs").mkdir()
    _cell(1).save(ext / "refs" / "anchor-a.png")
    (run / "hopr").symlink_to("../external/refs", target_is_directory=True)
    (inc / "_refs").symlink_to("../run/hopr", target_is_directory=True)
    _cell(1).save(inc / "1.png")
    return Bed(["--pngs-dir", str(inc), "--out-dir", str(run)], [inc, inc / "1.png", inc / "_refs" / "anchor-a.png"])


def _meta_through_a_link_in_out(root: Path) -> Bed:                   # meta.json -> ../run/hop.json -> ../external/meta.json
    ext, run, inc = _bed(root)
    (ext / "meta.json").write_text('{"items": {}}\n', encoding="utf-8")
    (run / "hop.json").symlink_to("../external/meta.json")
    (inc / "meta.json").symlink_to("../run/hop.json")
    _cell(1).save(inc / "1.png")
    return Bed(["--pngs-dir", str(inc), "--out-dir", str(run)], [inc, inc / "1.png", inc / "meta.json"])


def _frame_link_dips_into_a_run_folder(root: Path) -> Bed:            # 1.png -> ../run/sub/../../external/original.png
    _, run, inc = _bed(root)
    (run / "sub").mkdir()
    (inc / "1.png").symlink_to("../run/sub/../../external/original.png")
    return Bed(["--pngs-dir", str(inc), "--out-dir", str(run)], [inc, inc / "1.png"])


def _atlas_path_dips_into_a_run_folder(root: Path) -> Bed:            # --atlas run/sub/../../external/original.png
    _, run, _ = _bed(root)
    (run / "sub").mkdir()
    given = Path(f"{run}/sub/../../external/original.png")
    return Bed(["--atlas", str(given), "--grid", "1x1", "--out-dir", str(run)], [given])


def _group_link_dips_into_a_run_folder(root: Path) -> Bed:            # walk -> ../run/sub/../../external
    _, run, inc = _bed(root)
    (run / "sub").mkdir()
    (inc / "walk").symlink_to("../run/sub/../../external", target_is_directory=True)
    return Bed(["--pngs-dir", str(inc), "--out-dir", str(run)], [inc, inc / "walk", inc / "walk" / "original.png"])


def _pngs_dir_passes_through_the_run_dir(root: Path) -> Bed:          # run/../incoming — 런 폴더는 내놓는 동안에도 그 자리다
    _, run, inc = _bed(root)
    _cell(1).save(inc / "1.png")
    given = Path(f"{run}/../incoming")
    return Bed(["--pngs-dir", str(given), "--out-dir", str(run)], [given, given / "1.png"])


def _relative_from_inside_the_run_dir(root: Path) -> Bed:             # cd run; --pngs-dir ../incoming --out-dir .
    _, run, inc = _bed(root)
    _cell(1).save(inc / "1.png")
    return Bed(["--pngs-dir", "../incoming", "--out-dir", "."], [inc, inc / "1.png"], cwd=run)


def _frame_is_a_hard_link_of_a_run_file(root: Path) -> Bed:           # 이름이 둘인 파일은 out 쪽 이름이 지워져도 열린다
    _, run, inc = _bed(root)
    _cell(1).save(run / "x.png")
    os.link(run / "x.png", inc / "1.png")
    return Bed(["--pngs-dir", str(inc), "--out-dir", str(run)], [inc, inc / "1.png"])


def _plain_frames(root: Path) -> Bed:
    _, run, inc = _bed(root)
    _cell(1).save(inc / "1.png")
    return Bed(["--pngs-dir", str(inc), "--out-dir", str(run)], [inc, inc / "1.png"])


def _frame_link_loop(root: Path) -> Bed:                              # 1.png -> 1.png
    _, run, inc = _bed(root)
    (inc / "1.png").symlink_to("1.png")
    _cell(1).save(inc / "2.png")
    return Bed(["--pngs-dir", str(inc), "--out-dir", str(run)], [inc, inc / "2.png"])


def _pngs_dir_link_loop_without_out_dir(root: Path) -> Bed:           # loop -> loop, out 은 입력 옆 기본 자리
    _bed(root)
    (root / "loop").symlink_to("loop", target_is_directory=True)
    return Bed(["--pngs-dir", str(root / "loop")], [])


def _lock_name_links_to_the_atlas(root: Path) -> Bed:                 # run/.sprite-gen.lock -> ../external/original.png (한 시간 전)
    ext, run, _ = _bed(root)
    _aged(ext / "original.png")
    (run / ".sprite-gen.lock").symlink_to("../external/original.png")
    return Bed(["--atlas", str(ext / "original.png"), "--grid", "1x1", "--out-dir", str(run)], [ext / "original.png"])


def _lock_name_links_to_a_file_outside(root: Path) -> Bed:            # run/.sprite-gen.lock -> ../external/keep.txt (한 시간 전, 입력 아님)
    ext, run, inc = _bed(root)
    (ext / "keep.txt").write_bytes(b"not the run's\n")
    _aged(ext / "keep.txt")
    (run / ".sprite-gen.lock").symlink_to("../external/keep.txt")
    _cell(1).save(inc / "1.png")
    return Bed(["--pngs-dir", str(inc), "--out-dir", str(run)], [inc, inc / "1.png"])


def _lock_name_links_to_a_fresh_file(root: Path) -> Bed:              # run/.sprite-gen.lock -> ../external/keep.txt (방금)
    ext, run, inc = _bed(root)
    (ext / "keep.txt").write_bytes(b"not the run's\n")
    (run / ".sprite-gen.lock").symlink_to("../external/keep.txt")
    _cell(1).save(inc / "1.png")
    return Bed(["--pngs-dir", str(inc), "--out-dir", str(run)], [inc, inc / "1.png"])


def _rwlock_sidecar_links_to_the_atlas(root: Path) -> Bed:            # .run.sg-rwlock -> external/original.png — 열기만 하고 쓰지 않는다
    ext, run, _ = _bed(root)
    (root / RWLOCK).symlink_to("external/original.png")
    return Bed(["--atlas", str(ext / "original.png"), "--grid", "1x1", "--out-dir", str(run)], [ext / "original.png"])


SEP = r"[/\\]"


def _through(flag: str, *names: str) -> str:
    """거절 문구 — `flag` 가 out 안의 항목(`names`: 배치 폴더부터의 이름)을 지난다."""
    return re.escape(flag) + " goes through .*" + SEP.join(map(re.escape, names)) + ", inside --out-dir"


LOCK_REFUSED = "run" + SEP + re.escape(".sprite-gen.lock is not a lock file")

# (배치, 만드는 함수, 거절 문구 — None 이면 거절 없이 돌아야 한다)
PATHS = [
    ("N1", _pngs_dir_is_a_link_in_out, _through("--pngs-dir", "run", "input")),
    ("N2", _atlas_is_a_link_in_out, _through("--atlas", "run", "input.png")),
    ("N3", _frame_through_a_link_in_out, _through("1.png in --pngs-dir", "run", "hop.png")),
    ("N4", _group_through_a_link_in_out, _through("walk in --pngs-dir", "run", "hop")),
    ("M1", _frame_through_three_links_one_in_out, _through("1.png in --pngs-dir", "run", "hop.png")),
    ("M2", _frame_through_a_folder_link_in_out, _through("1.png in --pngs-dir", "run", "hopdir")),
    ("M3", _frame_through_a_link_in_out_spelt_in_capitals, _through("1.png in --pngs-dir", "RUN", "hop.png")),
    ("B1", _base_through_a_link_in_out, _through("_base in --pngs-dir", "run", "hopbase")),
    ("R1", _refs_through_a_link_in_out, _through("_refs in --pngs-dir", "run", "hopr")),
    ("J1", _meta_through_a_link_in_out, _through("meta.json in --pngs-dir", "run", "hop.json")),
    ("D1", _frame_link_dips_into_a_run_folder, _through("1.png in --pngs-dir", "run", "sub")),
    ("D2", _atlas_path_dips_into_a_run_folder, _through("--atlas", "run", "sub")),
    ("D3", _group_link_dips_into_a_run_folder, _through("walk in --pngs-dir", "run", "sub")),
    ("P1", _pngs_dir_passes_through_the_run_dir, None),
    ("P2", _relative_from_inside_the_run_dir, None),
    ("P3", _frame_is_a_hard_link_of_a_run_file, None),
    ("C0", _plain_frames, None),
    ("C1", _frame_link_loop, re.escape("1.png in --pngs-dir cannot be followed")),
    ("C2", _pngs_dir_link_loop_without_out_dir, re.escape("--pngs-dir cannot be followed")),
    ("L1", _lock_name_links_to_the_atlas, LOCK_REFUSED),
    ("L2", _lock_name_links_to_a_file_outside, LOCK_REFUSED),
    ("L3", _lock_name_links_to_a_fresh_file, LOCK_REFUSED),
    ("W1", _rwlock_sidecar_links_to_the_atlas, None),
]


def _opens(path: Path) -> object:
    """경로를 열면 닿는 것 — 같은 파일·폴더(장치·inode)와 그 바이트나 목록, 못 열면 그 까닭."""
    try:
        st = path.stat()
        return st.st_dev, st.st_ino, sorted(os.listdir(path)) if path.is_dir() else path.read_bytes()
    except OSError as exc:
        return f"cannot open: {exc.strerror}"


def _outside(root: Path, before: dict[str, object] | None = None) -> dict[str, object]:
    """런 폴더(`run`) 밖 전부. `before` 에 없던 읽기·쓰기 락 사이드카(런이 옆에 두는 것)는 뺀다."""
    got = {name: what for name, what in _tree(root).items() if name != "run" and not name.startswith("run/")}
    if before is not None and RWLOCK not in before:
        got.pop(RWLOCK, None)
    return got


@pytest.mark.parametrize("tag,layout,why", PATHS, ids=[f"{tag}-{layout.__name__.strip('_')}" for tag, layout, _ in PATHS])
def test_force_never_breaks_an_input_path_or_touches_what_lies_outside_the_run_dir(tmp_path, monkeypatch, tag, layout, why) -> None:
    bed = layout(tmp_path)
    if bed.cwd is not None:
        monkeypatch.chdir(bed.cwd)
    whole, outside, opened = _tree(tmp_path), _outside(tmp_path), {path: _opens(path) for path in bed.reads}
    try:
        said = f"rc={_unpack(*bed.argv, '--force')}"
    except SystemExit as refusal:
        said = str(refusal)
        assert _tree(tmp_path) == whole, f"{tag}: 거절했는데 무엇이 생기거나 바뀌었다 ({said})"
    else:
        assert {path: _opens(path) for path in bed.reads} == opened, f"{tag}: 입력 경로가 끊기거나 다른 것을 연다 ({said})"
        assert _outside(tmp_path, outside) == outside, f"{tag}: 런 폴더 밖이 바뀌었다 ({said})"
    if why:
        assert re.search(why, said), f"{tag}: 그 항목을 대며 거절하지 않았다 ({said})"
    else:
        assert said == "rc=0" and (tmp_path / "run" / "sprite-request.json").is_file(), f"{tag}: 돌지 않았다 ({said})"
