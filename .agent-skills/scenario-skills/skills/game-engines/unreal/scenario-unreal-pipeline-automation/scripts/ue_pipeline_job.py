"""
ue_pipeline_job: the job file ue_run.run_python executes inside Unreal for this skill.
NOT YET RUN IN UNREAL (written 2026-09-24, engine not installed). Offline: exercised against
a fake `unreal` module in tests/code/unreal-pipeline-automation/test_offline_fake_unreal.py.

Parent side (system python3):
    import sys; sys.path.insert(0, "<skills>/scenario-unreal-expert/scripts"); import ue_run
    job = "<skills>/scenario-unreal-pipeline-automation/scripts/ue_pipeline_job.py"
    env = ue_run.run_python("/abs/MyGame/MyGame.uproject", job,
                            args={"action": "import", "plan": "/abs/plan.json"}, timeout=7200)
    env["ok"], env["result"]["summary"], env["log"]["python_errors"]

Actions (args["action"]):
    import    plan (abs path), out_dir, chunk (25), pipeline, rules    -> run_import_plan
    preset    dest (content path), overwrite (False), route (post_import |
              interchange_mi), master, vertex_color (False)            -> ensure_pipeline_preset
    describe  path (default engine generic assets pipeline)            -> describe_pipeline
    validate  paths (packages or folders), rules                       -> validate_paths
    flags                                                              -> Interchange FBX cvars + API presence
Never point a saving job at a project an open editor has loaded (write lock): run the same
action in that editor through the MCP toolset or ue_remote.PythonRemote instead.
"""

__version__ = "0.1"  # Unreal Engine Expert Skills v0.1 (2026-09-24)

import json
import os
import sys

try:
    _HERE = os.path.dirname(os.path.abspath(__file__))
except NameError:  # exec() without __file__
    _HERE = os.getcwd()


def parse_args(args):
    """Dict args from ue_run.run_python (a dict), or from the ue_run.py CLI (a list holding one
    JSON string, or key=value strings)."""
    if isinstance(args, dict):
        return args
    if isinstance(args, (list, tuple)):
        if len(args) == 1 and str(args[0]).strip().startswith("{"):
            return json.loads(args[0])
        out = {}
        for x in args:
            if "=" in str(x):
                k, v = str(x).split("=", 1)
                out[k.lstrip("-")] = v
        return out
    return {}



def _truthy(v):
    return str(v).strip().lower() not in ("0", "false", "no", "off", "")


def main(args):
    if _HERE not in sys.path:
        sys.path.insert(0, _HERE)
    import ue_pipeline as P
    a = parse_args(args)
    act = a.get("action", "import")
    if act == "import":
        return P.run_import_plan(a["plan"], a.get("out_dir"), int(a.get("chunk", 25)), a.get("rules"),
                                 a.get("pipeline"), _truthy(a.get("validate", True)))
    if act == "preset":
        rows = P.pipeline_settings(a.get("route", "post_import"), a.get("master"),
                                   _truthy(a.get("vertex_color", False)))
        return P.ensure_pipeline_preset(a["dest"], settings=rows, overwrite=_truthy(a.get("overwrite", False)))
    if act == "describe":
        return P.describe_pipeline(a.get("path", P.DEFAULT_PIPELINE))
    if act == "validate":
        return P.validate_paths(a["paths"], a.get("rules"))
    if act == "flags":
        return {"interchange": P.interchange_fbx_flags(), "api": P.api_presence()}
    raise ValueError("unknown action %r (import, preset, describe, validate, flags)" % act)
