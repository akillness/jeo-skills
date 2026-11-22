# SPDX-License-Identifier: Apache-2.0
"""`video-loop` 과 `video-stop` 이 읽는 프레임을 지키는 계약 — 출력 폴더가 입력을 품거나 입력과 겹치는 배치.

지키는 것 (구현이 아니라 계약):
  1. 컷이 갈아 끼우거나 지우는 것(`cycle/`, `cycle.source/`, `cycle.refused/`, `follow.source.png`, strip·GIF·WebP,
     보고서)과 입력(`--frames-dir`, 그 안에서 찾은 프레임 하나하나, 그 경로가 지나는 링크와 폴더)이 같거나, 입력이
     그 안에 들거나, 입력 경로가 그 안의 항목을 지나면 프레임 하나 읽기 전에 거절한다 — 링크로 닿아도, 대소문자만
     다른 철자여도 같은 항목이다. `--out-dir` 자체는 비교하지 않는다(프레임은 흔히 그 안 `keyed/` 에 있다)
  2. 실행이 쓰고 지우는 임시 폴더는 이 실행만의 새 이름이다 — out 안 `.webp-frames`, `.gait-fallback-frames`
     같은 옛 고정 이름의 폴더는 입력이든 남의 것이든 건드리지 않는다
  3. `video-stop` 도 같다: `--frames-dir` 와 그 프레임, `--loop` 와 그 옆 strip 은 stop 이 쓰는 파일과 보고서가
     아니다
"""

from __future__ import annotations

import hashlib
import re
import shutil
from pathlib import Path

import pytest

from tests.frames.test_unpack_atlas_publish import _tree
from tests.video import test_stop as runs
from tests.video.test_idle_still import _still_frames
from sprite_gen.video import loop as loop_mod
from sprite_gen.video import stop as stop_mod


@pytest.fixture(scope="module")
def still(tmp_path_factory) -> Path:
    """한 번 만든 서 있는 몸 48 프레임(`test_idle_still`) — 배치마다 복사해 쓴다."""
    return _still_frames(tmp_path_factory.mktemp("still"))


def _place(still: Path, folder: Path) -> Path:
    shutil.copytree(still, folder)
    return folder


def _loop(frames_dir: Path, out_dir: Path, **kwargs) -> dict:
    return loop_mod.run_loop(frames_dir, out_dir, fps=24.0, state="idle", min_len=None, max_len=None, n_out=None,
                             seam_max=loop_mod.SEAM_RATIO_MAX, name="idle", cycle_mode="pinned",
                             **{"report_path": None, **kwargs})


def _digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _read(paths: list[Path]) -> dict[str, str | None]:
    """입력 경로(받은 철자 그대로)마다 지금 열리는 바이트의 sha256 — 열리지 않으면 None. 바이트 대신 digest 를 견주어
    실패한 단언이 큰 바이트의 차이를 그리지 않는다."""
    got: dict[str, str | None] = {}
    for path in paths:
        try:
            got[str(path)] = _digest(path.read_bytes())
        except OSError:
            got[str(path)] = None
    return got


def _state(folder: Path) -> dict[str, object]:
    """`_tree` 의 파일 바이트를 sha256 으로 — 폴더 안 모든 것."""
    return {name: _digest(got) if isinstance(got, bytes) else got for name, got in _tree(folder).items()}


# ── 1. 출력이 입력과 겹치는 배치 — 만들기 전에 거절 ──────────────────────────────

def _frames_in_cycle_source(root: Path, still: Path):
    _place(still, root / "out" / "cycle.source" / "keyed")
    return root / "out" / "cycle.source" / "keyed", root / "out", {}, r"--frames-dir lies inside cycle\.source in --out-dir"


def _frames_are_the_cycle(root: Path, still: Path):
    _place(still, root / "out" / "cycle")
    return root / "out" / "cycle", root / "out", {}, r"--frames-dir and cycle in --out-dir are the same folder"


def _frames_are_cycle_refused(root: Path, still: Path):
    _place(still, root / "out" / "cycle.refused")
    return root / "out" / "cycle.refused", root / "out", {}, r"--frames-dir and cycle\.refused in --out-dir are the same folder"


def _frames_dir_links_to_cycle_source(root: Path, still: Path):
    _place(still, root / "out" / "cycle.source")
    (root / "in").symlink_to(root / "out" / "cycle.source", target_is_directory=True)
    return root / "in", root / "out", {}, r"--frames-dir and cycle\.source in --out-dir are the same folder"


def _a_frame_linked_into_cycle_source(root: Path, still: Path):
    keyed = _place(still, root / "keyed")
    (root / "out" / "cycle.source").mkdir(parents=True)
    (keyed / "frame-0000.png").rename(root / "out" / "cycle.source" / "frame-0000.png")
    (keyed / "frame-0000.png").symlink_to(root / "out" / "cycle.source" / "frame-0000.png")
    return keyed, root / "out", {}, r"frame-0000\.png in --frames-dir lies inside cycle\.source in --out-dir"


def _frames_through_a_link_in_cycle_source(root: Path, still: Path):
    _place(still, root / "elsewhere" / "keyed")
    (root / "out" / "cycle.source").mkdir(parents=True)
    (root / "out" / "cycle.source" / "hop").symlink_to(root / "elsewhere", target_is_directory=True)
    return (root / "out" / "cycle.source" / "hop" / "keyed", root / "out", {},
            r"--frames-dir goes through .*hop, inside cycle\.source in --out-dir")


def _out_spelt_in_capitals(root: Path, still: Path):
    _place(still, root / "out" / "cycle.source" / "keyed")
    if not (root / "OUT").exists():
        pytest.skip("대소문자를 가리는 볼륨 — 철자가 다르면 다른 폴더다")
    return root / "out" / "cycle.source" / "keyed", root / "OUT", {}, r"--frames-dir lies inside cycle\.source in --out-dir"


def _report_is_a_frame(root: Path, still: Path):
    keyed = _place(still, root / "keyed")
    return (keyed, root / "out", {"report_path": keyed / "frame-0003.png"},
            r"frame-0003\.png in --frames-dir and --report are the same file")


OVERLAPS = [_frames_in_cycle_source, _frames_are_the_cycle, _frames_are_cycle_refused, _frames_dir_links_to_cycle_source,
            _a_frame_linked_into_cycle_source, _frames_through_a_link_in_cycle_source, _out_spelt_in_capitals,
            _report_is_a_frame]


@pytest.mark.parametrize("layout", OVERLAPS, ids=[layout.__name__.strip("_") for layout in OVERLAPS])
def test_a_cut_never_writes_over_or_deletes_the_frames_it_reads(tmp_path, still, layout) -> None:
    frames_dir, out_dir, kwargs, why = layout(tmp_path, still)
    inputs = sorted(frames_dir.glob("*.png"))
    read, before = _read(inputs), _state(tmp_path)
    try:
        said = f"rc=0, cycle {_loop(frames_dir, out_dir, **kwargs)['cycle']['kind']}"
    except SystemExit as refusal:
        said = str(refusal)
    assert _read(inputs) == read, f"video-loop 이 읽은 프레임을 지우거나 바꿨다 ({said})"
    assert re.search(why, said), f"입력과 겹치는 출력을 거절하지 않았다 ({said})"
    assert _state(tmp_path) == before, f"거절했는데 무엇이 생기거나 바뀌었다 ({said})"


# ── 2. 옛 고정 임시 이름 — 이 실행의 것이 아니면 건드리지 않는다 ─────────────────────

@pytest.mark.parametrize("scratch", [".webp-frames", ".gait-fallback-frames"])
def test_a_folder_of_an_old_scratch_name_in_the_out_dir_is_never_touched(tmp_path, still, scratch) -> None:
    frames_dir = _place(still, tmp_path / "out" / scratch)
    inputs = sorted(frames_dir.glob("*.png"))
    read = _read(inputs)
    try:
        said = f"rc=0, cycle {_loop(frames_dir, tmp_path / 'out')['cycle']['kind']}"
    except SystemExit as refusal:
        said = str(refusal)
    assert _read(inputs) == read, f"out 안 {scratch} 의 입력 프레임을 지우거나 바꿨다 ({said})"
    assert sorted(p.name for p in frames_dir.iterdir()) == [p.name for p in inputs], f"{scratch} 에 무엇을 썼다 ({said})"
    assert said.startswith("rc=0"), said
    left = [p.name for p in (tmp_path / "out").iterdir() if p.name.startswith(".") and p.name != scratch]
    assert left == [], f"이 실행의 임시 폴더가 남았다: {left}"


# ── 3. video-stop ───────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def run_loop_cut(tmp_path_factory) -> tuple[Path, Path]:
    """한 번 만든 달리기 클립의 keyed 프레임과 그 루프(`test_stop` 의 합성 러너) — 배치마다 복사해 쓴다."""
    made = tmp_path_factory.mktemp("run")
    keyed, run_from = runs.clip(made)
    return keyed, runs.cut(made, keyed, run_from + runs.PERIOD)


def _stop_copy(root: Path, made: tuple[Path, Path], keyed_at: Path) -> tuple[Path, Path]:
    keyed, meta = made
    shutil.copytree(keyed, keyed_at)
    shutil.copytree(meta.parent, root / "loop")
    return keyed_at, root / "loop" / meta.name


def test_a_stop_never_writes_into_a_frames_folder_of_the_old_scratch_name(tmp_path, run_loop_cut) -> None:
    keyed, meta = _stop_copy(tmp_path, run_loop_cut, tmp_path / "stop" / ".webp-frames")
    inputs = sorted(keyed.glob("*.png"))
    read = _read(inputs)
    try:
        said = f"rc=0, {stop_mod.make_stop(keyed, meta, tmp_path / 'stop')['status']}"
    except SystemExit as refusal:
        said = str(refusal)
    assert _read(inputs) == read, f"video-stop 이 out 안 .webp-frames 의 입력 프레임을 지우거나 바꿨다 ({said})"
    assert sorted(p.name for p in keyed.iterdir()) == [p.name for p in inputs], f".webp-frames 에 무엇을 썼다 ({said})"
    assert said == "rc=0, passed", said


def _stop_over_its_loop(root: Path, made: tuple[Path, Path]):
    keyed, meta = _stop_copy(root, made, root / "keyed")
    return keyed, meta, root / "loop", {"name": "run"}, r"--loop and run\.strip\.json in --out-dir are the same file"


def _stop_report_is_a_frame(root: Path, made: tuple[Path, Path]):
    keyed, meta = _stop_copy(root, made, root / "keyed")
    return (keyed, meta, root / "stop", {"report_path": keyed / "frame-0002.png"},
            r"frame-0002\.png in --frames-dir and --report are the same file")


STOP_OVERLAPS = [_stop_over_its_loop, _stop_report_is_a_frame]


@pytest.mark.parametrize("layout", STOP_OVERLAPS, ids=[layout.__name__.strip("_") for layout in STOP_OVERLAPS])
def test_a_stop_never_writes_over_what_it_reads(tmp_path, run_loop_cut, layout) -> None:
    keyed, meta, out_dir, kwargs, why = layout(tmp_path, run_loop_cut)
    inputs = [*sorted(keyed.glob("*.png")), meta, meta.with_name(meta.name[: -len(".json")] + ".png")]
    read, before = _read(inputs), _state(tmp_path)
    try:
        said = f"rc=0, {stop_mod.make_stop(keyed, meta, out_dir, **kwargs)['status']}"
    except SystemExit as refusal:
        said = str(refusal)
    assert _read(inputs) == read, f"video-stop 이 읽은 것을 덮어썼다 ({said})"
    assert re.search(why, said), f"입력과 겹치는 출력을 거절하지 않았다 ({said})"
    assert _state(tmp_path) == before, f"거절했는데 무엇이 생기거나 바뀌었다 ({said})"
