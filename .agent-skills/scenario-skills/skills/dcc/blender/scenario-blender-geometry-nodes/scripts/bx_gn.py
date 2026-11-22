"""
bx_gn: Geometry Nodes from Python for Blender 5.2 (tested on 5.2.1 LTS).

Build a node tree declaratively, attach it as a modifier, verify it by evaluating
the depsgraph, and render what it makes. It encodes the traps that break
hand-written GN code in 5.x:
  - tree.links.new() returns None (silently) when a socket belongs to another tree;
  - socket names are not unique (assets have two enabled 'Gravity' inputs; Math has three 'Value');
  - setting md.properties.inputs.<id>.value does not re-evaluate until obj.update_tag();
  - red links (field into a single-value socket, gizmo on a non-invertible source)
    only appear as link.is_valid == False AFTER an evaluation, never as an error;
  - Join Geometry puts the LAST created link FIRST in its output;
  - evaluated obj.bound_box ignores instances;
  - md.execution_time stays 0.0 headless (time with perf_counter instead).

  import sys; sys.path.append("<skill>/scripts"); import bx_gn as G
  b = G.Builder("Lift")                                  # tree + Group Input/Output (rebuilt in place if it exists)
  h = b.input("Height", "FLOAT", 0.5, min=0.0)           # returns the Group Input socket
  off = b.node("CombineXYZ", ins={"Z": h})               # aliases or full bl_idnames; ins: socket/node = link, else default
  sp = b.node("SetPosition", ins={"Geometry": b.geo_in, "Offset": off})
  b.output_geometry(sp)
  tree = b.done()                                        # zone pairing check + auto layout
  md = G.attach(obj, tree, inputs={"Height": 1.0})       # sets inputs, then obj.update_tag()
  rep = G.check(md); assert rep["ok"], rep                # invalid links, warnings, unpaired zones, hard refs
  print(G.stats(obj))                                     # counts per component, attributes per domain, world bbox
  G.snapshot([obj], "/abs/out/look.png")                 # Workbench render of the CURRENT frame; open it

Zones: zi, zo = b.zone("SIMULATION" | "REPEAT" | "FOREACH" | "CLOSURE", ...) pairs them and adds items.
Recipes (tested, rendered): scatter_tree, curve_array_tree, growth_tree, particle_drop_tree.
Test suite: tests/code/blender-geometry-nodes/ (run each with blender -b --factory-startup --python).
"""

__version__ = "0.1"  # Blender Expert Skills v0.1 (2026-09-24)
import math
import os
import statistics
import time

import bpy
from mathutils import Matrix, Vector

# --------------------------------------------------------------------------- identifiers
# Friendly aliases for node bl_idnames whose names are irregular. Anything else can be
# passed as a full bl_idname, or as a bare name that becomes GeometryNode<name>,
# FunctionNode<name>, ShaderNode<name> or Node<name> (first that exists).
NODE_IDS = {
    # group and zones
    "GroupInput": "NodeGroupInput", "GroupOutput": "NodeGroupOutput", "Group": "GeometryNodeGroup",
    "SimulationInput": "GeometryNodeSimulationInput", "SimulationOutput": "GeometryNodeSimulationOutput",
    "RepeatInput": "GeometryNodeRepeatInput", "RepeatOutput": "GeometryNodeRepeatOutput",
    "ForEachInput": "GeometryNodeForeachGeometryElementInput",
    "ForEachOutput": "GeometryNodeForeachGeometryElementOutput",
    "ClosureInput": "NodeClosureInput", "ClosureOutput": "NodeClosureOutput",
    "EvaluateClosure": "NodeEvaluateClosure", "CombineBundle": "NodeCombineBundle",
    "SeparateBundle": "NodeSeparateBundle", "Bake": "GeometryNodeBake", "Warning": "GeometryNodeWarning",
    # values and math
    "Value": "ShaderNodeValue", "Integer": "FunctionNodeInputInt", "Boolean": "FunctionNodeInputBool",
    "Vector": "FunctionNodeInputVector", "Math": "ShaderNodeMath", "VectorMath": "ShaderNodeVectorMath",
    "IntegerMath": "FunctionNodeIntegerMath", "BooleanMath": "FunctionNodeBooleanMath",
    "Compare": "FunctionNodeCompare", "MapRange": "ShaderNodeMapRange", "Mix": "ShaderNodeMix",
    "Clamp": "ShaderNodeClamp", "FloatCurve": "ShaderNodeFloatCurve", "FloatToInt": "FunctionNodeFloatToInt",
    "RandomValue": "FunctionNodeRandomValue", "CombineXYZ": "ShaderNodeCombineXYZ",
    "SeparateXYZ": "ShaderNodeSeparateXYZ", "NoiseTexture": "ShaderNodeTexNoise",
    "Switch": "GeometryNodeSwitch", "IndexSwitch": "GeometryNodeIndexSwitch", "MenuSwitch": "GeometryNodeMenuSwitch",
    "AccumulateField": "GeometryNodeAccumulateField", "EvaluateOnDomain": "GeometryNodeFieldOnDomain",
    "EvaluateAtIndex": "GeometryNodeFieldAtIndex", "StringJoin": "GeometryNodeStringJoin",
    "ValueToString": "FunctionNodeValueToString",
    # rotation and matrices
    "AlignRotationToVector": "FunctionNodeAlignRotationToVector", "RotateRotation": "FunctionNodeRotateRotation",
    "EulerToRotation": "FunctionNodeEulerToRotation", "RotationToEuler": "FunctionNodeRotationToEuler",
    "AxisAngleToRotation": "FunctionNodeAxisAngleToRotation", "CombineTransform": "FunctionNodeCombineTransform",
    "SeparateTransform": "FunctionNodeSeparateTransform", "MultiplyMatrices": "FunctionNodeMatrixMultiply",
    "InvertMatrix": "FunctionNodeInvertMatrix", "TransformPoint": "FunctionNodeTransformPoint",
    "TransformDirection": "FunctionNodeTransformDirection",
    # inputs (read nodes)
    "Position": "GeometryNodeInputPosition", "Normal": "GeometryNodeInputNormal", "Index": "GeometryNodeInputIndex",
    "ID": "GeometryNodeInputID", "NamedAttribute": "GeometryNodeInputNamedAttribute",
    "SceneTime": "GeometryNodeInputSceneTime", "SelfObject": "GeometryNodeSelfObject",
    "ObjectInfo": "GeometryNodeObjectInfo", "CollectionInfo": "GeometryNodeCollectionInfo",
    "EdgeAngle": "GeometryNodeInputMeshEdgeAngle", "FaceArea": "GeometryNodeInputMeshFaceArea",
    "MeshIsland": "GeometryNodeInputMeshIsland", "EdgeNeighbors": "GeometryNodeInputMeshEdgeNeighbors",
    "FaceNeighbors": "GeometryNodeInputMeshFaceNeighbors", "SplineParameter": "GeometryNodeSplineParameter",
    "CurveTangent": "GeometryNodeInputTangent", "InstanceScale": "GeometryNodeInputInstanceScale",
    "InstanceRotation": "GeometryNodeInputInstanceRotation", "InstanceTransform": "GeometryNodeInstanceTransform",
    # geometry operations
    "Transform": "GeometryNodeTransform", "BoundingBox": "GeometryNodeBoundBox",
    "Proximity": "GeometryNodeProximity", "CurveCircle": "GeometryNodeCurvePrimitiveCircle",
    "CurveLine": "GeometryNodeCurvePrimitiveLine", "GetListItem": "GeometryNodeListGetItem",
    "XPBDSolver": "GeometryNodeXPBDSolver",
}
_PREFIXES = ("GeometryNode", "FunctionNode", "ShaderNode", "Node")

SOCKET_TYPES = {
    "GEOMETRY": "NodeSocketGeometry", "FLOAT": "NodeSocketFloat", "INT": "NodeSocketInt",
    "BOOL": "NodeSocketBool", "BOOLEAN": "NodeSocketBool", "VECTOR": "NodeSocketVector",
    "COLOR": "NodeSocketColor", "RGBA": "NodeSocketColor", "ROTATION": "NodeSocketRotation",
    "MATRIX": "NodeSocketMatrix", "STRING": "NodeSocketString", "MENU": "NodeSocketMenu",
    "OBJECT": "NodeSocketObject", "COLLECTION": "NodeSocketCollection", "MATERIAL": "NodeSocketMaterial",
    "IMAGE": "NodeSocketImage", "BUNDLE": "NodeSocketBundle", "CLOSURE": "NodeSocketClosure",
}
# zone / capture / bundle item type strings
_ITEM_TYPES = {"BOOL": "BOOLEAN", "COLOR": "RGBA"}

ZONES = {
    "SIMULATION": ("GeometryNodeSimulationInput", "GeometryNodeSimulationOutput"),
    "REPEAT": ("GeometryNodeRepeatInput", "GeometryNodeRepeatOutput"),
    "FOREACH": ("GeometryNodeForeachGeometryElementInput", "GeometryNodeForeachGeometryElementOutput"),
    "CLOSURE": ("NodeClosureInput", "NodeClosureOutput"),
}

ASSET_FILES = {
    "essentials": "geometry_nodes_essentials.blend",
    "dynamics": "geometry_nodes_dynamics_assets.blend",
    "hair": "procedural_hair_node_assets.blend",
}


def idname(kind):
    """Resolve an alias or bare name to a node bl_idname (raises with a hint if unknown)."""
    if kind in NODE_IDS:
        return NODE_IDS[kind]
    if hasattr(bpy.types, kind) and kind[0].isupper() and ("Node" in kind):
        return kind
    for p in _PREFIXES:
        if hasattr(bpy.types, p + kind):
            return p + kind
    raise KeyError(f"unknown node kind '{kind}': pass a bl_idname such as 'GeometryNodeSetPosition'")


def _item_type(t):
    t = t.upper()
    return _ITEM_TYPES.get(t, t)


# --------------------------------------------------------------------------- sockets
def _socks(node, out):
    return [s for s in (node.outputs if out else node.inputs) if s.identifier != "__extend__"]


def sock(node, key=None, out=True):
    """Find a socket. key: int index, identifier (exact), or name.

    Names resolve to the ENABLED socket (Mix 'A' -> A_Vector when data_type is VECTOR).
    Two enabled sockets with the same name raise with their identifiers, so you pick one.
    key=None returns the first enabled socket.
    """
    if isinstance(node, bpy.types.NodeSocket):
        return node
    if isinstance(node, tuple):
        node, key = node
    socks = _socks(node, out)
    side = "output" if out else "input"
    if key is None:
        en = [s for s in socks if s.enabled]
        if not en:
            raise KeyError(f"{node.name}: no enabled {side}")
        return en[0]
    if isinstance(key, int):
        return socks[key]
    exact = [s for s in socks if s.identifier == key]
    if exact:
        return exact[0]
    named = [s for s in socks if s.name == key]
    pick = [s for s in named if s.enabled] or named
    if len(pick) == 1:
        return pick[0]
    avail = [(s.name, s.identifier) for s in socks if s.enabled]
    if not pick:
        raise KeyError(f"{node.name} ({node.bl_idname}): no {side} '{key}'. Enabled {side}s: {avail}")
    raise KeyError(f"{node.name}: {side} name '{key}' is ambiguous, use an identifier: "
                   f"{[(s.name, s.identifier) for s in pick]}")


def _is_source(v):
    return isinstance(v, (bpy.types.NodeSocket, bpy.types.Node)) or (
        isinstance(v, tuple) and len(v) == 2 and isinstance(v[0], bpy.types.Node))


def _assign(s, value):
    if not hasattr(s, "default_value"):
        raise TypeError(f"{s.node.name}.{s.identifier} ({s.type}) has no value; link something into it")
    s.default_value = value


# --------------------------------------------------------------------------- builder
class Builder:
    """Declarative GN tree builder. Every link is checked; every zone is paired.

    Builder(name) reuses an existing tree of that name and rebuilds it in place (nodes and
    interface cleared), so modifiers keep pointing at it; their input values reset, so set
    them again after a rebuild.
    """

    def __init__(self, name, geometry_in=True, geometry_out=True, rebuild=True):
        t = bpy.data.node_groups.get(name)
        if t is not None and t.bl_idname == "GeometryNodeTree" and rebuild and t.library is None:
            t.nodes.clear()
            t.interface.clear()
        else:
            t = bpy.data.node_groups.new(name, "GeometryNodeTree")
        self.tree = t
        self._panels = {}
        self.gi = t.nodes.new("NodeGroupInput")
        self.go = t.nodes.new("NodeGroupOutput")
        self.geo_in = self.input("Geometry", "GEOMETRY") if geometry_in else None
        if geometry_out:
            self.output("Geometry", "GEOMETRY")

    # interface ---------------------------------------------------------------
    def panel(self, name, closed=True):
        if name not in self._panels:
            self._panels[name] = self.tree.interface.new_panel(name, default_closed=closed)
        return self._panels[name]

    def input(self, name, type="FLOAT", default=None, min=None, max=None, subtype=None, panel=None,
              description="", dimensions=None, hide_value=False, single_value=False,
              default_attribute=None, hide_in_modifier=False):
        """Add a group input; returns the Group Input node's socket for linking."""
        item = self.tree.interface.new_socket(
            name, description=description, in_out="INPUT", socket_type=SOCKET_TYPES[type.upper()],
            parent=self.panel(panel) if panel else None)
        if subtype:
            item.subtype = subtype                      # 'FACTOR', 'ANGLE', 'DISTANCE', 'PERCENTAGE', ...
        if dimensions:
            item.dimensions = dimensions                # 2D vectors
        if default is not None:
            item.default_value = default
        if min is not None:
            item.min_value = min
        if max is not None:
            item.max_value = max
        item.hide_value = hide_value
        item.hide_in_modifier = hide_in_modifier
        if single_value:
            item.force_non_field = True
        if default_attribute:
            item.default_attribute_name = default_attribute
        return self.gi.outputs[item.identifier]

    def output(self, name, type="GEOMETRY", domain=None):
        """Add a group output; returns the Group Output node's socket. domain: attribute output domain."""
        item = self.tree.interface.new_socket(name, in_out="OUTPUT", socket_type=SOCKET_TYPES[type.upper()])
        if domain:
            item.attribute_domain = domain
        return self.go.inputs[item.identifier]

    # nodes and links -----------------------------------------------------------
    def node(self, kind, name=None, label=None, ins=None, **props):
        """Add a node. props (data_type, domain, operation, mode, node_tree...) are set BEFORE ins,
        because they change which sockets exist. ins: {key: value}; a socket, node or
        (node, output_key) value is linked, anything else becomes the socket's default_value."""
        n = self.tree.nodes.new(idname(kind))
        if name:
            n.name = name
        if label:
            n.label = label
        for k, v in props.items():
            setattr(n, k, v)
        for k, v in (ins or {}).items():
            self.set(n, k, v)
        return n

    def set(self, node, key, value):
        s = sock(node, key, out=False)
        if _is_source(value):
            return self.link(value, s)
        _assign(s, value)
        return s

    def out(self, node, key=None):
        return sock(node, key, out=True)

    def inp(self, node, key):
        return sock(node, key, out=False)

    def link(self, src, dst):
        """Link and verify. src: socket | node (first enabled output) | (node, key). dst: socket | (node, key)."""
        a = sock(src, out=True) if not isinstance(src, bpy.types.NodeSocket) else src
        b = sock(dst, out=False) if not isinstance(dst, bpy.types.NodeSocket) else dst
        if a.id_data != self.tree or b.id_data != self.tree:
            raise RuntimeError(f"socket from another tree: {a.id_data.name}.{a.node.name} -> "
                               f"{b.id_data.name}.{b.node.name} (tree {self.tree.name})")
        if a.is_output is False or b.is_output is True:
            raise RuntimeError(f"link direction wrong: {a.node.name}.{a.identifier} -> {b.node.name}.{b.identifier}")
        lk = self.tree.links.new(a, b)
        if lk is None:
            raise RuntimeError(f"links.new returned None: {a.node.name}.{a.identifier} -> {b.node.name}.{b.identifier}")
        return lk

    def join(self, items, node=None):
        """Join Geometry whose output order equals the list order.

        Blender puts the last created link first, so links are created in reverse. This
        matters for simulations that append elements: existing elements must come first
        (Thommes, BCON26: hair dynamics needs new curves appended at the end)."""
        j = node or self.node("JoinGeometry")
        for it in reversed([i for i in items if i is not None]):
            self.link(it, j.inputs[0])
        return j

    def output_geometry(self, src, name="Geometry"):
        return self.link(src, sock(self.go, name, out=False))

    # zones -------------------------------------------------------------------
    def zone(self, kind, items=(), iterations=None, domain=None, inputs=(), main=(), generation=(),
             outputs=()):
        """Create and pair a zone. Item specs are tuples (TYPE, name[, domain]).

        SIMULATION: items = state items (domain = attribute domain). Default 'Geometry' item exists.
        REPEAT:     items = repeat items; iterations = int or a source to link.
        FOREACH:    domain = iterated domain; inputs = per-element values (field outside, single
                    value inside); main = values written back onto the input geometry;
                    generation = attributes of the generated geometry (domain must match it).
        CLOSURE:    inputs / outputs = the signature; names must match the Evaluate Closure.
        """
        kind = kind.upper()
        a, b = ZONES[kind]
        zi, zo = self.tree.nodes.new(a), self.tree.nodes.new(b)
        if not zi.pair_with_output(zo):
            raise RuntimeError(f"pair_with_output failed for {kind}")
        if kind == "SIMULATION":
            for spec in items:
                it = zo.state_items.new(_item_type(spec[0]), spec[1])
                if len(spec) > 2 and spec[2]:
                    it.attribute_domain = spec[2]
        elif kind == "REPEAT":
            for spec in items:
                zo.repeat_items.new(_item_type(spec[0]), spec[1])
            if iterations is not None:
                self.set(zi, "Iterations", iterations)
        elif kind == "FOREACH":
            if domain:
                zo.domain = domain
            for spec in inputs:
                zo.input_items.new(_item_type(spec[0]), spec[1])
            for spec in main:
                zo.main_items.new(_item_type(spec[0]), spec[1])
            for spec in generation:
                it = zo.generation_items.new(_item_type(spec[0]), spec[1])
                if len(spec) > 2 and spec[2]:
                    it.domain = spec[2]
        elif kind == "CLOSURE":
            for spec in inputs:
                zo.input_items.new(_item_type(spec[0]), spec[1])
            for spec in outputs:
                zo.output_items.new(_item_type(spec[0]), spec[1])
        return zi, zo

    def items(self, node, collection, specs):
        """Add items to any dynamic-socket node: ('input_items'|'output_items') on Evaluate Closure,
        'bundle_items' on Combine/Separate Bundle, 'capture_items' on Capture Attribute."""
        coll = getattr(node, collection)
        return [coll.new(_item_type(s[0]), s[1]) for s in specs]

    def done(self, layout_tree=True):
        unpaired = [n.name for n in self.tree.nodes
                    if hasattr(n, "paired_output") and n.bl_idname in {v[0] for v in ZONES.values()}
                    and n.paired_output is None]
        if unpaired:
            raise RuntimeError(f"unpaired zone inputs: {unpaired}")
        if layout_tree:
            layout(self.tree)
        return self.tree


# --------------------------------------------------------------------------- layout
def _node_height(n):
    vis = sum(1 for s in n.inputs if s.enabled and s.identifier != "__extend__")
    vis += sum(1 for s in n.outputs if s.enabled and s.identifier != "__extend__")
    has_props = any(p in n.bl_rna.properties for p in ("data_type", "operation", "domain", "mode"))
    return 40 + 22 * vis + (30 if has_props else 0)


def layout(tree, gap_x=80, gap_y=30):
    """Left-to-right layout by longest path from sources; zone outputs sit right of their body.
    Rows are ordered by the mean height of the predecessors (one barycenter sweep)."""
    nodes = [n for n in tree.nodes if n.bl_idname != "NodeFrame"]
    preds = {n: set() for n in nodes}
    for lk in tree.links:
        if lk.from_node in preds and lk.to_node in preds:
            preds[lk.to_node].add(lk.from_node)
    for n in nodes:
        po = getattr(n, "paired_output", None)
        if po is not None and po in preds:
            preds[po].add(n)
    rank, indeg = {}, {n: len(p) for n, p in preds.items()}
    succ = {n: [] for n in nodes}
    for n, ps in preds.items():
        for p in ps:
            succ[p].append(n)
    queue = [n for n in nodes if indeg[n] == 0]
    for n in queue:
        rank[n] = 0
    while queue:
        n = queue.pop(0)
        for s in succ[n]:
            rank[s] = max(rank.get(s, 0), rank[n] + 1)
            indeg[s] -= 1
            if indeg[s] == 0:
                queue.append(s)
    for n in nodes:                                    # cycles (should not happen): park them at 0
        rank.setdefault(n, 0)
    cols = {}
    for n in nodes:
        cols.setdefault(rank[n], []).append(n)
    x, ypos = 0.0, {}
    for r in sorted(cols):
        col = cols[r]
        col.sort(key=lambda n: (statistics.mean([ypos[p] for p in preds[n] if p in ypos])
                                if any(p in ypos for p in preds[n]) else 0.0))
        heights = [_node_height(n) for n in col]
        total = sum(heights) + gap_y * (len(col) - 1)
        y = total / 2
        for n, h in zip(col, heights):
            n.location = (x, y)
            ypos[n] = y - h / 2
            y -= h + gap_y
        x += max(n.width for n in col) + gap_x
    return tree


# --------------------------------------------------------------------------- modifier
def attach(obj, tree, name=None, inputs=None):
    """Get-or-create a Nodes modifier by name, assign the tree, set inputs, tag for update."""
    name = name or tree.name
    md = obj.modifiers.get(name)
    if md is None or md.type != "NODES":
        md = obj.modifiers.new(name, "NODES")
    md.node_group = tree
    if inputs:
        set_inputs(md, inputs)
    else:
        obj.update_tag()
    return md


def _input_item(tree, key):
    items = [i for i in tree.interface.items_tree if i.item_type == "SOCKET" and i.in_out == "INPUT"]
    for i in items:
        if i.identifier == key:
            return i
    named = [i for i in items if i.name == key]
    if len(named) == 1:
        return named[0]
    if not named:
        raise KeyError(f"{tree.name}: no input '{key}'. Inputs: {[(i.name, i.identifier) for i in items]}")
    raise KeyError(f"{tree.name}: input name '{key}' is ambiguous, use one of {[(i.name, i.identifier) for i in named]}")


def set_inputs(md, values):
    """Set modifier inputs by name or identifier (5.2 API: md.properties.inputs), then tag.

    "attr:NAME" switches a field input to attribute mode (vertex groups are attributes).
    Objects, collections and materials take the data-block. Menus take the item name."""
    obj = md.id_data
    for key, v in values.items():
        item = _input_item(md.node_group, key)
        p = getattr(md.properties.inputs, item.identifier)
        if isinstance(v, str) and v.startswith("attr:"):
            p.type = "ATTRIBUTE"
            p.attribute_name = v[5:]
            continue
        if hasattr(p, "type") and p.type == "ATTRIBUTE":
            p.type = "VALUE"
        p.value = v
    obj.update_tag()                                   # 5.2.1: without this nothing re-evaluates
    return md


def get_inputs(md):
    out = {}
    for i in md.node_group.interface.items_tree:
        if i.item_type != "SOCKET" or i.in_out != "INPUT" or i.socket_type == "NodeSocketGeometry":
            continue
        p = getattr(md.properties.inputs, i.identifier, None)
        if p is None:
            continue
        if getattr(p, "type", "VALUE") == "ATTRIBUTE":
            out[i.name] = "attr:" + p.attribute_name
        else:
            v = getattr(p, "value", None)
            out[i.name] = v.name if hasattr(v, "name") and not isinstance(v, str) else (
                tuple(v) if hasattr(v, "__len__") and not isinstance(v, str) else v)
    return out


def set_output_attribute(md, socket_name, attribute_name):
    """Name a field output of the group so it is written as an attribute (Output Attributes panel)."""
    items = [i for i in md.node_group.interface.items_tree
             if i.item_type == "SOCKET" and i.in_out == "OUTPUT" and i.name == socket_name]
    getattr(md.properties.outputs, items[0].identifier).attribute_name = attribute_name
    md.id_data.update_tag()


def append_group(name, library="essentials"):
    """Append a shipped node-group asset (local, editable copy). library: essentials|dynamics|hair."""
    have = bpy.data.node_groups.get(name)
    if have is not None and have.library is None:
        return have
    path = os.path.join(bpy.utils.system_resource("DATAFILES"), "assets", "nodes", ASSET_FILES[library])
    with bpy.data.libraries.load(path, link=False) as (src, dst):
        if name not in src.node_groups:
            raise KeyError(f"'{name}' not in {ASSET_FILES[library]}: {[g for g in src.node_groups if not g.startswith('.')]}")
        dst.node_groups = [name]
    return dst.node_groups[0]


def list_assets(library="essentials"):
    path = os.path.join(bpy.utils.system_resource("DATAFILES"), "assets", "nodes", ASSET_FILES[library])
    with bpy.data.libraries.load(path, link=False) as (src, dst):
        return [g for g in src.node_groups if not g.startswith(".")]


# --------------------------------------------------------------------------- evaluation
def evaluated(obj):
    return obj.evaluated_get(bpy.context.evaluated_depsgraph_get())


def _attr_summary(attrs):
    return {a.name: (a.domain, a.data_type) for a in attrs if not a.name.startswith(".")}


_ATTR_WIDTH = {"FLOAT": 1, "INT": 1, "BOOLEAN": 1, "INT8": 1, "FLOAT_VECTOR": 3, "FLOAT2": 2, "INT32_2D": 2,
               "INT16_2D": 2, "FLOAT_COLOR": 4, "BYTE_COLOR": 4, "QUATERNION": 4, "FLOAT4": 4, "FLOAT4X4": 16}


def _read(attr):
    import numpy as np
    n = len(attr.data)
    w = _ATTR_WIDTH.get(attr.data_type)
    if w is None:
        return [d.value for d in attr.data]
    key = "vector" if attr.data_type in ("FLOAT_VECTOR", "FLOAT2") else (
        "color" if attr.data_type in ("FLOAT_COLOR", "BYTE_COLOR") else "value")
    dt = np.int32 if attr.data_type in ("INT", "INT8", "INT32_2D", "INT16_2D") else (
        bool if attr.data_type == "BOOLEAN" else np.float32)
    arr = np.zeros(n * w, dtype=dt)
    attr.data.foreach_get(key, arr)
    return arr.reshape(n, w) if w > 1 else arr


def _components(gs):
    comps = {}
    if gs.mesh is not None:
        comps["mesh"] = gs.mesh
    if gs.curves is not None:
        comps["curves"] = gs.curves
    if gs.pointcloud is not None:
        comps["pointcloud"] = gs.pointcloud
    ipc = gs.instances_pointcloud()
    if ipc is not None and len(ipc.points):
        comps["instances"] = ipc
    return comps


def attribute(obj, name, component="mesh"):
    """Evaluated attribute values as a numpy array (n,) or (n, width), plus its domain.
    component: mesh | curves | pointcloud | instances."""
    gs = evaluated(obj).evaluated_geometry()           # keep gs alive while reading its components
    comp = _components(gs).get(component)
    if comp is None:
        raise KeyError(f"{obj.name}: no evaluated {component} component")
    a = comp.attributes.get(name)
    if a is None:
        raise KeyError(f"{obj.name}.{component}: no attribute '{name}'. Have: {list(_attr_summary(comp.attributes))}")
    return _read(a), a.domain


def positions(obj, component="mesh", world=False):
    """Evaluated positions (n, 3). For instances the translation of instance_transform is used:
    the instance point cloud's own 'position' attribute reads all zeros in 5.2.1."""
    import numpy as np
    gs = evaluated(obj).evaluated_geometry()
    comp = _components(gs).get(component)
    if comp is None:
        return np.zeros((0, 3), dtype=np.float32)
    if component == "instances":
        p = _read(comp.attributes["instance_transform"]).reshape(-1, 4, 4)
        # FLOAT4X4 comes out column-major: translation is the last 4-float block
        p = p[:, 3, :3].astype(np.float64)
    else:
        p = _read(comp.attributes["position"]).astype(np.float64)
    if world and len(p):
        m = np.array(obj.matrix_world)
        p = p @ m[:3, :3].T + m[:3, 3]
    return p


def instance_transforms(obj, world=False):
    """Per-instance 4x4 matrices (object space, or world with world=True)."""
    gs = evaluated(obj).evaluated_geometry()
    ipc = gs.instances_pointcloud()
    if ipc is None or not len(ipc.points):
        return []
    mats = [Matrix(d.value) for d in ipc.attributes["instance_transform"].data]
    return [obj.matrix_world @ m for m in mats] if world else mats


def _ref_bounds(ref):
    """Local-space (lo, hi) of an instance reference (GeometrySet, Object or Collection)."""
    import numpy as np
    pts = []
    try:
        if isinstance(ref, bpy.types.Object):
            pts = [Vector(c) for c in ref.bound_box]
        elif isinstance(ref, bpy.types.Collection):
            pts = [o.matrix_world @ Vector(c) for o in ref.all_objects for c in o.bound_box]
        else:
            for comp in (ref.mesh, ref.curves, ref.pointcloud):
                if comp is not None and "position" in comp.attributes and len(comp.attributes["position"].data):
                    p = _read(comp.attributes["position"])
                    pts += [Vector(p.min(0)), Vector(p.max(0))]
    except Exception:
        pts = []
    if not pts:
        return Vector((0, 0, 0)), Vector((0, 0, 0))
    a = np.array([tuple(p) for p in pts])
    return Vector(a.min(0)), Vector(a.max(0))


def world_bbox(objs):
    """World-space (lo, hi) of evaluated objects INCLUDING instances (obj.bound_box ignores them)."""
    import numpy as np
    pts = []
    for o in objs:
        gs = evaluated(o).evaluated_geometry()
        mw = np.array(o.matrix_world)
        for name, comp in _components(gs).items():
            if name == "instances":
                refs = gs.instance_references()
                bounds = [_ref_bounds(r) for r in refs]
                ridx = _read(comp.attributes[".reference_index"]) if ".reference_index" in comp.attributes else None
                for i, d in enumerate(comp.attributes["instance_transform"].data):
                    m = o.matrix_world @ Matrix(d.value)
                    lo, hi = bounds[int(ridx[i])] if (ridx is not None and bounds) else (Vector(), Vector())
                    for c in ((lo.x, lo.y, lo.z), (hi.x, hi.y, hi.z), (lo.x, hi.y, lo.z), (hi.x, lo.y, hi.z)):
                        pts.append(tuple(m @ Vector(c)))
            elif "position" in comp.attributes and len(comp.attributes["position"].data):
                p = _read(comp.attributes["position"]).astype(np.float64)
                p = p @ mw[:3, :3].T + mw[:3, 3]
                pts += [tuple(p.min(0)), tuple(p.max(0))]
    if not pts:
        return Vector((0, 0, 0)), Vector((0, 0, 0))
    a = np.array(pts)
    return Vector(a.min(0)), Vector(a.max(0))


def stats(obj):
    """Counts per evaluated component, attributes per component {name: (domain, type)}, world bbox."""
    gs = evaluated(obj).evaluated_geometry()
    out = {"geometry_name": gs.name}
    for name, comp in _components(gs).items():
        if name == "mesh":
            out["mesh"] = {"verts": len(comp.vertices), "edges": len(comp.edges), "faces": len(comp.polygons),
                           "attributes": _attr_summary(comp.attributes)}
        elif name == "curves":
            out["curves"] = {"curves": len(comp.curves), "points": len(comp.points),
                             "attributes": _attr_summary(comp.attributes)}
        elif name == "pointcloud":
            out["pointcloud"] = {"points": len(comp.points), "attributes": _attr_summary(comp.attributes)}
        else:
            out["instances"] = {"count": len(comp.points), "references": len(gs.instance_references()),
                                "attributes": _attr_summary(comp.attributes)}
    lo, hi = world_bbox([obj])
    out["bbox"] = (tuple(round(v, 4) for v in lo), tuple(round(v, 4) for v in hi))
    return out


def _walk_trees(tree, seen=None):
    seen = seen if seen is not None else []
    if tree is None or tree in seen:
        return seen
    seen.append(tree)
    for n in tree.nodes:
        if n.bl_idname == "GeometryNodeGroup" and n.node_tree is not None:
            _walk_trees(n.node_tree, seen)
    return seen


def check(md, nested=True):
    """Evaluate once, then report what the node editor would show in red or yellow.

    invalid_links: link.is_valid False (field into single value, gizmo on non-invertible source,
                   incompatible types). Nested groups included (prefixed with their tree).
    warnings:      md.node_warnings (closure signature mismatch, Warning nodes, missing data).
    unpaired_zones, hard_refs (Object/Collection set inside the tree instead of exposed),
    output_unlinked. ok = no invalid link, no ERROR warning, no unpaired zone."""
    evaluated(md.id_data).evaluated_geometry()
    trees = _walk_trees(md.node_group) if nested else [md.node_group]
    zone_inputs = {v[0] for v in ZONES.values()}
    bad, unpaired, hard = [], [], []
    for t in trees:
        for lk in t.links:
            if not lk.is_valid:
                bad.append(f"{t.name}: {lk.from_node.name}.{lk.from_socket.identifier} -> "
                           f"{lk.to_node.name}.{lk.to_socket.identifier}")
        for n in t.nodes:
            if n.bl_idname in zone_inputs and getattr(n, "paired_output", None) is None:
                unpaired.append(f"{t.name}: {n.name}")
            if t == md.node_group or (t.library is None and t.asset_data is None):   # bpy wrappers: == not is
                for s in n.inputs:
                    if s.type in ("OBJECT", "COLLECTION") and not s.is_linked and getattr(s, "default_value", None):
                        hard.append(f"{t.name}: {n.name}.{s.name} = {s.default_value.name}")
    warns = [(w.type, w.message) for w in md.node_warnings]
    go = [n for n in md.node_group.nodes if n.bl_idname == "NodeGroupOutput"]
    out_unlinked = not go or not any(s.is_linked for s in go[0].inputs if s.type == "GEOMETRY")
    ok = not bad and not unpaired and not any(t == "ERROR" for t, _ in warns)
    return {"ok": ok, "invalid_links": bad, "warnings": warns, "unpaired_zones": unpaired,
            "hard_refs": hard, "output_unlinked": out_unlinked}


def time_eval(obj, repeats=3):
    """Median seconds to re-evaluate obj (md.execution_time reads 0.0 headless in 5.2.1)."""
    dg = bpy.context.evaluated_depsgraph_get()
    ts = []
    for _ in range(repeats):
        obj.update_tag()
        t0 = time.perf_counter()
        dg.update()
        obj.evaluated_get(dg).evaluated_geometry()
        ts.append(time.perf_counter() - t0)
    return statistics.median(ts)


# --------------------------------------------------------------------------- simulation
def step(frames, fn=None, scene=None):
    """frame_set every frame IN ORDER (a jump computes one step only). fn(frame) results by frame."""
    sc = scene or bpy.context.scene
    res = {}
    for f in frames:
        sc.frame_set(f)
        if fn is not None:
            res[f] = fn(f)
    return res


class _Selected:
    def __init__(self, obj):
        self.obj = obj

    def __enter__(self):
        vl = bpy.context.view_layer
        self.prev_sel = [o for o in vl.objects if o.select_get()]
        self.prev_act = vl.objects.active
        for o in self.prev_sel:
            o.select_set(False)
        self.obj.select_set(True)
        vl.objects.active = self.obj

    def __exit__(self, *a):
        vl = bpy.context.view_layer
        self.obj.select_set(False)
        for o in self.prev_sel:
            if o.name in vl.objects:
                o.select_set(True)
        vl.objects.active = self.prev_act


def bake(obj):
    """Bake every simulation zone and Bake node of obj (packed in the .blend by default)."""
    with _Selected(obj):
        return bpy.ops.object.simulation_nodes_cache_bake(selected=True)


def free_bake(obj):
    with _Selected(obj):
        return bpy.ops.object.simulation_nodes_cache_delete(selected=True)


# --------------------------------------------------------------------------- look
def material(name, color, roughness=0.5):
    """Get-or-create a material; color drives both Workbench (diffuse_color) and Principled."""
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.diffuse_color = (color[0], color[1], color[2], 1.0)
    m.roughness = roughness
    nt = getattr(m, "node_tree", None)
    if nt is not None:
        bsdf = nt.nodes.get("Principled BSDF")
        if bsdf is not None:
            bsdf.inputs["Base Color"].default_value = (color[0], color[1], color[2], 1.0)
            bsdf.inputs["Roughness"].default_value = roughness
    return m


_VIEWS = {
    "front": Vector((0, -1, 0)), "back": Vector((0, 1, 0)), "right": Vector((1, 0, 0)),
    "left": Vector((-1, 0, 0)), "top": Vector((0, 0.0001, 1)),
    "threequarter": Vector((-0.7, -1.0, 0.55)).normalized(),
    "low": Vector((0.8, -1.0, -0.3)).normalized(),
}


def _aim(cam, target, direction, dist):
    cam.location = target + direction.normalized() * dist
    cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()


def _tile(paths, rows, cols, out):
    import numpy as np
    imgs = []
    for p in paths:
        im = bpy.data.images.load(p, check_existing=False)
        w, h = im.size
        imgs.append(np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4))
        bpy.data.images.remove(im)
    h, w = imgs[0].shape[:2]
    sheet = np.ones((rows * h, cols * w, 4), dtype=np.float32)
    for i, a in enumerate(imgs):
        r, c = divmod(i, cols)
        y0 = (rows - 1 - r) * h                       # pixel rows are bottom-up
        sheet[y0:y0 + h, c * w:(c + 1) * w] = a
    img = bpy.data.images.new("BX_GN_sheet", cols * w, rows * h, alpha=True)
    img.pixels = sheet.ravel()
    img.filepath_raw = out
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)
    return out


def snapshot(objs, path, views=("threequarter",), frames=None, res=720, isolate=True, shadows=True,
             color_type="MATERIAL", margin=1.08, lens=50):
    """Workbench render in the CURRENT scene, so simulation state and instances are exactly what
    the depsgraph evaluates now (bx_review renders in a temporary scene at its own frame).

    frames: list of frames for a strip; the timeline is first stepped IN ORDER from the lowest
    frame to the highest (fills the simulation cache and a common framing), then each frame is
    rendered. Rows = views, columns = frames (time reads left to right); without frames the
    views sit side by side. isolate hides other objects from render (restored).
    Returns the sheet path; a <path>_legend.txt lists the tiles."""
    sc = bpy.context.scene
    objs = [o for o in objs if o is not None]
    base, _ = os.path.splitext(path)
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    r, sh = sc.render, sc.display.shading
    saved = dict(camera=sc.camera, engine=r.engine, rx=r.resolution_x, ry=r.resolution_y, pct=r.resolution_percentage,
                 fp=r.filepath, media=r.image_settings.media_type, fmt=r.image_settings.file_format,
                 vt=sc.view_settings.view_transform, light=sh.light, ct=sh.color_type, shadow=sh.show_shadows,
                 cavity=sh.show_cavity, frame=sc.frame_current,
                 world=tuple(sc.world.color) if sc.world else None)
    hidden = {}
    cam = bpy.data.objects.new("BX_GN_Cam", bpy.data.cameras.new("BX_GN_Cam"))
    sc.collection.objects.link(cam)
    try:
        if isolate:
            keep = set(objs) | {cam}
            for o in sc.objects:
                if o not in keep and not o.hide_render:
                    hidden[o] = True
                    o.hide_render = True
        frame_list = sorted(set(frames)) if frames else [sc.frame_current]
        lo = hi = None
        if frames:
            for f in range(min(frame_list), max(frame_list) + 1):
                sc.frame_set(f)
                if f in frame_list:
                    a, b = world_bbox(objs)
                    lo = a if lo is None else Vector(map(min, lo, a))
                    hi = b if hi is None else Vector(map(max, hi, b))
        else:
            lo, hi = world_bbox(objs)
        center, radius = (lo + hi) / 2, max((hi - lo).length / 2, 1e-3)
        r.engine = "BLENDER_WORKBENCH"
        r.resolution_x = r.resolution_y = res
        r.resolution_percentage = 100
        r.image_settings.media_type = "IMAGE"
        r.image_settings.file_format = "PNG"
        sc.view_settings.view_transform = "Standard"
        sh.light, sh.color_type, sh.show_shadows, sh.show_cavity = "STUDIO", color_type, shadows, False
        if sc.world:
            sc.world.color = (0.62, 0.64, 0.68)
        cam.data.lens = lens
        fov = 2 * math.atan(cam.data.sensor_width / (2 * lens))
        dist = radius / math.sin(fov / 2) * margin
        cam.data.clip_start, cam.data.clip_end = dist * 0.01, dist * 10
        sc.camera = cam
        tiles = {}
        for f in frame_list:
            if frames:
                sc.frame_set(f)
            for v in views:
                _aim(cam, center, _VIEWS[v], dist)
                p = f"{base}_f{f:04d}_{v}.png"
                r.filepath = p
                bpy.ops.render.render(write_still=True)
                tiles[(v, f)] = p
        order = [(v, f) for v in views for f in frame_list]          # rows = views, cols = frames
        rows, cols = (len(views), len(frame_list)) if frames else (1, len(views))
        _tile([tiles[k] for k in order], rows, cols, path)
        legend = [f"{v} / frame {f}" for v, f in order]
        with open(base + "_legend.txt", "w") as fh:
            fh.write("rows x cols, top-left first:\n" + "\n".join(legend))
    finally:
        for o in hidden:
            o.hide_render = False
        cd = cam.data
        bpy.data.objects.remove(cam)
        bpy.data.cameras.remove(cd)
        sc.camera = saved["camera"]
        r.engine, r.resolution_x, r.resolution_y = saved["engine"], saved["rx"], saved["ry"]
        r.resolution_percentage, r.filepath = saved["pct"], saved["fp"]
        r.image_settings.media_type = saved["media"]
        r.image_settings.file_format = saved["fmt"]
        sc.view_settings.view_transform = saved["vt"]
        sh.light, sh.color_type, sh.show_shadows, sh.show_cavity = saved["light"], saved["ct"], saved["shadow"], saved["cavity"]
        if saved["world"] is not None:
            sc.world.color = saved["world"]
        if frames:
            sc.frame_set(saved["frame"])
    return path


# --------------------------------------------------------------------------- recipes
def _world_up_local(b):
    """(0,0,1) world expressed in the modified object's space: Self Object > Object Info >
    Invert Matrix > Transform Direction (Thommes: everything in GN is object-local)."""
    info = b.node("ObjectInfo", transform_space="ORIGINAL", ins={"Object": b.node("SelfObject")})
    inv = b.node("InvertMatrix", ins={"Matrix": (info, "Transform")})
    return b.node("TransformDirection", ins={"Direction": (0.0, 0.0, 1.0), "Transform": (inv, "Matrix")}), info, inv


def _seed_plus(b, seed, k):
    """Offset seeds per Random Value node: two nodes with the same ID and Seed return correlated values."""
    return b.node("IntegerMath", operation="ADD", ins={0: seed, 1: k})


def scatter_tree(name="BX Scatter"):
    """Scatter on a surface: density x mask (attribute/vertex group), world-up slope limit,
    upright or normal-aligned rotation with random spin, random scale, pick from an object
    and/or a collection, per-instance 'scatter_rand' attribute for shaders, optional realize.
    Instances stay instances by default (cheap; shaders read instance attributes)."""
    b = Builder(name)
    inst_obj = b.input("Instance", "OBJECT", description="object instanced on the points")
    inst_col = b.input("Instances", "COLLECTION", description="pick randomly among the children")
    dens = b.input("Density", "FLOAT", 10.0, min=0.0, description="points per square metre (object space)")
    mask = b.input("Density Mask", "FLOAT", 1.0, min=0.0, max=1.0, subtype="FACTOR",
                   description="0 to 1; switch to an attribute or vertex group with attr:NAME")
    slope = b.input("Max Slope", "FLOAT", math.radians(35.0), min=0.0, max=math.pi, subtype="ANGLE",
                    description="faces steeper than this (vs world up) get nothing")
    seed = b.input("Seed", "INT", 0)
    smin = b.input("Scale Min", "FLOAT", 0.8, min=0.0, panel="Transform")
    smax = b.input("Scale Max", "FLOAT", 1.2, min=0.0, panel="Transform")
    align = b.input("Align to Normal", "BOOL", False, panel="Transform",
                    description="off: upright in world (trees); on: follow the surface (rocks, moss)")
    spin = b.input("Random Spin", "FLOAT", 1.0, min=0.0, max=1.0, subtype="FACTOR", panel="Transform")
    realize = b.input("Realize", "BOOL", False, panel="Output")

    up, _, _ = _world_up_local(b)
    flat = b.node("Compare", data_type="VECTOR", mode="DIRECTION", operation="LESS_EQUAL",
                  ins={"A": b.node("Normal"), "B": up, "Angle": slope})
    density = b.node("Math", operation="MULTIPLY", ins={0: dens, 1: mask})
    dist = b.node("DistributePointsOnFaces", ins={"Mesh": b.geo_in, "Selection": flat, "Density": density,
                                                  "Seed": seed})
    upright = b.node("AlignRotationToVector", axis="Z", ins={"Vector": up})
    base_rot = b.node("Switch", input_type="ROTATION", ins={"Switch": align, "False": upright,
                                                             "True": (dist, "Rotation")})
    two_pi = b.node("Math", operation="MULTIPLY", ins={0: spin, 1: 2 * math.pi})
    ang = b.node("RandomValue", data_type="FLOAT", ins={"Min": 0.0, "Max": two_pi, "Seed": _seed_plus(b, seed, 1)})
    rot = b.node("RotateRotation", rotation_space="LOCAL",
                 ins={"Rotation": base_rot,
                      "Rotate By": b.node("EulerToRotation", ins={"Euler": b.node("CombineXYZ", ins={"Z": ang})})})
    scl = b.node("RandomValue", data_type="FLOAT", ins={"Min": smin, "Max": smax, "Seed": _seed_plus(b, seed, 2)})
    oi = b.node("ObjectInfo", transform_space="ORIGINAL", ins={"Object": inst_obj, "As Instance": True})
    ci = b.node("CollectionInfo", ins={"Collection": inst_col, "Separate Children": True, "Reset Children": True})
    pool = b.join([(oi, "Geometry"), ci])
    pick = b.node("RandomValue", data_type="INT", ins={"Min": 0, "Max": 9999, "Seed": _seed_plus(b, seed, 3)})
    iop = b.node("InstanceOnPoints", ins={"Points": dist, "Instance": pool, "Pick Instance": True,
                                          "Instance Index": pick, "Rotation": rot, "Scale": scl})
    rid = b.node("RandomValue", data_type="FLOAT", ins={"Seed": _seed_plus(b, seed, 4)})
    tagged = b.node("StoreNamedAttribute", data_type="FLOAT", domain="INSTANCE",
                    ins={"Geometry": iop, "Name": "scatter_rand", "Value": rid})
    real = b.node("RealizeInstances", ins={"Geometry": tagged})
    res = b.node("Switch", input_type="GEOMETRY", ins={"Switch": realize, "False": tagged, "True": real})
    b.output_geometry(b.join([b.geo_in, res]))
    return b.done()


def curve_array_tree(name="BX Curve Array"):
    """Array an object along the modified curve at a fixed spacing: instance X along the tangent,
    Z along the curve normal, optional alternating twist around the tangent (chain links: 90
    degrees), random scale, keep or drop the curve, optional realize."""
    b = Builder(name)
    inst = b.input("Instance", "OBJECT")
    spacing = b.input("Spacing", "FLOAT", 0.25, min=0.001, subtype="DISTANCE")
    scale = b.input("Scale", "FLOAT", 1.0, min=0.0)
    rscale = b.input("Random Scale", "FLOAT", 0.0, min=0.0, max=1.0, subtype="FACTOR")
    twist = b.input("Alternate Twist", "FLOAT", 0.0, subtype="ANGLE", description="extra roll on every other instance")
    seed = b.input("Seed", "INT", 0)
    keep = b.input("Keep Curve", "BOOL", False, panel="Output")
    realize = b.input("Realize", "BOOL", False, panel="Output")

    pts = b.node("CurveToPoints", mode="LENGTH", ins={"Curve": b.geo_in, "Length": spacing})
    a1 = b.node("AlignRotationToVector", axis="X", ins={"Vector": (pts, "Tangent")})
    a2 = b.node("AlignRotationToVector", axis="Z", pivot_axis="X", ins={"Rotation": a1, "Vector": (pts, "Normal")})
    odd = b.node("Math", operation="FLOORED_MODULO", ins={0: b.node("Index"), 1: 2.0})
    roll = b.node("Math", operation="MULTIPLY", ins={0: odd, 1: twist})
    rot = b.node("RotateRotation", rotation_space="LOCAL",
                 ins={"Rotation": a2,
                      "Rotate By": b.node("EulerToRotation", ins={"Euler": b.node("CombineXYZ", ins={"X": roll})})})
    lo = b.node("Math", operation="SUBTRACT", ins={0: 1.0, 1: rscale})
    hi = b.node("Math", operation="ADD", ins={0: 1.0, 1: rscale})
    rnd = b.node("RandomValue", data_type="FLOAT", ins={"Min": lo, "Max": hi, "Seed": seed})
    s = b.node("Math", operation="MULTIPLY", ins={0: scale, 1: rnd})
    oi = b.node("ObjectInfo", transform_space="ORIGINAL", ins={"Object": inst, "As Instance": True})
    iop = b.node("InstanceOnPoints", ins={"Points": pts, "Instance": (oi, "Geometry"), "Rotation": rot, "Scale": s})
    real = b.node("RealizeInstances", ins={"Geometry": iop})
    arr = b.node("Switch", input_type="GEOMETRY", ins={"Switch": realize, "False": iop, "True": real})
    both = b.join([b.geo_in, arr])
    res = b.node("Switch", input_type="GEOMETRY", ins={"Switch": keep, "False": arr, "True": both})
    b.output_geometry(res)
    return b.done()


def growth_tree(name="BX Growth"):
    """Repeat-zone growth: random faces extrude along (normal + upward bias) for N iterations,
    each step shorter (Taper) and each tip scaled down, then subdivided and smoothed.
    Face count grows linearly: faces = F0 + sides_per_face * selected * iterations."""
    b = Builder(name)
    iters = b.input("Iterations", "INT", 6, min=0, max=64)
    step0 = b.input("Step", "FLOAT", 0.25, min=0.0, subtype="DISTANCE")
    taper = b.input("Taper", "FLOAT", 0.8, min=0.05, max=1.0, subtype="FACTOR")
    prob = b.input("Probability", "FLOAT", 0.3, min=0.0, max=1.0, subtype="FACTOR")
    upward = b.input("Upward", "FLOAT", 0.5, description="bias of the growth direction toward +Z (object space)")
    seed = b.input("Seed", "INT", 0)
    level = b.input("Smooth Level", "INT", 1, min=0, max=3)

    start = b.node("RandomValue", data_type="BOOLEAN", ins={"Probability": prob, "Seed": seed})
    zi, zo = b.zone("REPEAT", items=[("BOOLEAN", "Tip"), ("FLOAT", "Step")], iterations=iters)
    b.set(zi, "Geometry", b.geo_in)
    b.set(zi, "Tip", start)
    b.set(zi, "Step", step0)
    bias = b.node("CombineXYZ", ins={"Z": upward})
    d = b.node("VectorMath", operation="NORMALIZE",
               ins={0: b.node("VectorMath", operation="ADD", ins={0: b.node("Normal"), 1: bias})})
    ex = b.node("ExtrudeMesh", mode="FACES", ins={"Mesh": (zi, "Geometry"), "Selection": (zi, "Tip"), "Offset": d,
                                                   "Offset Scale": (zi, "Step"), "Individual": True})
    sc = b.node("ScaleElements", domain="FACE", ins={"Geometry": ex, "Selection": (ex, "Top"), "Scale": taper})
    nxt = b.node("Math", operation="MULTIPLY", ins={0: (zi, "Step"), 1: taper})
    b.link(sc, (zo, "Geometry"))
    b.link((ex, "Top"), (zo, "Tip"))
    b.link(nxt, (zo, "Step"))
    sub = b.node("SubdivisionSurface", ins={"Mesh": (zo, "Geometry"), "Level": level})
    smooth = b.node("SetShadeSmooth", ins={"Geometry": sub})
    b.output_geometry(smooth)
    return b.done()


def particle_drop_tree(name="BX Particle Drop"):
    """Simulation zone: points emitted in a world-space box for N frames fall under world gravity,
    bounce on a world ground plane (restitution, friction) and settle. New points are appended
    at the END of the state (Join order), each with a stable 'pid'. Position and velocity are
    computed together in one Capture Attribute so neither reads the other's new value.
    Outputs the modified geometry plus icosphere instances (Material input)."""
    b = Builder(name)
    rate = b.input("Rate", "INT", 20, min=0, description="points emitted per frame")
    nframes = b.input("Emit Frames", "INT", 20, min=0)
    center = b.input("Emit Center", "VECTOR", (0.0, 0.0, 3.0), description="world space")
    size = b.input("Emit Size", "VECTOR", (2.0, 2.0, 0.5))
    grav = b.input("Gravity", "FLOAT", 9.81, panel="Physics")
    rest = b.input("Restitution", "FLOAT", 0.45, min=0.0, max=1.0, subtype="FACTOR", panel="Physics")
    fric = b.input("Friction", "FLOAT", 0.3, min=0.0, max=1.0, subtype="FACTOR", panel="Physics")
    ground = b.input("Ground Height", "FLOAT", 0.0, description="world Z", panel="Physics")
    rad = b.input("Radius", "FLOAT", 0.06, min=0.001, subtype="DISTANCE")
    seed = b.input("Seed", "INT", 0)
    mat = b.input("Material", "MATERIAL")

    info = b.node("ObjectInfo", transform_space="ORIGINAL", ins={"Object": b.node("SelfObject")})
    to_world = (info, "Transform")
    to_local = (b.node("InvertMatrix", ins={"Matrix": to_world}), "Matrix")
    zi, zo = b.zone("SIMULATION")        # nothing into zi Geometry: the state starts empty

    # emission, world-space box converted to object space
    frame = (b.node("SceneTime"), "Frame")
    emitting = b.node("Compare", data_type="FLOAT", operation="LESS_EQUAL", ins={"A": frame, "B": nframes})
    count = b.node("Switch", input_type="INT", ins={"Switch": emitting, "False": 0, "True": rate})
    fseed = b.node("Math", operation="MULTIPLY_ADD", ins={0: seed, 1: 7919.0, 2: frame})
    jitter = b.node("RandomValue", data_type="FLOAT_VECTOR",
                    ins={"Min": (-0.5, -0.5, -0.5), "Max": (0.5, 0.5, 0.5), "Seed": fseed})
    wpos = b.node("VectorMath", operation="MULTIPLY_ADD", ins={0: jitter, 1: size, 2: center})
    newp = b.node("Points", ins={"Count": count, "Position": b.node("TransformPoint", ins={"Vector": wpos,
                                                                                           "Transform": to_local}),
                                 "Radius": rad})
    born = b.node("Math", operation="SUBTRACT", ins={0: frame, 1: 1.0})
    pid = b.node("Math", operation="MULTIPLY_ADD", ins={0: born, 1: rate, 2: b.node("Index")})
    newp = b.node("StoreNamedAttribute", data_type="INT", domain="POINT",
                  ins={"Geometry": newp, "Name": "pid", "Value": pid})
    state = b.join([(zi, "Geometry"), newp])          # existing points first, new ones appended

    # integrate in world space (semi-implicit Euler), collide with the ground plane
    dt = (zi, "Delta Time")
    vel = b.node("NamedAttribute", data_type="FLOAT_VECTOR", ins={"Name": "velocity"})
    g = b.node("CombineXYZ", ins={"Z": b.node("Math", operation="MULTIPLY", ins={0: grav, 1: -1.0})})
    v1 = b.node("VectorMath", operation="MULTIPLY_ADD", ins={0: g, 1: dt, 2: (vel, "Attribute")})
    pw = b.node("TransformPoint", ins={"Vector": b.node("Position"), "Transform": to_world})
    p1 = b.node("VectorMath", operation="MULTIPLY_ADD", ins={0: v1, 1: dt, 2: pw})
    sp1 = b.node("SeparateXYZ", ins={"Vector": p1})
    floor = b.node("Math", operation="ADD", ins={0: ground, 1: rad})
    hit = b.node("Compare", data_type="FLOAT", operation="LESS_THAN", ins={"A": (sp1, "Z"), "B": floor})
    p_hit = b.node("CombineXYZ", ins={"X": (sp1, "X"), "Y": (sp1, "Y"), "Z": floor})
    p2 = b.node("Switch", input_type="VECTOR", ins={"Switch": hit, "False": p1, "True": p_hit})
    sv = b.node("SeparateXYZ", ins={"Vector": v1})
    keep = b.node("Math", operation="SUBTRACT", ins={0: 1.0, 1: fric})
    bounce = b.node("Math", operation="MULTIPLY", ins={0: (sv, "Z"), 1: b.node("Math", operation="MULTIPLY",
                                                                                ins={0: rest, 1: -1.0})})
    v_hit = b.node("CombineXYZ", ins={"X": b.node("Math", operation="MULTIPLY", ins={0: (sv, "X"), 1: keep}),
                                      "Y": b.node("Math", operation="MULTIPLY", ins={0: (sv, "Y"), 1: keep}),
                                      "Z": bounce})
    v2 = b.node("Switch", input_type="VECTOR", ins={"Switch": hit, "False": v1, "True": v_hit})
    cap = b.node("CaptureAttribute", domain="POINT")
    b.items(cap, "capture_items", [("VECTOR", "p"), ("VECTOR", "v")])
    b.set(cap, "Geometry", state)
    b.set(cap, "p", p2)
    b.set(cap, "v", v2)
    stv = b.node("StoreNamedAttribute", data_type="FLOAT_VECTOR", domain="POINT",
                 ins={"Geometry": (cap, "Geometry"), "Name": "velocity", "Value": (cap, "v")})
    setp = b.node("SetPosition", ins={"Geometry": stv, "Position": b.node("TransformPoint", ins={
        "Vector": (cap, "p"), "Transform": to_local})})
    b.link(setp, (zo, "Geometry"))

    ball = b.node("MeshIcoSphere", ins={"Radius": 1.0, "Subdivisions": 2})
    iop = b.node("InstanceOnPoints", ins={"Points": (zo, "Geometry"), "Instance": ball, "Scale": rad})
    shaded = b.node("SetMaterial", ins={"Geometry": iop, "Material": mat})
    b.output_geometry(b.join([b.geo_in, shaded]))
    return b.done()
