"""
zb_goz: read and write GoZ binary files, and drive the GoZ folder protocol, in pure Python.

No ZBrush, numpy or Blender needed: the same file runs in system python3, in Blender's or
Maya's Python, and inside ZBrush. That is the point: a GoZ file becomes plain data an agent
can check (counts, names, UVs, polygroups) or write, without GoB or the GoZ buttons.

    import zb_goz
    info = zb_goz.read_goz("/abs/out/body.GoZ")          # dict: name, points, faces, uvs...
    zb_goz.write_goz("/abs/in/rock.GoZ", "rock", points, faces, polygroups=groups)
    zb_goz.check_names(["Body", "Body", "left eye"])     # GoZ naming problems

Layout (little endian), confirmed by parsing the ZBrush-written file
/Applications/Maxon ZBrush 2026/ZResources/DXFStar.GoZ (2026.2.1) and by rewriting it byte
for byte (tests/code/zbrush-automation/test_zb_goz.py):
  header  32 bytes  b"GoZb 1.0 ZBrush GoZ Binary" + 6 dots
  block   tag u32, size u32 (whole block, header included), count u32, modifier u32, payload
  end     a 16-byte block of zeros (tag 0)
Tags seen in DXFStar.GoZ: 1 object name ("GoZMesh_<name>", NUL padded to 4 bytes), 5001
flags (4 zero bytes), 10001 points (3 x f32), 20001 faces (4 x u32, 0xFFFFFFFF as the 4th
index of a triangle), 2 material name ("GoZMat_<name>"). Tags known only from the GoB
add-on (JoseConseco/GoB, via the project note automation__community-bridges-remote-control)
[verify against a ZBrush export with UVs, polypaint, mask and groups]: 25001 UVs (4 x (u, v)
f32 per face), 35001 polypaint (B, G, R, 0 bytes per point), 30002 mask (u16 per point,
stored as (1 - mask) * 65535), 40001 polygroups (u16 per face, 65504 = no group), 45001
diffuse map path, 50001 normal map path, 55001 displacement map path.

Axes [inferred, verify]: Maya's GoZ_Info.txt flips Y and Z on both import and export
(/Users/Shared/Pixologic/GoZApps/Maya/GoZ_Info.txt), GoB's Blender GoZ_Info flips nothing
and applies its own matrix. So a .GoZ holds ZBrush's own axes, not OBJ axes: convert with
goz_to_obj_axes() before comparing with an OBJ export of the same SubTool.

Folder protocol (GoZ SDK "GoZBrushFromApp"; not yet run on this Mac): write the .GoZ files,
list their extension-less paths in GoZBrush/GoZ_ObjectList.txt, optionally set
IMPORT_AS_SUBTOOL in GoZBrush/GoZ_Config.txt, then run GoZBrush/GoZBrushFromApp.app, which
opens every listed object in the running ZBrush (or launches it). push_to_zbrush() does this
and backs up every shared file it changes.
"""

__version__ = "0.1"  # ZBrush Expert Skills v0.1 (2026-09-24)
import os
import re
import shutil
import struct
import subprocess
import time

HEADER = b"GoZb 1.0 ZBrush GoZ Binary" + b"." * 6
PIXOLOGIC = "/Users/Shared/Pixologic"
NO_GROUP = 65504
TRI = 0xFFFFFFFF

TAG_OBJECT, TAG_MATERIAL, TAG_FLAGS = 1, 2, 5001
TAG_POINTS, TAG_FACES, TAG_UVS = 10001, 20001, 25001
TAG_MASK, TAG_POLYPAINT, TAG_GROUPS = 30002, 35001, 40001
TAG_DIFFUSE, TAG_NORMAL, TAG_DISPLACEMENT = 45001, 50001, 55001
TAG_NAMES = {0: "end", TAG_OBJECT: "object_name", TAG_MATERIAL: "material_name",
             TAG_FLAGS: "flags", TAG_POINTS: "points", TAG_FACES: "faces", TAG_UVS: "uvs",
             TAG_MASK: "mask", TAG_POLYPAINT: "polypaint", TAG_GROUPS: "polygroups",
             TAG_DIFFUSE: "diffuse_map", TAG_NORMAL: "normal_map",
             TAG_DISPLACEMENT: "displacement_map"}
STRING_TAGS = (TAG_OBJECT, TAG_MATERIAL, TAG_DIFFUSE, TAG_NORMAL, TAG_DISPLACEMENT)


class GoZError(ValueError):
    pass


# --------------------------------------------------------------------------------------------
# Binary format
# --------------------------------------------------------------------------------------------

def _cstr(payload):
    return payload.split(b"\0", 1)[0].decode("utf-8", "replace")


def read_goz(path, data=True):
    """Parse a .GoZ file. data=False skips the arrays (counts only, fast on big files).

    Returns {"path", "header", "name", "material", "blocks": [{tag, kind, offset, size,
    count, modifier}], "points", "faces", "uvs", "polypaint", "mask", "polygroups", "maps",
    "counts": {"points", "faces", "triangles", "quads"}, "unknown_tags"}. Faces are lists of
    3 or 4 point indices; uvs are per face lists of 4 (u, v) pairs as stored."""
    with open(path, "rb") as fh:
        buf = fh.read()
    if not buf.startswith(b"GoZb"):
        raise GoZError(f"{path}: not a GoZ file (header {buf[:8]!r})")
    out = {"path": path, "header": buf[:32].decode("ascii", "replace"), "name": None,
           "material": None, "blocks": [], "points": None, "faces": None, "uvs": None,
           "polypaint": None, "mask": None, "polygroups": None, "maps": {},
           "unknown_tags": []}
    off = 32
    ended = False
    while off + 16 <= len(buf):
        tag, size, count, mod = struct.unpack_from("<IIII", buf, off)
        kind = TAG_NAMES.get(tag, "unknown")
        out["blocks"].append({"tag": tag, "kind": kind, "offset": off, "size": size,
                              "count": count, "modifier": mod})
        if tag == 0:
            ended = True
            break
        if size < 16 or off + size > len(buf):
            raise GoZError(f"{path}: block tag {tag} at {off} has size {size} (file {len(buf)})")
        body = buf[off + 16:off + size]
        if tag in STRING_TAGS:
            s = _cstr(body)
            if tag == TAG_OBJECT:
                out["name"] = s[len("GoZMesh_"):] if s.startswith("GoZMesh_") else s
                out["raw_name"] = s
            elif tag == TAG_MATERIAL:
                out["material"] = s[len("GoZMat_"):] if s.startswith("GoZMat_") else s
            else:
                out["maps"][kind] = s
        elif not data:
            pass
        elif tag == TAG_POINTS:
            v = struct.unpack_from(f"<{3 * count}f", body)
            out["points"] = [tuple(v[i:i + 3]) for i in range(0, 3 * count, 3)]
        elif tag == TAG_FACES:
            v = struct.unpack_from(f"<{4 * count}I", body)
            out["faces"] = [list(v[i:i + 3]) if v[i + 3] == TRI else list(v[i:i + 4])
                            for i in range(0, 4 * count, 4)]
        elif tag == TAG_UVS:
            v = struct.unpack_from(f"<{8 * count}f", body)
            out["uvs"] = [[(v[i + 2 * k], v[i + 2 * k + 1]) for k in range(4)]
                          for i in range(0, 8 * count, 8)]
        elif tag == TAG_POLYPAINT:
            out["polypaint"] = [(body[i + 2], body[i + 1], body[i])      # stored B, G, R, 0
                                for i in range(0, 4 * count, 4)]
        elif tag == TAG_MASK:
            v = struct.unpack_from(f"<{count}H", body)
            out["mask"] = [round(1.0 - x / 65535.0, 6) for x in v]
        elif tag == TAG_GROUPS:
            out["polygroups"] = list(struct.unpack_from(f"<{count}H", body))
        elif tag == TAG_FLAGS:
            out["flags"] = body
        else:
            out["unknown_tags"].append(tag)
        off += size
    if not ended:
        raise GoZError(f"{path}: no end block (truncated file?)")
    pts = next((b["count"] for b in out["blocks"] if b["tag"] == TAG_POINTS), 0)
    fcs = next((b["count"] for b in out["blocks"] if b["tag"] == TAG_FACES), 0)
    counts = {"points": pts, "faces": fcs}
    if out["faces"] is not None:
        counts["triangles"] = sum(1 for f in out["faces"] if len(f) == 3)
        counts["quads"] = fcs - counts["triangles"]
    out["counts"] = counts
    return out


def goz_info(path):
    """Counts, names and block list only (no arrays)."""
    r = read_goz(path, data=False)
    return {k: r[k] for k in ("path", "header", "name", "material", "counts", "maps",
                              "unknown_tags")} | {"tags": [b["tag"] for b in r["blocks"]]}


def _string_block(tag, text):
    raw = text.encode("utf-8") + b"\0"
    raw += b"\0" * (-len(raw) % 4)                     # DXFStar.GoZ: NUL padded to 4 bytes
    return struct.pack("<IIII", tag, 16 + len(raw), 1, 0) + raw


def _array_block(tag, count, payload):
    return struct.pack("<IIII", tag, 16 + len(payload), count, 0) + payload


def write_goz(path, name, points, faces, uvs=None, polygroups=None, polypaint=None, mask=None,
              material=None, flags=b"\0\0\0\0", maps=None):
    """Write a .GoZ in the layout of DXFStar.GoZ. points: [(x, y, z)] in ZBrush axes
    (see obj_to_goz_axes); faces: lists of 3 or 4 zero-based indices; uvs: per face 3 or 4
    (u, v) pairs, stored unchanged [verify orientation]; polygroups: one int per face
    (NO_GROUP = none); polypaint: (r, g, b) 0..255 per point; mask: 0..1 per point
    (1 = masked); maps: {"diffuse_map"|"normal_map"|"displacement_map": path}.
    material defaults to name, like ZBrush's own GoZMat_<name>. Returns {path, bytes}."""
    npts, nf = len(points), len(faces)
    chunks = [HEADER, _string_block(TAG_OBJECT, "GoZMesh_" + name),
              _array_block(TAG_FLAGS, 1, flags)]
    chunks.append(_array_block(TAG_POINTS, npts,
                               b"".join(struct.pack("<3f", *map(float, p)) for p in points)))
    fbytes = []
    for f in faces:
        if len(f) == 3:
            fbytes.append(struct.pack("<4I", f[0], f[1], f[2], TRI))
        elif len(f) == 4:
            fbytes.append(struct.pack("<4I", *f))
        else:
            raise GoZError(f"face with {len(f)} corners: GoZ holds triangles and quads only")
        if max(f) >= npts or min(f) < 0:
            raise GoZError(f"face {f} indexes outside 0..{npts - 1}")
    chunks.append(_array_block(TAG_FACES, nf, b"".join(fbytes)))
    if uvs is not None:
        if len(uvs) != nf:
            raise GoZError(f"{len(uvs)} UV entries for {nf} faces")
        ub = []
        for fu in uvs:
            pairs = list(fu) + [(0.0, 0.0)] * (4 - len(fu))
            ub.append(b"".join(struct.pack("<2f", float(u), float(v)) for u, v in pairs[:4]))
        chunks.append(_array_block(TAG_UVS, nf, b"".join(ub)))
    if polypaint is not None:
        if len(polypaint) != npts:
            raise GoZError(f"{len(polypaint)} colours for {npts} points")
        chunks.append(_array_block(TAG_POLYPAINT, npts, b"".join(
            bytes((int(b) & 255, int(g) & 255, int(r) & 255, 0)) for r, g, b in polypaint)))
    if mask is not None:
        if len(mask) != npts:
            raise GoZError(f"{len(mask)} mask values for {npts} points")
        chunks.append(_array_block(TAG_MASK, npts, b"".join(
            struct.pack("<H", int(round((1.0 - min(max(float(m), 0.0), 1.0)) * 65535)))
            for m in mask)))
    if polygroups is not None:
        if len(polygroups) != nf:
            raise GoZError(f"{len(polygroups)} polygroups for {nf} faces")
        chunks.append(_array_block(TAG_GROUPS, nf, b"".join(
            struct.pack("<H", int(g) & 0xFFFF) for g in polygroups)))
    tag_of = {"diffuse_map": TAG_DIFFUSE, "normal_map": TAG_NORMAL,
              "displacement_map": TAG_DISPLACEMENT}
    for kind, p in (maps or {}).items():
        chunks.append(_string_block(tag_of[kind], p))
    chunks.append(_string_block(TAG_MATERIAL, "GoZMat_" + (material or name)))
    chunks.append(b"\0" * 16)
    data = b"".join(chunks)
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "wb") as fh:
        fh.write(data)
    os.replace(tmp, path)
    return {"path": path, "bytes": len(data)}


def goz_to_obj_axes(points):
    """GoZ (ZBrush) axes to OBJ-export axes: flip Y and Z [inferred from Maya's GoZ_Info
    EXPORT_FLIP_Y/Z, verify with one SubTool exported both ways]."""
    return [(x, -y, -z) for x, y, z in points]


obj_to_goz_axes = goz_to_obj_axes            # the flip is its own inverse


def bbox(points):
    if not points:
        return None
    xs, ys, zs = zip(*points)
    return [min(xs), min(ys), min(zs), max(xs), max(ys), max(zs)]


# --------------------------------------------------------------------------------------------
# Names
# --------------------------------------------------------------------------------------------

_BAD = re.compile(r"[^A-Za-z0-9_]")


def check_names(names):
    """GoZ needs unique Tool and SubTool names across every loaded Tool, without spaces or
    non-alphanumeric characters (GoZ docs "Restrictions"). Underscore is accepted here because
    ZBrush's own names use it (PM3D_Sphere3D, Polymesh3D_1) [added]. Returns a list of
    {"name", "problem"}."""
    issues, seen = [], {}
    for n in names:
        key = n.lower()
        if key in seen:
            issues.append({"name": n, "problem": f"duplicate of {seen[key]!r}"})
        else:
            seen[key] = n
        if not n:
            issues.append({"name": n, "problem": "empty"})
        elif _BAD.search(n):
            issues.append({"name": n, "problem": "characters other than A-Z, a-z, 0-9, _"})
        elif n[0].isdigit():
            issues.append({"name": n, "problem": "starts with a digit [added caution]"})
    return issues


# --------------------------------------------------------------------------------------------
# Folder protocol
# --------------------------------------------------------------------------------------------

def read_pff(path):
    """GoZ preference files: 'KEY = value' per line (GoZ SDK appendix)."""
    out = {}
    with open(path, errors="ignore") as fh:
        for line in fh:
            if "=" in line:
                k, v = line.split("=", 1)
                out[k.strip()] = v.strip().strip('"')
    return out


def set_pff_value(path, key, value, backup_dir=None):
    """Set KEY = value in a PFF file, keeping a timestamped copy first (never overwrite
    without a copy). Returns {"path", "backup", "old", "new"}."""
    with open(path, errors="ignore") as fh:
        lines = fh.read().splitlines()
    stamp = time.strftime("%Y%m%d-%H%M%S")
    bdir = backup_dir or os.path.dirname(path)
    os.makedirs(bdir, exist_ok=True)
    backup = os.path.join(bdir, os.path.basename(path) + f".{stamp}.bak")
    shutil.copy2(path, backup)
    old, done = None, False
    for i, line in enumerate(lines):
        if "=" in line and line.split("=", 1)[0].strip() == key:
            old = line.split("=", 1)[1].strip()
            lines[i] = f"{key}\t=\t{value}"
            done = True
    if not done:
        lines.append(f"{key}\t=\t{value}")
    with open(path, "w") as fh:
        fh.write("\n".join(lines) + "\n")
    return {"path": path, "backup": backup, "old": old, "new": value}


def project_dir(pixologic=PIXOLOGIC):
    p = os.path.join(pixologic, "GoZBrush", "GoZ_ProjectPath.txt")
    try:
        with open(p) as fh:
            d = fh.read().strip()
        return d or os.path.join(pixologic, "GoZProjects", "Default")
    except OSError:
        return os.path.join(pixologic, "GoZProjects", "Default")


def identifier(goz_path):
    """GoZ object identifier: the full path without the extension (GoZ SDK
    "GoZ_ObjectList.txt")."""
    return os.path.splitext(os.path.abspath(goz_path))[0]


def write_object_list(goz_paths, pixologic=PIXOLOGIC, backup_dir=None):
    """GoZBrush/GoZ_ObjectList.txt: one identifier per line (an empty list is one empty
    line). The previous list is copied first."""
    p = os.path.join(pixologic, "GoZBrush", "GoZ_ObjectList.txt")
    backup = None
    if os.path.exists(p):
        bdir = backup_dir or os.path.dirname(p)
        os.makedirs(bdir, exist_ok=True)
        backup = os.path.join(bdir, "GoZ_ObjectList.txt." + time.strftime("%Y%m%d-%H%M%S") + ".bak")
        shutil.copy2(p, backup)
    ids = [identifier(g) for g in goz_paths]
    with open(p, "w") as fh:
        fh.write("\n".join(ids) + "\n")
    return {"path": p, "identifiers": ids, "backup": backup}


def app_info(app="Maya", pixologic=PIXOLOGIC):
    """Flip flags and commands of a GoZ target app (GoZApps/<app>/GoZ_Info.txt, GoZ SDK
    IV.1) plus its configured PATH, which can be stale: on this Mac Maya's GoZ_Config.txt
    points at /Applications/Autodesk/maya2017 although no Maya is installed (2026-09-24)."""
    d = os.path.join(pixologic, "GoZApps", app)
    out = {"app": app, "dir": d, "exists": os.path.isdir(d)}
    if out["exists"]:
        for f in ("GoZ_Info.txt", "GoZ_Config.txt"):
            p = os.path.join(d, f)
            if os.path.exists(p):
                out[f] = read_pff(p)
        cfg_path = out.get("GoZ_Config.txt", {}).get("PATH")
        out["path_exists"] = bool(cfg_path) and os.path.exists(cfg_path)
    return out


def push_to_zbrush(goz_paths, as_subtool=None, pixologic=PIXOLOGIC, backup_dir=None,
                   dry_run=False):
    """Open .GoZ files in the running ZBrush through GoZBrushFromApp (GoZ SDK III.8)
    [verify end to end]. as_subtool None leaves Preferences > GoZ > Import as SubTool as it
    is; True or False rewrites IMPORT_AS_SUBTOOL in GoZBrush/GoZ_Config.txt after a backup
    (a shared, user-visible setting: restore it with restore_pff). ZBrush comes to the front.
    The identifier must stay the same for a mesh already linked to ZBrush, or ZBrush makes a
    new SubTool instead of updating it (GoZ SDK IV.6)."""
    for g in goz_paths:
        read_goz(g, data=False)                       # refuse to hand ZBrush a broken file
    app = os.path.join(pixologic, "GoZBrush", "GoZBrushFromApp.app")
    plan = {"object_list": [identifier(g) for g in goz_paths], "launcher": app,
            "as_subtool": as_subtool, "dry_run": dry_run}
    if dry_run:
        return plan
    if not os.path.exists(app):
        raise GoZError(f"{app} missing: run ZBrush once so GoZ installs itself")
    if as_subtool is not None:
        plan["config"] = set_pff_value(os.path.join(pixologic, "GoZBrush", "GoZ_Config.txt"),
                                       "IMPORT_AS_SUBTOOL", "TRUE" if as_subtool else "FALSE",
                                       backup_dir)
    plan["list"] = write_object_list(goz_paths, pixologic, backup_dir)
    r = subprocess.run(["open", "-a", app], capture_output=True, text=True, timeout=60)
    plan["open_rc"], plan["open_err"] = r.returncode, r.stderr.strip()
    return plan


def restore_pff(backup, path):
    """Put a backed-up GoZ preference file back (copy, the backup stays)."""
    shutil.copy2(backup, path)
    return {"restored": path, "from": backup}


def _cli(argv=None):
    import argparse
    import json
    ap = argparse.ArgumentParser(description="Inspect GoZ files and the GoZ folder")
    ap.add_argument("cmd", choices=("info", "dump", "app"))
    ap.add_argument("target")
    ns = ap.parse_args(argv)
    if ns.cmd == "info":
        res = goz_info(ns.target)
    elif ns.cmd == "dump":
        r = read_goz(ns.target)
        res = {k: v for k, v in r.items() if k != "flags"}
    else:
        res = app_info(ns.target)
    print(json.dumps(res, indent=1, default=repr))
    return 0


if __name__ == "__main__":
    import sys
    sys.exit(_cli())
