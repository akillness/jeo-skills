#!/usr/bin/env python3
"""imagegen.py - generate a film's raster SURFACES (grounds, materials, photo-like plates, cut-outs) with the Codex CLI's image_gen tool.

Usage:
  python3 imagegen.py plates.json --out assets/gen [--jobs 3] [--force] [--only id1,id2] [--model M] [--timeout 600]
  python3 imagegen.py plates.json --dry-run          (guard + exact prompts + codex commands; spends nothing, writes nothing)
  python3 imagegen.py --help

plates.json:
  {
    "size": [1920, 1080],            # film frame; every opaque plate also gets a cover-cropped <id>@WxH.png
    "style": "one shared line: palette, light, lens, grain (keeps the set consistent)",
    "plates": [
      {"id": "fog-ground", "role": "ground",  "prompt": "slow volumetric fog over wet basalt, low warm key light", "aspect": "16:9"},
      {"id": "coin",       "role": "cutout",  "prompt": "a brushed brass disc, studio lit", "transparent": true, "aspect": "1:1"},
      {"id": "desk",       "role": "photo",   "prompt": "oak desk surface, soft window light", "refs": ["assets/brand/material.png"]}
    ]
  }

WHAT THIS IS FOR. A missing VISUAL SURFACE only: a ground with light and texture, a photographic material, an object cut-out. Code
draws every letter, logo, UI element and chart; real captured assets come first; generated images are illustrative and every plate
must perform in the film (parallax, light, occlusion, mask reveal, rack focus). A plate never replaces product proof.

PROMPT GUARD (runs before anything is generated; one refusal stops the whole run with exit 2). A plate prompt, the shared style or
"avoid" may not ASK for: text / lettering / numbers / posters / charts, logos or named brands, UI / screens / dashboards /
screenshots, people / faces / portraits / customers / founders (people presented as real). Negations are fine ("no text, no
logos" is added to every prompt anyway). Refused wording must be rewritten: describe the material, light and object instead.

Provider: `codex exec` (ChatGPT login, no API key), about 1-2 minutes per plate, so plates run in parallel (--jobs).
Per-job isolation (fixes the old shared-directory bug where parallel runs could copy the wrong image): every plate runs in its OWN
temporary working directory (<out>/.work/<id>-XXXX), codex writes <workdir>/result.png, and only then is it moved to <out>/<id>.png.
MD5 check: the result must not be byte-identical to another plate or to a reference image; a duplicate is deleted and reported as
FAILED (collision). Transparent cut-outs: real alpha is requested; if the PNG comes back opaque it is regenerated on flat #00FF00 and
keyed with ffmpeg; alpha >= 250 is snapped to 255 (generators return "opaque" at ~253, which ghosts type placed behind a cut-out).

Outputs:  <out>/<id>.png   <out>/<id>@<W>x<H>.png (opaque plates)   <out>/ledger.jsonl (prompt, md5, seconds, alpha, provider)
Requires: codex on PATH with the image_generation feature ON (providers.sh reports "codex.image_generation"), ffmpeg + ffprobe.
Exit: 0 every requested plate exists afterwards, 1 a plate failed, 2 bad usage / guard refusal / no provider.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

NO_TEXT = ("Absolutely no text, letters, numbers, words, logos, watermarks, signatures, user-interface elements, screens, charts or "
           "people/faces anywhere in the image; typography, logos and UI are added later in code.")

# ----------------------------------------------------------------------------------------------------------- prompt guard
_BRANDS = ("apple|google|microsoft|amazon|facebook|instagram|tiktok|spotify|netflix|nike|adidas|coca-?cola|pepsi|tesla|openai|anthropic|"
           "chatgpt|youtube|whatsapp|airbnb|starbucks|mcdonald'?s|ferrari|porsche|samsung|sony|nintendo|playstation|xbox|disney|figma|"
           "vercel|github|twitter|wispr")
GUARD = [
    ("text", re.compile(r"\b(text|texts|typograph\w*|lettering|letters?|words?|headlines?|captions?|slogans?|taglines?|quotes?|handwriting|"
                        r"calligraph\w*|signage|signs? (reading|saying)|that says|saying|spell\w*|inscriptions?|labels?|labelled|poster|"
                        r"billboard|newspaper|book cover|numerals?|digits?|numbers|watermarks?|subtitles?|logotype)\b", re.I)),
    ("logo/brand", re.compile(r"\b(logos?|wordmarks?|brand ?marks?|trademarks?|emblems?|monograms?|insignia|crests?|brand names?|app icons?|"
                              r"favicons?|" + _BRANDS + r")\b", re.I)),
    ("UI/screen", re.compile(r"\b(ui|ux|user interfaces?|interfaces?|dashboards?|app screens?|screenshots?|screen ?grabs?|web ?pages?|websites?|"
                             r"landing pages?|browser windows?|app windows?|menu bars?|toolbars?|navbars?|sidebars?|buttons?|cursors?|"
                             r"chat (windows?|bubbles?)|notifications?|modals?|dropdowns?|input fields?|mock-?ups?|wireframes?|"
                             r"phone screens?|laptop screens?|screen showing|terminal windows?|code editors?|spreadsheets?|charts?|graphs?|"
                             r"infographics?)\b", re.I)),
    ("people", re.compile(r"\b(persons?|people|man(?!-made)|men|woman|women|girls?|boys?|child|children|kids?|babies|baby|crowds?|faces?|"
                          r"facial|portraits?|head ?shots?|selfies?|founders?|ceos?|ctos?|customers?|employees?|celebrit\w+|actors?|"
                          r"actress(es)?|influencers?|testimonials?|team photo|human (face|figure|portrait)|real person)\b", re.I)),
]
# "no text, logos or people" / "without any watermark" / "avoid UI": a NEGATED list is not a request. Strip only cue + items that are
# themselves forbidden words (1-2 words each, joined by comma / or / and), so "no text, a woman at a desk" still trips on "woman".
_CUE = re.compile(r"\b(?:no|without|avoid|avoiding|never|zero|free of|free from|not)\b[ ]*(?:(?:any|visible|readable|real|other)[ ]+)*", re.I)
_SEP = re.compile(r"\s*,\s*(?:(?:or|and|nor)\s+)?|\s+(?:or|and|nor)\s+|\s*/\s*", re.I)
_ANY = re.compile("|".join(rx.pattern for _, rx in GUARD), re.I)


def _strip_negated(t: str) -> str:
    out, pos = [], 0
    while True:
        m = _CUE.search(t, pos)
        if not m:
            out.append(t[pos:])
            return "".join(out)
        out.append(t[pos:m.start()])
        j = m.end()
        while True:
            w = re.match(r"[A-Za-z'-]+(?:[ ][A-Za-z'-]+)?", t[j:])
            item = None
            if w:                                              # shortest 1- or 2-word item that is itself a forbidden term
                words = w.group(0).split(" ")
                for k in range(1, len(words) + 1):
                    cand = " ".join(words[:k])
                    if _ANY.fullmatch(cand) or _ANY.search(cand) and k == 1:
                        item = cand
                        break
            if not item:
                break
            j += len(item)
            sm = _SEP.match(t, j)
            if not sm:
                break
            j = sm.end()
        pos = max(j, m.end())


def guard(texts: list) -> list:
    """Return [(category, matched_word, source_label)] for everything in texts [(label, str)] that ASKS for forbidden content."""
    out = []
    for label, t in texts:
        if not t:
            continue
        stripped = _strip_negated(t)
        for cat, rx in GUARD:
            for m in rx.finditer(stripped):
                out.append((cat, m.group(0), label))
    return out


# ----------------------------------------------------------------------------------------------------------- helpers
def die(msg: str, code: int = 2) -> None:
    print("error: " + msg, file=sys.stderr)
    sys.exit(code)


def md5(p: Path) -> str:
    h = hashlib.md5()
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def codex_image_feature() -> tuple:
    exe = shutil.which("codex")
    if not exe:
        return False, "codex not on PATH"
    try:
        out = subprocess.run([exe, "features", "list"], capture_output=True, text=True, timeout=30).stdout
    except (OSError, subprocess.TimeoutExpired) as e:
        return False, "codex features list failed: %s" % e
    for line in out.splitlines():
        parts = line.split()
        if parts and parts[0] == "image_generation":
            return (parts[-1] == "true"), ("codex image_generation on" if parts[-1] == "true" else "codex image_generation is OFF (run: codex features enable image_generation)")
    return False, "codex has no image_generation feature (update codex)"


def build_prompt(p: dict, style: str, dest: Path, chroma: bool) -> str:
    spec = [
        "Use case: %s" % p.get("use_case", "stylized-concept"),
        "Asset type: %s for a %s motion-design launch film; it is one layer in a composite, not a finished poster." % (p.get("role", "plate"), p.get("aspect", "16:9")),
        "Primary request: %s" % p["prompt"],
    ]
    if style:
        spec.append("Shared look (match exactly across the set): %s" % style)
    if p.get("transparent"):
        if chroma:
            spec.append("Background: one perfectly flat, uniform pure green #00FF00 background with no shadow, gradient or green spill on the subject.")
        else:
            spec.append("Background: fully transparent (real alpha channel), subject cleanly isolated.")
    spec.append("Constraints: " + NO_TEXT)
    if p.get("avoid"):
        spec.append("Avoid: %s" % p["avoid"])
    refs = (" The attached image(s) are references for material, light and colour only; do not copy any text, logo, UI or face from them."
            if p.get("refs") else "")
    return ("Use your built-in image_gen tool to generate exactly ONE image from the spec below.%s Then copy the generated PNG to %s "
            "(absolute path; overwrite if present) and print that path. Do not write any other files and do not edit the spec.\n\n%s"
            % (refs, dest, "\n".join(spec)))


def codex_cmd(prompt: str, refs: list, workdir: Path, model) -> list:
    cmd = ["codex", "exec", "--skip-git-repo-check", "-s", "workspace-write", "-C", str(workdir)]
    if model:
        cmd += ["-m", model]
    for r in refs:
        cmd += ["-i", r]
    cmd.append(prompt)
    return cmd


def run_codex(cmd: list, timeout: int) -> tuple:
    try:
        cp = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return cp.returncode, (cp.stdout + cp.stderr)[-2000:]
    except subprocess.TimeoutExpired:
        return 124, "timeout"
    except OSError as e:
        return 127, str(e)


def has_alpha(png: Path) -> bool:
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=pix_fmt", "-of", "csv=p=0", str(png)],
                         capture_output=True, text=True).stdout
    return any(k in out for k in ("rgba", "ya", "argb", "bgra"))


def alpha_stats(png: Path) -> tuple:
    """(share of pixels with alpha>=250, share with 0<alpha<250) from a tiny rgba decode; None when no alpha."""
    r = subprocess.run(["ffmpeg", "-v", "error", "-i", str(png), "-vf", "scale=128:-1:flags=area,format=rgba,extractplanes=a", "-f", "rawvideo", "-pix_fmt", "gray", "-"],
                       capture_output=True)
    b = r.stdout
    if not b:
        return None
    return sum(1 for v in b if v >= 250) / len(b), sum(1 for v in b if 0 < v < 250) / len(b)


def snap_alpha(png: Path) -> None:
    """alpha >= 250 -> 255 (ffmpeg lutrgb, no PIL needed); the soft edge ramp below 250 is kept."""
    tmp = png.with_suffix(".snap.png")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(png), "-vf", "format=rgba,lutrgb=a='if(gte(val\\,250)\\,255\\,val)'", "-pix_fmt", "rgba", str(tmp)], check=True)
    tmp.replace(png)


def key_green(src: Path, dst: Path) -> None:
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-vf", "colorkey=0x00FF00:0.30:0.08,despill=type=green", "-pix_fmt", "rgba", str(dst)], check=True)


def cover_crop(src: Path, dst: Path, w: int, h: int) -> None:
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-vf", "scale=%d:%d:force_original_aspect_ratio=increase:flags=lanczos,crop=%d:%d" % (w, h, w, h), str(dst)], check=True)


def generate_one(p: dict, style: str, work_root: Path, refs: list, model, timeout: int, chroma: bool) -> tuple:
    """Run codex in a private working directory; return (png_path or None, exit code, log)."""
    wd = Path(tempfile.mkdtemp(prefix="%s-" % re.sub(r"[^A-Za-z0-9_.-]", "_", p["id"]), dir=str(work_root)))
    result = wd / "result.png"
    code, log = run_codex(codex_cmd(build_prompt(p, style, result, chroma), refs, wd, model), timeout)
    if result.exists():
        return result, code, log
    pngs = sorted(wd.rglob("*.png"), key=lambda q: q.stat().st_mtime, reverse=True)   # the driver agent saved it under another name
    return (pngs[0] if pngs else None), code, log


def make_plate(p: dict, cfg: dict, out: Path, work_root: Path, args, seen: dict, lock: threading.Lock, ref_md5: set) -> dict:
    dest = out / ("%s.png" % p["id"])
    rec = {"id": p["id"], "role": p.get("role"), "prompt": p["prompt"], "provider": "codex"}
    t0 = time.time()
    if dest.exists() and not args.force:
        rec["status"] = "cached"
    else:
        refs = [str(Path(r).resolve()) for r in p.get("refs", [])]
        res, code, log = generate_one(p, cfg.get("style", ""), work_root, refs, args.model, args.timeout, False)
        if res is not None and p.get("transparent") and not has_alpha(res):
            raw, code, log = generate_one(p, cfg.get("style", ""), work_root, refs, args.model, args.timeout, True)
            if raw is not None:
                keyed = raw.with_name("keyed.png")
                key_green(raw, keyed)
                res = keyed
        rec.update(seconds=round(time.time() - t0), exit=code)
        if res is None:
            rec.update(status="failed", log=log)
            return rec
        digest = md5(res)
        with lock:                                        # collision check: two plates (or a reference) must never be the same bytes
            clash = seen.get(digest)
            if digest in ref_md5:
                clash = "<reference image>"
            if clash and clash != p["id"]:
                rec.update(status="failed", log="COLLISION: result is byte-identical to %s (md5 %s); parallel-run mix-up or the model copied a reference. Re-run with --force --only %s" % (clash, digest, p["id"]), md5=digest)
                shutil.rmtree(res.parent, ignore_errors=True)
                return rec
            seen[digest] = p["id"]
        shutil.move(str(res), str(dest))
        shutil.rmtree(res.parent, ignore_errors=True)
        rec.update(status="generated", md5=digest)
    if "md5" not in rec:
        rec["md5"] = md5(dest)
        with lock:
            clash = seen.get(rec["md5"])
            if clash and clash != p["id"]:
                rec["warning"] = "cached file is byte-identical to plate '%s'" % clash
            seen.setdefault(rec["md5"], p["id"])
    if p.get("transparent"):
        rec["alpha"] = has_alpha(dest)
        if rec["alpha"]:
            snap_alpha(dest)
            st = alpha_stats(dest)
            if st:
                rec["alpha_opaque_share"], rec["alpha_soft_share"] = round(st[0], 3), round(st[1], 3)
                if st[0] < 0.01:
                    rec["warning"] = "alpha looks empty (< 1 % opaque pixels)"
        else:
            rec["warning"] = "no alpha channel after keying: check the plate by eye"
    elif cfg.get("size"):
        w, h = cfg["size"]
        framed = out / ("%s@%dx%d.png" % (p["id"], w, h))
        cover_crop(dest, framed, w, h)
        rec["framed"] = framed.name
    return rec


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("plates", help="plates.json")
    ap.add_argument("--out", default="assets/gen")
    ap.add_argument("--jobs", type=int, default=3)
    ap.add_argument("--force", action="store_true", help="regenerate plates that already exist")
    ap.add_argument("--only", default="", help="comma-separated plate ids")
    ap.add_argument("--model", default=None, help="codex model for the driver agent (the image model is Codex's)")
    ap.add_argument("--timeout", type=int, default=600, help="seconds per codex call")
    ap.add_argument("--dry-run", action="store_true", help="guard + print the exact prompts and codex commands; no calls, no files")
    args = ap.parse_args()

    pf = Path(args.plates)
    if not pf.is_file():
        die("plates file not found: %s" % pf)
    try:
        cfg = json.loads(pf.read_text())
    except ValueError as e:
        die("plates.json is not valid JSON: %s" % e)
    plates = cfg.get("plates")
    if not isinstance(plates, list) or not plates:
        die('plates.json needs a non-empty "plates" list')
    ids = [p.get("id") for p in plates]
    for p in plates:
        if not isinstance(p, dict) or not p.get("id") or not p.get("prompt"):
            die('every plate needs "id" and "prompt"')
        if not re.fullmatch(r"[A-Za-z0-9_.-]+", p["id"]):
            die("plate id %r: use letters, digits, - _ . only" % p["id"])
    if len(set(ids)) != len(ids):
        die("duplicate plate ids in plates.json")
    if args.only:
        keep = set(args.only.split(","))
        missing = keep - set(ids)
        if missing:
            die("--only: unknown plate id(s): %s" % ", ".join(sorted(missing)))
        plates = [p for p in plates if p["id"] in keep]

    # ---- guard: everything is checked before anything is spent
    refused = []
    for p in plates:
        for cat, word, label in guard([("prompt", p["prompt"]), ("avoid", p.get("avoid", "")), ("style", cfg.get("style", ""))]):
            refused.append((p["id"], cat, word, label))
    if refused:
        print("PROMPT GUARD: refused (nothing generated). Describe material, light and object; code draws text, logos, UI and charts.", file=sys.stderr)
        for pid, cat, word, label in refused:
            print("  plate '%s' %s: asks for %s (%r)" % (pid, label, cat, word), file=sys.stderr)
        return 2

    out = Path(args.out).resolve()
    if args.dry_run:
        ok, why = codex_image_feature()
        print("dry run: %d plate(s) -> %s   guard: all clear   provider: %s" % (len(plates), out, why))
        for p in plates:
            wd = out / ".work" / ("%s-XXXX" % p["id"])
            refs = [str(Path(r).resolve()) for r in p.get("refs", [])]
            print("\n--- plate %s (%s%s)  would write %s and %s" % (p["id"], p.get("role", "plate"), ", transparent" if p.get("transparent") else "", out / ("%s.png" % p["id"]),
                                                              out / ("%s@%dx%d.png" % (p["id"], *cfg["size"])) if cfg.get("size") and not p.get("transparent") else "(no framed copy)"))
            print("codex command: " + " ".join(shlex.quote(c) for c in codex_cmd("<prompt below>", refs, wd, args.model)))
            print(build_prompt(p, cfg.get("style", ""), wd / "result.png", False))
        return 0

    if not shutil.which("codex"):
        die("codex not on PATH: no image provider. Plan code-only / captured surfaces (providers.sh shows what exists).")
    ok, why = codex_image_feature()
    if not ok:
        die(why)
    for t in ("ffmpeg", "ffprobe"):
        if not shutil.which(t):
            die(t + " not found")
    out.mkdir(parents=True, exist_ok=True)
    work_root = out / ".work"
    work_root.mkdir(exist_ok=True)
    lock, seen = threading.Lock(), {}
    for q in out.glob("*.png"):                        # md5s of plates that already exist (and are not being regenerated)
        if "@" not in q.name and q.stem not in {p["id"] for p in plates if args.force}:
            seen.setdefault(md5(q), q.stem)
    ref_md5 = {md5(Path(r)) for p in plates for r in p.get("refs", []) if Path(r).is_file()}
    with ThreadPoolExecutor(max_workers=max(1, args.jobs)) as ex:
        recs = list(ex.map(lambda p: make_plate(p, cfg, out, work_root, args, seen, lock, ref_md5), plates))
    shutil.rmtree(work_root, ignore_errors=True)
    with (out / "ledger.jsonl").open("a") as f:
        for r in recs:
            f.write(json.dumps({**{k: v for k, v in r.items() if k != "log"}, "date": time.strftime("%Y-%m-%d")}) + "\n")
    for r in recs:
        print("%9s  %s  %ss  %s%s%s" % (r["status"], r["id"], r.get("seconds", "-"), r.get("framed", ""),
                                       ("  alpha=%s" % r["alpha"]) if "alpha" in r else "", ("  WARNING: " + r["warning"]) if r.get("warning") else ""))
        if r["status"] == "failed":
            print("           " + str(r.get("log", ""))[-300:].replace("\n", " "), file=sys.stderr)
    return 0 if all(r["status"] != "failed" for r in recs) else 1


if __name__ == "__main__":
    sys.exit(main())
