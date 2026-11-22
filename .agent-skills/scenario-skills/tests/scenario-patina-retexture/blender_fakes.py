"""Duck-typed stand-ins for the bpy and mathutils members the scripts touch.

They only store what a script assigns and hand back what a test planted, so a test checks
the scene the script built (which node feeds which socket, which frames were keyed),
never Blender's own behavior. test_blender.py runs the same code against real bpy.
"""

import types
from types import SimpleNamespace

import numpy as np
from PIL import Image


class Matrix:
    """The mathutils.Matrix members the scripts use: `@` with a matrix or a 3-vector
    (homogeneous, like Blender), row indexing, to_scale, and conversion to numpy."""

    def __init__(self, values):
        self.values = np.asarray(values, dtype=float)

    def __array__(self, dtype=None, copy=None):
        return self.values if dtype is None else self.values.astype(dtype)

    def __getitem__(self, index):
        return self.values[index]

    def __matmul__(self, other):
        if isinstance(other, Matrix):
            return Matrix(self.values @ other.values)
        return tuple(self.values[:3, :3] @ np.asarray(other, dtype=float) + self.values[:3, 3])

    def to_scale(self):
        return tuple(float(v) for v in np.linalg.norm(self.values[:3, :3], axis=0))


def matrix(location=(0, 0, 0), scale=(1, 1, 1)):
    basis = np.diag([*scale, 1.0])
    basis[:3, 3] = location
    return Matrix(basis)


def mathutils_module():
    module = types.ModuleType("mathutils")
    module.Vector = tuple
    return module


class Quaternion(tuple):
    """What a patched track_quaternion returns: the unit look direction, plus a zero w."""

    def to_euler(self):
        return tuple(self[:3])


def look_quaternion(location, target):
    direction = np.asarray(target, dtype=float) - np.asarray(location, dtype=float)
    return Quaternion((*(direction / np.linalg.norm(direction)), 0.0))


class Socket:
    def __init__(self, node, key):
        self.node = node
        self.key = key
        # Vector sockets are written one component at a time.
        self.default_value = [0.0, 0.0, 0.0]
        self.is_linked = False


class Sockets(dict):
    def __init__(self, node):
        super().__init__()
        self.node = node

    def __missing__(self, key):
        socket = self[key] = Socket(self.node, key)
        return socket


class Node:
    def __init__(self, kind):
        self.kind = kind
        self.inputs = Sockets(self)
        self.outputs = Sockets(self)


class Nodes(list):
    def new(self, kind):
        node = Node(kind)
        self.append(node)
        return node

    def named(self, name):
        return next(node for node in self if node.name == name)

    def of_kind(self, kind):
        return [node for node in self if node.kind == kind]


class Links(list):
    def new(self, source, target):
        target.is_linked = True
        self.append((source, target))

    def source(self, target):
        """The socket feeding `target`, or None."""
        return next((s for s, t in self if t is target), None)


class NodeTree:
    def __init__(self):
        self.nodes = Nodes()
        self.links = Links()


class IDBlock:
    """A material or world: custom properties plus a node tree enabled by use_nodes."""

    def __init__(self, name, **attributes):
        self.name = name
        self.use_nodes = False
        self.node_tree = NodeTree()
        self.properties = {}
        for key, value in attributes.items():
            setattr(self, key, value)

    def __setitem__(self, key, value):
        self.properties[key] = value

    def __getitem__(self, key):
        return self.properties[key]


class Pixels:
    def __init__(self, values):
        self.values = np.asarray(values, dtype=np.float32).reshape(-1)

    def __len__(self):
        return self.values.size

    def foreach_get(self, buffer):
        buffer[:] = self.values


class FakeImage:
    def __init__(self, path, size, rgba):
        self.filepath = path
        self.name = path
        self.size = size
        self.pixels = Pixels(rgba)
        self.is_float = False
        self.depth = 32
        self.colorspace_settings = SimpleNamespace(name=None)
        self.packed = False

    def pack(self):
        self.packed = True


class Images(list):
    """bpy.data.images.load with Blender's failure modes: a missing file raises, and an
    unreadable one loads lazily with a zero size."""

    def load(self, path, check_existing=False):
        try:
            with Image.open(path) as image:
                rgba = np.asarray(image.convert("RGBA"), dtype=np.float32) / 255
                size = image.size
        except FileNotFoundError:
            raise RuntimeError(f"Error: Cannot read file '{path}': No such file") from None
        except OSError:
            rgba, size = np.zeros(4), (0, 0)
        loaded = FakeImage(path, size, rgba)
        self.append(loaded)
        return loaded


class Recorder:
    """Records keyframe_insert calls as (property, frame, value)."""

    def keyframe_insert(self, prop, frame):
        if not hasattr(self, "keys"):
            self.keys = []
        value = getattr(self, prop)
        self.keys.append((prop, frame, tuple(value) if isinstance(value, tuple) else value))


class LightData(Recorder):
    def __init__(self, name, kind):
        self.name = name
        self.type = kind
        self.energy = 10.0
        self.size = 0.25
        self.size_y = 0.25
        self.color = (1, 1, 1)
        self.shape = "SQUARE"


class CameraData:
    def __init__(self, name):
        self.name = name
        self.type = "ORTHO"
        self.lens = 50
        self.sensor_width = 24
        self.sensor_fit = "AUTO"
        self.shift_x = self.shift_y = 0.3
        self.dof = SimpleNamespace(use_dof=True)
        self.clip_start = 0.1
        self.clip_end = 100.0


class SceneObject(Recorder):
    def __init__(self, name, data=None, kind=None, location=(0, 0, 0), materials=()):
        self.name = name
        self.data = data
        if kind is None:
            kind = {LightData: "LIGHT", CameraData: "CAMERA"}.get(type(data), "MESH")
        self.type = kind
        self.location = location
        self.rotation_euler = (0, 0, 0)
        self.rotation_quaternion = (1, 0, 0, 0)
        self.rotation_mode = "XYZ"
        self.parent = None
        self.matrix_basis = matrix(location)
        self.matrix_parent_inverse = matrix()
        self.material_slots = [SimpleNamespace(material=m) for m in materials]
        self.hide_render = False
        self.bound_box = CUBE
        self.selected = True

    def select_set(self, state):
        self.selected = state


CUBE = [(x, y, z) for x in (-0.5, 0.5) for y in (-0.5, 0.5) for z in (-0.5, 0.5)]


class UVLayer:
    def __init__(self, name, loops):
        self.name = name
        self.data = [SimpleNamespace(uv=None) for _ in range(loops)]
        self.active_render = False


class UVLayers(list):
    def __init__(self, mesh):
        super().__init__()
        self.mesh = mesh
        self.active = None

    def new(self, name):
        layer = UVLayer(name, len(self.mesh.loops))
        self.append(layer)
        return layer


class Mesh:
    """A unit cube's top face (+Z) and front face (-Y), one loop per corner."""

    def __init__(self, users=1):
        self.vertices = [SimpleNamespace(co=corner) for corner in CUBE]
        faces = (((1, 3, 7, 5), (0, 0, 1)), ((0, 4, 5, 1), (0, -1, 0)))
        self.polygons = []
        self.loops = []
        for corners, normal in faces:
            start = len(self.loops)
            self.loops += [SimpleNamespace(vertex_index=i) for i in corners]
            self.polygons.append(
                SimpleNamespace(
                    vertices=list(corners),
                    normal=normal,
                    loop_indices=range(start, start + len(corners)),
                )
            )
        self.uv_layers = UVLayers(self)
        self.users = users

    def copy(self):
        twin = Mesh()
        twin.vertices = [SimpleNamespace(co=v.co) for v in self.vertices]
        return twin


class DataCollection(list):
    def __init__(self, factory):
        super().__init__()
        self.factory = factory

    def new(self, *args):
        item = self.factory(*args)
        self.append(item)
        return item

    def get(self, name):
        return next((item for item in self if item.name == name), None)


class Objects(DataCollection):
    def __init__(self, scene):
        super().__init__(SceneObject)
        self.scene = scene
        self.removed = []

    def remove(self, obj, do_unlink=False):
        self.removed.append(obj.name)
        if obj in self:
            self.remove_item(obj)
        if do_unlink and obj in self.scene.objects:
            self.scene.objects.remove(obj)

    def remove_item(self, obj):
        list.remove(self, obj)


class SceneObjects(list):
    """scene.objects, also serving as view_layer.objects with its active object."""

    active = None


class Scene:
    def __init__(self, objects=()):
        self.objects = SceneObjects(objects)
        self.collection = SimpleNamespace(objects=SimpleNamespace(link=self.objects.append))
        self.markers = []
        self.timeline_markers = SimpleNamespace(new=self.add_marker)
        self.properties = {}
        self.world = None
        self.camera = None
        self.frame_start = 0
        self.frame_end = 0
        self.current_frame = None
        self.render = SimpleNamespace(
            engine="CYCLES",
            image_settings=SimpleNamespace(color_management="OVERRIDE"),
            use_border=True,
        )
        self.display_settings = SimpleNamespace(display_device="Display P3")
        self.eevee = SimpleNamespace(taa_render_samples=64, use_raytracing=False)
        self.view_settings = SimpleNamespace(
            view_transform="Standard", look="None", exposure=2.0, gamma=2.2
        )

    def add_marker(self, name, frame):
        self.markers.append((name, frame))

    def frame_set(self, frame):
        self.current_frame = frame

    def __setitem__(self, key, value):
        self.properties[key] = value


def bpy_module(scene=None):
    """A bpy module with an open scene; ops are Mock-free so a test plants its own."""
    scene = scene or Scene()
    module = types.ModuleType("bpy")
    module.context = SimpleNamespace(
        scene=scene, view_layer=SimpleNamespace(objects=scene.objects, update=lambda: None)
    )
    module.data = SimpleNamespace(
        objects=Objects(scene),
        lights=DataCollection(LightData),
        cameras=DataCollection(CameraData),
        materials=DataCollection(IDBlock),
        worlds=DataCollection(IDBlock),
        images=Images(),
        screens=[],
    )
    module.ops = SimpleNamespace()
    module.app = SimpleNamespace(version_string="5.0.1")
    return module
