// AgentKit.Pipeline v0.1 (scenario-unity-pipeline-automation, 2026-09-24). Scene edits an agent makes inside
// a user's editor: undoable as ONE named step, recorded on the exact component, prefab-correct, saved.
//
//   AgentKit.Pipeline.EditorEditJobs.PlacePrefabs  {scene?, label? | prefabs?, spacing, parent, save}
//   AgentKit.Pipeline.EditorEditJobs.UndoProof     {}   (the checks behind the rules below, run live)
//
// Rules (Freya Holmer, pZ45O2hg_30 [02:59:23]-[03:02:41]; 6.3 Scripting API Undo, SerializedObject,
// PrefabUtility): record Undo on the component that changes (the Transform, not the GameObject)
// BEFORE the change; structure through Undo.RegisterCreatedObjectUndo / AddComponent /
// SetTransformParent / DestroyObjectImmediate; group and name the step; direct edits of prefab
// instances also call PrefabUtility.RecordPrefabInstancePropertyModifications; SerializedObject
// does dirty + undo + prefab overrides by itself. Never open another scene over a dirty user scene.
// Run in Unity 6000.3.21f1 on 2026-09-24 (batch and through the AgentKit bridge of a resident editor).
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using Object = UnityEngine.Object;

namespace AgentKit.Pipeline
{
    public static class EditorEditJobs
    {
        // ================================================================ PlacePrefabs
        public static void PlacePrefabs()
        {
            AgentJob.Run(() =>
            {
                var scenePath = AgentJob.Str("scene");
                var active = SceneManager.GetActiveScene();
                Scene scene;
                if (string.IsNullOrEmpty(scenePath) || active.path == scenePath) scene = active;
                else
                {
                    if (!Application.isBatchMode && active.isDirty)
                        throw new InvalidOperationException("the open scene '" + active.path + "' has unsaved changes: save it or pass its path");
                    scene = File.Exists(scenePath) ? EditorSceneManager.OpenScene(scenePath, OpenSceneMode.Single)
                                                   : EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects, NewSceneMode.Single);
                }
                var prefabs = AgentJob.List("prefabs").Select(Convert.ToString).ToList();
                var label = AgentJob.Str("label");
                if (prefabs.Count == 0 && label != null)
                    prefabs = PropsManifest.Load().Where(p => p.status == "built" && p.labels.Contains(label)).Select(p => p.prefab).OrderBy(x => x, StringComparer.Ordinal).ToList();
                if (prefabs.Count == 0) throw new ArgumentException("no prefabs: pass prefabs [] or a label present in props_manifest.json");
                float spacing = AgentJob.Float("spacing", 3f);
                int cols = Math.Max(1, (int)Math.Ceiling(Math.Sqrt(prefabs.Count)));
                var r = PlaceCore(scene, prefabs, AgentJob.Str("parent", "Agent_Props"), spacing, cols, "Agent: place " + prefabs.Count + " props");
                if (AgentJob.Bool("save", true))
                {
                    if (string.IsNullOrEmpty(scene.path) && !string.IsNullOrEmpty(scenePath)) EditorSceneManager.SaveScene(scene, scenePath);
                    else EditorSceneManager.SaveScene(scene);
                }
                r["scene"] = scene.path;
                r["saved"] = !scene.isDirty;
                return r;
            });
        }

        /// <summary>Instantiates prefabs in a grid under one parent as a single undo step.</summary>
        public static Dictionary<string, object> PlaceCore(Scene scene, List<string> prefabPaths, string parentName, float spacing, int cols, string undoName)
        {
            Undo.IncrementCurrentGroup();
            int group = Undo.GetCurrentGroup();
            Undo.SetCurrentGroupName(undoName);
            var parent = scene.GetRootGameObjects().FirstOrDefault(g => g.name == parentName);
            if (parent == null)
            {
                parent = new GameObject(parentName);
                SceneManager.MoveGameObjectToScene(parent, scene);
                Undo.RegisterCreatedObjectUndo(parent, undoName);
            }
            int placed = 0, skipped = 0;
            var existing = new HashSet<string>(parent.GetComponentsInChildren<Transform>(true).Select(t => t.name));
            for (int i = 0; i < prefabPaths.Count; i++)
            {
                var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(prefabPaths[i]);
                if (prefab == null) { skipped++; continue; }
                if (existing.Contains(prefab.name)) { skipped++; continue; }           // idempotent: one instance per prefab
                var inst = (GameObject)PrefabUtility.InstantiatePrefab(prefab, scene);
                Undo.RegisterCreatedObjectUndo(inst, undoName);                    // undo removes it
                Undo.SetTransformParent(inst.transform, parent.transform, undoName);
                Undo.RecordObject(inst.transform, undoName);                       // the Transform, not the GameObject
                inst.transform.localPosition = new Vector3((i % cols) * spacing, 0f, (i / cols) * spacing);
                placed++;
            }
            Undo.CollapseUndoOperations(group);
            EditorSceneManager.MarkSceneDirty(scene);
            return new Dictionary<string, object>
            {
                { "placed", placed }, { "skipped", skipped }, { "parent", parentName }, { "undo_group", Undo.GetCurrentGroupName() },
                { "children", parent.transform.childCount },
            };
        }

        // ================================================================ BuildLineup
        /// <summary>Visual QA scene: every built prop of a label (or the given prefabs) on a grid next to a 1.8 m
        /// reference capsule, with a ground plane and two AgentView_ bookmarks (3/4 and top-down) framed on the
        /// grid, then AgentCapture.CaptureViews {scene, scene_bookmarks: true} renders them (graphics=True).
        /// What to look for: magenta (shader), black or inverted shading (normal maps), props lying on their
        /// side (axis), giants and dwarfs next to the capsule (units), floating props (pivot).</summary>
        public static void BuildLineup()
        {
            AgentJob.Run(() =>
            {
                var scenePath = AgentJob.Str("scene", "Assets/Scenes/AgentLineup.unity");
                var label = AgentJob.Str("label");
                var prefabs = AgentJob.List("prefabs").Select(Convert.ToString).ToList();
                if (prefabs.Count == 0)
                    prefabs = PropsManifest.Load().Where(p => p.status == "built" && (label == null || p.labels.Contains(label)))
                        .Select(p => p.prefab).OrderBy(x => x, StringComparer.Ordinal).Take(AgentJob.Int("max", 64)).ToList();
                if (prefabs.Count == 0) throw new ArgumentException("no prefabs for the lineup");
                var scene = EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects, NewSceneMode.Single);
                float spacing = AgentJob.Float("spacing", 2.5f);
                int cols = Math.Max(1, (int)Math.Ceiling(Math.Sqrt(prefabs.Count)));
                var r = PlaceCore(scene, prefabs, "Agent_Lineup", spacing, cols, "Agent: lineup");
                int rows = Mathf.CeilToInt(prefabs.Count / (float)cols);
                var capsule = GameObject.CreatePrimitive(PrimitiveType.Capsule);   // 2 m primitive scaled to 1.8 m
                capsule.name = "Agent_Reference_1.8m";
                capsule.transform.localScale = new Vector3(0.5f, 0.9f, 0.5f);
                capsule.transform.position = new Vector3(-spacing, 0.9f, 0f);
                // frame the grid AND the capsule: bounding box -> bounding sphere -> camera distance for the FOV
                var bounds = new Bounds(capsule.transform.position, Vector3.one);
                foreach (var rd in scene.GetRootGameObjects().SelectMany(g => g.GetComponentsInChildren<Renderer>())) bounds.Encapsulate(rd.bounds);
                var ground = GameObject.CreatePrimitive(PrimitiveType.Plane);
                ground.name = "Agent_Ground";
                ground.transform.position = new Vector3(bounds.center.x, 0f, bounds.center.z);
                ground.transform.localScale = new Vector3(bounds.size.x / 10f + 0.6f, 1f, bounds.size.z / 10f + 0.6f);
                float radius = bounds.extents.magnitude;
                const float fov = 45f;
                float dist = radius / Mathf.Sin(fov * 0.5f * Mathf.Deg2Rad) * 1.02f;
                var dir = new Vector3(-0.55f, 0.6f, -0.75f).normalized;
                AgentCapture.SaveBookmark("ThreeQuarter", bounds.center + dir * dist, bounds.center, fov);
                AgentCapture.SaveBookmark("TopDown", bounds.center + new Vector3(0f, dist, -0.01f), bounds.center, fov);
                r["rows"] = rows;
                r["bounds_size"] = bounds.size;
                EditorSceneManager.SaveScene(scene, scenePath);
                r["scene"] = scenePath;
                r["prefabs"] = prefabs.Count;
                return r;
            });
        }

        // ================================================================ UndoProof
        /// <summary>Runs the Undo, dirty and prefab-override rules as checks and returns what Unity did.
        /// Needs one built prefab (props_manifest.json) and a writable scratch scene path.</summary>
        public static void UndoProof()
        {
            AgentJob.Run(() =>
            {
                var scratch = AgentJob.Str("scene", "Assets/Scenes/AgentUndoProof.unity");
                var prefabPath = AgentJob.Str("prefab") ?? PropsManifest.Load().Where(p => p.status == "built").Select(p => p.prefab).OrderBy(x => x, StringComparer.Ordinal).FirstOrDefault();
                var prefab = prefabPath != null ? AssetDatabase.LoadAssetAtPath<GameObject>(prefabPath) : null;
                if (prefab == null) throw new InvalidOperationException("no built prefab to test with");
                var res = new Dictionary<string, object> { { "prefab", prefabPath } };
                var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
                EditorSceneManager.SaveScene(scene, scratch);

                // 1. placement of 3 instances as one step, then one PerformUndo
                PlaceCore(scene, new List<string> { prefabPath }, "Agent_Props", 3f, 2, "Agent: place");
                int afterPlace = CountRoots(scene);
                Undo.PerformUndo();
                res["place_roots_before_undo"] = afterPlace;
                res["place_roots_after_undo"] = CountRoots(scene);

                // 2. RecordObject on the GameObject vs on the Transform
                var go = new GameObject("Agent_Target");                           // not registered: only the move is on the stack
                Undo.IncrementCurrentGroup();
                Undo.RecordObject(go, "move (wrong object)");
                go.transform.position = new Vector3(5, 0, 0);
                Undo.FlushUndoRecordObjects();
                Undo.PerformUndo();
                res["record_gameobject_then_undo_x"] = go ? go.transform.position.x : float.NaN;   // 5: not restored
                if (go == null) go = new GameObject("Agent_Target");
                go.transform.position = Vector3.zero;
                Undo.IncrementCurrentGroup();
                Undo.RecordObject(go.transform, "move (transform)");
                go.transform.position = new Vector3(5, 0, 0);
                Undo.FlushUndoRecordObjects();
                Undo.PerformUndo();
                res["record_transform_then_undo_x"] = go ? go.transform.position.x : float.NaN;    // 0: restored

                // 3. SerializedObject edit: undo recorded without any Undo call
                Undo.IncrementCurrentGroup();
                var so = new SerializedObject(go.transform);
                so.FindProperty("m_LocalPosition").vector3Value = new Vector3(0, 7, 0);
                bool applied = so.ApplyModifiedProperties();
                res["serialized_applied"] = applied;
                res["serialized_y"] = go.transform.localPosition.y;
                Undo.FlushUndoRecordObjects();
                Undo.PerformUndo();
                res["serialized_then_undo_y"] = go.transform.localPosition.y;
                res["scene_dirty_after_edits"] = scene.isDirty;

                // 4. prefab instance overrides: recorded vs direct, then save + reopen
                var a = (GameObject)PrefabUtility.InstantiatePrefab(prefab, scene);
                a.name = "Agent_Recorded";
                var b = (GameObject)PrefabUtility.InstantiatePrefab(prefab, scene);
                b.name = "Agent_Direct";
                var boxA = a.GetComponent<BoxCollider>();
                var boxB = b.GetComponent<BoxCollider>();
                var baseSize = boxA.size;
                Undo.RecordObject(boxA, "resize (recorded)");
                boxA.size = baseSize * 2f;
                PrefabUtility.RecordPrefabInstancePropertyModifications(boxA);
                boxB.size = baseSize * 3f;                                          // no Undo, no Record, no SetDirty
                res["override_recorded_has_mod"] = HasMod(a, "m_Size");
                res["override_direct_has_mod"] = HasMod(b, "m_Size");
                EditorSceneManager.MarkSceneDirty(scene);
                EditorSceneManager.SaveScene(scene);
                var reopened = EditorSceneManager.OpenScene(scratch, OpenSceneMode.Single);
                var ra = reopened.GetRootGameObjects().First(g => g.name == "Agent_Recorded").GetComponent<BoxCollider>();
                var rb = reopened.GetRootGameObjects().First(g => g.name == "Agent_Direct").GetComponent<BoxCollider>();
                res["reopen_recorded_ratio"] = Math.Round(ra.size.x / baseSize.x, 3);   // 2: kept
                res["reopen_direct_ratio"] = Math.Round(rb.size.x / baseSize.x, 3);     // observed value recorded by the live test
                res["base_size_x"] = baseSize.x;

                // 5. unregistered vs registered edits when the prefab ASSET changes before the scene is saved
                var c = (GameObject)PrefabUtility.InstantiatePrefab(prefab, reopened);
                c.name = "Agent_DirectBeforeMerge";
                var d = (GameObject)PrefabUtility.InstantiatePrefab(prefab, reopened);
                d.name = "Agent_RecordedBeforeMerge";
                var boxC = c.GetComponent<BoxCollider>();
                var boxD = d.GetComponent<BoxCollider>();
                boxC.size = baseSize * 3f;                                          // direct, unregistered
                Undo.RecordObject(boxD, "resize (recorded)");
                boxD.size = baseSize * 2f;
                PrefabUtility.RecordPrefabInstancePropertyModifications(boxD);
                ToggleTrigger(prefabPath, true);                                    // the asset changes (unrelated property)
                res["after_asset_change_direct_ratio"] = Math.Round(boxC.size.x / baseSize.x, 3);
                res["after_asset_change_recorded_ratio"] = Math.Round(boxD.size.x / baseSize.x, 3);
                res["after_asset_change_trigger_propagated"] = boxC.isTrigger;
                ToggleTrigger(prefabPath, false);                                   // restore the asset
                EditorSceneManager.MarkSceneDirty(reopened);
                EditorSceneManager.SaveScene(reopened);
                return res;
            });
        }

        static void ToggleTrigger(string prefabPath, bool on)
        {
            var root = PrefabUtility.LoadPrefabContents(prefabPath);
            try
            {
                var so = new SerializedObject(root.GetComponent<BoxCollider>());
                so.FindProperty("m_IsTrigger").boolValue = on;
                so.ApplyModifiedPropertiesWithoutUndo();
                PrefabUtility.SaveAsPrefabAsset(root, prefabPath);
            }
            finally { PrefabUtility.UnloadPrefabContents(root); }
        }

        static int CountRoots(Scene s) => s.GetRootGameObjects().Sum(g => g.GetComponentsInChildren<Transform>(true).Length);

        static bool HasMod(GameObject instance, string prop)
        {
            var mods = PrefabUtility.GetPropertyModifications(instance);
            return mods != null && mods.Any(m => m.propertyPath.StartsWith(prop, StringComparison.Ordinal) && m.target is BoxCollider);
        }
    }
}
