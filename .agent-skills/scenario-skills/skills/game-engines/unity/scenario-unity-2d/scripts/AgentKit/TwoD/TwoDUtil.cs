// AgentKit 2D v0.1 (scenario-unity-2d skill, 2026-09-24). Small helpers shared by the TwoD jobs.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace AgentKit.TwoD
{
    public static class TwoDUtil
    {
        /// <summary>AgentJob.List/Dict return an EMPTY collection when the key is missing (never null),
        /// so "?? default" never fires (observed: a silent audit). Use these for defaults.</summary>
        public static List<object> ListOr(string key, params object[] def)
        {
            var l = AgentJob.List(key);
            return l.Count > 0 ? l : new List<object>(def);
        }

        public static Dictionary<string, object> DictOr(string key, Dictionary<string, object> def)
        {
            var d = AgentJob.Dict(key);
            return d.Count > 0 ? d : def;
        }

        public static void EnsureFolder(string assetFolder)
        {
            assetFolder = assetFolder.Replace('\\', '/').TrimEnd('/');
            if (AssetDatabase.IsValidFolder(assetFolder)) return;
            var parent = Path.GetDirectoryName(assetFolder)?.Replace('\\', '/');
            if (!string.IsNullOrEmpty(parent) && !AssetDatabase.IsValidFolder(parent)) EnsureFolder(parent);
            AssetDatabase.CreateFolder(parent, Path.GetFileName(assetFolder));
        }

        /// <summary>All sprites of a texture asset, in slice order when names end with a number.</summary>
        public static List<Sprite> Sprites(string texturePath)
        {
            return AssetDatabase.LoadAllAssetsAtPath(texturePath).OfType<Sprite>()
                .OrderBy(s => s.name, StringComparer.Ordinal).ToList();
        }

        public static Sprite Sprite(string texturePath, string name = null)
        {
            var all = Sprites(texturePath);
            if (all.Count == 0) throw new InvalidOperationException("no sprite in " + texturePath + " (imported as Sprite?)");
            if (name == null) return all[0];
            var s = all.FirstOrDefault(x => x.name == name);
            if (s == null) throw new InvalidOperationException("sprite '" + name + "' not in " + texturePath + " (has: " + string.Join(",", all.Select(x => x.name)) + ")");
            return s;
        }

        public static Color ToColor(object o, Color def)
        {
            if (o is List<object> l && l.Count >= 3)
                return new Color((float)AgentJson.ToDouble(l[0]), (float)AgentJson.ToDouble(l[1]), (float)AgentJson.ToDouble(l[2]),
                    l.Count > 3 ? (float)AgentJson.ToDouble(l[3]) : 1f);
            if (o is string s && ColorUtility.TryParseHtmlString(s, out var c)) return c;
            return def;
        }

        public static Vector2 ToVector2(object o, Vector2 def)
        {
            if (o is List<object> l && l.Count >= 2) return new Vector2((float)AgentJson.ToDouble(l[0]), (float)AgentJson.ToDouble(l[1]));
            return def;
        }

        /// <summary>Open a scene, or create and save it when it does not exist yet.</summary>
        public static Scene OpenOrCreateScene(string path, bool fresh = false)
        {
            if (!fresh && File.Exists(Path.Combine(AgentJob.ProjectRoot, path)))
                return EditorSceneManager.OpenScene(path, OpenSceneMode.Single);
            EnsureFolder(Path.GetDirectoryName(path));
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            EditorSceneManager.SaveScene(scene, path);
            return scene;
        }

        public static GameObject GetOrCreate(string name, Transform parent = null)
        {
            GameObject go = null;
            if (parent != null) { var t = parent.Find(name); if (t != null) go = t.gameObject; }
            else go = SceneManager.GetActiveScene().GetRootGameObjects().FirstOrDefault(g => g.name == name);
            if (go == null)
            {
                go = new GameObject(name);
                if (parent != null) go.transform.SetParent(parent, false);
            }
            return go;
        }

        public static T GetOrAdd<T>(GameObject go) where T : Component
        {
            var c = go.GetComponent<T>();
            return c != null ? c : go.AddComponent<T>();
        }

        public static string Rel(string absOrRel)
        {
            var root = AgentJob.ProjectRoot.Replace('\\', '/') + "/";
            var p = absOrRel.Replace('\\', '/');
            return p.StartsWith(root) ? p.Substring(root.Length) : p;
        }
    }
}
