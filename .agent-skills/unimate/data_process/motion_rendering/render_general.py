"""Render multi-view frames for the general dataset's assets (EEVEE).

The ``general`` dataset is extra training data in the objaverse layout: one
rigged asset per file in ``dataset/raw/general/animation/`` (``.glb``/``.gltf``,
``.fbx`` also accepted; every animation of a file is a clip), exported by
``motion_export/export_general.py``. This is
:mod:`render_objaverse` with that exporter's file list and action discovery,
so both stages derive the same ``{asset}-{action}`` clip names:

  * every ``.glb``/``.gltf``/``.fbx`` file, minus ``excluded.csv``
    (``blender_export.list_asset_files``);
  * asset name = file stem with ``-`` and whitespace replaced by ``_``
    (``blender_export.asset_name``);
  * actions renamed to their glTF animation names, and the bound action when
    no pose action is found (``blender_export.discover_clip_actions``).

Assets without a mesh export fine but have nothing to render, so they get no
caption and stage 4 drops their clips.

Usage (plain python — EEVEE needs the pip ``bpy`` module's GPU context):
    python -m data_process.motion_rendering.render_general \
        --data_dir dataset/raw/general/animation --output_dir dataset/render/general
"""

import sys

from loguru import logger

from data_process.motion_rendering.render_objaverse import main as render_main
from data_process.utils.blender_export import discover_clip_actions, list_asset_files


def main():
    return render_main(
        list_assets=list_asset_files,
        discover=discover_clip_actions,
        description="Render multi-view frames for the general dataset's "
                    "GLB/GLTF/FBX animations (EEVEE).",
    )


if __name__ == "__main__":
    # bpy/Blender exits 0 even on an uncaught exception, which hides failures
    # from `set -e` and from Slurm's afterok dependencies.
    try:
        sys.exit(main())
    except Exception:
        logger.exception("render_general failed")
        sys.exit(1)
