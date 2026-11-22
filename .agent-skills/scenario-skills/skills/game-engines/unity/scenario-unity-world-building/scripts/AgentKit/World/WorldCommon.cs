// scenario-unity-world-building v0.1 (2026-09-24). Shared editor helpers for the world-building jobs:
// folders, URP materials, procedural textures, mesh assets, static flags, scene helpers.
// Installed by ut_world.install(P) into Assets/Editor/AgentKit/World/ (compiles into
// Assembly-CSharp-Editor next to the core AgentKit). Run in Unity 6000.3.21f1 on 2026-09-24.
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;

namespace AgentKit.World
{
    public static class WorldCommon
    {
        public const string Root = "Assets/World";

        public static string EnsureFolder(string path)
        {
            path = path.Replace('\\', '/').TrimEnd('/');
            if (AssetDatabase.IsValidFolder(path)) return path;
            var parent = Path.GetDirectoryName(path).Replace('\\', '/');
            EnsureFolder(parent);
            AssetDatabase.CreateFolder(parent, Path.GetFileName(path));
            return path;
        }

        /// <summary>Get-or-create a URP Lit material asset (idempotent: same path, same asset).</summary>
        public static Material LitMaterial(string path, Color color, Texture2D tex = null, float smoothness = 0.2f,
                                           bool twoSided = false, bool instancing = true)
        {
            EnsureFolder(Path.GetDirectoryName(path));
            var mat = AssetDatabase.LoadAssetAtPath<Material>(path);
            var shader = Shader.Find("Universal Render Pipeline/Lit");
            if (shader == null) throw new System.InvalidOperationException("URP Lit shader not found (is URP the active pipeline?)");
            if (mat == null) { mat = new Material(shader); AssetDatabase.CreateAsset(mat, path); }
            mat.shader = shader;
            mat.SetColor("_BaseColor", color);
            if (tex != null) mat.SetTexture("_BaseMap", tex);
            mat.SetFloat("_Smoothness", smoothness);
            mat.SetFloat("_Cull", twoSided ? (float)CullMode.Off : (float)CullMode.Back);
            mat.doubleSidedGI = twoSided;
            mat.enableInstancing = instancing;
            EditorUtility.SetDirty(mat);
            return mat;
        }

        /// <summary>Noise-tinted tiling texture written as PNG and imported (repeat wrap, mips, sRGB).
        /// Placeholder albedo for layout work; production albedo comes from scenario-textures or art.</summary>
        public static Texture2D NoiseTexture(string path, Color a, Color b, float freq, int seed, int size = 512, float grain = 0.15f)
        {
            if (AssetDatabase.LoadAssetAtPath<Texture2D>(path) == null)
            {
                EnsureFolder(Path.GetDirectoryName(path));
                var t = new Texture2D(size, size, TextureFormat.RGBA32, false);
                var px = new Color[size * size];
                var rng = new System.Random(seed);
                float ox = seed * 13.1f, oz = seed * 7.7f;
                for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                {
                    // tileable: sample noise on a torus-like wrap by blending the four quadrants
                    float u = (float)x / size, v = (float)y / size;
                    float n = TileNoise(u, v, freq, ox, oz) * 0.75f + TileNoise(u, v, freq * 4f, ox + 50, oz + 50) * 0.25f;
                    float g = (float)rng.NextDouble() * grain - grain * 0.5f;
                    var c = Color.Lerp(a, b, Mathf.Clamp01(n + g));
                    c.a = 1f;
                    px[y * size + x] = c;
                }
                t.SetPixels(px);
                t.Apply();
                File.WriteAllBytes(path, t.EncodeToPNG());
                Object.DestroyImmediate(t);
                AssetDatabase.ImportAsset(path, ImportAssetOptions.ForceSynchronousImport);
                var imp = (TextureImporter)AssetImporter.GetAtPath(path);
                imp.wrapMode = TextureWrapMode.Repeat;
                imp.mipmapEnabled = true;
                imp.sRGBTexture = true;
                imp.SaveAndReimport();
            }
            return AssetDatabase.LoadAssetAtPath<Texture2D>(path);
        }

        static float TileNoise(float u, float v, float f, float ox, float oz)
        {
            float a = Mathf.PerlinNoise(ox + u * f, oz + v * f);
            float b = Mathf.PerlinNoise(ox + (u - 1) * f, oz + v * f);
            float c = Mathf.PerlinNoise(ox + u * f, oz + (v - 1) * f);
            float d = Mathf.PerlinNoise(ox + (u - 1) * f, oz + (v - 1) * f);
            float ab = Mathf.Lerp(a, b, u), cd = Mathf.Lerp(c, d, u);
            return Mathf.Lerp(ab, cd, v);
        }

        /// <summary>Save a copy of a mesh as an asset (so prefabs and scenes reference a real asset).</summary>
        public static Mesh SaveMesh(Mesh m, string path)
        {
            EnsureFolder(Path.GetDirectoryName(path));
            var existing = AssetDatabase.LoadAssetAtPath<Mesh>(path);
            var copy = Object.Instantiate(m);
            copy.name = Path.GetFileNameWithoutExtension(path);
            if (existing != null) { EditorUtility.CopySerialized(copy, existing); Object.DestroyImmediate(copy); return existing; }
            AssetDatabase.CreateAsset(copy, path);
            return copy;
        }

        public static void SetStaticRecursive(GameObject go, StaticEditorFlags flags)
        {
            foreach (var t in go.GetComponentsInChildren<Transform>(true))
                GameObjectUtility.SetStaticEditorFlags(t.gameObject, flags);
        }

        public static GameObject GetOrCreate(string name, Transform parent = null)
        {
            GameObject go = null;
            if (parent != null) { var t = parent.Find(name); if (t) go = t.gameObject; }
            else
                foreach (var r in SceneManager.GetActiveScene().GetRootGameObjects())
                    if (r.name == name) { go = r; break; }
            if (go == null) { go = new GameObject(name); if (parent) go.transform.SetParent(parent, false); }
            return go;
        }

        /// <summary>Destroy a root object by name if present (idempotent regeneration of generated content).</summary>
        public static void RemoveRoot(string name)
        {
            foreach (var r in SceneManager.GetActiveScene().GetRootGameObjects())
                if (r.name == name) Object.DestroyImmediate(r);
        }

        public static Scene OpenScene(string path)
        {
            if (!File.Exists(AgentJob.ResolvePath(path))) throw new FileNotFoundException("scene not found: " + path);
            return EditorSceneManager.OpenScene(path, OpenSceneMode.Single);
        }

        public static Terrain FindTerrain()
        {
            var t = Object.FindFirstObjectByType<Terrain>();
            if (t == null) throw new System.InvalidOperationException("no Terrain in the open scene (run WorldTerrain.BuildIsland first)");
            return t;
        }

        public static Vector3 Ground(Terrain t, float x, float z) =>
            new Vector3(x, t.SampleHeight(new Vector3(x, 0, z)) + t.transform.position.y, z);

        public static List<object> V(Vector3 v) => new List<object> { System.Math.Round(v.x, 3), System.Math.Round(v.y, 3), System.Math.Round(v.z, 3) };

        public static string PathOf(Transform t)
        {
            var parts = new List<string>();
            for (var c = t; c != null; c = c.parent) parts.Insert(0, c.name);
            return t.gameObject.scene.name + ":" + string.Join("/", parts);
        }

        public static void Save(Scene s)
        {
            EditorSceneManager.MarkSceneDirty(s);
            if (!EditorSceneManager.SaveScene(s)) throw new System.InvalidOperationException("SaveScene failed: " + s.path);
            AssetDatabase.SaveAssets();
        }
    }
}
