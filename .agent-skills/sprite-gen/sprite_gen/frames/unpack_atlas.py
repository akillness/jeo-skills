# SPDX-License-Identifier: Apache-2.0
"""Unpack a composed sprite sheet back into a curator-ready run directory.

This is the inverse of `compose_sprite_atlas.py`. When only the combined
`sprite-sheet-alpha.png` (+ optional manifest) survives — for example a deployed
asset whose original `frames/` source is gone — this rebuilds the per-frame
editable representation so the curation webview can open it.

Layout source priority (explicit wins, auto-detect is the no-instruction
default — and the chosen path is always reported, never silent):

  1. --grid <cols>x<rows>     a human said the grid; slice uniform cells (position-faithful).
  2. --manifest <json>        read exact frame rectangles from the manifest.
  3. auto-detect (default)    read the atlas alpha and cut on transparent gutters.

Output (a normal sprite-gen run dir):

  <out-dir>/
    sprite-request.json        synthesized recipe (fps/loop are defaults unless a manifest had them)
    frames/<state>/frame-N.png
    frames/frames-manifest.json
    unpack-source.json         provenance + original manifest format, for a future writeback

Then: serve_curation.py --run-dir <out-dir>
"""

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path
from typing import Any, Callable

from PIL import Image

from sprite_gen.util.cli_kwargs import namespace_from_kwargs
from sprite_gen.curate.curation import imported_ref_role
from sprite_gen.spec.runio import (
    LOCK_FILENAME,
    REQUEST_FILENAME,
    REQUEST_KIND,
    acquire_run_dir_lock,
    atomic_save_image,
    atomic_write_text,
    follow_input,
    new_stage,
    publish_guard,
    refuse_overlap,
    relative_posix,
)
from sprite_gen.frames.segment import mask_components
from sprite_gen.frames.cutout import KEY_TARGETS, MAGENTA
from sprite_gen.util.console import utf8_streams
from sprite_gen.util.hexcolor import format_hex

UNPACK_SOURCE_KIND = "sprite-gen-unpack-source"
ALPHA_THRESHOLD = 16  # a pixel counts as content above this alpha
MIN_GUTTER = 1        # a fully-empty line of >= this many px separates frames


# --- auto-detect (visual blob clustering) -----------------------------------

def auto_detect(atlas: Image.Image) -> tuple[list[dict[str, Any]], tuple[int, int]]:
    """Read the sheet visually: find content blobs, cluster them into a grid.

    Connected components survive a character's internal transparency (a single
    pose stays one blob), which is why this is far more robust on packed grids
    than cutting on transparent gutters. Blobs are clustered into rows by their
    vertical center, then into frames within a row by horizontal overlap.

    Returns (states, cell_size). Each frame rect is the blob's content bbox;
    write_run centers it in the cell.
    """
    scale = max(1, max(atlas.width, atlas.height) // 600)  # downsample for speed
    sw, sh = atlas.width // scale, atlas.height // scale
    small = atlas.getchannel("A").resize((sw, sh), Image.BILINEAR)
    mask = [b > ALPHA_THRESHOLD for b in small.tobytes()]  # 'L' mode: 1 byte/px
    boxes_small = mask_components(mask, sw, sh, min_area=max(6, (sw * sh) // 4000))
    if not boxes_small:
        raise SystemExit("auto-detect found no content blobs in the atlas")

    # map blob bboxes back to full resolution
    boxes = [(x0 * scale, y0 * scale, x1 * scale, y1 * scale) for (x0, y0, x1, y1) in boxes_small]
    heights = sorted(y1 - y0 for _x0, y0, _x1, y1 in boxes)
    widths = sorted(x1 - x0 for x0, _y0, x1, _y1 in boxes)
    med_h = heights[len(heights) // 2]
    med_w = widths[len(widths) // 2]

    # cluster into rows by vertical center
    boxes.sort(key=lambda b: (b[1] + b[3]) / 2)
    rows: list[list[tuple[int, int, int, int]]] = []
    row_tol = med_h * 0.6
    for box in boxes:
        cy = (box[1] + box[3]) / 2
        if rows and abs(cy - sum((b[1] + b[3]) / 2 for b in rows[-1]) / len(rows[-1])) <= row_tol:
            rows[-1].append(box)
        else:
            rows.append([box])

    states: list[dict[str, Any]] = []
    max_w = max_h = 0
    for row_index, row_boxes in enumerate(rows):
        row_boxes.sort(key=lambda b: b[0])
        # merge horizontally overlapping / near blobs into one frame
        frames: list[list[int]] = []
        gap = med_w * 0.3
        for box in row_boxes:
            if frames and box[0] - frames[-1][2] <= gap:
                f = frames[-1]
                f[0], f[1] = min(f[0], box[0]), min(f[1], box[1])
                f[2], f[3] = max(f[2], box[2]), max(f[3], box[3])
            else:
                frames.append(list(box))
        rects = []
        for f in frames:
            rect = (f[0], f[1], f[2] - f[0], f[3] - f[1])
            rects.append(rect)
            max_w, max_h = max(max_w, rect[2]), max(max_h, rect[3])
        if rects:
            states.append({"name": f"row-{row_index}", "rects": rects})

    if max_w == 0 or max_h == 0:
        raise SystemExit("auto-detect could not size any frame")
    cell = (max_w + 8, max_h + 8)  # pad so centered content is not flush to the edge
    return states, cell


# --- explicit layout sources ------------------------------------------------

def grid_layout(atlas: Image.Image, cols: int, rows: int) -> tuple[list[dict[str, Any]], tuple[int, int]]:
    cell_w = atlas.width // cols
    cell_h = atlas.height // rows
    states = []
    for r in range(rows):
        rects = []
        for c in range(cols):
            rect = (c * cell_w, r * cell_h, cell_w, cell_h)
            crop = atlas.crop((rect[0], rect[1], rect[0] + cell_w, rect[1] + cell_h))
            if crop.getchannel("A").getbbox() is None:
                continue  # skip empty trailing cells
            rects.append(rect)
        if rects:
            states.append({"name": f"row-{r}", "rects": rects})
    return states, (cell_w, cell_h)


def manifest_layout(
    manifest: dict[str, Any],
    direction: str | None,
) -> tuple[list[dict[str, Any]], tuple[int, int], str, dict[str, Any]]:
    """Resolve frame rectangles from a known manifest format.

    Returns (states, cell, atlas_filename, per_state_meta).
    """
    cell = manifest.get("cell", {})
    cell_w = int(cell.get("width", cell.get("size", 0)))
    cell_h = int(cell.get("height", cell.get("size", 0)))

    # compose-format: explicit frame_layout rectangles
    if "frame_layout" in manifest and manifest["frame_layout"].get("rows"):
        fl = manifest["frame_layout"]
        cell_w = cell_w or fl.get("cellWidth", 0)
        cell_h = cell_h or fl.get("cellHeight", 0)
        states = []
        meta = {}
        anim = manifest.get("animation", {}).get("rows", {})
        for state, rects in fl["rows"].items():
            states.append({"name": state, "rects": [(r["x"], r["y"], r["w"], r["h"]) for r in rects]})
            meta[state] = {"fps": anim.get(state, {}).get("fps", 6), "loop": anim.get(state, {}).get("loop", True)}
        atlas_file = manifest.get("game_input") or manifest.get("sprite_sheet_alpha")
        return states, (cell_w, cell_h), atlas_file, meta

    # archive-2dir-mirror / grid-row format: rows carry {row, frames, fps, loop}
    cols = int(cell.get("columns", 0)) or None
    rows_src = None
    atlas_file = None
    if "directions" in manifest:
        directions = manifest["directions"]
        chosen = direction or next(iter(directions))
        if chosen not in directions:
            raise SystemExit(f"direction '{chosen}' not in manifest; have {list(directions)}")
        rows_src = directions[chosen]["rows"]
        atlas_file = directions[chosen]["sprite_sheet"]
    elif manifest.get("animation", {}).get("rows"):
        rows_src = {k: v for k, v in manifest["animation"]["rows"].items()}
        atlas_file = manifest.get("game_input") or manifest.get("sprite_sheet_alpha")

    if not rows_src:
        raise SystemExit("manifest has no frame_layout, directions, or animation rows to read")
    if not (cell_w and cell_h):
        raise SystemExit("manifest cell width/height missing; pass --cell WxH")

    states = []
    meta = {}
    for state, info in rows_src.items():
        row = int(info["row"])
        frames = int(info["frames"])
        rects = [(c * cell_w, row * cell_h, cell_w, cell_h) for c in range(frames)]
        states.append({"name": state, "rects": rects})
        meta[state] = {"fps": int(info.get("fps", 6)), "loop": bool(info.get("loop", True))}
    return states, (cell_w, cell_h), atlas_file, meta


# --- writing ----------------------------------------------------------------

def write_run(
    out_dir: Path,
    atlas: Image.Image,
    states: list[dict[str, Any]],
    cell: tuple[int, int],
    meta: dict[str, Any],
    layout_source: str,
    provenance: dict[str, Any],
    run_dir: Path | None = None,
) -> dict[str, Any]:
    """Write the run's files into `out_dir`, a staging folder when `run_dir` names the run dir they are
    published into: the run carries that name and path, never the staging folder's."""
    run_dir = run_dir or out_dir
    cell_w, cell_h = cell
    frames_root = out_dir / "frames"
    frames_root.mkdir(parents=True, exist_ok=True)

    request_states = {}
    manifest_rows = []
    for state in states:
        name = state["name"]
        state_dir = frames_root / name
        state_dir.mkdir(parents=True, exist_ok=True)
        files = []
        for index, (x, y, w, h) in enumerate(state["rects"]):
            crop = atlas.crop((x, y, x + w, y + h)).convert("RGBA")
            # place into a clean cell; center when the crop is smaller (auto-detect)
            if crop.size == (cell_w, cell_h):
                framed = crop
            else:
                framed = Image.new("RGBA", (cell_w, cell_h), (0, 0, 0, 0))
                framed.alpha_composite(crop, ((cell_w - w) // 2, (cell_h - h) // 2))
            out = state_dir / f"frame-{index}.png"
            atomic_save_image(framed, out)
            files.append(relative_posix(out, out_dir))
        m = meta.get(name, {})
        request_states[name] = {
            "frames": len(state["rects"]),
            "fps": int(m.get("fps", 6)),
            "loop": bool(m.get("loop", True)),
            "action": "",
        }
        manifest_rows.append({"state": name, "frames": len(state["rects"]), "method": "unpacked", "files": files, "ok": True})

    request = {
        "version": 1,
        "kind": REQUEST_KIND,
        "engine": "component-row",
        "character": {"id": run_dir.name, "description": f"unpacked from atlas ({layout_source})"},
        "cell": {"shape": "rect" if cell_w != cell_h else "square", "width": cell_w, "height": cell_h, "size": cell_w, "safe_margin": 0},
        "chroma_key": provenance.get("chroma_key", {"name": MAGENTA, "hex": format_hex(KEY_TARGETS[MAGENTA]), "rgb": list(KEY_TARGETS[MAGENTA])}),
        "states": request_states,
    }
    atomic_write_text(out_dir / REQUEST_FILENAME, json.dumps(request, ensure_ascii=False, indent=2) + "\n")
    atomic_write_text(
        frames_root / "frames-manifest.json",
        json.dumps({"ok": True, "engine": "component-row", "run_dir": str(run_dir), "cell": request["cell"], "rows": manifest_rows, "errors": [], "warnings": []}, ensure_ascii=False, indent=2) + "\n",
    )
    source_doc = {
        "version": 1,
        "kind": UNPACK_SOURCE_KIND,
        "layout_source": layout_source,
        "cell": {"width": cell_w, "height": cell_h},
        **provenance,
    }
    atomic_write_text(out_dir / "unpack-source.json", json.dumps(source_doc, ensure_ascii=False, indent=2) + "\n")
    return {"layout_source": layout_source, "states": [s["name"] for s in states], "cell": [cell_w, cell_h]}


def import_pngs(out_dir: Path, png_paths: list[Path], state_name: str, labels: list[str], iso: dict[str, Any] | None = None) -> dict[str, Any]:
    """단일 그룹 임포트 (하위호환 래퍼) — 그룹 지원 본체는 import_png_groups."""
    return import_png_groups(out_dir, [{"name": state_name, "paths": png_paths, "labels": labels}], iso)


def loop_marks(folder: Path, count: int) -> dict[int, str]:
    """The cells of a video-loop `cycle/` folder (one `*.strip.json` beside it, holding `count` cycle frames) that the
    held fill made between their neighbours (`made`) and that still show the picture before them (`held`), from the
    strip metadata's `held_fill` (docs/loop-repair.md section 7); nothing for any other folder. A cut given at
    `--out-fps` has every cell made at its own time: its held cells alone are marked."""
    metas = sorted(folder.parent.glob("*.strip.json")) if folder.name == "cycle" else []
    if len(metas) != 1:
        return {}
    meta = json.loads(metas[0].read_text(encoding="utf-8"))
    held = meta.get("held_fill")
    if not isinstance(held, dict) or meta.get("cycle_frames") != count:
        return {}
    marks = {} if "out_fps" in meta else {int(c): "made" for c in held.get("made", [])}
    for run in held.get("held_runs", []):
        marks.update({c: "held" for c in range(int(run["start"]) + 1, int(run["start"]) + int(run["length"]))})
    return marks


def import_png_groups(out_dir: Path, groups: list[dict[str, Any]], iso: dict[str, Any] | None = None,
                      base_src: Path | None = None, run_dir: Path | None = None) -> dict[str, Any]:
    """Import separate PNGs as one or more curator rows (states).

    groups: [{"name": str, "paths": [Path], "labels": [str], "refs": [Path]}] —
    하위폴더 하나가 큐레이터 줄 하나가 된다 (예: reference/ 와 portraits/ 를 분리).
    셀 크기는 전 그룹 공유 최대치라 카드 배율이 그룹 간에도 일관된다. 원본은 복사만 한다.

    소스 1급 수용 (run-contract.md §4): `base_src` 는 아이덴티티 truth →
    `base-source.<ext>` (큐레이션뷰 베이스 참조 줄). group 의 `refs` 는 그 줄의
    생성 재료 `<role>-<name>.png` → `references/imported/<state>/` (상태별 생성 재료
    칩). 역할(anchor/basis/guide) 해석은 serve_curation `_state_refs` 가 파일명에서
    단독 수행한다 (여긴 파일명 보존 복사만 — 역할 파싱 SSoT 이원화 금지).

    `run_dir` 는 out_dir(스테이징)을 내놓을 런 폴더 — 런은 그 이름과 경로를 단다, 스테이징 폴더의 것이 아니라.
    """
    run_dir = run_dir or out_dir
    loaded: list[tuple[dict[str, Any], list[Image.Image]]] = []
    cell_w = 0
    cell_h = 0
    for group in groups:
        imgs = [Image.open(p).convert("RGBA") for p in group["paths"]]
        cell_w = max(cell_w, max(i.width for i in imgs))
        cell_h = max(cell_h, max(i.height for i in imgs))
        loaded.append((group, imgs))

    request_states: dict[str, Any] = {}
    manifest_rows = []
    source_files: list[str] = []
    source_labels: list[str] = []
    imported_refs_manifest: dict[str, list[str]] = {}
    for group, imgs in loaded:
        state_name = str(group["name"])
        labels = list(group.get("labels", []))
        state_dir = out_dir / "frames" / state_name
        state_dir.mkdir(parents=True, exist_ok=True)
        files = []
        for index, im in enumerate(imgs):
            if im.size == (cell_w, cell_h):
                framed = im
            else:
                framed = Image.new("RGBA", (cell_w, cell_h), (0, 0, 0, 0))
                framed.alpha_composite(im, ((cell_w - im.width) // 2, (cell_h - im.height) // 2))
            out = state_dir / f"frame-{index}.png"
            atomic_save_image(framed, out)
            files.append(relative_posix(out, out_dir))
        request_states[state_name] = {"frames": len(imgs), "fps": 2, "loop": False, "action": "imported still set"}
        manifest_rows.append({"state": state_name, "frames": len(imgs), "method": "imported-pngs", "files": files, "labels": labels, "ok": True})
        source_files.extend(p.name for p in group["paths"])
        source_labels.extend(labels)
        # generation-material refs → references/imported/<state>/ (큐레이터 생성 재료 칩).
        # 파일명을 보존해 복사한다 — role 파싱은 serve_curation 이 단독으로.
        ref_paths = [Path(r) for r in group.get("refs", [])]
        if ref_paths:
            ref_dir = out_dir / "references" / "imported" / state_name
            ref_dir.mkdir(parents=True, exist_ok=True)
            for rp in ref_paths:
                shutil.copy2(rp, ref_dir / rp.name)
            imported_refs_manifest[state_name] = [rp.name for rp in ref_paths]

    # base 아이덴티티 truth → base-source.<ext> (큐레이션뷰 베이스 참조 줄). prepare.py 와
    # 동일하게 원본 확장자 보존 복사 (identity 는 재인코딩 없이 pristine 유지).
    base_out_name = None
    if base_src is not None:
        base_src = Path(base_src)
        base_out = out_dir / f"base-source{base_src.suffix.lower() or '.png'}"
        shutil.copy2(base_src, base_out)
        base_out_name = base_out.name

    first_dir = groups[0]["paths"][0].parent
    request = {
        "version": 1,
        "kind": REQUEST_KIND,
        "engine": "component-row",
        "character": {"id": run_dir.name, "description": f"imported PNG set from {first_dir}"},
        "cell": {"shape": "square" if cell_w == cell_h else "rect", "width": cell_w, "height": cell_h, "size": cell_w, "safe_margin": 0},
        "chroma_key": {"name": MAGENTA, "hex": format_hex(KEY_TARGETS[MAGENTA]), "rgb": list(KEY_TARGETS[MAGENTA])},
        "states": request_states,
    }
    if iso:
        request["iso"] = iso  # ground-grid geometry for the curator overlay
    atomic_write_text(out_dir / REQUEST_FILENAME, json.dumps(request, ensure_ascii=False, indent=2) + "\n")
    atomic_write_text(
        out_dir / "frames" / "frames-manifest.json",
        json.dumps({"ok": True, "engine": "component-row", "run_dir": str(run_dir), "cell": request["cell"],
                    "rows": manifest_rows, "errors": [], "warnings": []}, ensure_ascii=False, indent=2) + "\n",
    )
    atomic_write_text(
        out_dir / "unpack-source.json",
        json.dumps({"version": 1, "kind": UNPACK_SOURCE_KIND, "layout_source": "imported-pngs",
                    "cell": {"width": cell_w, "height": cell_h}, "source_dir": str(first_dir),
                    "files": source_files, "labels": source_labels,
                    "groups": [str(g["name"]) for g in groups],
                    "base_source": base_out_name, "imported_refs": imported_refs_manifest}, ensure_ascii=False, indent=2) + "\n",
    )
    return {"layout_source": "imported-pngs", "states": [str(g["name"]) for g in groups], "cell": [cell_w, cell_h],
            "frames": sum(len(imgs) for _, imgs in loaded),
            "base_source": base_out_name, "imported_refs": imported_refs_manifest}


def _refuse_overlap(inputs: dict[str, Path | None], out_dir: Path) -> None:
    """An input is never written, moved or deleted. Refused before anything is made: an input that is
    the run dir (the run would replace it), lies inside it or goes through anything inside it (a --force
    publish moves the run dir's prior content aside and deletes it entry by entry — a link as a link, so a
    path through it breaks), or holds it (the run would be written into the input). An input is followed
    the way the system opens it (`runio.follow_path`): every link and folder its path looks up, a folder a
    later `..` leaves again included. Read by real path and file identity, so a link, or a second spelling
    on a case-insensitive volume, is the same folder (`runio.refuse_overlap`, the judgment every writer calls)."""
    refuse_overlap(inputs, {"--out-dir": out_dir}, holds=("--out-dir",),
                   replaces="--force replaces the run dir's content")


def _found_inputs(src: Path, groups: list[dict[str, Any]], *files: Path | None) -> dict[str, Path]:
    """What an import reads in its --pngs-dir `src`, named by where it was found there: every folder it reads a file
    from (a group folder, `_base`, `_refs`), then every file it reads (a frame, a `_refs` PNG, and `files`: the
    `_base` image and meta.json when it reads them). Any of them may be a link, and lead into the run dir or
    through it."""
    read = [p for g in groups for p in (*g["paths"], *g["refs"])] + [p for p in files if p is not None]
    folders = [f for f in dict.fromkeys(p.parent for p in read) if f != src]
    return {f"{relative_posix(p, src)} in --pngs-dir": p for p in (*folders, *read)}


def _build_and_publish(out_dir: Path, build: Callable[[Path], dict[str, Any]]) -> dict[str, Any]:
    """Make the run dir, take its single-writer lock, build the run into a staging folder of this
    run's own beside it (`.<out>.<pid>-<random>.sg-staging`, a new name, so a folder of the old fixed
    name — an input or another run's — is never touched), then publish it over out_dir. A failed or
    invalid build leaves the prior run intact; the staging folder is the only thing beside out_dir the
    run deletes. Called once every input is read and checked, so a refusal has made nothing."""
    try:
        out_dir.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise SystemExit(f"cannot create run dir next to the input: {out_dir}\n  {exc}\n  pass --out-dir <writable path> to choose another location")
    acquire_run_dir_lock(out_dir, "unpack_atlas_run")
    staging = new_stage(out_dir, ".sg-staging")
    try:
        result = build(staging)
        _publish_run(staging, out_dir)
    finally:
        shutil.rmtree(staging, ignore_errors=True)
    return result


_PUBLISH_BACKUP = "sg-backup"  # the in-place backup is `.sg-backup.<pid>-<random>` (runio.new_stage)


def _publish_run(staging: Path, out_dir: Path) -> None:
    """Publish the fully-built staging run into out_dir.

    Named isolation strategy: **out_dir (and the `.sprite-gen.lock` inside it) never
    disappears** during the publish. Prior content is relocated into an in-place
    `.sg-backup` subdir and staging content moved in — out_dir is never renamed away, so a
    concurrent writer's `acquire_run_dir_lock(out_dir)` always finds the held lock and
    blocks (runio single-writer contract holds across the whole publish). On an I/O failure
    the swap rolls back to the prior run byte-intact (Atomicity: succeed or roll back).
    The backup is a new folder of this publish's own, so a `.sg-backup` already in the prior run
    is prior content like any other: moved aside, restored by a rollback, replaced on success.
    Called only after a successful build."""
    # publish_guard (exclusive) blocks concurrent readers (serve_curation read_guard) for
    # the whole swap, so a serving /api/run never observes the half-published state
    # (reader isolation — a reader sees the complete prior run or the complete new run).
    with publish_guard(out_dir):
        backup = new_stage(out_dir / _PUBLISH_BACKUP, "")
        reserved = {LOCK_FILENAME, backup.name}
        moved: list[str] = []
        phase1_done = False
        try:
            for child in [c for c in out_dir.iterdir() if c.name not in reserved]:
                child.rename(backup / child.name)          # prior content -> in-place backup
                moved.append(child.name)
            phase1_done = True
            for child in [c for c in staging.iterdir() if c.name != LOCK_FILENAME]:
                child.rename(out_dir / child.name)          # new content -> out_dir
        except OSError:
            # roll back to the prior run byte-intact.
            if phase1_done:
                # all prior content is safe in backup; drop any partial new content we placed.
                for child in [c for c in out_dir.iterdir() if c.name not in reserved]:
                    shutil.rmtree(child) if child.is_dir() else child.unlink()
            # restore relocated prior content (a phase-1-partial failure left the rest in place)
            for name in moved:
                (backup / name).rename(out_dir / name)
            raise
        finally:
            shutil.rmtree(backup, ignore_errors=True)


def parse_grid(value: str) -> tuple[int, int]:
    cols, rows = value.lower().split("x")
    return int(cols), int(rows)


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--atlas", type=Path, help="sprite sheet PNG (or use --manifest)")
    parser.add_argument("--manifest", type=Path, help="manifest JSON with frame layout")
    parser.add_argument("--pngs-dir", type=Path, help="folder of separate PNGs to import as one state's frames")
    parser.add_argument("--state-name", default="items", help="state name for --pngs-dir import")
    parser.add_argument("--out-dir", type=Path, help="run dir for output; defaults to a '<source>-curator' folder next to the input so it is easy to find")
    parser.add_argument("--grid", type=parse_grid, help="explicit COLSxROWS, for example 8x9")
    parser.add_argument("--cell", type=parse_grid, help="explicit cell WxH (for manifests missing cell size)")
    parser.add_argument("--direction", help="which direction to unpack from a multi-direction manifest")
    parser.add_argument("--states", help="comma-separated state names to override detected/row names")
    parser.add_argument("--auto", action="store_true", help="force alpha auto-detect even if a manifest is given")
    parser.add_argument("--force", action="store_true", help="overwrite an existing out-dir")
    return parser


def _run(args: argparse.Namespace):

    # default the run dir to a clearly-findable sibling next to the input.
    if args.out_dir:
        out_dir = args.out_dir.expanduser().resolve()
    else:
        if args.pngs_dir:
            _, base = follow_input("--pngs-dir", args.pngs_dir.expanduser())
            out_dir = base.parent / f"{base.name}-curator"
        elif args.atlas:
            _, base = follow_input("--atlas", args.atlas.expanduser())
            out_dir = base.parent / f"{base.stem}-curator"
        elif args.manifest:
            _, base = follow_input("--manifest", args.manifest.expanduser())
            out_dir = base.parent / f"{base.stem}-curator"
        else:
            raise SystemExit("need one of --pngs-dir / --atlas / --manifest (or pass --out-dir)")
    out_dir = out_dir.resolve()  # a link publishes where it points; inputs are compared with the real run dir

    _refuse_overlap({"--pngs-dir": args.pngs_dir, "--atlas": args.atlas, "--manifest": args.manifest}, out_dir)
    if out_dir.exists() and any(out_dir.iterdir()) and not args.force:
        raise SystemExit(f"out-dir not empty: {out_dir} (use --force)")

    # --pngs-dir: import a folder of separate PNGs (e.g. a furniture set).
    # 하위폴더가 있으면 각 하위폴더가 큐레이터 줄(state) 하나가 된다 —
    # 예: reference/ (베이스 이미지 칸) + portraits/ (표정 세트 줄).
    if args.pngs_dir:
        src = args.pngs_dir.expanduser().resolve()
        top_pngs = sorted(p for p in src.glob("*.png"))
        # reserved underscore dirs carry sources, not curator rows (run-contract.md §4):
        #   _base/ = whole-set identity image, <group>/_refs/ = that row's generation material.
        reserved = {"_base", "_refs"}
        subdirs = sorted(d for d in src.iterdir() if d.is_dir() and d.name not in reserved)
        # _base/<img> → base-source (base reference row). Accept the same formats serve_curation shows.
        base_src = None
        base_dir = src / "_base"
        if base_dir.is_dir():
            base_candidates = sorted(p for p in base_dir.iterdir()
                                     if p.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp"))
            if len(base_candidates) > 1:
                # _base is the run's single identity image; picking one of several silently would
                # make identity SSoT ambiguous (No Silent Fallback).
                raise SystemExit(
                    f"_base/ has {len(base_candidates)} images ({', '.join(p.name for p in base_candidates)}); "
                    f"provide exactly one identity image."
                )
            if base_candidates:
                base_src = base_candidates[0]

        def _group_refs(group_dir: Path) -> list[Path]:
            rd = group_dir / "_refs"
            return sorted(rd.glob("*.png")) if rd.is_dir() else []

        # prefer human names from a sibling meta.json (file -> item name), else filename stem
        file_to_name: dict[str, str] = {}
        iso = None
        meta_path = src / "meta.json"
        if meta_path.is_file():
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
            file_to_name = {info.get("file"): name for name, info in meta.get("items", {}).items() if isinstance(info, dict)}
            tile = meta.get("tile")
            anchor = meta.get("anchor")
            if tile and anchor:
                iso = {
                    "tile": {"width": int(tile["width"]), "height": int(tile["height"])},
                    "projection": tile.get("projection", "2:1 dimetric diamond"),
                    "anchor_pixel": anchor.get("pixel", [128, 222]),
                    "canvas": meta.get("style", {}).get("canvas", [256, 256]),
                }
        groups: list[dict[str, Any]] = []
        if top_pngs:
            groups.append({"name": args.state_name, "paths": top_pngs,
                           "labels": [file_to_name.get(p.name, p.stem) for p in top_pngs],
                           "refs": _group_refs(src)})
        for sub in subdirs:
            sub_pngs = sorted(p for p in sub.glob("*.png"))
            if sub_pngs:
                groups.append({"name": sub.name, "paths": sub_pngs,
                               "labels": [file_to_name.get(p.name, p.stem) for p in sub_pngs],
                               "refs": _group_refs(sub)})
        if not groups:
            raise SystemExit(f"no PNGs in {src}")
        for group in groups:
            # a video-loop cut's cells: each made between its neighbours, or still the picture before it, says so on its card
            marks = loop_marks(group["paths"][0].parent, len(group["paths"]))
            group["labels"] = [f"{label} ({marks[k]})" if k in marks else label for k, label in enumerate(group["labels"])]
        # imported ref roles are validated fail-loud (run-contract §4). A _refs file whose
        # prefix isn't a known role (anchor/basis/guide) is malformed input — reject it
        # loudly instead of silently relabeling it as guide (No Silent Fallback).
        bad_refs = [f"{g['name']}/_refs/{Path(r).name}"
                    for g in groups for r in g.get("refs", [])
                    if imported_ref_role(Path(r).name) is None]
        if bad_refs:
            raise SystemExit("invalid _refs role prefix — expected anchor-/basis-/guide-<name>.png, got: "
                             + ", ".join(bad_refs))
        # what the import found in --pngs-dir is an input too: a link there may lead into --out-dir or through it,
        # whose prior content --force deletes. Compared with the run dir once all of it is found, before the run dir
        # is made.
        _refuse_overlap(_found_inputs(src, groups, base_src, meta_path if meta_path.is_file() else None), out_dir)
        # atomic rebuild: all validation above ran before any mutation; build into a
        # staging dir, then publish over out_dir. A --force re-import that fails (or is
        # invalid) leaves the prior run intact — never clear-then-fail.
        result = _build_and_publish(
            out_dir, lambda staging: import_png_groups(staging, groups, iso, base_src=base_src, run_dir=out_dir))
        result["ok"] = True
        result["out_dir"] = str(out_dir)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0

    manifest = json.loads(args.manifest.read_text(encoding="utf-8")) if args.manifest else None
    provenance: dict[str, Any] = {
        "atlas": str(args.atlas) if args.atlas else None,
        "manifest": str(args.manifest) if args.manifest else None,
        "direction": args.direction,
    }

    # resolve layout + atlas image
    atlas_path = args.atlas
    meta: dict[str, Any] = {}
    if args.grid:
        layout_source = "grid-explicit"
        if not atlas_path:
            raise SystemExit("--grid needs --atlas")
        atlas = Image.open(atlas_path).convert("RGBA")
        states, cell = grid_layout(atlas, *args.grid)
    elif manifest and not args.auto:
        layout_source = "manifest"
        states, cell, atlas_name, meta = manifest_layout(manifest, args.direction)
        provenance["chroma_key"] = manifest.get("chroma_key") if isinstance(manifest.get("chroma_key"), dict) else None
        if not atlas_path:
            atlas_path = (args.manifest.parent / atlas_name) if atlas_name else None
        if not atlas_path or not Path(atlas_path).is_file():
            raise SystemExit(f"could not locate atlas image (manifest pointed to {atlas_name}); pass --atlas")
        atlas = Image.open(atlas_path).convert("RGBA")
    else:
        layout_source = "auto-detect"
        if not atlas_path:
            raise SystemExit("auto-detect needs --atlas")
        atlas = Image.open(atlas_path).convert("RGBA")
        states, cell = auto_detect(atlas)

    if args.states:
        names = [n.strip() for n in args.states.split(",")]
        for i, name in enumerate(names):
            if i < len(states):
                states[i]["name"] = name

    provenance["atlas"] = str(atlas_path)
    if not args.atlas:
        _refuse_overlap({"the atlas the manifest names": Path(atlas_path)}, out_dir)
    # atomic rebuild (see --pngs-dir): atlas/layout resolution above is read-only; build
    # into staging, then publish over out_dir so a failed rebuild leaves the prior run intact.
    result = _build_and_publish(
        out_dir, lambda staging: write_run(staging, atlas, states, cell, meta, layout_source, provenance,
                                           run_dir=out_dir))
    result["ok"] = True
    result["out_dir"] = str(out_dir)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0



def run(**kwargs: object):
    return _run(namespace_from_kwargs(_build_parser(), kwargs))

def main() -> int:
    utf8_streams()
    parser = _build_parser()
    args = parser.parse_args()
    return _run(args)


if __name__ == "__main__":
    raise SystemExit(main())
