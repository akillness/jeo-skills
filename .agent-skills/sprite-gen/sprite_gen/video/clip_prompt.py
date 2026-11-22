# SPDX-License-Identifier: Apache-2.0
"""`sprite-gen video-prompt` — the clip prompt for one (direction, state), for a clip made elsewhere.

`video-set` builds this prompt (`batch.build_prompt`) and sends it to `sprite-gen video` itself.
When the clip is made by another tool instead — a video MCP connected to the user's own agent,
such as ZCRE — the agent asks for the prompt here, sends it with the `video-canvas` still through
that tool, and hands the mp4 back to `video-frames` and `video-loop`. The engine never calls the
other tool: this verb prints text and reads nothing but its arguments.

A clip source that cannot pin an end frame (`--no-last-frame`; ZCRE's `grok-imagine-video-1.5` has
image-to-video only) cannot film what `video-set` films pinned (`pins_last_frame`: idle, attack, a
walk or run in a diagonal). Those are refused, or with `--unpinned` asked for as an unpinned clip,
with a warning: the prompt then asks for an evenly paced repeat (an attack still asks for one
strike), the loop is searched instead of cut whole, and it may not close.

`--play` gives the play mode as `video-set --play` does (`play.MODES`): a motion of your own, named
by `--state` and described by `--motion`, is asked for and cut as that mode says.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from sprite_gen.frames.cutout import GREEN
from sprite_gen.gen import prompt_parts
from sprite_gen.gen.chroma import KEY_BACKGROUND_TEXT
from sprite_gen.gen.facing import FACINGS
from sprite_gen.gen import handedness as handed_mod
from sprite_gen.gen.handedness import Handed
from sprite_gen.gen.video import DEFAULT_MODEL  # the clip model the prompt is for unless named: gen.video's default
from sprite_gen.video import batch as batch_mod
from sprite_gen.video import body_plan as body_mod
from sprite_gen.video import effect as effect_mod
from sprite_gen.video import play as play_mod
from sprite_gen.video.body_plan import Body
from sprite_gen.util.console import utf8_streams

START_STILL_KEYS = tuple(KEY_BACKGROUND_TEXT)


def plan_prompt(*, direction: str, state: str, facing: str = "right", character: str | None = None,
                motion: str | None = None, model: str = DEFAULT_MODEL, last_frame: bool = True,
                unpinned: bool = False, duration: int | None = None, key: str = GREEN,
                handed: list[Handed] | None = None, body_plan: list[Body] | None = None, end_frame: Path | None = None,
                play: str | None = None) -> dict[str, Any]:
    """The prompt `video-set` would send for (direction, state), and how its clip is to be cut. `handed`
    (`handedness.parse`) adds where each asymmetric item is in this view, as `video-set --handed` does;
    `body_plan` (`body_plan.parse_all`) what the subject stands on, as `video-set --body-plan` does; `play` the play
    mode (`play.MODES`; None, the state's preset), as `video-set --play` does."""
    if direction not in batch_mod.VIEW_TEXT:
        raise SystemExit(f"video-prompt: --direction must be one of {', '.join(sorted(batch_mod.VIEW_TEXT))}, got {direction!r}")
    if key not in START_STILL_KEYS:
        raise SystemExit(f"video-prompt: --key must be one of {', '.join(START_STILL_KEYS)}, got {key!r}")
    if unpinned and last_frame:
        raise SystemExit("video-prompt: --unpinned goes with --no-last-frame (a source that can pin the end frame films it pinned)")
    mode = play_mod.resolve(state, play, prog="video-prompt")
    lifetime = mode == play_mod.LIFETIME
    if end_frame is not None:
        if mode != play_mod.ONCE_HOLD:
            raise SystemExit("video-prompt: --end-frame requires a once-hold motion (a non-loop state, or --play once-hold)")
        if not last_frame:
            raise SystemExit("video-prompt: this source cannot pin an end frame")
    wants_pin = batch_mod.pins_last_frame(state, direction, play)
    if lifetime and not last_frame:
        raise SystemExit("video-prompt: an effect requires an empty black end-frame pin; this source cannot pin it")
    warnings: list[str] = []
    pinned: bool | None = None
    if wants_pin and not last_frame:
        if not unpinned:
            raise SystemExit(
                f"video-prompt: a {direction} {state} is filmed ending on its first frame (the canvas pinned as the end "
                "frame), and this clip source has no end frame (--no-last-frame). Leave the state out, or pass --unpinned "
                "to film it without the pin: the prompt then asks for an evenly paced repeat (an attack for one strike), "
                "the loop is searched instead of cut whole, and it may not close.")
        pinned = False
        cut = "loop" if mode == play_mod.LOOP else "return"
        warnings.append(f"{direction} {state} filmed without its end-frame pin: the {cut} is searched, not cut whole, and may not close")
    pins = wants_pin and last_frame
    parts = batch_mod.clip_prompt_parts(direction, state, character, facing=facing, motion=motion, pinned=pinned,
                                        model=model, handed=handed, body_plan=body_plan, play=play)
    prompt = parts.text
    # the caller's own words (--character, --motion) against the engine's: a conflict is a warning
    warnings += [note["text"] for note in parts.notes if note["kind"] == prompt_parts.CONFLICT]
    cycle = batch_mod.cycle_for(state, direction, play, pinned=pins)
    # as video-set places and cuts: a side or diagonal view takes the facing, front and back face right
    canvas_facing = loop_facing = facing if direction in handed_mod.LATERAL_VIEWS else "right"
    mid_step = batch_mod.starts_mid_step(state, direction, body_plan)
    still = "<dir>/walk-start.png" if mid_step else "<still.png>"
    duration = batch_mod.duration_for(state, duration)
    end = f", end frame {end_frame}" if end_frame is not None else (", end frame <dir>/canvas.end.png" if lifetime else ", end frame <dir>/canvas.png") if pins else ""
    record: dict[str, Any] = {
        "kind": "sprite-gen-video-prompt",
        "direction": direction,
        "state": state,
        "play": mode,
        "facing": facing,
        **({"handed": [vars(h) for h in handed]} if handed else {}),
        **({"body_plan": [vars(b) for b in body_plan]} if body_plan else {}),
        "model": model,
        "prompt": prompt,
        "duration": duration,
        "last_frame": str(end_frame) if end_frame is not None else ("black" if lifetime else "canvas") if pins else None,
        "cycle": cycle,
        "commands": {
            # a lifetime is framed as an effect, whatever its name
            "canvas": f"sprite-gen video-canvas --still {still} --state {effect_mod.STATE if lifetime else state} --facing {canvas_facing} --out <dir>/canvas.png --report <dir>/canvas.report.json",
            "clip": f"your video tool, not sprite-gen: image-to-video from <dir>/canvas.png with this prompt, {duration} s{end}, saved as <dir>/clip.mp4",
            "frames": "sprite-gen video-frames --clip <dir>/clip.mp4 --out-dir <dir>/frames --spill auto --reference <dir>/canvas.png",
            "loop": f"sprite-gen video-loop --frames-dir <dir>/frames/keyed --out-dir <dir>/loop --fps <fps in frames.report.json> --state {state} --cycle {cycle} --facing {loop_facing} --name {direction}-{state}",
        },
        "warnings": warnings,
        **({"notes": parts.notes} if parts.notes else {}),
    }
    if lifetime:
        record["commands"]["frames"] = "sprite-gen video-frames --clip <dir>/clip.mp4 --out-dir <dir>/frames --alpha-mode brightness"
        record["blend"] = "add"
    needs = handed_mod.first_frame_needs(handed or [], direction, canvas_facing if direction in handed_mod.LATERAL_VIEWS else None,
                                         gait=state in batch_mod.GAIT_STATES)
    if needs:
        record["still_needs"] = needs
    if mid_step:
        record["start_still"] = {
            "why": "a front or back walk films from its still redrawn mid-step; from a standing still the clip model walks askew",
            "prompt": batch_mod.walk_start_prompt(direction, key, handed, body_plan),
            "command": "sprite-gen gen --ref <still.png> --prompt-file <start-prompt.txt> --out <dir>/walk-start.png --report <dir>/walk-start.report.json",
        }
    return record


def add_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--direction", required=True, choices=sorted(batch_mod.VIEW_TEXT), help="view of the still")
    parser.add_argument("--state", required=True, help="motion state (idle/walk/run/jump/attack/...)")
    parser.add_argument("--facing", choices=FACINGS, default="right", help="side or diagonal view: which way it faces (default right)")
    parser.add_argument("--handed", action="append", default=[], metavar="ITEM=SIDE [PART]", help="an asymmetric item on one of the character's own sides, e.g. 'the black smartwatch=left wrist' (repeatable): the prompt says where it is in this view")
    parser.add_argument("--body-plan", action="append", default=[], metavar="PLAN | FIGURE=PLAN", help="what the character stands on: biped (default), quadruped or legless; a scene of several figures names each, e.g. 'the man=biped' 'the horse=quadruped' (repeatable), as video-set --body-plan")
    parser.add_argument("--character", help="short subject phrase used in the prompt (e.g. 'The armored knight')")
    parser.add_argument("--motion", help="the caller's own motion paragraph in place of the state's sentence (build_prompt(motion=...))")
    parser.add_argument("--play", choices=play_mod.MODES, help="how the motion plays (default: the state's preset; a word that is no named state, a loop): the end-frame pin, the prompt's ending and the video-loop --cycle follow it, as video-set --play")
    parser.add_argument("--model", default=DEFAULT_MODEL, help=f"clip model the prompt is for (default {DEFAULT_MODEL}); a Lite model calms a walk")
    parser.add_argument("--duration", type=int, help="seconds to ask for (default: the state's own, as video-set)")
    parser.add_argument("--end-frame", type=Path, help="non-loop terminal-pose canvas to pin instead of returning to the starting image")
    parser.add_argument("--no-last-frame", action="store_true", help="the clip source cannot pin an end frame (ZCRE's grok-imagine-video-1.5): states filmed pinned are refused")
    parser.add_argument("--unpinned", action="store_true", help="with --no-last-frame: film a pinned state without the pin, with a warning, instead of refusing it")
    parser.add_argument("--key", choices=START_STILL_KEYS, default=GREEN, help="the still's chroma key, for a front or back walk's mid-step redraw sentence (default green)")
    parser.add_argument("--json", action="store_true", help="print the whole record (prompt, duration, end-frame pin, loop cut, commands) instead of the prompt alone")


def run(**kwargs: object) -> int:
    record = plan_prompt(
        end_frame=kwargs.get("end_frame"), play=kwargs.get("play"),  # type: ignore[arg-type]
        direction=str(kwargs["direction"]), state=str(kwargs["state"]), facing=str(kwargs.get("facing") or "right"),
        character=kwargs.get("character"), motion=kwargs.get("motion"),  # type: ignore[arg-type]
        model=str(kwargs.get("model") or DEFAULT_MODEL), last_frame=not kwargs.get("no_last_frame"),
        unpinned=bool(kwargs.get("unpinned")), duration=(int(kwargs["duration"]) if kwargs.get("duration") else None),  # type: ignore[arg-type]
        key=str(kwargs.get("key") or GREEN),
        handed=handed_mod.parse_all(list(kwargs.get("handed") or [])) or None,  # type: ignore[arg-type]
        body_plan=body_mod.parse_all(list(kwargs.get("body_plan") or [])) or None,  # type: ignore[arg-type]
    )
    for line in record["warnings"]:
        print(f"video-prompt: warning: {line}", file=sys.stderr)
    for line in record.get("still_needs", []):
        print(f"video-prompt: the still: {line}", file=sys.stderr)
    print(json.dumps(record, ensure_ascii=False, indent=2) if kwargs.get("json") else record["prompt"])
    return 0


def main(argv: list[str] | None = None) -> int:
    utf8_streams()
    parser = argparse.ArgumentParser(prog="sprite-gen video-prompt", description=__doc__)
    add_arguments(parser)
    return run(**vars(parser.parse_args(argv)))


if __name__ == "__main__":
    raise SystemExit(main())
