"""Write every generation request for a cast of sprite characters: the stills
each hero still needs and one image-to-video clip per hero x facing x cycle.

Usage: python3 cycle_prompts.py cast.json [-o requests.json]

Model-agnostic on purpose: each request carries the prompt, negative prompt,
anchor frames and duration; the agent maps them onto the fields of the member
it discovered (read with model_schema_get) and prices the payload with dry_run.
Stills:
  - hero described in text, no art: one pose sheet with every facing side by
    side, so identity matches between facings;
  - hero with a first frame for some facings, or a "reference" image (their
    own art): one turnaround per missing facing, drawn from that art;
  - hero with every facing: nothing.
Missing asset ids become "<upload ...>" placeholders; fill the cast and re-run.
"""
import argparse
import json
from pathlib import Path

KEY = {"magenta": "magenta (#FF00FF)", "green": "green (#00FF00)", "blue": "blue (#0000FF)"}
MIRROR = {"se": "sw", "ne": "nw", "e": "w"}   # facings the sheet gets by flipping, unless listed explicitly
BACK = {"ne", "nw", "n"}                      # back views: need the away-from-viewer run recipe
CAMERA = {
 "isometric": "classic isometric RPG view, seen from about 30 degrees above",
 "topdown": "top-down RPG view, seen from about 45 degrees above",
 "side": "straight side-on view, camera at the character's height, like a 2D platformer",
}

STILL_SE_NE = ("{medium} game sprite sheet, two poses of the same character side by side, standing neutral, full body, "
               "on a perfectly flat solid {key} background, no shadows on the ground, no text.\n\n"
               "Character: {character}\n\n"
               "Camera: {camera}.\n"
               "Left pose: body turned three-quarters toward the viewer, facing down and to the right (south-east).\n"
               "Right pose: body turned three-quarters away from the viewer, facing up and to the right (north-east), {back}.\n\n"
               "Style: {style}, each figure about 60% of the image height, both figures the same size and aligned on the "
               "same baseline, generous empty space around each.")
STILL_MULTI = ("{medium} game sprite sheet, {lead}, standing neutral, "
               "full body, on a perfectly flat solid {key} background, no shadows on the ground, no text.\n\n"
               "Character: {character}\n\nCamera: {camera}.\n{poses}\n\n"
               "Style: {style}, each figure about 60% of the image height, all figures the same size and aligned on the "
               "same baseline, generous empty space around each.")
TURNAROUND = ("Redraw the exact same character as in the reference image: same design, proportions, colors, outfit, "
              "props and art style (if it is pixel art, keep the same pixel size, outline and palette). One single "
              "full-body figure standing neutral, {pose}. Camera: {camera}.{about} The figure is centered, about 60% of "
              "the image height, on a perfectly flat solid {key} background, no ground shadow, no text, nothing else.")
# where a character's right hand appears on screen per facing (for "notes" such as weapon hand): the right
# hand points 90 degrees clockwise from the facing seen from above; screen-down is toward the viewer
RIGHT_SIDE = {"se": "on the left side of the image, nearer to us", "sw": "on the left side of the image, farther from us",
              "ne": "on the right side of the image, nearer to us", "nw": "on the right side of the image, farther from us",
              "e": "nearer to us", "w": "farther from us", "s": "on the left side of the image", "n": "on the right side of the image"}
POSE = {
 "se": "body turned three-quarters toward the viewer, facing down and to the right (south-east)",
 "sw": "body turned three-quarters toward the viewer, facing down and to the left (south-west)",
 "ne": "body turned three-quarters away from the viewer, facing up and to the right (north-east), {back}",
 "nw": "body turned three-quarters away from the viewer, facing up and to the left (north-west), {back}",
 "e":  "full side profile facing right",
 "w":  "full side profile facing left",
 "s":  "facing straight toward the viewer",
 "n":  "facing straight away from the viewer, {back}",
}

FACING = {
 "se": "{he} always faces diagonally toward the bottom-right corner of the frame (isometric three-quarter front view from above, the same angle as the first frame), never turning to a side view.",
 "sw": "{he} always faces diagonally toward the bottom-left corner of the frame (isometric three-quarter front view from above, the same angle as the first frame), never turning to a side view.",
 "ne": "{he} always faces diagonally toward the top-right corner of the frame, seen three-quarters from behind (isometric view from above, the same angle as the first frame), never turning around.",
 "nw": "{he} always faces diagonally toward the top-left corner of the frame, seen three-quarters from behind (isometric view from above, the same angle as the first frame), never turning around.",
 "e":  "{he} always faces right in a flat side-on profile, the same angle as the first frame, never turning toward the camera.",
 "w":  "{he} always faces left in a flat side-on profile, the same angle as the first frame, never turning toward the camera.",
 "s":  "{he} always faces straight toward the viewer, the same angle as the first frame, never turning to a side view.",
 "n":  "{he} always faces straight away from the viewer, seen from behind, the same angle as the first frame, never turning around.",
}
CYCLE = {
 "walk":   "{medium} game sprite animation, like a treadmill: the {who} immediately starts walking in place and keeps walking for the whole clip, a steady repeating walk cycle at a relaxed pace ({walk_motion}{extra}).",
 "run":    "{medium} game sprite animation, like a treadmill: the {who} immediately starts running in place and keeps running for the whole clip, a steady repeating run cycle ({run_motion}{extra}).",
 "idle":   "{medium} game sprite animation: the {who} stands idle in place, a subtle breathing loop: chest rises and falls, a slight weight shift, {idle}. Feet stay planted. Calm, small motion.",
 "attack": "{medium} game sprite animation: the {who} performs one {attack}, then returns to the starting ready pose. Snappy anticipation, fast strike, short follow-through.",
}
TAIL = " {he} stays centered and does not travel across the frame. Locked static camera, flat solid {keyname} background, no ground shadow, {crisp}, same character design as the first frame."
# what "wrong angle" means depends on the facing: a profile is the goal for E/W, the failure for diagonals
WRONG_ANGLE = {"e": "front view, back view, three-quarter view, facing the camera, turning around",
               "s": "side view, profile view, back view, turning around",
               "n": "side view, profile view, facing the camera, turning around"}
WRONG_ANGLE["w"] = WRONG_ANGLE["e"]
NEG_REST = "camera movement, zoom, travelling across the frame, ground shadow, drop shadow, background change, extra characters, blur, 3D render"
NEG_LOCO = ", slowing down, stopping, standing still"

# Back-view run: a fast run from a back three-quarter frame drifts into a side-on
# profile. Describing it as running *away* from the viewer, naming what stays
# visible, pinning the end frame and giving it 5 s holds the angle; the loop
# search then takes the middle of the clip.
AWAY = {"ne": ("toward the top-right corner of the screen", "{poss} left shoulder is closer to us than {poss} right"),
        "nw": ("toward the top-left corner of the screen", "{poss} right shoulder is closer to us than {poss} left"),
        "n":  ("straight up the screen", "both shoulders stay level")}
BACK_RUN = ("{medium} game sprite animation seen from behind. The {who} runs away from the viewer, {toward}, on a "
            "treadmill so {it} stays in place. We keep seeing {back_view} at the same {angle} as the first frame for "
            "the whole clip: {shoulders}. Steady repeating run cycle ({run_motion}{extra}). Locked static camera, flat solid {keyname} background, no ground "
            "shadow, {crisp}.")
BACK_RUN_NEG = ("side view, profile view, facing right, facing the camera, turning, rotating, camera movement, zoom, "
                "travelling across the frame, ground shadow, background change, blur, 3D render, slowing down, stopping")

# Straight front and back locomotion (S, N) turned to a three-quarter view mid-clip, or walked
# toward the camera and grew in the frame, on a short free-ended clip. Pinning the end frame on a
# 5 s clip held the angle on the walks and runs it was tried on; the loop search takes the middle.
STRAIGHT = {"s", "n"}
TOWARD = (" {he} treads in place facing the viewer and never comes closer: {it} stays the same size in the frame"
          " for the whole clip.")
TOWARD_NEG = ", walking toward the camera, coming closer, growing larger"
# default gait wording is two-legged; a quadruped, a flyer or a slithering hero overrides it in the cast
WALK_MOTION = "heel-to-toe steps, arms swing opposite the legs, slight up-and-down bob"
RUN_MOTION = "knees high, arms pumping, torso leaning forward, both feet leave the ground between steps"

POSS = {"he": "his", "she": "her", "it": "its", "they": "their"}


def words(h, hid, keyname):
    d = dict(h)
    d.setdefault("who", "character")
    d["he"] = h.get("pronoun", "It")
    d["it"] = d["he"].lower()
    d["poss"] = POSS.get(d["it"], "its")
    d.setdefault("extra", "")
    d.setdefault("walk_motion", WALK_MOTION)
    d.setdefault("run_motion", RUN_MOTION)
    d.setdefault("idle", "a gentle sway")
    d.setdefault("attack", f"quick strike with {d['poss']} weapon, or a punch if {d['it']} has none")
    d.setdefault("back", "we see the back")
    d.setdefault("back_view", f"{d['poss']} back")
    d["keyname"] = keyname
    # painted / HD heroes ("pixel": false) must not be pushed toward pixel art by the prompts
    pixel = h.get("pixel", True)
    d["medium"] = "Pixel art" if pixel else "2D"
    d["crisp"] = "crisp pixel art" if pixel else "the exact art style, detail and sharpness of the first frame"
    return d


def clip_request(hid, d, facing, cy, first):
    """One clip. Back-view runs, and walks and runs facing straight toward or away from the
    viewer, pin both ends and run longer; loops that return to rest pin the last frame;
    other walks and runs leave it free."""
    if facing in BACK and cy == "run":
        toward, shoulders = AWAY[facing]
        prompt = BACK_RUN.format(toward=toward, shoulders=shoulders.format(**d),
                                 angle="angle" if facing == "n" else "diagonal angle", **d)
        return {"id": f"{hid}_{facing}_{cy}", "prompt": prompt, "negative_prompt": BACK_RUN_NEG,
                "first_frame": first, "last_frame": first, "duration_s": 5, "aspect_ratio": "1:1", "audio": False}
    neg = WRONG_ANGLE.get(facing, "side view, profile view, turning around") + ", " + NEG_REST
    loco = cy in ("walk", "run")
    straight = loco and facing in STRAIGHT
    prompt = CYCLE[cy] + " " + FACING[facing]
    if loco:
        neg += NEG_LOCO
    if straight and facing == "s":
        prompt += TOWARD
        neg += TOWARD_NEG
    return {"id": f"{hid}_{facing}_{cy}", "prompt": (prompt + TAIL).format(**d),
            "negative_prompt": neg, "first_frame": first,
            "last_frame": None if loco and not straight else first,
            "duration_s": 5 if straight else 3, "aspect_ratio": "1:1", "audio": False}


def build(cast):
    style = cast.get("style", "crisp hand-placed pixel art, 1px dark outline, limited palette of about 24 colors")
    facings = cast.get("facings", ["se", "ne"])
    camera = CAMERA.get(cast.get("camera", "isometric"), cast.get("camera"))
    keyname = cast.get("key", "magenta")
    key = KEY[keyname]
    out = {"stills": [], "clips": [], "notes": []}
    for hid, h in cast["heroes"].items():
        d = words(h, hid, keyname)
        firsts = h.get("first_frames", {})
        missing = [f for f in facings if f not in firsts]
        reference = h.get("reference")
        if missing and not firsts and not reference:
            if "character" not in h:
                raise ValueError(f"{hid}: needs a 'character' description, a 'reference' image or a first frame")
            if facings == ["se", "ne"]:
                prompt = STILL_SE_NE.format(key=key, camera=camera, style=style, **d)
            elif len(facings) == 1:
                prompt = STILL_MULTI.format(lead="one pose of the character", key=key, camera=camera, style=style,
                                            poses="Pose: " + POSE[facings[0]].format(**d) + ".", **d)
            else:
                poses = "Poses from left to right:\n" + "\n".join(
                    f"{i + 1}. {POSE[f].format(**d)}" for i, f in enumerate(facings))
                prompt = STILL_MULTI.format(lead=f"{len(facings)} poses of the same character side by side in one row",
                                            key=key, camera=camera, style=style, poses=poses, **d)
            wide = len(facings) > 1
            out["stills"].append({"id": f"{hid}_sheet", "kind": "pose-sheet", "split": facings, "prompt": prompt,
                                  "reference_images": [], "width": 512 * (len(facings) + 1) if wide else 1024,
                                  "height": 1024, "candidates": 2})
        elif missing:
            ref = reference or firsts.get("se") or next(iter(firsts.values()))
            for f in missing:
                about = f" The character: {h['character']}" if h.get("character") else ""
                if h.get("notes"):
                    about += (f" Important: {h['notes']} Do not mirror the character: in this pose "
                              f"{d['poss']} right hand is {RIGHT_SIDE[f]}.")
                out["stills"].append({"id": f"{hid}_{f}_turnaround", "kind": "turnaround", "facing": f,
                                      "prompt": TURNAROUND.format(pose=POSE[f].format(**d), camera=camera, key=key,
                                                                  about=about),
                                      "reference_images": [ref], "width": 1024, "height": 1024, "candidates": 2})
        for f in facings:
            for cy in cast.get("cycles", list(CYCLE)):
                if cy not in CYCLE:
                    raise ValueError(f"no prompt template for cycle '{cy}': add one to CYCLE")
                out["clips"].append(clip_request(hid, d, f, cy, firsts.get(f, f"<upload {hid}_{f}_first.png>")))
    for f in facings:
        if f in MIRROR and MIRROR[f] not in facings:
            out["notes"].append(f"{MIRROR[f].upper()} is a mirror of {f.upper()}; for an asymmetric character "
                                f"(weapon hand, eyepatch) add '{MIRROR[f]}' to facings to generate it instead")
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cast")
    ap.add_argument("-o", "--out", default="requests.json")
    a = ap.parse_args()
    out = build(json.loads(Path(a.cast).read_text()))
    Path(a.out).write_text(json.dumps(out, indent=1))
    long = sum(c["duration_s"] == 5 for c in out["clips"])
    print(f"{len(out['stills'])} stills, {len(out['clips'])} clips ({len(out['clips']) - long} short, {long} long) "
          f"-> {a.out}; price the exact payloads with dry_run before running")
    for n in out["notes"]:
        print("note:", n)


if __name__ == "__main__":
    main()
