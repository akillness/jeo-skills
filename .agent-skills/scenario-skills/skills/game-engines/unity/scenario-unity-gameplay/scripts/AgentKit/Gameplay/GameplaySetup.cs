// scenario-unity-gameplay AgentKit jobs (Unity Expert Skills v0.1, 2026-09-24): project physics setup and
// read-back. Copied to Assets/Editor/AgentKit/Gameplay/ by ut_gameplay.install(P).
//   ut_run.run_method(P, "AgentKit.Gameplay.GameplaySetup.ConfigurePhysics", {...})
//   ut_run.run_method(P, "AgentKit.Gameplay.GameplaySetup.ReadPhysicsSettings")   # in a NEW process
// Layers are written through SerializedObject on ProjectSettings/TagManager.asset and the collision
// matrix through Physics.IgnoreLayerCollision (persists: read back from a second batch process).
// Time values MUST go through SerializedObject on TimeManager.asset: `Time.maximumDeltaTime = 0.1`
// from an editor job changed the running editor only and was 0.333 again in the next process
// (observed 2026-09-24). Fixed Timestep is stored as a rational: "Fixed Timestep.m_Count" ticks at
// m_Rate = 141,120,000 per second (default count 2,822,399 = 0.019999992 s).
using System;
using System.Collections.Generic;
using System.Linq;
using UnityEditor;
using UnityEngine;

namespace AgentKit.Gameplay
{
    public static class GameplaySetup
    {
        /// <summary>Default gameplay layers (user layers 8+). Override with the "layers" arg.</summary>
        public static readonly Dictionary<string, int> DefaultLayers = new Dictionary<string, int>
        {
            { "Environment", 8 }, { "Player", 9 }, { "Enemy", 10 }, { "Projectile", 11 },
        };

        /// <summary>Pairs that never interact in a typical shooter (the matrix is a performance and a
        /// correctness tool: 6.3 Manual "Use the layer collision matrix to reduce overlaps").</summary>
        public static readonly string[][] DefaultIgnorePairs =
        {
            new[] { "Projectile", "Projectile" },
            new[] { "Enemy", "Enemy" },            // agents avoid each other through RVO, not colliders
        };

        public static SerializedObject SettingsObject(string assetPath)
        {
            var objs = AssetDatabase.LoadAllAssetsAtPath(assetPath);
            if (objs == null || objs.Length == 0) throw new InvalidOperationException("cannot load " + assetPath);
            return new SerializedObject(objs[0]);
        }

        /// <summary>Idempotent: names user layers; refuses to rename a layer already used by another name.</summary>
        public static Dictionary<string, object> EnsureLayers(Dictionary<string, int> layers)
        {
            var tm = SettingsObject("ProjectSettings/TagManager.asset");
            var arr = tm.FindProperty("layers");
            var written = new List<object>();
            foreach (var kv in layers)
            {
                if (kv.Value < 3 || kv.Value > 31 || kv.Value == 4 || kv.Value == 5) throw new ArgumentException("layer index not a user layer: " + kv.Value);
                var p = arr.GetArrayElementAtIndex(kv.Value);
                if (p.stringValue == kv.Key) continue;
                if (!string.IsNullOrEmpty(p.stringValue)) throw new InvalidOperationException($"layer {kv.Value} already named '{p.stringValue}', wanted '{kv.Key}'");
                p.stringValue = kv.Key;
                written.Add(kv.Key + "=" + kv.Value);
            }
            tm.ApplyModifiedPropertiesWithoutUndo();
            return new Dictionary<string, object> { { "written", written } };
        }

        public static int Layer(string name)
        {
            int i = LayerMask.NameToLayer(name);
            if (i < 0 && DefaultLayers.TryGetValue(name, out var d)) i = d;
            if (i < 0) throw new ArgumentException("unknown layer " + name);
            return i;
        }

        public static void ConfigurePhysics()
        {
            AgentJob.Run(() =>
            {
                var layers = new Dictionary<string, int>(DefaultLayers);
                foreach (var kv in AgentJob.Dict("layers")) layers[kv.Key] = (int)AgentJson.ToDouble(kv.Value);
                var lr = EnsureLayers(layers);

                var pairs = new List<string[]>();
                if (AgentJob.Has("ignore_pairs"))
                {
                    foreach (var o in AgentJob.List("ignore_pairs"))
                        if (o is List<object> l && l.Count == 2) pairs.Add(new[] { l[0].ToString(), l[1].ToString() });
                }
                else pairs.AddRange(DefaultIgnorePairs);
                foreach (var pr in pairs) Physics.IgnoreLayerCollision(layers[pr[0]], layers[pr[1]], true);

                var tmo = SettingsObject("ProjectSettings/TimeManager.asset");
                if (AgentJob.Has("fixed_dt"))
                {
                    var rate = tmo.FindProperty("Fixed Timestep.m_Rate");
                    double ticksPerSecond = (double)rate.FindPropertyRelative("m_Numerator").longValue / System.Math.Max(1, rate.FindPropertyRelative("m_Denominator").longValue);
                    tmo.FindProperty("Fixed Timestep.m_Count").longValue = (long)System.Math.Round(AgentJob.Float("fixed_dt") * ticksPerSecond);
                }
                if (AgentJob.Has("max_dt")) tmo.FindProperty("Maximum Allowed Timestep").floatValue = AgentJob.Float("max_dt");
                tmo.ApplyModifiedPropertiesWithoutUndo();
                // Physics toggles through the asset as well (Physics.autoSyncTransforms is deprecated in 6.3).
                var dm = SettingsObject("ProjectSettings/DynamicsManager.asset");
                dm.FindProperty("m_AutoSyncTransforms").boolValue = false;
                dm.FindProperty("m_ReuseCollisionCallbacks").boolValue = AgentJob.Bool("reuse_collision_callbacks", true);
                if (AgentJob.Has("queries_hit_triggers")) dm.FindProperty("m_QueriesHitTriggers").boolValue = AgentJob.Bool("queries_hit_triggers");
                dm.ApplyModifiedPropertiesWithoutUndo();
                AssetDatabase.SaveAssets();
                var r = Read(layers);
                r["layers_written"] = lr["written"];
                r["ignore_pairs"] = pairs.Select(p => p[0] + "x" + p[1]).ToList();
                return r;
            });
        }

        public static void ReadPhysicsSettings()
        {
            AgentJob.Run(() => Read(new Dictionary<string, int>(DefaultLayers)));
        }

        static Dictionary<string, object> Read(Dictionary<string, int> layers)
        {
            var dm = SettingsObject("ProjectSettings/DynamicsManager.asset");
            var matrix = new List<object>();
            var names = layers.OrderBy(k => k.Value).ToList();
            for (int i = 0; i < names.Count; i++)
                for (int j = i; j < names.Count; j++)
                    matrix.Add(new Dictionary<string, object>
                    {
                        { "pair", names[i].Key + "x" + names[j].Key },
                        { "collide", !Physics.GetIgnoreLayerCollision(names[i].Value, names[j].Value) },
                    });
            return new Dictionary<string, object>
            {
                { "layer_names", names.Select(k => k.Value + ":" + LayerMask.LayerToName(k.Value)).ToList() },
                { "matrix", matrix },
                { "fixed_dt", Time.fixedDeltaTime }, { "max_dt", Time.maximumDeltaTime },
                { "queries_hit_triggers", Physics.queriesHitTriggers },
                { "reuse_collision_callbacks", Physics.reuseCollisionCallbacks },
                { "auto_sync_transforms", dm.FindProperty("m_AutoSyncTransforms").boolValue },
                { "simulation_mode", Physics.simulationMode.ToString() },
                { "default_solver_iterations", Physics.defaultSolverIterations },
                { "sleep_threshold", Physics.sleepThreshold },
                { "broadphase_type", dm.FindProperty("m_BroadphaseType").intValue },
            };
        }
    }
}
