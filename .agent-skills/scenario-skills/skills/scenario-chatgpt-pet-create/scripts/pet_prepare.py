#!/usr/bin/env python3
"""Set up a ChatGPT pet run: request, background key and generation jobs.

  init   create the run folder, request.json and jobs.json (one prompt and size per job)
  note   append a sentence to some jobs' prompts (look mechanics, user feedback)
  pixel  derive the pixel grid and palette from a Pixel Snapper result of the base
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pet_common as pc  # noqa: E402

SUNBURST = "model_openai-gpt-image-2-5-sunburst"
NANO_BANANA = "model_google-gemini-nano-banana-2-1"
MAX_USER_REFERENCES = 6  # leaves room for the base, contact sheet and look references (10 max)

STYLES = {
    "auto": "pick one style that suits the concept and any references, then keep it identical in every image",
    "pixel": "pixel art with a chunky readable silhouette, a one-pixel dark outline, a small fixed palette, flat cel shading and hard stepped edges, no anti-aliasing or gradients",
    "plush": "a soft plush toy with rounded stitched fabric shapes, felt and fleece textures and sewn-on details",
    "clay": "a hand-sculpted clay figure with rounded forms, a matte finish and a faint handmade texture",
    "sticker": "glossy sticker art with bold simple shapes, a thick clean outline, flat fills and one small highlight",
    "flat-vector": "a flat vector illustration with geometric shapes, solid color areas, a crisp outline and almost no shading",
    "3d-toy": "a stylized 3D vinyl toy with smooth rounded forms, soft studio lighting and simple materials, not photoreal",
    "painterly": "light painterly rendering, simple brush texture inside clean, well-defined edges",
    "match": "exactly the style of the reference images: same rendering, outline, palette and level of detail",
    "brand-inspired": "a mascot built from the brand cues given (colors, shapes, attitude), never its logo, wordmark or any readable text",
}

ACTIONS = {
    "idle": "Idle loop: the character stands relaxed in its default pose facing the viewer, breathes, blinks once and sways very slightly. Feet stay planted. The first and last poses are nearly identical. No gestures, no walking, no props.",
    "running-right": "Run cycle toward the right edge of the image: the character faces screen-right and runs in place with clearly alternating legs (or its own way of moving), arms and appendages swinging in opposition. The poses form one smooth loop.",
    "running-left": "Run cycle toward the left edge of the image: the character faces screen-left and runs in place with clearly alternating legs (or its own way of moving), arms and appendages swinging in opposition. The poses form one smooth loop.",
    "waving": "Friendly wave: the first pose is the idle stance, then one arm (or paw, wing, appendage) rises, waves side to side and comes back down by the last pose. The greeting is shown by the limb only.",
    "jumping": "Small happy jump in place: pose 1 crouches to prepare, pose 2 springs up, pose 3 is the highest point with the whole character clearly above the ground line, pose 4 comes down, pose 5 lands back in the idle stance on the same ground line. The character keeps its size; the height comes from its position only.",
    "failed": "Something went wrong: the first pose is the idle stance, then the character shows disappointment (slumping, drooping ears or arms, sad eyes, a facepalm) and holds it. Tears, a puff of smoke or dizzy stars are fine only when they touch the character.",
    "waiting": "Waiting for the user: an expectant, asking pose (looking out at the viewer, an open palm, a small hopeful bob) that clearly says it needs an answer or approval. Distinct from idle and from reviewing.",
    "running": "Busy working: the character concentrates in place with its own body only (a hand on its chin, tapping fingers, a determined frown, a small focused bob). No objects, tools or screens unless the character already has them. This is not running: no legs in motion, no travel.",
    "review": "Reviewing finished work: the character leans in, narrows its eyes or tilts its head as if inspecting something just in front of it. No new props such as magnifying glasses, papers or screens unless the character already has them.",
}

LOOK_RULES = (
    "Right and left are the viewer's right and left edges of the image, never the character's own. "
    "Body, feet and size stay exactly the same in every pose; only the eyes, head, upper body and attached parts move, "
    "the way this character naturally looks around. Never rotate, tilt or shrink the whole character. "
    "Anything that sits on one side (a leaf or antenna leaning one way, a patch, a badge) stays on that same side in every pose."
)
LOOKS = {
    "look-cardinals": (
        "Four poses of the character looking in four screen directions, in this order: "
        "1 straight up toward the top edge, 2 toward the right edge, 3 down toward the bottom edge, 4 toward the left edge. "
        "Each direction must read instantly at a small size."
    ),
    "look-9": (
        "Eight poses of one smooth look-around sweep, clockwise, in this order: up; up and slightly right; up-right; "
        "right and slightly up; right; right and slightly down; down-right; down and slightly right."
    ),
    "look-10": (
        "Eight poses continuing the look-around sweep, clockwise, in this order: down; down and slightly left; down-left; "
        "left and slightly down; left; left and slightly up; up-left; up and slightly left. "
        "The last pose is one small step before looking straight up."
    ),
}
# Which reference sentences a look prompt carries depends on which references the job has.
CARDINALS_REF = "The reference with four poses shows up, right, down and left: match those exactly and step evenly between them."
FIRST_HALF_REF = "The other eight-pose reference is the first half of the sweep: continue it, so the first pose follows its last one."
KEPT_ROW_REF = "The reference strip for these directions is the pet's current version of this row: keep its directions and order, and change only what the notes ask."

FORBIDDEN = (
    "No text, numbers, labels, frames, grid lines or borders. No speed lines, motion blur, dust, shadows, sparkles, "
    "or any effect floating apart from the character."
)


def background(key: dict) -> str:
    color = key["hex"] if key["name"] == key["hex"] else f"{key['name']} {key['hex']}"
    return (
        f"Background: one perfectly flat {color} fill from edge to edge, with no gradient, texture, floor, "
        f"shadow, glow or vignette. No {color} or similar color anywhere on the character."
    )


def base_prompt(req: dict) -> str:
    parts = [
        f"{req['display_name']}, an animated pet companion: {req['notes']}.",
        "One full-body character, centered, facing the viewer in its default standing pose.",
        "Compact proportions that read at 192 by 208 pixels: a large head, a clear face, bold shapes, few tiny details.",
        f"Style: {req['style_text']}.",
    ]
    if req["references"]:
        parts.append("Keep the identity shown in the reference images: shapes, colors, markings, outfit and props.")
    return " ".join(parts + [background(req["chroma_key"]), FORBIDDEN])


def edit_prompt(req: dict, change: str) -> str:
    return " ".join(
        [
            f"Edit the character in the reference image: {change}.",
            "Keep everything else identical: proportions, face, palette, outline, style and pose.",
            "One full-body character, centered, facing the viewer.",
            background(req["chroma_key"]),
            FORBIDDEN,
        ]
    )


def strip_prompt(req: dict, frames: int, action: str, retry: bool = False) -> str:
    lead = (
        f"Draw exactly {frames} full-body poses of the same character in one horizontal row, left to right in "
        "animation order, evenly spaced with clear empty background between neighbors, every pose fully inside "
        "the image with a margin."
    )
    same = (
        "Same character as the reference image in every pose: identical face, proportions, colors, markings, "
        "outline, material and props. Same size in every pose, standing on the same ground line, except where "
        "the action itself lifts the character."
    )
    style = f"Style: {req['style_text']}."
    retry_lead = [f"Exactly {frames} poses, every one fully separated from its neighbors and none touching the image edge."] if retry else []
    return " ".join([*retry_lead, lead, same, style, action, background(req["chroma_key"]), FORBIDDEN])


def sizes(frames: int) -> dict:
    """Request size per named model. Sunburst gets one 448 px slot per pose; asked for 3584x512
    it returned 3584x1200, so the height is never below a third of the width. Nano Banana
    gets the nearest wider aspect preset."""
    if frames == 1:
        return {SUNBURST: {"width": 1024, "height": 1024}, NANO_BANANA: {"aspectRatio": "1:1"}}
    width = min(3840, frames * 448)
    height = max(512, -(-width // 48) * 16)
    return {
        SUNBURST: {"width": width, "height": height},
        NANO_BANANA: {"aspectRatio": "4:1" if frames <= 4 else "8:1"},
    }


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def text_key(text: str):
    words = set(re.findall(r"[a-z]+", text.lower()))
    if words & {"magenta", "pink", "purple", "violet", "fuchsia", "lilac"}:
        if words & {"green", "lime", "olive"}:
            return "cyan", (0, 255, 255)
        return "green", (0, 255, 0)
    return "magenta", (255, 0, 255)


def resolve_jobs(only: str | None, version: int) -> list:
    every = list(pc.STANDARD) + (["look-cardinals", "look-9", "look-10"] if version == 2 else [])
    if not only:
        return every
    wanted = []
    for item in (part.strip() for part in only.split(",")):
        names = ["look-cardinals", "look-9", "look-10"] if item == "look" else [item]
        for name in names:
            if name not in every:
                pc.fail(f"unknown job {name!r} for a v{version} sheet; choose from {', '.join(every)} or 'look'")
            if name not in wanted:
                wanted.append(name)
    return [job for job in every if job in wanted]


def build_jobs(req: dict, wanted: list, base_kind: str | None, change: str | None, kept: set = frozenset(), current_rows: bool = True) -> list:
    """`kept` names the rows of an existing sheet whose strips sit in references/rows/; `current_rows`
    False leaves a redone row's own old strip out (its motion or directions are what is wrong)."""
    user_refs = req["references"]
    jobs = []

    def add(job_id, kind, frames, prompt, retry, refs, depends):
        jobs.append(
            {
                "id": job_id,
                "kind": kind,
                "frames": frames,
                "prompt": prompt,
                "retry_prompt": retry,
                "references": refs,
                "sizes": sizes(frames),
                "depends_on": depends,
                "output": f"generated/{job_id}.png",
                "status": "pending",
                "asset_ids": {},
            }
        )

    if base_kind == "edit":
        prompt = edit_prompt(req, change)
        add("base", "edit", 1, prompt, prompt, ["references/base.png"], [])
    elif base_kind == "base":
        prompt = base_prompt(req)
        add("base", "base", 1, prompt, prompt, user_refs, [])
    after_base = ["base"] if base_kind else []
    redo = bool(req.get("base_sheet")) and base_kind is None and current_rows
    for job in pc.STANDARD:
        if job not in wanted:
            continue
        frames = pc.frame_count(job)
        refs = ["references/base.png", *user_refs]
        if redo:
            refs.append(f"references/rows/{job}.png")
        depends = list(after_base)
        if job == "running-left" and "running-right" in wanted:
            refs.append("generated/running-right.png")
            depends.append("running-right")
        action = ACTIONS[job]
        add(job, "row", frames, strip_prompt(req, frames, action), strip_prompt(req, frames, action, True), refs, depends)
    standard_jobs = [job for job in pc.STANDARD if job in wanted]
    for job, frames in (("look-cardinals", 4), ("look-9", 8), ("look-10", 8)):
        if job not in wanted:
            continue
        # Reference only what this run generates or what the existing sheet keeps.
        refs, depends, sentences = ["references/base.png"], [], [LOOKS[job]]
        if job == "look-cardinals":
            depends = after_base + standard_jobs
        else:
            if "look-cardinals" in wanted:
                refs.append("generated/look-cardinals.png")
                depends.append("look-cardinals")
                sentences.append(CARDINALS_REF)
            if job == "look-10" and ("look-9" in wanted or "look-9" in kept):
                refs.append("generated/look-9.png" if "look-9" in wanted else "references/rows/look-9.png")
                depends += ["look-9"] if "look-9" in wanted else []
                sentences.append(FIRST_HALF_REF)
            if redo and job in kept:
                refs.append(f"references/rows/{job}.png")
                sentences.append(KEPT_ROW_REF)
        action = " ".join([*sentences, LOOK_RULES])
        add(job, "look", frames, strip_prompt(req, frames, action), strip_prompt(req, frames, action, True), refs, depends)
    return jobs


def cmd_init(args) -> int:
    name = (args.name or "").strip()
    pet_id = slug(args.id or name or "pet")
    if not pet_id:
        pc.fail("--id or --name must contain letters or digits")
    display = name or pet_id.replace("-", " ").title()
    split = None
    if args.from_split:
        split = pc.read_json(Path(args.from_split) / "summary.json")
        if not split.get("ok"):
            pc.fail("the split summary is not ok; run pet_frames.py split on a valid sheet first")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    run = Path(args.out) if args.out else Path.cwd() / "pets" / f"{pet_id}-{stamp}"
    if run.exists() and any(run.iterdir()) and not args.force:
        pc.fail(f"{run} is not empty; pass --force to reuse it")
    for sub in ("references/rows", "generated", "frames", "qa", "previews", "final", "package"):
        (run / sub).mkdir(parents=True, exist_ok=True)

    if len(args.reference) > MAX_USER_REFERENCES:
        pc.fail(f"at most {MAX_USER_REFERENCES} reference images; pick the ones that define the pet best")
    references = []
    for index, source in enumerate(args.reference, start=1):
        source = Path(source)
        if not source.is_file():
            pc.fail(f"reference not found: {source}")
        target = run / "references" / f"user-{index:02d}{source.suffix.lower() or '.png'}"
        shutil.copy2(source, target)
        references.append(str(target.relative_to(run)))

    notes = (args.notes or args.description or f"an original pet called {display}").strip().rstrip(".")
    description = (args.description or f"{display}, an animated pet companion.").strip()
    version = args.version or (split["version"] if split else 2)
    style = "pixel" if args.pixel else args.style or ("match" if split else "auto")
    style_text = STYLES[style] + (f"; {args.style_notes.strip()}" if args.style_notes else "")

    if args.chroma_key:
        rgb = pc.parse_key(args.chroma_key)
        known = next((n for n, c in pc.KEY_CANDIDATES if c == rgb), pc.key_hex(rgb))
        key = {"name": known, "hex": pc.key_hex(rgb), "selection": "manual"}
    elif split:
        key = dict(split["chroma_key"])
    elif references:
        pixels = np.concatenate([pc.sample_pixels(pc.load_rgba(run / ref)) for ref in references])
        key_name, rgb, score = pc.choose_key(pixels)
        key = {"name": key_name, "hex": pc.key_hex(rgb), "selection": "references", "score": score}
    else:
        key_name, rgb = text_key(f"{notes} {description} {args.style_notes or ''}")
        key = {"name": key_name, "hex": pc.key_hex(rgb), "selection": "text"}

    req = {
        "pet_id": pet_id,
        "display_name": display,
        "description": description,
        "notes": notes,
        "style": style,
        "style_text": style_text,
        "version": version,
        "pixel": bool(args.pixel),
        "chroma_key": key,
        "references": references,
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    if split:
        req["base_sheet"] = split["sheet"]
        req["source_version"] = split["version"]
        shutil.copy2(Path(args.from_split) / "identity.png", run / "references" / "base.png")
        for strip in sorted((Path(args.from_split) / "strips").glob("*.png")):
            shutil.copy2(strip, run / "references" / "rows" / strip.name)
        if split.get("pixel_grid"):
            req["pixel"] = True
            pc.write_json(run / "pixel.json", {"grid": split["pixel_grid"], "palette": split["palette"]})
    pc.write_json(run / "request.json", req)

    if split and args.change:
        base_kind = "edit"
    elif split:
        base_kind = None
    else:
        base_kind = "base"
    kept = {strip.stem for strip in (run / "references" / "rows").glob("*.png")}
    jobs = build_jobs(req, resolve_jobs(args.only, version), base_kind, args.change, kept, not args.no_current_row)
    pc.write_json(run / "jobs.json", {"pet_id": pet_id, "chroma_key": key["hex"], "jobs": jobs})
    ready = [job["id"] for job in jobs if not job["depends_on"]]
    print(json.dumps({"ok": True, "run": str(run), "chroma_key": key, "jobs": [j["id"] for j in jobs], "ready": ready}))
    return 0


def cmd_note(args) -> int:
    path = Path(args.run) / "jobs.json"
    data = pc.read_json(path)
    targets = {part.strip() for part in args.jobs.split(",")}
    known = {job["id"] for job in data["jobs"]}
    if targets - known:
        pc.fail(f"unknown jobs: {', '.join(sorted(targets - known))}")
    text = args.text.strip()
    for job in data["jobs"]:
        if job["id"] in targets:
            job["prompt"] = f"{job['prompt']} {text}"
            job["retry_prompt"] = f"{job['retry_prompt']} {text}"
    pc.write_json(path, data)
    print(json.dumps({"ok": True, "jobs": sorted(targets)}))
    return 0


def cmd_pixel(args) -> int:
    run = Path(args.run)
    req = pc.read_json(run / "request.json")
    key = pc.parse_key(req["chroma_key"]["hex"])
    snapped = pc.remove_key(pc.load_rgba(args.snapped), key)
    box = pc.bbox(pc.visible(snapped))
    if box is None:
        pc.fail("the snapped image has no pixels left after removing the background")
    x0, y0, x1, y1 = box
    width, height = x1 - x0, y1 - y0
    usable_w, usable_h = pc.CELL_W - 2 * pc.MARGIN, pc.CELL_H - 2 * pc.MARGIN
    # Grid 1 is pixel art drawn at cell resolution: palette and on/off alpha, no block enlargement.
    grid = next((k for k in (8, 4, 2, 1) if width * k <= usable_w and height * k <= usable_h), None)
    if grid is None:
        pc.fail(
            f"the snapped pet is {width}x{height} px, larger than a pet cell ({usable_w}x{usable_h}); "
            "check that the Pixel Snapper result is the downsized one"
        )
    pet = snapped[y0:y1, x0:x1]
    solid = pc.visible(pet)
    colors = np.unique(pet[solid][:, :3], axis=0)
    # The snapper quantizes the outline's blend with the background into colors of their own
    # (purple on a magenta key); the build maps those pixels to the nearest pet color instead.
    blends = pc.key_like(colors, key)
    if blends.all():
        pc.fail("every snapped color carries the key's hue; re-run init with another --chroma-key")
    colors = colors[~blends]
    if len(colors) > args.colors:
        sample = Image.fromarray(np.ascontiguousarray(pet[solid][:, :3].reshape(1, -1, 3)))
        reduced = np.array(sample.quantize(args.colors, method=Image.Quantize.MEDIANCUT).convert("RGB"))
        colors = np.unique(reduced.reshape(-1, 3), axis=0)
    pc.write_json(
        run / "pixel.json",
        {"grid": grid, "native_size": [width, height], "palette": [pc.key_hex(c) for c in colors]},
    )
    base = run / "references" / "base.png"
    original = run / "references" / "base-source.png"
    if base.exists() and not original.exists():
        shutil.copy2(base, original)
    factor = max(grid, 512 // height)
    big = np.repeat(np.repeat(pet, factor, axis=0), factor, axis=1)
    big[~np.repeat(np.repeat(solid, factor, axis=0), factor, axis=1)] = 0
    pc.save_png(pc.on_key(big, key, pad=factor * 4), base)
    req["pixel"] = True
    pc.write_json(run / "request.json", req)
    print(json.dumps({"ok": True, "grid": grid, "native_size": [width, height], "colors": len(colors), "key_blends_dropped": int(blends.sum())}))
    return 0


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    init = sub.add_parser("init", help="create a run folder with its request and jobs")
    init.add_argument("--name", help="display name, e.g. 'Biscuit'")
    init.add_argument("--id", help="folder-safe id; defaults to the name")
    init.add_argument("--description", help="one sentence shown with the pet")
    init.add_argument("--notes", help="what the pet looks like: species, colors, outfit, props, personality")
    init.add_argument("--style", choices=sorted(STYLES), help="default auto; match when updating a sheet")
    init.add_argument("--style-notes", help="extra style wording appended to the preset")
    init.add_argument("--reference", action="append", default=[], help="reference image (repeatable, up to 6)")
    init.add_argument("--version", type=int, choices=(1, 2), help="2 adds the 16 look directions (default 2)")
    init.add_argument("--pixel", action="store_true", help="pixel-perfect mode (forces the pixel style)")
    init.add_argument("--chroma-key", help="#RRGGBB background key; chosen automatically when omitted")
    init.add_argument("--from-split", help="folder written by pet_frames.py split: update an existing sheet")
    init.add_argument("--only", help="comma list of jobs to generate (or 'look' for the three look jobs)")
    init.add_argument("--change", help="with --from-split: edit the pet into a new look (adds an edit job)")
    init.add_argument("--no-current-row", action="store_true", help="with --from-split: do not reference a redone row's old strip")
    init.add_argument("--out", help="run folder; default ./pets/<id>-<UTC time>")
    init.add_argument("--force", action="store_true", help="reuse a non-empty run folder")
    init.set_defaults(func=cmd_init)

    note = sub.add_parser("note", help="append a sentence to some jobs' prompts")
    note.add_argument("run")
    note.add_argument("--jobs", required=True, help="comma list of job ids")
    note.add_argument("--text", required=True)
    note.set_defaults(func=cmd_note)

    pixel = sub.add_parser("pixel", help="grid and palette from a Pixel Snapper result of the base")
    pixel.add_argument("run")
    pixel.add_argument("--snapped", required=True, help="the downloaded Pixel Snapper output")
    pixel.add_argument("--colors", type=int, default=24, help="palette cap (match the snapper's colors)")
    pixel.set_defaults(func=cmd_pixel)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
