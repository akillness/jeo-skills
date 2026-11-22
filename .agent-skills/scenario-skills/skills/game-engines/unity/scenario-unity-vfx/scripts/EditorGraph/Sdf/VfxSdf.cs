// AgentKit.Vfx v0.1 (scenario-unity-vfx, 2026-09-24). SDF baking with the PUBLIC VFX Graph API (supported route):
// UnityEngine.VFX.SDF.MeshToSDFBaker bakes on the GPU into a 3D RenderTexture; the SDF Bake Tool window's own
// save (SaveToAsset) is internal, so this reads the texture back with AsyncGPUReadback, slice by slice, into a
// Texture3D (RHalf) asset. Bake Tool SDFs are normalized (largest side = 1): pass GetActualBoxSize() to the
// graph with the texture (VFX Graph 17.3 manual). Per-frame bakes: low resolution (64) and Dispose().
// Called by AgentKit.Vfx.VfxGraphJobs.BakeSdf through reflection. Compiles only with VFX Graph installed.
using System;
using System.Collections.Generic;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.VFX.SDF;

namespace AgentKit.VfxGraph
{
    public static class VfxSdf
    {
        public static Dictionary<string, object> BakeToAsset(Mesh mesh, string assetPath, int maxRes, float padding)
        {
            if (mesh == null) throw new ArgumentNullException(nameof(mesh));
            var b = mesh.bounds;
            var size = b.size + Vector3.one * padding * 2f;
            var baker = new MeshToSDFBaker(size, b.center, maxRes, mesh, 1, 0.5f, 0f);
            try
            {
                baker.BakeSDF();
                var rt = baker.SdfTexture;
                int w = rt.width, h = rt.height, d = rt.volumeDepth;
                var req = AsyncGPUReadback.Request(rt, 0, 0, w, 0, h, 0, d, null);
                req.WaitForCompletion();
                if (req.hasError) throw new InvalidOperationException("AsyncGPUReadback failed on the SDF texture (" + rt.graphicsFormat + ")");
                int bpp = req.layerDataSize / (w * h);
                var bytes = new byte[req.layerDataSize * d];
                for (int z = 0; z < d; z++)
                {
                    var layer = req.GetData<byte>(z);
                    NativeArrayCopy(layer, bytes, z * req.layerDataSize);
                }
                var fmt = bpp == 2 ? TextureFormat.RHalf : bpp == 4 ? TextureFormat.RFloat : TextureFormat.RGBAHalf;
                var tex = new Texture3D(w, h, d, fmt, false) { wrapMode = TextureWrapMode.Clamp, filterMode = FilterMode.Bilinear, name = System.IO.Path.GetFileNameWithoutExtension(assetPath) };
                tex.SetPixelData(bytes, 0);
                tex.Apply(false, false);
                System.IO.Directory.CreateDirectory(System.IO.Path.GetDirectoryName(System.IO.Path.GetFullPath(assetPath)));
                if (AssetDatabase.LoadMainAssetAtPath(assetPath) != null) AssetDatabase.DeleteAsset(assetPath);
                AssetDatabase.CreateAsset(tex, assetPath);
                // sample: centre of the grid (inside a closed mesh) and a corner (outside)
                float centre = Read(bytes, bpp, w, h, w / 2, h / 2, d / 2), corner = Read(bytes, bpp, w, h, 0, 0, 0);
                var box = baker.GetActualBoxSize();
                return new Dictionary<string, object>
                {
                    { "asset", assetPath }, { "grid", new[] { w, h, d } }, { "format", rt.graphicsFormat.ToString() }, { "bytes_per_voxel", bpp },
                    { "actual_box_size", box }, { "sdf_centre", centre }, { "sdf_corner", corner },
                };
            }
            finally
            {
                baker.Dispose();   // the finalizer warns if forgotten
            }
        }

        static void NativeArrayCopy(Unity.Collections.NativeArray<byte> src, byte[] dst, int offset)
        {
            for (int i = 0; i < src.Length; i++) dst[offset + i] = src[i];
        }

        static float Read(byte[] data, int bpp, int w, int h, int x, int y, int z)
        {
            int i = ((z * h + y) * w + x) * bpp;
            if (bpp == 2) return Mathf.HalfToFloat(BitConverter.ToUInt16(data, i));
            if (bpp == 4) return BitConverter.ToSingle(data, i);
            return Mathf.HalfToFloat(BitConverter.ToUInt16(data, i));
        }
    }
}
