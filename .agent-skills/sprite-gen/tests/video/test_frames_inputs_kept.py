# SPDX-License-Identifier: Apache-2.0
"""`video-frames` 가 읽는 클립과 스틸을 지키는 계약 — 출력 폴더가 입력을 품거나 입력과 겹치는 배치.

지키는 것 (구현이 아니라 계약):
  1. 실행이 갈아 끼우거나 지우는 것(`raw/` 의 프레임, `keyed/`, `keyed.refused/`, 보고서, `--source-manifest`)과
     입력(`--clip`, `--reference`, 그 경로가 지나는 링크와 폴더)이 같거나, 입력이 그 안에 들거나, 입력 경로가 그 안의
     항목을 지나면 아무것도 만들기 전에 거절한다 — 링크로 닿아도, 대소문자만 다른 철자여도 같은 파일이다
  2. 키잉의 작업 폴더는 이 실행만의 새 이름이다 — out 안 옛 고정 이름 `.keyed.work` 의 폴더는 입력이든 남의
     것이든 건드리지 않는다
"""

from __future__ import annotations

import re
import shutil
import subprocess
from pathlib import Path

import pytest
from PIL import Image

from tests.video.test_loop_inputs_kept import _read, _state
from tests.video.test_source_restoration import frames as figure_frames
from sprite_gen.video.frames import run_frames

JUNK = b"\x00\x00\x00\x18ftypisom" + b"\x00" * 64  # 클립 이름의 파일 — 거절이 먼저라 ffmpeg 가 읽지 않는다


@pytest.fixture(scope="module")
def clip(tmp_path_factory) -> Path:
    """초록 키 위 합성 인물 12 프레임의 mp4 (`test_source_restoration` 의 그림, 같은 ffmpeg 레시피)."""
    if not shutil.which("ffmpeg"):
        pytest.skip("ffmpeg required")
    made = tmp_path_factory.mktemp("clip")
    for k, f in enumerate(figure_frames()):
        canvas = Image.new("RGB", f.size, (0, 255, 0))
        canvas.paste(f, mask=f.getchannel("A"))
        canvas.save(made / f"frame-{k:04}.png")
    subprocess.run(["ffmpeg", "-v", "error", "-framerate", "24", "-i", str(made / "frame-%04d.png"), "-c:v", "libx264",
                    "-pix_fmt", "yuv420p", str(made / "clip.mp4")], check=True)
    return made / "clip.mp4"


def _frames(root: Path, clip: Path, **kwargs) -> str:
    """`video-frames` 한 번 — 끝난 모양을 한 줄로(통과면 rc=0, 거절·실패면 그 문구)."""
    args = {"key": "green", "allow_edge_contact": False, "report_path": None, **kwargs}
    try:
        return f"rc=0, keyed {run_frames(clip, root / 'out', **args)['keyed_dir']}"
    except SystemExit as refusal:
        return str(refusal)


# ── 1. 출력이 입력과 겹치는 배치 — 만들기 전에 거절 ──────────────────────────────

def _clip_in_keyed(root: Path, clip: Path):
    (root / "out" / "keyed").mkdir(parents=True)
    (root / "out" / "keyed" / "c.mp4").write_bytes(JUNK)
    return root / "out" / "keyed" / "c.mp4", {}, r"--clip lies inside keyed in --out-dir"


def _clip_linked_into_keyed(root: Path, clip: Path):
    (root / "out" / "keyed").mkdir(parents=True)
    (root / "out" / "keyed" / "c.mp4").write_bytes(JUNK)
    (root / "in.mp4").symlink_to(root / "out" / "keyed" / "c.mp4")
    return root / "in.mp4", {}, r"--clip lies inside keyed in --out-dir"


def _reference_in_keyed(root: Path, clip: Path):
    (root / "out" / "keyed").mkdir(parents=True)
    Image.new("RGB", (8, 8), (0, 255, 0)).save(root / "out" / "keyed" / "still.png")
    (root / "c.mp4").write_bytes(JUNK)
    return (root / "c.mp4", {"reference": root / "out" / "keyed" / "still.png"},
            r"--reference lies inside keyed in --out-dir")


def _report_is_the_clip(root: Path, clip: Path):
    shutil.copyfile(clip, root / "c.mp4")
    return root / "c.mp4", {"report_path": root / "c.mp4"}, r"--clip and --report are the same file"


def _source_manifest_spelt_in_capitals(root: Path, clip: Path):
    shutil.copyfile(clip, root / "c.mp4")
    Image.new("RGB", (8, 8), (0, 255, 0)).save(root / "still.png")
    if not (root / "C.MP4").exists():
        pytest.skip("대소문자를 가리는 볼륨 — 철자가 다르면 다른 파일이다")
    return (root / "c.mp4", {"reference": root / "still.png", "source_manifest": root / "C.MP4"},
            r"--clip and --source-manifest are the same file")


OVERLAPS = [_clip_in_keyed, _clip_linked_into_keyed, _reference_in_keyed, _report_is_the_clip,
            _source_manifest_spelt_in_capitals]


@pytest.mark.parametrize("layout", OVERLAPS, ids=[layout.__name__.strip("_") for layout in OVERLAPS])
def test_frames_never_write_over_or_delete_the_clip_or_still_they_read(tmp_path, clip, layout) -> None:
    given, kwargs, why = layout(tmp_path, clip)
    inputs = [given, *([kwargs["reference"]] if "reference" in kwargs else [])]
    read, before = _read(inputs), _state(tmp_path)
    said = _frames(tmp_path, given, **kwargs)
    assert _read(inputs) == read, f"video-frames 가 읽은 입력을 지우거나 바꿨다 ({said})"
    assert re.search(why, said), f"입력과 겹치는 출력을 거절하지 않았다 ({said})"
    assert _state(tmp_path) == before, f"거절했는데 무엇이 생기거나 바뀌었다 ({said})"


# ── 2. 옛 고정 작업 폴더 이름 — 이 실행의 것이 아니면 건드리지 않는다 ─────────────────

def test_a_folder_of_the_old_working_name_beside_keyed_is_never_touched(tmp_path, clip) -> None:
    work = tmp_path / "out" / ".keyed.work"
    work.mkdir(parents=True)
    shutil.copyfile(clip, work / "c.mp4")
    read = _read([work / "c.mp4"])
    said = _frames(tmp_path, work / "c.mp4")
    assert _read([work / "c.mp4"]) == read, f"out 안 .keyed.work 의 입력 클립을 지웠다 ({said})"
    assert said.startswith("rc=0"), said
    left = sorted(p.name for p in (tmp_path / "out").iterdir() if p.name.startswith("."))
    assert left == [".keyed.work"], f"이 실행의 작업 폴더가 남았다: {left}"
