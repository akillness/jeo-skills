# Anonymised judging set: copies strips (and optional close-ups) under neutral ids, writes the list file judges read and
# a key you keep. Mix in a "before" strip or a re-judge of an old picture to calibrate (judge spread is about +-1).
# usage: python3 judge-set.py <round name> <skills.json> <entry>...   entry = <id>:<strip.jpg>[:<close.jpg>]
#   skills.json: [{"id", "skill", "caster", "does"}] (what each skill is and does, in one line)
import json, os, random, shutil, sys
name, info = sys.argv[1], {s["id"]: s for s in json.load(open(sys.argv[2]))}
entries = [e.split(":") for e in sys.argv[3:]]
random.seed(name); random.shuffle(entries)
os.makedirs(name, exist_ok=True); key, lines = {}, []
for n, e in enumerate(entries, 1):
    sid = f"{name}-{n:02d}"; key[sid] = {"id": e[0], "strip": e[1], "close": e[2] if len(e) > 2 else None}
    shutil.copy(e[1], f"{name}/{sid}.jpg")
    extra = ""
    if len(e) > 2: shutil.copy(e[2], f"{name}/{sid}-close.jpg"); extra = f" A close-up of the key frames, cropped tighter, is at {os.path.abspath(name)}/{sid}-close.jpg; look at both."
    s = info[e[0]]
    lines.append(f"- {sid}: strip {os.path.abspath(name)}/{sid}.jpg — **{s['skill']}**, cast by {s['caster']}. What it does: {s['does']}{extra}")
open(f"{name}.md", "w").write("\n".join(lines) + "\n"); json.dump(key, open(f"{name}-key.json", "w"), indent=1)
print(f"wrote {name}.md and {name}-key.json ({len(lines)} strips)")
