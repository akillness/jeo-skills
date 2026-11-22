// PlayMode tests: every gameplay prefab must work alone in an empty scene (Ryan Hipple, raQ3iHhE_Kk
// [00:16:29]: singleton chains made his team rebuild the whole game inside a debug scene), and running it
// must leave every ScriptableObject definition untouched IN MEMORY.
// Why in memory: a Play-mode write to an SO stays in Editor memory with IsDirty false and never reaches the
// .asset, even after AssetDatabase.SaveAssets() (observed, procedures.md A4), so a file hash taken by
// another process cannot see it. EditorJsonUtility.ToJson of the loaded asset, in the process that plays,
// does (Code Monkey, 5a-ztc5gcFw, Agent translation). The same guard for whole scenes: ArchPlayMode "so_guard".
// Folders: Assets/Game/Prefabs and Assets/Game/Data (change the constants). Editor only (AssetDatabase).
// scenario-unity-architecture skill template, run in Unity 6000.3.21f1 on 2026-09-24 (procedures.md A6, A11).
using System.Collections;
using System.Collections.Generic;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;

namespace Game.Tests
{
    public class PrefabIsolationTests
    {
        const string PrefabFolder = "Assets/Game/Prefabs";
        const string DefinitionFolder = "Assets/Game/Data";

        [UnityTest]
        public IEnumerator EveryPrefab_RunsAloneInAnEmptyScene()
        {
#if UNITY_EDITOR
            var guids = UnityEditor.AssetDatabase.FindAssets("t:Prefab", new[] { PrefabFolder });
            if (guids.Length == 0) Assert.Ignore("no prefabs under " + PrefabFolder);
            foreach (var guid in guids)
            {
                var path = UnityEditor.AssetDatabase.GUIDToAssetPath(guid);
                var prefab = UnityEditor.AssetDatabase.LoadAssetAtPath<GameObject>(path);
                var scene = SceneManager.CreateScene("Isolation_" + prefab.name);
                SceneManager.SetActiveScene(scene);
                var go = Object.Instantiate(prefab);
                for (int i = 0; i < 5; i++) yield return null;       // Awake, OnEnable, Start, a few Updates
                LogAssert.NoUnexpectedReceived();                     // any error or exception fails the test
                Object.Destroy(go);
                yield return SceneManager.UnloadSceneAsync(scene);
                Debug.Log("[PrefabIsolation] ok: " + path);
            }
#else
            Assert.Ignore("needs the Editor (AssetDatabase)");
            yield break;
#endif
        }

#if UNITY_EDITOR
        static Dictionary<string, string> DefinitionsInMemory()
        {
            var d = new Dictionary<string, string>();
            foreach (var guid in UnityEditor.AssetDatabase.FindAssets("t:ScriptableObject", new[] { DefinitionFolder }))
            {
                var p = UnityEditor.AssetDatabase.GUIDToAssetPath(guid);
                var so = UnityEditor.AssetDatabase.LoadAssetAtPath<ScriptableObject>(p);
                if (so != null) d[p] = UnityEditor.EditorJsonUtility.ToJson(so);
            }
            return d;
        }
#endif

        [UnityTest]
        public IEnumerator EveryPrefab_LeavesDefinitionsUntouchedInMemory()
        {
#if UNITY_EDITOR
            LogAssert.ignoreFailingMessages = true;                  // this test judges SO writes only
            var guids = UnityEditor.AssetDatabase.FindAssets("t:Prefab", new[] { PrefabFolder });
            if (guids.Length == 0) Assert.Ignore("no prefabs under " + PrefabFolder);
            var writes = new List<string>();
            foreach (var guid in guids)
            {
                var path = UnityEditor.AssetDatabase.GUIDToAssetPath(guid);
                var prefab = UnityEditor.AssetDatabase.LoadAssetAtPath<GameObject>(path);
                var before = DefinitionsInMemory();
                var scene = SceneManager.CreateScene("SoGuard_" + prefab.name);
                SceneManager.SetActiveScene(scene);
                var go = Object.Instantiate(prefab);
                for (int i = 0; i < 5; i++) yield return null;
                var after = DefinitionsInMemory();
                foreach (var kv in before)
                    if (after.TryGetValue(kv.Key, out var now) && now != kv.Value) writes.Add(prefab.name + " wrote " + kv.Key);
                Object.Destroy(go);
                yield return SceneManager.UnloadSceneAsync(scene);
            }
            LogAssert.ignoreFailingMessages = false;
            Assert.IsEmpty(writes, "runtime writes to ScriptableObject definitions (they persist in the Editor and vanish in builds): " + string.Join("; ", writes));
#else
            Assert.Ignore("needs the Editor (AssetDatabase, EditorJsonUtility)");
            yield break;
#endif
        }
    }
}
