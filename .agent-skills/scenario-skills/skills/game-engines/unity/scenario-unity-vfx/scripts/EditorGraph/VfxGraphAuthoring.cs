// AgentKit.Vfx v0.1 (scenario-unity-vfx, 2026-09-24). UNSUPPORTED, VERSION-LOCKED graph authoring for VFX Graph 17.3.
//
// VFX Graph has no public authoring API: its model classes (VFXGraph, VFXParameter, VFXBasicEvent,
// VFXDataParticle, blocks) are internal to Unity.VisualEffectGraph.Editor. That package declares
// [InternalsVisibleTo("Unity.Testing.VisualEffectGraph.EditorTests")] (Editor/PackageInfo.cs), so an
// editor-only asmdef with exactly that name compiles against the internal model, which is what this
// folder does. Use it only when a human cannot do the GUI step (Blackboard + > Float > Exposed; right-click
// > Create Node > Context > Event): it can break on any VFX Graph update, and a project that also installs
// Unity's real VFX test assembly would get a name clash. Never edit the .vfx YAML by hand instead.
// Called by AgentKit.Vfx.VfxGraphJobs through reflection (no compile-time dependency from AgentKit).
// Run in Unity 6000.3.21f1 (VFX Graph 17.3.0) on 2026-09-24: tests/code/unity-vfx/test_live_vfxgraph.py.
using System;
using System.Collections.Generic;
using System.Linq;
using UnityEditor;
using UnityEditor.VFX;
using UnityEngine;
using UnityEngine.VFX;

namespace AgentKit.VfxGraph
{
    public static class VfxGraphAuthoring
    {
        static VFXGraph Graph(string assetPath)
        {
            var resource = VisualEffectResource.GetResourceAtPath(assetPath);
            if (resource == null) throw new ArgumentException("not a VFX Graph asset: " + assetPath);
            return resource.GetOrCreateGraph();
        }

        /// <summary>Describe systems, contexts and blocks (type names and input slot names) of a graph.</summary>
        public static Dictionary<string, object> Describe(string assetPath)
        {
            var g = Graph(assetPath);
            var contexts = new List<object>();
            foreach (var c in g.children.OfType<VFXContext>())
            {
                contexts.Add(new Dictionary<string, object>
                {
                    { "type", c.GetType().Name }, { "label", c.label },
                    { "blocks", c.children.Select(b => b.GetType().Name + "(" + string.Join(",", ((VFXBlock)b).inputSlots.Select(s => s.name)) + ")").ToList() },
                    { "capacity", c.GetData() is VFXDataParticle d ? (object)d.GetSettingValue("capacity") : null },
                });
            }
            var parameters = g.children.OfType<VFXParameter>().Select(p => (object)(p.exposedName + ":" + p.type.Name + (p.exposed ? ":exposed" : ""))).ToList();
            return new Dictionary<string, object> { { "contexts", contexts }, { "parameters", parameters } };
        }

        /// <summary>Add an exposed float property linked to an input slot of a block, an Event context linked
        /// to the Start flow of the first spawner (which removes the implicit OnPlay binding on that port,
        /// VFX Graph 17.3 manual), optionally set every particle system's capacity, recompile and save.
        /// blockType e.g. "VFXSpawnerConstantRate", slotName e.g. "Rate".</summary>
        public static Dictionary<string, object> AddExposedFloatAndEvent(string assetPath, string propertyName, float value,
                                                                         string blockType, string slotName, string eventName, int capacity)
        {
            var g = Graph(assetPath);
            var spawner = g.children.OfType<VFXBasicSpawner>().FirstOrDefault();
            if (spawner == null) throw new InvalidOperationException("no spawner context in " + assetPath);

            // 1. exposed float parameter -> block input slot
            var block = g.children.OfType<VFXContext>().SelectMany(c => c.children).OfType<VFXBlock>()
                         .FirstOrDefault(b => b.GetType().Name == blockType);
            if (block == null) throw new InvalidOperationException("block " + blockType + " not found");
            var slot = block.inputSlots.FirstOrDefault(s => s.name == slotName);
            if (slot == null) throw new InvalidOperationException("slot " + slotName + " not found on " + blockType);
            var existing = g.children.OfType<VFXParameter>().FirstOrDefault(p => p.exposedName == propertyName);
            var param = existing;
            if (param == null)
            {
                var desc = VFXLibrary.GetParameters().First(d => d.modelType == typeof(float));
                param = desc.CreateInstance();
                g.AddChild(param);
                param.SetSettingValue("m_ExposedName", propertyName);
                param.SetSettingValue("m_Exposed", true);
                param.AddNode(new Vector2(spawner.position.x - 300f, spawner.position.y + 80f));
            }
            param.value = value;
            bool linked = param.outputSlots[0].Link(slot);
            param.ValidateNodes();

            // 2. custom event -> spawner Start (flow slot 0)
            var evt = g.children.OfType<VFXBasicEvent>().FirstOrDefault(e => e.eventName == eventName);
            if (evt == null)
            {
                evt = ScriptableObject.CreateInstance<VFXBasicEvent>();
                evt.SetSettingValue("eventName", eventName);
                evt.position = new Vector2(spawner.position.x, spawner.position.y - 180f);
                g.AddChild(evt);
            }
            evt.LinkTo(spawner, 0, 0);

            // 3. capacity of every particle system (Orson Favrel: capacity near the real alive count + headroom)
            var caps = new List<object>();
            if (capacity > 0)
                foreach (var d in g.children.OfType<VFXContext>().Select(c => c.GetData()).OfType<VFXDataParticle>().Distinct())
                {
                    d.SetSettingValue("capacity", (uint)capacity);
                    caps.Add(capacity);
                }

            // 4. compile and save the way the VFX window's Compile and Save buttons do
            var resource = g.GetResource();
            g.SetExpressionGraphDirty();
            g.CompileAndUpdateAsset(resource.asset);
            resource.WriteAssetWithSubAssets();
            AssetDatabase.SaveAssets();
            AssetDatabase.ImportAsset(assetPath, ImportAssetOptions.ForceUpdate | ImportAssetOptions.ForceSynchronousImport);
            return new Dictionary<string, object>
            {
                { "asset", assetPath }, { "property", propertyName }, { "linked", linked }, { "slot", blockType + "." + slotName },
                { "event", eventName }, { "event_linked_to_spawner_start", evt.outputContexts.Contains(spawner) }, { "capacity_set", caps },
            };
        }
    }
}
