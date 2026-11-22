# SPDX-License-Identifier: Apache-2.0
"""조회는 런 파일을 쓰지 않는다 (plan sprite-gen/state-revision-read-mutation).

합성 회귀는 `state_revision()` 조회 중 은퇴 키를 정규화하더라도 request 바이트와
세대 지문이 바뀌지 않아야 함을 고정한다.

계약 (SRP): **읽는 쪽은 읽기만 한다.** 은퇴 키는 로더가 메모리에서 현행 키로 정규화해
호출부 동작을 유지하고, 디스크 스키마 이관은 사용자가 명시적으로 부르는 단일 writer
(`runio.migrate_request_file` / `sprite-gen migrate-request`) 에서만 원자적으로 일어난다.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

from sprite_gen.curate import curation as curation_mod
from sprite_gen.curate.curation import state_revision
from sprite_gen.spec.runio import REQUEST_FILENAME, load_request


def write_synthetic_fixture_a_request(run_dir: Path, fit: dict) -> None:
    """은퇴 키를 안은 합성 scratch 런의 최소 모형."""
    run_dir.mkdir(parents=True, exist_ok=True)
    (run_dir / REQUEST_FILENAME).write_text(json.dumps({
        "version": 1, "kind": "sprite-gen-request", "engine": "component-row",
        "character": {"id": "synthetic_fixture_a", "description": "", "base_image": None},
        "cell": {"shape": "square", "width": 96, "height": 96, "safe_margin_x": 8,
                 "safe_margin_y": 8, "size": 96, "safe_margin": 8},
        "chroma_key": {"name": "magenta", "hex": "#FF00FF", "rgb": [255, 0, 255],
                       "selection": "fallback"},
        "states": {"walk": {"frames": 2, "fps": 8, "loop": True, "action": "x"}},
        "fit": fit,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_frames_manifest(run_dir: Path) -> None:
    """`state_revision` 이 행 지문을 계산하려면 manifest row 가 있어야 한다 (없으면 None
    을 돌려주고 조기 반환해, 재현하려는 로더 경로를 통과하지 않는다)."""
    frames = run_dir / "frames"
    frames.mkdir(parents=True, exist_ok=True)
    (frames / "frames-manifest.json").write_text(json.dumps({
        "rows": [{"state": "walk", "frames": 2, "files": ["frame-0.png", "frame-1.png"]}],
    }), encoding="utf-8")


def sha256_of(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


@pytest.fixture()
def synthetic_fixture_a_run(tmp_path: Path) -> Path:
    run_dir = tmp_path / "synthetic_fixture_a"
    write_synthetic_fixture_a_request(run_dir, {"pixel_perfect": True, "logical_height": 48})
    write_frames_manifest(run_dir)
    return run_dir


def read_everything(run_dir: Path) -> None:
    """조회 API 전수 — 어느 진입점으로 읽어도 런 디렉터리는 바이트 불변이어야 한다."""
    from sprite_gen.curate import anchor as anchor_mod
    from sprite_gen.curate.curation import load_curation, load_curation_report

    load_request(run_dir)
    anchor_mod.load_request(run_dir)
    state_revision(run_dir, "walk")
    curation_mod.run_revision(run_dir)
    load_curation(run_dir)
    load_curation_report(run_dir)


def run_dir_sha256(run_dir: Path) -> dict[str, str]:
    return {str(p.relative_to(run_dir)): sha256_of(p)
            for p in sorted(run_dir.rglob("*")) if p.is_file()}


def test_read_api_surface_is_byte_stable(synthetic_fixture_a_run: Path) -> None:
    """조회 API 전수: 어느 진입점으로 읽어도 런 디렉터리 바이트가 불변이다.

    한 진입점만 잠그면 다음 진입점이 같은 병을 다시 만든다 — 계약은 "이 함수" 가 아니라
    "읽는 쪽" 전체다.

    `state_revision()` 조회 사고(request 재기록)의 재현 고정도 여기다: request 바이트가 그대로면
    그 바이트를 해싱하는 `run_revision` 세대 지문도 움직이지 않는다."""
    before = run_dir_sha256(synthetic_fixture_a_run)
    read_everything(synthetic_fixture_a_run)
    # 반공허 단정: manifest row 가 없으면 state_revision 은 None 으로 조기 반환해 로더를 밟지 않는다.
    assert state_revision(synthetic_fixture_a_run, "walk") is not None
    assert run_dir_sha256(synthetic_fixture_a_run) == before, (
        "조회가 런 디렉터리를 바꿨다 — state_revision() 등이 sprite-request.json 을 재기록하면 "
        "canonical 런이 오염되고 세대 지문이 움직인다 (합성 조회 회귀)")


def test_read_api_surface_is_byte_stable_when_the_sidecar_is_stale(synthetic_fixture_a_run: Path) -> None:
    """세대가 어긋난 큐레이션 사이드카를 읽어도 런 디렉터리에 파일이 생기지 않는다.

    `load_curation_report` 는 드롭을 판정하면서 원문을 `curation.stale-<hash>.json` 으로
    써 뒀다 — 조회만 했는데 런 디렉터리에 새 파일이 생겼다는 뜻이고, 이 플랜이 request
    로더에서 잡은 것과 같은 계열이다 (노을이 검수 Scope 밖 관찰, 2026-08-02). 드롭 시점엔
    아직 잃은 것이 없다: `curation.json` 은 그대로고, 백업은 실제로 덮는 writer
    (`write_curation_atomic`) 한 곳에서만 난다."""
    from sprite_gen.curate.curation import CURATION_FILENAME

    (synthetic_fixture_a_run / CURATION_FILENAME).write_text(json.dumps({
        "version": 1, "kind": "sprite-gen-curation",
        "run_revision": "0" * 12,                    # 현재 세대와 어긋난다 → 행 단위 구제 경로
        "states": {"walk": {"selected": [1]}},       # 행 스탬프 없음 → 드롭 대상
    }), encoding="utf-8")
    before = run_dir_sha256(synthetic_fixture_a_run)

    doc, report = curation_mod.load_curation_report(synthetic_fixture_a_run)
    assert doc is None and report["dropped"] == ["walk"], "드롭 경로를 실제로 밟아야 한다"
    read_everything(synthetic_fixture_a_run)

    assert run_dir_sha256(synthetic_fixture_a_run) == before, (
        "조회가 런 디렉터리에 썼다 — 세대 불일치 사이드카를 읽는 것만으로 파일이 생기거나 바뀐다")
    assert not list(synthetic_fixture_a_run.glob("curation.stale-*.json"))


def test_retired_key_still_reads_as_the_current_key(synthetic_fixture_a_run: Path) -> None:
    """읽기 호환은 유지된다 — 은퇴 키 런의 호출부는 현행 키를 본다 (메모리 정규화).

    디스크를 안 쓰는 것과 은퇴 키를 못 읽는 것은 다르다. 후자가 되면 승인 런이 파이프라인
    에서 통째로 떨어진다."""
    request = load_request(synthetic_fixture_a_run)
    assert request["fit"]["pixel_unfake"] is True
    assert "pixel_perfect" not in request["fit"]
    assert request["fit"]["logical_height"] == 48


def test_loader_holds_no_writer_call(synthetic_fixture_a_run: Path) -> None:
    """구조 단정: 로더 경로에 쓰기 호출 자체가 없다.

    런타임 단정만 두면 "락이 있을 때만 안 쓴다" 류의 조건부 쓰기가 다시 기어들어와도
    fixture 가 그 조건을 안 밟으면 초록으로 통과한다. 그래서 읽기 경로에 writer 심볼이
    **존재하지 않는다**는 것을 AST 로 본다."""
    import ast

    WRITERS = {"atomic_write_text", "atomic_write_set", "atomic_save_image",
               "write_text", "write_bytes", "replace", "rename", "unlink", "mkdir"}
    import sprite_gen.spec.runio as _runio_mod
    source = Path(_runio_mod.__file__).read_text(encoding="utf-8")
    tree = ast.parse(source)
    read_path = {"load_request", "normalize_retired_keys", "_read_request_document"}
    offenders: list[str] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.FunctionDef) or node.name not in read_path:
            continue
        for child in ast.walk(node):
            if isinstance(child, ast.Call):
                target = child.func
                name = (target.attr if isinstance(target, ast.Attribute)
                        else target.id if isinstance(target, ast.Name) else None)
                if name in WRITERS:
                    offenders.append(f"runio.py:{child.lineno} {node.name}() -> {name}()")
    assert not offenders, (
        "읽기 경로가 쓰기를 호출한다:\n  " + "\n  ".join(offenders)
        + "\n→ 스키마 이관은 `migrate_request_file` (명시 writer) 에서만 한다")
