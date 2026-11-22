"""Minimal bpy-free GLB reader: node transforms, skin joints, skinned rest geometry."""

import json
import struct

import numpy as np

_COMPONENTS = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16,
               5125: np.uint32, 5126: np.float32}
_SIZES = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
# Component types a sparse accessor's indices may have.
_INDEX_COMPONENTS = {5121: np.uint8, 5123: np.uint16, 5125: np.uint32}
_JSON_CHUNK, _BIN_CHUNK = 0x4E4F534A, 0x004E4942


class Glb:
    """One GLB file: its glTF JSON (``json``), binary chunk and node list."""

    def __init__(self, path):
        with open(path, 'rb') as f:
            data = f.read()
        self.json, self.bin = {}, b''
        offset = 12
        while offset < len(data):
            length, kind = struct.unpack_from('<II', data, offset)
            chunk = data[offset + 8:offset + 8 + length]
            if kind == _JSON_CHUNK:
                self.json = json.loads(chunk)
            elif kind == _BIN_CHUNK:
                self.bin = chunk
            offset += 8 + length
        self.nodes = self.json.get('nodes', [])

    def _view_start(self, view_index, byte_offset, nbytes):
        """Where in the binary chunk *nbytes* at *byte_offset* into a
        bufferView start; ValueError for a view of another buffer than the
        GLB's own, or a read past the view or the chunk."""
        view = self.json['bufferViews'][view_index]
        if view.get('buffer', 0) != 0:
            raise ValueError(f"bufferView {view_index} reads buffer {view['buffer']}: only "
                             f"the GLB's binary chunk (buffer 0) is supported")
        start = view.get('byteOffset', 0) + byte_offset
        length = view.get('byteLength', len(self.bin) - view.get('byteOffset', 0))
        if byte_offset + nbytes > length or start + nbytes > len(self.bin):
            raise ValueError(f"bufferView {view_index}: {nbytes} bytes at offset {byte_offset} "
                             f"read past the view ({length} bytes) or the binary chunk")
        return view, start

    def accessor(self, index):
        """Accessor *index* as a float64 ``(count, components)`` array (glTF
        2.0 accessors: interleaved or not, no ``bufferView`` meaning zeros,
        ``sparse`` replacements, ``normalized`` integers); ValueError for an
        unsupported or malformed one."""
        acc = self.json['accessors'][index]
        if acc['componentType'] not in _COMPONENTS or acc['type'] not in _SIZES:
            raise ValueError(f"accessor {index}: unsupported componentType "
                             f"{acc['componentType']} / type {acc['type']!r}")
        dtype = np.dtype(_COMPONENTS[acc['componentType']])
        width, count = _SIZES[acc['type']], acc['count']
        if 'bufferView' in acc:
            stride = (self.json['bufferViews'][acc['bufferView']].get('byteStride', 0)
                      or dtype.itemsize * width)
            nbytes = stride * (count - 1) + dtype.itemsize * width if count else 0
            _, start = self._view_start(acc['bufferView'], acc.get('byteOffset', 0), nbytes)
            raw = np.frombuffer(self.bin, dtype=np.uint8, offset=start, count=nbytes)
            rows = np.lib.stride_tricks.as_strided(raw, (count, dtype.itemsize * width),
                                                   (stride, 1))
            arr = np.ascontiguousarray(rows).view(dtype).reshape(count, width)
        else:
            arr = np.zeros((count, width), dtype=dtype)
        sparse = acc.get('sparse')
        if sparse:
            arr = arr.copy()
            n = sparse['count']
            ind = sparse['indices']
            if ind['componentType'] not in _INDEX_COMPONENTS:
                raise ValueError(f"accessor {index}: sparse index componentType "
                                 f"{ind['componentType']} is not an unsigned integer type")
            itype = np.dtype(_INDEX_COMPONENTS[ind['componentType']])
            _, istart = self._view_start(ind['bufferView'], ind.get('byteOffset', 0),
                                         n * itype.itemsize)
            indices = np.frombuffer(self.bin, dtype=itype, count=n, offset=istart).astype(np.int64)
            if n and (indices[-1] >= count or np.any(np.diff(indices) <= 0)):
                raise ValueError(f"accessor {index}: sparse indices must strictly increase "
                                 f"and stay below count {count}")
            vals = sparse['values']
            _, vstart = self._view_start(vals['bufferView'], vals.get('byteOffset', 0),
                                         n * width * dtype.itemsize)
            arr[indices] = np.frombuffer(self.bin, dtype=dtype, count=n * width,
                                         offset=vstart).reshape(n, width)
        arr = arr.astype(np.float64)
        if acc.get('normalized') and dtype.kind in 'iu':
            arr /= np.iinfo(dtype).max
            if dtype.kind == 'i':
                np.maximum(arr, -1.0, out=arr)
        return arr

    @staticmethod
    def _local(node):
        if 'matrix' in node:
            return np.array(node['matrix'], dtype=np.float64).reshape(4, 4).T
        x, y, z, w = node.get('rotation', [0, 0, 0, 1])
        rot = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
        mat = np.eye(4)
        mat[:3, :3] = rot * np.array(node.get('scale', [1, 1, 1]))
        mat[:3, 3] = node.get('translation', [0, 0, 0])
        return mat

    def world(self):
        """World matrices of every node, ``(N, 4, 4)``."""
        parent = {c: i for i, n in enumerate(self.nodes) for c in n.get('children', [])}
        out = [None] * len(self.nodes)

        def get(i):
            if out[i] is None:
                local = self._local(self.nodes[i])
                out[i] = local if i not in parent else get(parent[i]) @ local
            return out[i]
        return np.stack([get(i) for i in range(len(self.nodes))]) if self.nodes \
            else np.zeros((0, 4, 4))

    def joints(self):
        """``{name: world 4x4}`` of every skin joint."""
        world = self.world()
        return {self.nodes[j].get('name'): world[j]
                for skin in self.json.get('skins', []) for j in skin['joints']}

    def skinned_triangles(self):
        """Rest-pose triangles of every skinned primitive as ``(T, 9)``, and the
        dominant joint name of each of their corners, ``(T, 3)``."""
        world = self.world()
        tris, dominant = [], []
        for node in self.nodes:
            if 'mesh' not in node or 'skin' not in node:
                continue
            skin = self.json['skins'][node['skin']]
            joints = skin['joints']
            ibm = self.accessor(skin['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1)
            joint_mats = world[joints] @ ibm
            names = np.array([self.nodes[j].get('name') for j in joints])
            for prim in self.json['meshes'][node['mesh']]['primitives']:
                attrs = prim['attributes']
                if 'JOINTS_0' not in attrs:
                    continue
                pos = self.accessor(attrs['POSITION'])
                jidx = self.accessor(attrs['JOINTS_0']).astype(int)
                wts = self.accessor(attrs['WEIGHTS_0'])
                wts = wts / np.maximum(wts.sum(1, keepdims=True), 1e-12)
                homo = np.c_[pos, np.ones(len(pos))]
                verts = sum(wts[:, k:k + 1] * np.einsum('nij,nj->ni', joint_mats[jidx[:, k]], homo)[:, :3]
                            for k in range(jidx.shape[1]))
                faces = (self.accessor(prim['indices']).astype(int).reshape(-1, 3)
                         if 'indices' in prim else np.arange(len(pos)).reshape(-1, 3))
                tris.append(verts[faces].reshape(-1, 9))
                dominant.append(names[jidx[np.arange(len(jidx)), wts.argmax(1)]][faces])
        if not tris:
            return np.zeros((0, 9)), np.zeros((0, 3), dtype=object)
        return np.concatenate(tris), np.concatenate(dominant)
