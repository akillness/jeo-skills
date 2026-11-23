"""Compares two collected runs of the same personas on two versions of an app
(two branches, two builds, a flag): goal reached, actions, score and issues of
each version, persona by persona, the issues seen on one version only and the
improvements by area. Works with any brief; briefs/improve.md gives the goal
and action counts.

Simulated users show what blocks or confuses them on each version. They do not
predict which version converts better: confirm with real users before deciding.
Usage: python3 scripts/compare.py <run_dir_A> <run_dir_B> [name_A name_B]"""
import sys
from collections import defaultdict
from statistics import median

from summarize import AREAS, GOALS, ORDER, cell, number, per_persona, personas_by_id, phone

SEVERITIES = ("blocker", "major", "minor", "cosmetic")


def load(run_dir):
    """persona -> score, goal reached, actions, issues and improvement areas of one run."""
    run = {}
    for persona, data in per_persona(run_dir):
        goal = str(data.get("goal_reached") or "").strip().lower()
        issues = [{"severity": str(i.get("severity") or "?").strip().lower(),
                   "title": str(i.get("title") or "?").strip()}
                  for i in data.get("issues") or [] if isinstance(i, dict)]
        areas = [str(i.get("area") or "").strip().lower()
                 for i in data.get("improvements") or [] if isinstance(i, dict) and i.get("title")]
        run[persona] = {"score": number(data.get("score")), "actions": number(data.get("actions")),
                        "goal": goal if goal in GOALS else "", "issues": issues,
                        "areas": [a if a in AREAS else "other" for a in areas]}
    return run


def fmt(x):
    return "" if x is None else f"{x:g}"


def overview(run):
    ps = list(run.values())
    goals = [p["goal"] for p in ps if p["goal"]]
    actions = [p["actions"] for p in ps if p["actions"] is not None]
    scores = [p["score"] for p in ps if p["score"] is not None]
    sev = defaultdict(int)
    for p in ps:
        for i in p["issues"]:
            sev[i["severity"]] += 1
    return [str(len(ps)),
            " / ".join(str(goals.count(g)) for g in GOALS) if goals else "",
            fmt(median(actions)) if actions else "",
            f"{sum(scores) / len(scores):.1f}/10" if scores else "",
            " / ".join(str(sev[s]) for s in SEVERITIES)]


def only_in(run, other):
    """Issues whose title (case aside) never appears in the other run, most severe first."""
    seen = {i["title"].lower() for p in other.values() for i in p["issues"]}
    found = {}
    for persona, p in run.items():
        for i in p["issues"]:
            if i["title"].lower() not in seen:
                f = found.setdefault(i["title"].lower(), {"title": i["title"], "sev": i["severity"], "personas": set()})
                f["personas"].add(persona)
                if ORDER.get(i["severity"], 9) < ORDER.get(f["sev"], 9):
                    f["sev"] = i["severity"]
    return sorted(found.values(), key=lambda f: (ORDER.get(f["sev"], 9), -len(f["personas"]), f["title"].lower()))


def render(a, b, names=("A", "B"), dirs=("", "")):
    na, nb = names
    both, alone = sorted(set(a) & set(b)), sorted(set(a) ^ set(b))
    lines = [f"# {na} vs {nb}", "",
             f"The same personas on two versions of the app ({na}: {dirs[0]}, {nb}: {dirs[1]}). "
             f"{len(both)} personas ran both."]
    if alone:
        lines.append(f"Only on one version, so not in the persona table: {', '.join(alone)}.")
    lines += ["Simulated users show what blocks or confuses them on each version. They do not predict "
              "which version converts better: confirm with real users before you decide.", "",
              f"| | {na} | {nb} |", "|---|---|---|"]
    labels = ["Personas", "Goal reached (yes / partly / no)", "Median actions", "Average score",
              "Issues (blocker / major / minor / cosmetic)"]
    for label, x, y in zip(labels, overview(a), overview(b)):
        lines.append(f"| {label} | {x} | {y} |")

    personas = personas_by_id()
    lines += ["", "## Persona by persona", "",
              f"| Persona | Device | Language | Goal {na} | Goal {nb} | Actions {na} | Actions {nb} "
              f"| Score {na} | Score {nb} | Issues {na} | Issues {nb} |", "|---|---|---|---|---|---|---|---|---|---|---|"]
    up = down = same = 0
    for p in both:
        x, y = a[p], b[p]
        device, locale, _ = phone(personas.get(p))
        lines.append(f"| {p} | {cell(device)} | {locale} | {x['goal']} | {y['goal']} | {fmt(x['actions'])} "
                     f"| {fmt(y['actions'])} | {fmt(x['score'])} | {fmt(y['score'])} | {len(x['issues'])} "
                     f"| {len(y['issues'])} |")
        if x["score"] is not None and y["score"] is not None:
            up, down, same = up + (y["score"] > x["score"]), down + (y["score"] < x["score"]), same + (y["score"] == x["score"])
    if up + down + same:
        lines += ["", f"{nb} scored higher than {na} for {up} of {up + down + same} personas, lower for {down}, "
                      f"the same for {same}. With ten personas, a gap of one or two is noise."]

    for name, run, other in ((na, a, b), (nb, b, a)):
        found = only_in(run, other)
        lines += ["", f"## Issues seen only on {name}", ""]
        if not found:
            lines.append("None.")
        lines += [f"- {f['sev']}: {cell(f['title'])} ({', '.join(sorted(f['personas']))})" for f in found[:20]]
        if len(found) > 20:
            lines.append(f"- and {len(found) - 20} more")
    lines += ["", "The same bug described in other words appears on both lists: read them side by side."]

    areas = {name: defaultdict(int) for name in names}
    for name, run in zip(names, (a, b)):
        for p in run.values():
            for area in p["areas"]:
                areas[name][area] += 1
    if any(areas[n] for n in names):
        lines += ["", "## Improvements suggested, by area", "", f"| Area | {na} | {nb} |", "|---|---|---|"]
        for area in sorted(set(areas[na]) | set(areas[nb]), key=lambda k: (-(areas[na][k] + areas[nb][k]), k)):
            lines.append(f"| {area} | {areas[na][area]} | {areas[nb][area]} |")
    return "\n".join(lines) + "\n"


def main():
    if len(sys.argv) not in (3, 5):
        sys.exit(__doc__)
    names = tuple(sys.argv[3:5]) or ("A", "B")
    print(render(load(sys.argv[1]), load(sys.argv[2]), names, tuple(sys.argv[1:3])), end="")


if __name__ == "__main__":
    main()
