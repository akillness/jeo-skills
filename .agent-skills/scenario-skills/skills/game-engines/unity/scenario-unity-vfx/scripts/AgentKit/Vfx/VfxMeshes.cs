// AgentKit.Vfx v0.2 (Unity Expert Skills, scenario-unity-vfx, 2026-09-24).
// Procedural VFX meshes: the "texture moving over some kind of a mesh" that is about 90% of Nordeus's shipped
// mobile effects (Nikola Damjanov, YZWK [00:28:02]): rings and shockwaves, slash arcs, tapered cones, flat
// quads for ground marks. Each mesh has normalized UVs (U along the shape, V across), vertex alpha that fades
// the edges (Nordeus adds polygons for vertex alpha control and triangulates before export so the gradient
// interpolates as authored, [00:28:57] to [00:29:29]: generated here as triangles, so nothing to triangulate),
// and is saved as a .asset. Used as Mesh-mode particles (one particle, lifetime = the beat) so Size, Color and
// Custom Data over life animate them, or on a MeshRenderer for a looping element.
using System.Collections.Generic;
using UnityEditor;
using UnityEngine;

namespace AgentKit.Vfx
{
    public static class VfxMeshes
    {
        /// <summary>Flat ring or arc in the XZ plane (y up), authored at outer radius `outer`. U runs 0..1 along the
        /// arc (texture tiling comes from the material), V runs 0 (inner) to 1 (outer). Three rows so the vertex
        /// alpha is 0 at both edges and `midAlpha` in the middle; `endFade` (0..0.5 of the arc) tapers both ends of
        /// an open arc (slash). Faces +Y; render two-sided (the uber shader's Cull Off).</summary>
        public static Mesh Ring(int segments, float inner, float outer, float arcDeg = 360f, float midAlpha = 1f, float endFade = 0f, float midV = 0.5f)
        {
            var verts = new List<Vector3>();
            var uvs = new List<Vector2>();
            var cols = new List<Color>();
            var tris = new List<int>();
            float[] vs = { 0f, midV, 1f };
            for (int s = 0; s <= segments; s++)
            {
                float u = s / (float)segments;
                float a = Mathf.Deg2Rad * (arcDeg * u - arcDeg * 0.5f);
                var dir = new Vector3(Mathf.Sin(a), 0f, Mathf.Cos(a));
                float ends = 1f;
                if (endFade > 0f && arcDeg < 359.9f) ends = Mathf.Clamp01(Mathf.Min(u, 1f - u) / endFade);
                ends = ends * ends * (3f - 2f * ends);
                for (int k = 0; k < 3; k++)
                {
                    float r = Mathf.Lerp(inner, outer, vs[k]);
                    verts.Add(dir * r);
                    uvs.Add(new Vector2(u, vs[k]));
                    cols.Add(new Color(1f, 1f, 1f, (k == 1 ? midAlpha : 0f) * ends));
                }
            }
            for (int s = 0; s < segments; s++)
                for (int k = 0; k < 2; k++)
                {
                    int a0 = s * 3 + k, a1 = a0 + 1, b0 = a0 + 3, b1 = b0 + 1;
                    tris.AddRange(new[] { a0, b0, a1, a1, b0, b1 });
                }
            return Build("VFX_Ring", verts, uvs, cols, tris);
        }

        /// <summary>Open tapered cylinder (cone) around +Y from radius r0 at y = 0 to r1 at y = height. U around, V up;
        /// vertex alpha 1 at the base fading to 0 at the top (a rising column, a beam, a vortex).</summary>
        public static Mesh Cone(int segments, float r0, float r1, float height, int rows = 4)
        {
            var verts = new List<Vector3>();
            var uvs = new List<Vector2>();
            var cols = new List<Color>();
            var tris = new List<int>();
            for (int s = 0; s <= segments; s++)
            {
                float u = s / (float)segments;
                float a = u * Mathf.PI * 2f;
                var dir = new Vector3(Mathf.Sin(a), 0f, Mathf.Cos(a));
                for (int k = 0; k <= rows; k++)
                {
                    float v = k / (float)rows;
                    verts.Add(dir * Mathf.Lerp(r0, r1, v) + Vector3.up * height * v);
                    uvs.Add(new Vector2(u, v));
                    float fade = 1f - v;
                    cols.Add(new Color(1f, 1f, 1f, fade * fade));
                }
            }
            int stride = rows + 1;
            for (int s = 0; s < segments; s++)
                for (int k = 0; k < rows; k++)
                {
                    int a0 = s * stride + k, a1 = a0 + 1, b0 = a0 + stride, b1 = b0 + 1;
                    tris.AddRange(new[] { a0, a1, b0, a1, b1, b0 });
                }
            return Build("VFX_Cone", verts, uvs, cols, tris);
        }

        /// <summary>Flat quad in the XZ plane (y up), side `size`, UV 0..1, vertex alpha 1: ground and wall marks
        /// oriented by the effect root (impact: up = surface normal).</summary>
        public static Mesh QuadXZ(float size = 1f)
        {
            float h = size * 0.5f;
            var verts = new List<Vector3> { new Vector3(-h, 0, -h), new Vector3(h, 0, -h), new Vector3(-h, 0, h), new Vector3(h, 0, h) };
            var uvs = new List<Vector2> { new Vector2(0, 0), new Vector2(1, 0), new Vector2(0, 1), new Vector2(1, 1) };
            var cols = new List<Color> { Color.white, Color.white, Color.white, Color.white };
            var tris = new List<int> { 0, 2, 1, 1, 2, 3 };
            return Build("VFX_QuadXZ", verts, uvs, cols, tris);
        }

        static Mesh Build(string name, List<Vector3> v, List<Vector2> uv, List<Color> c, List<int> t)
        {
            var m = new Mesh { name = name };
            m.SetVertices(v);
            m.SetUVs(0, uv);
            // Color32 (UNorm8 x 4), not float colors: Mesh-mode particles read the mesh's vertex color as 8-bit, so a float
            // color attribute arrives as garbage (white alpha-tent ring rendered flat dark blue, alpha about 0.25; the same
            // mesh on a MeshRenderer is correct). Observed on 6000.3.21f1, MeshParticleColorProbe, 2026-09-24.
            m.SetColors(c.ConvertAll(x => (Color32)x));
            m.SetTriangles(t, 0);
            m.RecalculateNormals();
            m.RecalculateBounds();
            return m;
        }

        /// <summary>Save (or replace the data of) a mesh asset at path; returns the asset.</summary>
        public static Mesh Save(Mesh m, string path)
        {
            System.IO.Directory.CreateDirectory(System.IO.Path.Combine(AgentJob.ProjectRoot, System.IO.Path.GetDirectoryName(path)));
            var existing = AssetDatabase.LoadAssetAtPath<Mesh>(path);
            if (existing != null)
            {
                existing.Clear();
                existing.SetVertices(m.vertices);
                existing.SetUVs(0, m.uv);
                existing.SetColors(new List<Color32>(m.colors32));
                existing.SetTriangles(m.triangles, 0);
                existing.RecalculateNormals();
                existing.RecalculateBounds();
                EditorUtility.SetDirty(existing);
                Object.DestroyImmediate(m);
                return existing;
            }
            AssetDatabase.CreateAsset(m, path);
            return m;
        }
    }
}
