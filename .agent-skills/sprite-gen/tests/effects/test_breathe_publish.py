# SPDX-License-Identifier: Apache-2.0
"""`sprite-gen breathe <frames> <out>` 가 원본을 지키는 계약 — 내놓는 길(굽기 뒤 폴더 쓰기).

지키는 것 (구현이 아니라 계약):
  1. 원본 폴더(칸과 칸 아닌 파일)는 한 바이트도 바뀌지 않는다 — 이름이 옛 임시 폴더 이름
     (`.<out>.partial`)이어도, 링크로 그 이름에 걸려 있어도
  2. 지우는 것은 이 실행이 만든 것뿐이다 — out 옆에 남이 둔 `.<out>.partial` 은 그대로 남는다
  3. out 과 frames 가 같거나 한쪽이 다른 쪽 안에 들면 아무것도 만들기 전에 거절한다 — 실경로
     기준이라 링크로 돌아 들어와도, 대소문자만 다른 철자여도 같은 폴더로 읽는다
  4. out 이 빈 폴더로 가는 링크면 링크가 가리키는 자리에 내놓고 링크는 그대로 둔다
  5. 내놓다가 못 끝내면 소리 내 멈추고, 이 실행의 임시 폴더만 치운다 — 그새 out 에 들어온 남의
     파일은 그대로다
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from sprite_gen.effects import breathe as B

from tests.effects.test_breathe_smooth import _bust

FRAMES = [f"frame-{i:03d}.png" for i in range(3)]
NOTE = b"source notes, not a frame\n"


def _loop(folder: Path) -> Path:
    """칸 셋과 칸이 아닌 파일 하나가 든 프레임 폴더."""
    folder.mkdir(parents=True)
    for name in FRAMES:
        _bust().save(folder / name)
    (folder / "notes.txt").write_bytes(NOTE)
    return folder


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


def _run(frames: Path, out: Path) -> int:
    from sprite_gen import cli

    return cli.main(["breathe", str(frames), str(out), "--mode", "smooth"])


# ── 1·2. 원본과 남의 폴더는 그대로 ──────────────────────────────────

def test_a_source_named_like_the_old_staging_folder_is_kept(tmp_path) -> None:
    src = _loop(tmp_path / ".out.partial")
    before = _tree(src)
    assert _run(src, tmp_path / "out") == 0
    assert _tree(src) == before, "원본 폴더(칸과 칸 아닌 파일)가 바뀌었다"
    assert _names(tmp_path / "out") == sorted([*FRAMES, "breathe.json"])
    assert _names(tmp_path) == [".out.partial", "out"], "임시 폴더가 남았다"


def test_a_source_linked_under_the_old_staging_name_is_kept(tmp_path) -> None:
    real = _loop(tmp_path / "loop")
    link = tmp_path / ".out.partial"
    link.symlink_to(real, target_is_directory=True)
    before = _tree(real)
    assert _run(link, tmp_path / "out") == 0
    assert _tree(real) == before, "링크 너머의 원본이 바뀌었다"
    assert link.is_symlink() and link.resolve() == real.resolve()
    assert _names(tmp_path / "out") == sorted([*FRAMES, "breathe.json"])


def test_a_staging_folder_someone_else_left_is_not_touched(tmp_path) -> None:
    src = _loop(tmp_path / "loop")
    stale = tmp_path / ".out.partial"
    stale.mkdir()
    (stale / "keep.txt").write_bytes(b"not this run's\n")
    assert _run(src, tmp_path / "out") == 0
    assert _tree(stale) == {"keep.txt": b"not this run's\n"}, "이 실행이 만들지 않은 폴더를 지웠다"
    assert _names(tmp_path) == [".out.partial", "loop", "out"]


# ── 3. 겹치는 폴더는 아무것도 만들기 전에 거절 ───────────────────────

def _out_is_frames(root: Path):
    src = _loop(root / "loop")
    return src, src


def _out_inside_frames(root: Path):
    src = _loop(root / "loop")
    return src, src / "out"


def _frames_inside_out(root: Path):
    src = _loop(root / "out" / "loop")
    return src, root / "out"


def _out_links_to_frames(root: Path):
    src = _loop(root / "loop")
    (root / "out").symlink_to(src, target_is_directory=True)
    return src, root / "out"


def _out_under_a_link_into_frames(root: Path):
    src = _loop(root / "loop")
    (root / "alias").symlink_to(src, target_is_directory=True)
    return src, root / "alias" / "out"


def _frames_through_a_link_inside_out(root: Path):
    _loop(root / "out" / "loop")
    (root / "in").symlink_to(root / "out" / "loop", target_is_directory=True)
    return root / "in", root / "out"


def _out_inside_frames_spelt_in_capitals(root: Path):
    src = _loop(root / "loop")
    if not (root / "LOOP").exists():
        pytest.skip("대소문자를 가리는 볼륨 — 철자가 다르면 다른 폴더다")
    return src, root / "LOOP" / "out"


OVERLAPS = [
    (_out_is_frames, "같은 폴더"),
    (_out_inside_frames, "out 이 frames 안"),
    (_frames_inside_out, "frames 가 out 안"),
    (_out_links_to_frames, "같은 폴더"),
    (_out_under_a_link_into_frames, "out 이 frames 안"),
    (_frames_through_a_link_inside_out, "frames 가 out 안"),
    (_out_inside_frames_spelt_in_capitals, "out 이 frames 안"),
]


@pytest.mark.parametrize("layout,why", OVERLAPS, ids=[layout.__name__.strip("_") for layout, _ in OVERLAPS])
def test_overlapping_folders_are_refused_before_anything_is_made(tmp_path, layout, why) -> None:
    src, out = layout(tmp_path)
    before = _tree(tmp_path)
    with pytest.raises(SystemExit, match=why):
        _run(src, out)
    assert _tree(tmp_path) == before, "거절했는데 무엇이 생기거나 바뀌었다"


# ── 4. 링크 out 은 가리키는 자리에 ───────────────────────────────────

def test_an_output_link_to_an_empty_folder_publishes_where_it_points(tmp_path) -> None:
    src = _loop(tmp_path / "loop")
    target = tmp_path / "target"
    target.mkdir()
    link = tmp_path / "out"
    link.symlink_to(target, target_is_directory=True)
    assert _run(src, link) == 0
    assert link.is_symlink() and link.resolve() == target.resolve(), "out 링크가 바뀌었다"
    assert _names(target) == sorted([*FRAMES, "breathe.json"])
    assert _names(tmp_path) == ["loop", "out", "target"], "임시 폴더가 남았다"


# ── 5. 못 끝낸 내놓기 ───────────────────────────────────────────────

def test_a_publication_that_cannot_finish_clears_only_its_own_staging(tmp_path, monkeypatch) -> None:
    src = _loop(tmp_path / "loop")
    out = tmp_path / "out"
    out.mkdir()
    before = _tree(src)
    bake = B.bake_breathe_sequence

    def bake_while_another_writer_fills_out(*args, **kwargs):
        baked = bake(*args, **kwargs)
        (out / "other.txt").write_bytes(b"another writer's\n")     # 확인 뒤, 내놓기 전에 남이 out 에 썼다
        return baked

    monkeypatch.setattr(B, "bake_breathe_sequence", bake_while_another_writer_fills_out)
    with pytest.raises(OSError):
        _run(src, out)
    assert _tree(out) == {"other.txt": b"another writer's\n"}, "남이 out 에 쓴 것이 바뀌었다"
    assert _tree(src) == before
    assert _names(tmp_path) == ["loop", "out"], "이 실행의 임시 폴더가 남았다"
