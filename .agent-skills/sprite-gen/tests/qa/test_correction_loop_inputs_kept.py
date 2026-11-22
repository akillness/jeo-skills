# SPDX-License-Identifier: Apache-2.0
"""`correction-loop` 이 읽는 런을 지키는 계약 — 출력 폴더가 런과 겹치는 배치.

지키는 것 (구현이 아니라 계약):
  1. 런 폴더(`--run-dir`)와 최선 후보의 복사가 그 안에서 읽는 파일·폴더·링크 하나하나(그 경로가 지나는 링크와
     폴더까지)가 루프가 쓰는 것 — `--out-dir`, 그 안의 시도 폴더와 그 파일, 공급자가 만드는 후보, 최선 후보,
     보고서 — 과 같거나 그 안에 들면 아무것도 만들기 전에 거절한다. 쓰는 자리마다 그 이름으로 본다: 그 자리에
     이미 있는 링크가 런이나 런 안으로 가도 같은 항목이다
  2. `--out-dir` 가 런 폴더 안이면(기본값 `<run-dir>/correction-loop`) 루프는 거기에 더할 뿐이고, 최선 후보의
     복사는 그 폴더를 빼고 런만 복사한다 — 제 출력을 제 안에 복사하지 않는다. 그 폴더에 앞선 루프가 남긴 것이
     있어도 같다
"""

from __future__ import annotations

import re
import shlex
import shutil
import sys
from pathlib import Path

import pytest

from tests.video.test_loop_inputs_kept import _digest, _state
from sprite_gen.qa.correction_loop import run_loop


def _loop(run_dir: Path, out_dir: Path | None) -> str:
    """dry-run 한 번 — 끝난 모양을 한 줄로(끝나면 rc=0 과 최선 후보, 거절·실패면 그 문구)."""
    try:
        result = run_loop(run_dir, states="walk", out_dir=out_dir, dry_run=True)
    except (SystemExit, OSError) as stopped:
        return f"{type(stopped).__name__}: {str(stopped)[:300]}"
    return f"rc=0, best {result['preserved_best']}"


def _readable(folder: Path) -> dict[str, str]:
    """런 폴더에서 열리는 모든 파일 — 상대 경로 → 바이트의 sha256(링크는 따라가 읽는다)."""
    return {p.relative_to(folder).as_posix(): _digest(p.read_bytes()) for p in sorted(folder.rglob("*")) if p.is_file()}


# ── 1. 출력이 런과 겹치는 배치 — 만들기 전에 거절 ──────────────────────────────

def _run_is_the_best_candidate(root: Path, run: Path):
    (root / "loop").mkdir()
    run.rename(root / "loop" / "best-candidate")
    return root / "loop" / "best-candidate", root / "loop", r"--run-dir lies inside --out-dir"


def _run_is_the_out_dir(root: Path, run: Path):
    return run, run, r"--run-dir and --out-dir are the same folder"


def _a_link_in_the_run_into_the_best_candidate(root: Path, run: Path):
    (root / "loop" / "best-candidate").mkdir(parents=True)
    (root / "loop" / "best-candidate" / "notes.txt").write_bytes(b"what the run's link reads\n")
    (run / "notes.txt").symlink_to(root / "loop" / "best-candidate" / "notes.txt")
    return run, root / "loop", r"notes\.txt in --run-dir lies inside --out-dir"


def _an_attempt_linked_to_the_run(root: Path, run: Path):
    (run / "inspect.json").write_bytes(b'{"sentinel":"the original input report"}\n')
    (root / "loop").mkdir()
    (root / "loop" / "attempt-1").symlink_to(run, target_is_directory=True)
    return run, root / "loop", r"--run-dir and attempt-1 in --out-dir are the same folder"


def _an_attempt_linked_into_the_run(root: Path, run: Path):
    (run / "old-loop" / "attempt-1").mkdir(parents=True)
    (run / "old-loop" / "attempt-1" / "inspect.json").write_bytes(b'{"sentinel":"an earlier loop kept in the run"}\n')
    (root / "loop").mkdir()
    (root / "loop" / "attempt-1").symlink_to(run / "old-loop" / "attempt-1", target_is_directory=True)
    return run, root / "loop", r"old-loop/attempt-1 in --run-dir and attempt-1 in --out-dir are the same folder"


def _the_best_candidate_linked_into_the_run(root: Path, run: Path):
    (root / "loop").mkdir()
    (root / "loop" / "best-candidate").symlink_to(run / "raw", target_is_directory=True)
    return run, root / "loop", r"raw in --run-dir and best-candidate in --out-dir are the same folder"


def _an_attempt_file_linked_to_a_run_file(root: Path, run: Path):
    (root / "loop" / "attempt-1").mkdir(parents=True)
    (root / "loop" / "attempt-1" / "score.json").symlink_to(run / "sprite-request.json")
    return run, root / "loop", r"sprite-request\.json in --run-dir and attempt-1/score\.json in --out-dir are the same file"


def _the_report_linked_to_a_run_file(root: Path, run: Path):
    (root / "loop").mkdir()
    (root / "loop" / "correction-loop.report.json").symlink_to(run / "sprite-request.json")
    return (run, root / "loop",
            r"sprite-request\.json in --run-dir and correction-loop\.report\.json in --out-dir are the same file")


OVERLAPS = [_run_is_the_best_candidate, _run_is_the_out_dir, _a_link_in_the_run_into_the_best_candidate,
            _an_attempt_linked_to_the_run, _an_attempt_linked_into_the_run, _the_best_candidate_linked_into_the_run,
            _an_attempt_file_linked_to_a_run_file, _the_report_linked_to_a_run_file]


@pytest.mark.parametrize("layout", OVERLAPS, ids=[layout.__name__.strip("_") for layout in OVERLAPS])
def test_the_loop_never_writes_over_or_deletes_the_run_it_reads(tmp_path, fixture_run_dir, layout) -> None:
    run_dir, out_dir, why = layout(tmp_path, fixture_run_dir)
    read, before = _readable(run_dir), _state(tmp_path)
    said = _loop(run_dir, out_dir)
    assert _readable(run_dir) == read, f"correction-loop 이 읽은 런을 지우거나 바꿨다 ({said})"
    assert re.search(why, said), f"런과 겹치는 출력을 거절하지 않았다 ({said})"
    assert _state(tmp_path) == before, f"거절했는데 무엇이 생기거나 바뀌었다 ({said})"


def test_a_candidate_the_provider_would_make_over_the_run_is_refused_before_it_runs(tmp_path, fixture_run_dir) -> None:
    """공급자는 다음 후보를 루프가 정한 자리(`--out-dir` 의 `candidate-<n>`)에 만든다 — 그 자리가 런으로 가는 링크면
    공급자가 읽는 런 위에 쓴다: 공급자를 부르기 전에, 아무것도 만들기 전에 거절한다."""
    made = tmp_path / "made"  # 공급자가 내놓는 런 — 원래 런과 바이트가 다르다
    shutil.copytree(fixture_run_dir, made)
    (made / "raw" / "idle.png").write_bytes((made / "raw" / "walk.png").read_bytes())
    (tmp_path / "loop").mkdir()
    (tmp_path / "loop" / "candidate-2").symlink_to(fixture_run_dir, target_is_directory=True)
    provider = shlex.join([sys.executable, "-c", "import shutil, sys; shutil.copytree(sys.argv[1], sys.argv[2], dirs_exist_ok=True)",
                           str(made), "{next_run_dir}"])
    read, before = _readable(fixture_run_dir), _state(tmp_path)
    try:
        result = run_loop(fixture_run_dir, states="walk", out_dir=tmp_path / "loop", max_passes=2, pass_score=1000.0,
                          provider_command=provider)
        said = f"rc=0, best {result['preserved_best']}"
    except (SystemExit, OSError) as stopped:
        said = f"{type(stopped).__name__}: {str(stopped)[:300]}"
    assert _readable(fixture_run_dir) == read, f"공급자가 루프가 읽는 런 위에 후보를 썼다 ({said})"
    assert re.search(r"--run-dir and candidate-2 in --out-dir are the same folder", said), f"런으로 가는 후보 자리를 거절하지 않았다 ({said})"
    assert _state(tmp_path) == before, f"거절했는데 무엇이 생기거나 바뀌었다 ({said})"


def test_an_earlier_candidate_holding_a_link_into_the_run_is_taken_away_before_the_provider_runs(tmp_path,
                                                                                               fixture_run_dir) -> None:
    """앞선 루프가 남긴 `candidate-2/` 는 루프 제 출력이다 — 그 안에 런으로 가는 링크가 있어도 공급자가 그 링크를 지나
    런 위에 쓰지 않는다: 공급자를 부르기 전에 그 자리를 비운다(링크는 따라가지 않고 지운다)."""
    made = tmp_path / "made"  # 공급자가 내놓는 런 — 원래 런과 바이트가 다르다
    shutil.copytree(fixture_run_dir, made)
    (made / "raw" / "idle.png").write_bytes((made / "raw" / "walk.png").read_bytes())
    (tmp_path / "loop" / "candidate-2" / "raw").mkdir(parents=True)
    (tmp_path / "loop" / "candidate-2" / "raw" / "idle.png").symlink_to(fixture_run_dir / "raw" / "idle.png")
    provider = shlex.join([sys.executable, "-c", "import shutil, sys; shutil.copytree(sys.argv[1], sys.argv[2], dirs_exist_ok=True)",
                           str(made), "{next_run_dir}"])
    read = _readable(fixture_run_dir)
    try:
        result = run_loop(fixture_run_dir, states="walk", out_dir=tmp_path / "loop", max_passes=2, pass_score=1000.0,
                          provider_command=provider)
        said = f"rc=0, best {result['preserved_best']}"
    except (SystemExit, OSError) as stopped:
        said = f"{type(stopped).__name__}: {str(stopped)[:300]}"
    assert _readable(fixture_run_dir) == read, f"공급자가 앞선 후보 안의 링크를 지나 런 위에 썼다 ({said})"
    assert said.startswith("rc=0"), f"앞선 후보가 있는 out 으로 돌지 못했다 ({said})"
    candidate = tmp_path / "loop" / "candidate-2"
    assert not (candidate / "raw" / "idle.png").is_symlink() and _readable(candidate) == _readable(made), \
        "새 후보가 공급자가 내놓은 런 그대로가 아니다"

# ── 2. 기본 out 은 런 안 — 더할 뿐, 복사는 그 폴더를 뺀다 ──────────────────────────

def test_the_default_out_dir_inside_the_run_is_left_out_of_the_best_candidates_copy(fixture_run_dir) -> None:
    read = _readable(fixture_run_dir)
    said = _loop(fixture_run_dir, None)
    assert said.startswith("rc=0"), f"기본 out(런 안)으로 돌지 못했다 ({said})"
    best = fixture_run_dir / "correction-loop" / "best-candidate"
    assert _readable(best) == read, "최선 후보가 런 그대로가 아니다 — 제 출력을 제 안에 복사했다"
    kept = {name: data for name, data in _readable(fixture_run_dir).items() if not name.startswith("correction-loop/")}
    assert kept == read, "런의 원래 파일이 바뀌었다"


def test_a_second_loop_into_the_default_out_dir_is_the_loops_own(fixture_run_dir) -> None:
    """앞선 루프의 시도·최선 후보·보고서가 이미 있는 기본 out 은 루프 제 것이다 — 두 번째 루프도 거절하지 않고,
    최선 후보는 여전히 런 그대로다."""
    read = _readable(fixture_run_dir)
    first, second = _loop(fixture_run_dir, None), _loop(fixture_run_dir, None)
    assert first.startswith("rc=0") and second.startswith("rc=0"), f"기본 out 으로 다시 돌지 못했다 ({first} / {second})"
    assert _readable(fixture_run_dir / "correction-loop" / "best-candidate") == read, "두 번째 최선 후보가 런 그대로가 아니다"
    kept = {name: data for name, data in _readable(fixture_run_dir).items() if not name.startswith("correction-loop/")}
    assert kept == read, "런의 원래 파일이 바뀌었다"
