"""Mesh animation: drive rigged characters with motion data and export GLB/FBX.

Entry points (all run under Blender headless, ``blender -b -P <script> -- <args>``):

- ``animate_motion``  — feature-format clip (stage-4 / generated) + ``cond.npy``
- ``animate_npz``     — export-stage motion NPZ (bone names carried in the file)
- ``animate_fbx``     — raw animation FBX/GLB clips, action transfer by bone name
- ``animate_mixamo``  — batch wrapper pairing one character with a directory of NPZs
- ``animate_lbs``     — manual NumPy FK+LBS: deform a rigged asset's skinned mesh
  directly with a motion NPZ (either flavor) and save the vertex animation
- one rigged asset → ``cond.npy`` + canonical rest-pose GLB: ``data_process.rig_preprocess``

Shared plumbing lives in :mod:`.common` (processed-asset lookup, keyframe-and-
export core); the canonical rest-pose bake in :mod:`.canonical_rig` (also used
by ``feature_extraction/canonical_assets.py``); rig primitives in
:mod:`data_process.utils.blender_rig`.
"""
