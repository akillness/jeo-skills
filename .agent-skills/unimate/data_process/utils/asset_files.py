"""Files of the processed assets: paths, notes, GLB JSON (bpy-free).

Layout:

    <export>/rigs/<asset>.glb                  rest-pose asset on the export's pruned
                                                 skeleton (export stage, --save_glb /
                                                 --glb_only; built by processed_assets.py)
    <export>/rigs/texture_issues/<asset>.txt   exactly while that GLB has a texture problem
    <export>/rigs/glb_errors/<asset>.txt       exactly while building it last failed
    <export>/replaced/{motions,videos}/          an asset's clips from before it was
                                                 exported again (set_aside_old_clips)
    <root>/canonical_assets/<ds>/<name>.glb      the same in the stage-4 canonical frame
                                                 (feature_extraction/canonical_assets.py),
                                                 with its own glb_errors/ and texture_issues/

One note file per asset, so parallel workers never share one.
"""

import hashlib
import json
import os
import struct

import numpy as np
from loguru import logger

# Sibling of motions/ in an export directory: rigs/<asset>.glb, the asset
# that motions/<asset>-*.npz animate.
PROCESSED_GLB_DIR = 'rigs'
TEXTURE_ISSUES_DIR = 'texture_issues'
GLB_ERRORS_DIR = 'glb_errors'
# Sibling of a features root (<root>/features/<ds>): <root>/canonical_assets/<ds>.
CANONICAL_ASSETS_DIR = 'canonical_assets'
# Mixamo character whose canonical GLB drives the shared Mixamo rig by default.
DEFAULT_MIXAMO_CHARACTER = 'Michelle'
# Sibling of motions/ in an export directory: clips of an earlier export of an
# asset that is exported again (replaced/motions/, replaced/videos/).
REPLACED_DIR = 'replaced'
# The canonical rest-pose GLB of a cond entry carries its joint order under
# this glTF extras key (feature_extraction/canonical_assets.py).
CANONICAL_ORDER_KEY = 'canonical_joint_order'
# ... and the cond_frame_digest of the cond it was baked from (a GLB without
# it cannot be checked against the cond).
FRAME_DIGEST_KEY = 'canonical_frame_digest'


def default_assets_dir(features_dir):
    """Where a features directory's canonical assets go by default: beside the
    features root, never inside it. ``<root>/features<suffix>/<ds>`` (e.g.
    ``dataset/features/truebones``, ``dataset/features_v2/truebones``) gives
    ``<root>/canonical_assets<suffix>/<ds>``; any other directory ``<dir>``
    (e.g. a temporary stage-4 ``SAVE_DIR``) gives ``<dir>_canonical_assets``.
    The path is made absolute without resolving symlinks."""
    path = os.path.abspath(features_dir.rstrip(os.sep))
    parent = os.path.dirname(path)
    name = os.path.basename(parent)
    if name.startswith('features'):
        return os.path.join(os.path.dirname(parent),
                            CANONICAL_ASSETS_DIR + name[len('features'):],
                            os.path.basename(path))
    return path + '_' + CANONICAL_ASSETS_DIR


# ---------------------------------------------------------------------------
# Export-stage assets
# ---------------------------------------------------------------------------

def processed_glb_path(output_dir, asset):
    """``<output_dir>/rigs/<asset>.glb``."""
    return os.path.join(output_dir, PROCESSED_GLB_DIR, f'{asset}.glb')


def asset_clip_npzs(output_dir, asset):
    """Sorted ``motions/<asset>-*.npz`` of one exported asset."""
    motion_dir = os.path.join(output_dir, 'motions')
    if not os.path.isdir(motion_dir):
        return []
    prefix = f'{asset}-'
    return sorted(os.path.join(motion_dir, f) for f in os.listdir(motion_dir)
                  if f.startswith(prefix) and f.endswith('.npz'))


def asset_glb_missing(output_dir, asset):
    """True when the asset has clip NPZs but no processed GLB yet."""
    return (not os.path.isfile(processed_glb_path(output_dir, asset))
            and bool(asset_clip_npzs(output_dir, asset)))


def main_skeleton_clips(output_dir, asset, want=None):
    """``(main, others)``: the asset's clip NPZs on its main skeleton, and
    those on any other one.

    An objaverse / general asset has one skeleton (pruning is shared by its
    clips); a Truebones species can ship rig variants, pruned separately. The
    main skeleton is *want* (joint names) when given, else the asset's entry
    in ``joint_names.json`` (the export's record: the dominant variant), else
    the one most clips use.
    """
    groups = {}
    for path in asset_clip_npzs(output_dir, asset):
        with np.load(path, allow_pickle=True) as npz:
            groups.setdefault(tuple(str(n) for n in npz['names']), []).append(path)
    if not groups:
        return [], []
    if want is None and len(groups) > 1:
        joint_names_path = os.path.join(output_dir, 'joint_names.json')
        if os.path.isfile(joint_names_path):
            with open(joint_names_path) as f:
                want = json.load(f).get(asset)
    key = tuple(want) if want is not None and tuple(want) in groups \
        else max(groups, key=lambda k: len(groups[k]))
    others = sorted(p for k, paths in groups.items() if k != key for p in paths)
    return groups[key], others


def write_note(notes_dir, kind, name, lines):
    """``<notes_dir>/<kind>/<name>.txt`` holding *lines*, or removed when there
    are none (*kind*: ``TEXTURE_ISSUES_DIR`` or ``GLB_ERRORS_DIR``)."""
    path = os.path.join(notes_dir, kind, f'{name}.txt')
    if lines:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'w') as f:
            f.write('\n'.join(lines) + '\n')
    elif os.path.isfile(path):
        os.remove(path)


def set_aside_old_clips(output_dir, asset):
    """Move ``motions/<asset>-*.npz`` and ``videos/<asset>-*.mp4`` of an
    earlier export to ``replaced/``. A fresh export rewrites the asset whole,
    and a clip it no longer produces (renamed, now too short) must not stay
    among the new ones. Returns the number of clips moved."""
    moved = 0
    for sub, ext in (('motions', '.npz'), ('videos', '.mp4')):
        src_dir = os.path.join(output_dir, sub)
        if not os.path.isdir(src_dir):
            continue
        names = [f for f in os.listdir(src_dir)
                 if f.startswith(f'{asset}-') and f.endswith(ext)]
        if not names:
            continue
        dst_dir = os.path.join(output_dir, REPLACED_DIR, sub)
        os.makedirs(dst_dir, exist_ok=True)
        for name in names:
            os.replace(os.path.join(src_dir, name), os.path.join(dst_dir, name))
        if sub == 'motions':
            moved = len(names)
    return moved


def remove_asset_glb(output_dir, asset):
    """Delete the asset's processed GLB and its notes; called before an asset
    is (re-)exported, since the GLB was built from the skeleton being replaced."""
    paths = [processed_glb_path(output_dir, asset)] + [
        os.path.join(output_dir, PROCESSED_GLB_DIR, kind, f'{asset}.txt')
        for kind in (TEXTURE_ISSUES_DIR, GLB_ERRORS_DIR)]
    removed = [p for p in paths if os.path.isfile(p)]
    for p in removed:
        os.remove(p)
    if removed and removed[0].endswith('.glb'):
        logger.info(f"Removed the stale processed GLB of '{asset}'")


def record_glb_error(output_dir, key, message):
    """``rigs/glb_errors/<key>.txt`` holding *message*, or removed when it is
    None: an asset's GLB failure, or one with no single asset to retry."""
    if message:
        logger.error(message)
    write_note(os.path.join(output_dir, PROCESSED_GLB_DIR), GLB_ERRORS_DIR, key,
               [message] if message else [])


def log_other_skeletons(asset, others):
    """Warn about clips the asset's processed GLB cannot drive (another rig variant)."""
    if others:
        logger.warning(f"'{asset}': {len(others)} clip(s) use another skeleton than its "
                       f"processed GLB (drive them from the source file): "
                       f"{[os.path.basename(p)[:-4] for p in others]}")


def report_glb_errors(output_dir):
    """Log the recorded GLB failures of an export directory; returns their count."""
    errors_dir = os.path.join(output_dir, PROCESSED_GLB_DIR, GLB_ERRORS_DIR)
    n = len(os.listdir(errors_dir)) if os.path.isdir(errors_dir) else 0
    if n:
        logger.error(f"{n} asset(s) have no processed GLB; see {errors_dir} "
                     f"(rerun with --glb_only to retry). Their NPZs are complete.")
    return n


# ---------------------------------------------------------------------------
# GLB contents
# ---------------------------------------------------------------------------

def read_glb_json(path):
    """The JSON chunk of a GLB file (ValueError when it is not one)."""
    with open(path, 'rb') as f:
        magic, _version, _length = struct.unpack('<4sII', f.read(12))
        if magic != b'glTF':
            raise ValueError(f"{path} is not a GLB file")
        chunk_len, chunk_type = struct.unpack('<I4s', f.read(8))
        if chunk_type != b'JSON':
            raise ValueError(f"{path}: first GLB chunk is not JSON")
        return json.loads(f.read(chunk_len))


def glb_images(path):
    """``[(name, n_bytes), ...]`` for the images embedded in a GLB file; an
    image stored by URI (not embedded) counts with 0 bytes."""
    gltf = read_glb_json(path)
    views = gltf.get('bufferViews', [])
    return [(img.get('name', ''),
             views[img['bufferView']].get('byteLength', 0) if 'bufferView' in img else 0)
            for img in gltf.get('images', [])]


def glb_image_digests(path):
    """``[(name, sha1 of the embedded bytes), ...]`` for the images of a GLB
    file (an image stored by URI, not embedded, has None)."""
    with open(path, 'rb') as f:
        data = f.read()
    json_len = struct.unpack_from('<I', data, 12)[0]
    gltf = json.loads(data[20:20 + json_len])
    bin_start = 20 + json_len + 8           # BIN chunk header follows the JSON chunk
    views = gltf.get('bufferViews', [])
    out = []
    for img in gltf.get('images', []):
        if 'bufferView' not in img:
            out.append((img.get('name', ''), None))
            continue
        view = views[img['bufferView']]
        off = bin_start + view.get('byteOffset', 0)
        out.append((img.get('name', ''), hashlib.sha1(data[off:off + view['byteLength']]).hexdigest()))
    return out


def glb_node_extra(path, key):
    """The first value of glTF extras *key* on any node of a GLB, or None
    (also for a missing or unreadable file)."""
    try:
        gltf = read_glb_json(path)
    except (OSError, ValueError, struct.error):
        return None
    for node in gltf.get('nodes', []):
        value = (node.get('extras') or {}).get(key)
        if value:
            return value
    return None


def glb_joint_order(path):
    """The joint order a canonical GLB stores (``CANONICAL_ORDER_KEY``), as a
    list of names, or None (no such GLB, or not a canonical asset)."""
    value = glb_node_extra(path, CANONICAL_ORDER_KEY)
    if isinstance(value, str):
        value = json.loads(value)
    return None if value is None else [str(n) for n in value]


_FRAME_KEYS = ('joint_names', 'parents', 'tpos_first_frame', 'tpos_global_rotations')


def _cond_hash(entry, fold_zero):
    h = hashlib.sha1()
    h.update(json.dumps([str(n) for n in entry['joint_names']]).encode())
    h.update(np.asarray(entry['parents'], dtype=np.int64).tobytes())
    for key in ('tpos_first_frame', 'tpos_global_rotations'):
        values = np.round(np.asarray(entry[key], dtype=np.float64), 6)
        h.update((values + 0.0 if fold_zero else values).tobytes())
    return h.hexdigest()


def cond_digest(entry):
    """sha1 of a cond entry's joint names, hierarchy and canonical T-pose
    (rounded to 1e-6): the cond part of a canonical GLB's resume digest."""
    return _cond_hash(entry, fold_zero=False)


def cond_frame_digest(entry):
    """The canonical frame a cond entry defines, as :func:`cond_digest` but
    with -0.0 taken as 0.0, so float noise around zero (whose sign can differ
    between machines) leaves it unchanged; None when the entry lacks one of
    the T-pose fields. Sampler manifests record it per motion and canonical
    GLBs per bake (``FRAME_DIGEST_KEY``), and a motion is driven only against
    a cond and a GLB of the same frame."""
    if any(key not in entry for key in _FRAME_KEYS):
        return None
    return _cond_hash(entry, fold_zero=True)


def check_glb_textures(glb_path, expected, unresolved):
    """Compare the textures a GLB embeds with the ones the scene used.

    Args:
        expected: ``{image name: names it may be embedded under}`` for the
            images the exported materials use that have pixel data (the
            exporter names an image after its datablock or its file stem).
        unresolved: names of the material images whose files were not found.

    Returns:
        A list of problems (empty when every texture made it in). An image the
        exporter merged into another (diffuse + opacity into one RGBA image,
        metallic + roughness) is embedded under the sources' names joined by
        ``-``, and counts as present. Images still missing by name are
        reported, not failed: the exporter may also skip an image wired
        through a node it cannot translate.
    """
    embedded = glb_images(glb_path)
    problems = []
    if unresolved:
        problems.append(f"texture files not found: {sorted(unresolved)}")
    empty = [n for n, size in embedded if size == 0]
    if empty:
        problems.append(f"images without embedded data: {empty}")
    if expected and not any(size for _, size in embedded):
        problems.append(f"no texture embedded although the materials use {len(expected)}")
    else:
        names = {n for n, _ in embedded}
        names |= {part for n in names for part in n.split('-')}   # merged 'A-B'
        absent = sorted(n for n, aliases in expected.items() if not aliases & names)
        if absent:
            problems.append(f"{len(absent)} of {len(expected)} material images not embedded, "
                            f"alone or merged (dropped by the glTF exporter?): {absent[:5]}")
    return problems
