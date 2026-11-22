#!/usr/bin/env bash
# Prep generated clips for the engine: frames (24 fps, native res) -> subject matte -> tracking.
# usage: bash tools/prep_clip.sh                 # every assets/clips/*.mp4
#        bash tools/prep_clip.sh lip_a dance_b    # only these clip names
# Matte: Apple Vision foreground mask via tools/matte (macOS, compiled by scaffold.sh). Elsewhere, generate mattes another way
# (e.g. Scenario video background removal) and save them as assets/video/<clip>/m_00001.png ... (white = subject).
# Afterwards, for flat colour-backdrop clips: .venv/bin/python tools/fixmatte.py <clip> [--white]
cd "$(dirname "$0")/.."
names=("$@")
if [ ${#names[@]} -eq 0 ]; then for f in assets/clips/*.mp4; do names+=("$(basename "$f" .mp4)"); done; fi
for n in "${names[@]}"; do
  f="assets/clips/$n.mp4"
  [ -f "$f" ] || {
    echo "missing $f"
    continue
  }
  w=$(ffprobe -v error -select_streams v -show_entries stream=width -of csv=p=0 "$f")
  .venv/bin/python tools/prep_video.py "$f" "$n" --fps 24 --width "$w" 2>&1 | grep -v objc | tail -1
  if [ -x tools/matte ]; then
    ./tools/matte "assets/video/$n"
    .venv/bin/python - "$n" <<'PY' 2>&1 | grep -v objc
import json,sys; p=f'assets/video/{sys.argv[1]}/meta.json'; m=json.load(open(p)); m['mask']=True; json.dump(m,open(p,'w'),indent=1)
PY
  else echo "$n: no tools/matte binary; skipping matte. Fallbacks: Scenario background removal + tools/matte_keyed.py, then tools/matte_fallback.py (references/pipeline.md §5)"; fi
  .venv/bin/python tools/track.py "$n" 2>&1 | grep -v -E "objc|INFO|WARNING|W0000|I0000" | tail -1
done
echo PREP_DONE
