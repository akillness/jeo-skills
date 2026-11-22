"""
cine_render_callbacks: Movie Render Graph Execute Script callback for scenario-unreal-cinematics.

STATUS: NOT YET RUN IN UNREAL (UE 5.8 not installed on 2026-09-24). Tested only against a fake
`unreal` module (tests/code/unreal-cinematics/test_ue_cine_fakeunreal.py): that proves the
logic, not the API names marked [verify].

Why: the render log says a job finished, the callback says which files it wrote. The job-level
list is the input of ue_cine.check_manifest(plan, manifests), which compares it with the frames
each shot must have (exclusive end) and with the disk (mrq-cli "Callback Scripts": `output_data
.graph_data[*].render_layer_data[layer].file_paths`).

Install once per project (mrq-cli "Permanently defining the Python UClass"; 5.8 notes):
  1. copy this file to <project>/Content/Python/cine_render_callbacks.py
  2. add `import cine_render_callbacks` to <project>/Content/Python/init_unreal.py; without it
     the class exists only in the session that defined it
  3. template graph: Execute Script node, class CineWrittenFiles, mode "Editor Only" (5.8: a
     Python class needs Editor Only)
  4. per-shot callbacks (on_shot_finished) run only when Global Output Settings > Flush Disk
     Writes Per Shot is on, or is_per_shot_callback_needed() returns True; both stall at the end
     of every shot until its files are written. The job-level manifest does not need them, so
     PER_SHOT stays False unless a per-shot hook is worth the stall.

Output: one JSON per job in <project>/Saved/MovieRenders/_manifests/ (or $UE_CINE_MANIFEST_DIR),
named <job_name>__<YYYYmmdd-HHMMSS>.json (never overwritten): {"job_name", "sequence",
"sequence_name", "files": {layer: [paths]}, "success", "written_at"}. Pick the newest per job
with ue_cine.latest_manifests(dir). The job and graph handed to callbacks are duplicates, so
nothing done here leaks into the shared queue or graph assets (mrq-cli).
"""

__version__ = "0.1"  # Unreal Engine Expert Skills v0.1 (2026-09-24)

import json
import os
import time

import unreal


def manifest_dir():
    d = os.environ.get("UE_CINE_MANIFEST_DIR")
    if not d:
        d = os.path.join(unreal.Paths.project_saved_dir(), "MovieRenders", "_manifests")  # [verify]
    os.makedirs(d, exist_ok=True)
    return d


def _path_str(p):
    if p is None:
        return ""
    if hasattr(p, "export_text"):
        try:
            return str(p.export_text())
        except Exception:
            pass
    return str(getattr(p, "path", p))


def _prop(obj, name):
    try:
        return obj.get_editor_property(name)
    except Exception:
        return getattr(obj, name, None)


def written_files(output_data):
    """{layer: [paths]} from the callback's output data [verify the 5.8 map type]."""
    out = {}
    for gd in output_data.graph_data:
        rld = gd.render_layer_data
        items = rld.items() if hasattr(rld, "items") else [(k, rld[k]) for k in rld]
        for layer, data in items:
            out.setdefault(str(layer), []).extend(str(p) for p in data.file_paths)
    return out


def write_manifest(job_copy, output_data, shot=None):
    seq = _path_str(_prop(job_copy, "sequence"))
    name = seq.rsplit("/", 1)[-1].split(".")[0]
    job = str(_prop(job_copy, "job_name") or name or "job")
    rec = {"job_name": job, "sequence": seq, "sequence_name": name, "shot": shot,
           "files": written_files(output_data),
           "success": bool(getattr(output_data, "success", True)),
           "written_at": time.strftime("%Y-%m-%d %H:%M:%S")}
    stem = "%s__%s" % (job if shot is None else "%s_%s" % (job, shot), time.strftime("%Y%m%d-%H%M%S"))
    path = os.path.join(manifest_dir(), stem + ".json")
    n = 1
    while os.path.exists(path):  # never overwrite
        path = os.path.join(manifest_dir(), "%s_%d.json" % (stem, n))
        n += 1
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(rec, fh, indent=1)
    unreal.log("cine manifest: %s" % path)
    return path


@unreal.uclass()
class CineWrittenFiles(unreal.MovieGraphScriptBase):
    """Execute Script node class: writes the job's written-file list (Editor Only mode)."""
    PER_SHOT = False  # True forces a stall at every shot end (Flush Disk Writes Per Shot)

    @unreal.ufunction(override=True)
    def on_job_finished(self, job_copy, output_data):
        # the doc's short sample calls super().on_job_start here by mistake (mrq-cli)
        super().on_job_finished(job_copy, output_data)
        write_manifest(job_copy, output_data)

    @unreal.ufunction(override=True)
    def is_per_shot_callback_needed(self):  # [verify override signature]
        return bool(self.PER_SHOT)

    @unreal.ufunction(override=True)
    def on_shot_finished(self, job_copy, shot_copy, output_data):
        super().on_shot_finished(job_copy, shot_copy, output_data)
        if self.PER_SHOT:
            write_manifest(job_copy, output_data,
                           shot=str(_prop(shot_copy, "outer_name") or "shot"))  # [verify]
