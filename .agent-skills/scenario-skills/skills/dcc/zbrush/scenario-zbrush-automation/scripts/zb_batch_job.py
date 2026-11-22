"""
zb_batch_job: one batch recipe for one file inside ZBrush, launched with ZBrush's -script
mode (one ZBrush process per file, no bridge). Also holds resolve_refs(), the recipe
argument resolver shared with the agent-side runner (zb_batch), so both modes run the same
recipe data.

Launch (Maxon SDK quickstart, ex_mod_subtool_export.py; the scene file, if any, is the LAST
argument):
    "/Applications/Maxon ZBrush 2026/ZBrush.app/Contents/MacOS/ZBrush" \
        -script /abs/skills/scenario-zbrush-automation/scripts/zb_batch_job.py --job /abs/job.json

job.json = {"recipe": [step, ...], "params": {...}, "ctx": {...}, "result": "/abs/x.json"}.
A step is {"name", "module", "func", "args", "kwargs", "critical", ...}. The job writes the
result file after every step (atomic replace), so a hang still leaves the finished steps on
disk, then calls sys.exit(0 ok / 1 failed / 2 bad job). Whether ZBrush quits on sys.exit in
-script mode is not documented [verify live_a05]: zb_batch.run_script_job quits it if not.
"""

__version__ = "0.1"  # ZBrush Expert Skills v0.1 (2026-09-24)
import json
import os
import sys
import time
import traceback

HERE = os.path.dirname(os.path.abspath(__file__))
LEAD = os.path.abspath(os.path.join(HERE, "..", "..", "scenario-zbrush-expert", "scripts"))
SCENE_EXT = (".zpr", ".ztl", ".zbr")


def parse_argv(argv):
    """Script arguments start at sys.argv.index('-script') + 2 (Maxon example); a trailing
    scene file (.ZPR/.ZTL) is ZBrush's own argument and is split off."""
    if "-script" in argv:
        i = argv.index("-script")
        script = argv[i + 1] if i + 1 < len(argv) else None
        rest = list(argv[i + 2:])
    else:
        script, rest = None, list(argv[1:])
    scene = rest.pop() if rest and rest[-1].lower().endswith(SCENE_EXT) else None
    job = None
    if "--job" in rest:
        j = rest.index("--job")
        job = rest[j + 1] if j + 1 < len(rest) else None
    return {"script": script, "job": job, "scene": scene, "args": rest}


def _lookup(root, dotted):
    cur = root
    for part in dotted.split("."):
        if isinstance(cur, dict) and part in cur:
            cur = cur[part]
        else:
            raise KeyError(dotted)
    return cur


def resolve_refs(obj, ctx, params):
    """'$p.name' -> params, '$c.name' -> ctx (dots walk dicts); other strings are formatted
    with {**params, **ctx} when they contain '{'. Lists and dicts are walked."""
    if isinstance(obj, str):
        if obj.startswith("$p."):
            return _lookup(params, obj[3:])
        if obj.startswith("$c."):
            return _lookup(ctx, obj[3:])
        if "{" in obj:
            return obj.format(**{**params, **ctx})
        return obj
    if isinstance(obj, list):
        return [resolve_refs(x, ctx, params) for x in obj]
    if isinstance(obj, dict):
        return {k: resolve_refs(v, ctx, params) for k, v in obj.items()}
    return obj


def write_json_atomic(path, data):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w") as fh:
        json.dump(data, fh, indent=1, default=repr)
    os.replace(tmp, path)


def _import_toolkit(names):
    """Import toolkit modules by path, then take the folders off sys.path and the modules
    out of sys.modules (Maxon Style Guide: shared interpreter)."""
    import importlib
    before = set(sys.modules)
    dirs = [HERE, LEAD]
    for d in dirs:
        sys.path.insert(0, d)
    try:
        mods = {n: importlib.import_module(n) for n in names}
    finally:
        for d in dirs:
            while d in sys.path:
                sys.path.remove(d)
        for k in set(sys.modules) - before:
            if k.startswith("zb_"):
                sys.modules.pop(k, None)
    return mods


def run_job(job, mods):
    recipe, params = job["recipe"], job.get("params", {})
    ctx = dict(job.get("ctx", {}))
    res_path = job["result"]
    result = {"status": "running", "started": time.strftime("%Y-%m-%dT%H:%M:%S"),
              "steps": [], "ctx": ctx, "finished": False}
    write_json_atomic(res_path, result)
    failed = False
    for step in recipe:
        rec = {"step": step["name"], "ok": False, "seconds": None, "value": None, "error": None}
        t = time.time()
        try:
            fn = getattr(mods[step["module"]], step["func"])
            args = resolve_refs(step.get("args", []), ctx, params)
            kwargs = resolve_refs(step.get("kwargs", {}), ctx, params)
            rec["value"] = fn(*args, **kwargs)
            rec["ok"] = True
            if isinstance(rec["value"], dict) and isinstance(rec["value"].get("ctx"), dict):
                ctx.update(rec["value"]["ctx"])
        except Exception as e:
            rec["error"] = f"{type(e).__name__}: {e}"
            rec["trace"] = traceback.format_exc()[-2000:]
        rec["seconds"] = round(time.time() - t, 3)
        result["steps"].append(rec)
        result["ctx"] = ctx
        write_json_atomic(res_path, result)
        if not rec["ok"] and step.get("critical", True):
            failed = True
            break
    result["status"] = "failed" if failed else "ok"
    result["finished"] = True
    result["ended"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    write_json_atomic(res_path, result)
    return result


def main(argv=None):
    a = parse_argv(sys.argv if argv is None else argv)
    if not a["job"] or not os.path.exists(a["job"]):
        print(f"zb_batch_job: no job file ({a})")
        return 2
    with open(a["job"]) as fh:
        job = json.load(fh)
    names = sorted({s["module"] for s in job["recipe"]} | {"zb_ops"})
    try:
        mods = _import_toolkit(names)
    except Exception:
        write_json_atomic(job["result"], {"status": "failed", "finished": True,
                                          "error": traceback.format_exc()[-2000:]})
        return 2
    r = run_job(job, mods)
    return 0 if r["status"] == "ok" else 1


if __name__ == "__main__":
    sys.exit(main())
