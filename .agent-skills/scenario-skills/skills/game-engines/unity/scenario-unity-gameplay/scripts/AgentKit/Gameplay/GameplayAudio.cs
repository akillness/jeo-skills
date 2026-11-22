// scenario-unity-gameplay AgentKit jobs (Unity Expert Skills v0.1, 2026-09-24): an Audio Mixer authored
// from code. Unity has NO public editor API for mixer groups, exposed parameters or snapshots (the
// Audio Mixer window is the documented path). This job drives the INTERNAL
// UnityEditor.Audio.AudioMixerController through reflection, the same calls the window makes:
// CreateMixerControllerAtPath, CreateNewGroup + AddChildToParent, AddExposedParameter with an
// AudioGroupParameterPath, CloneNewSnapshotFromTarget, AudioMixerGroupController.SetValueForVolume.
// Verified in 6000.3.21f1 only: internal APIs can change in any release. If a member is missing the
// job fails with its name; fall back to a template .mixer made once in the window (gui-paths.md).
//   ut_run.run_method(P, "AgentKit.Gameplay.GameplayAudio.CreateCombatMixer",
//       {"path": "Assets/AgentKit.Gameplay/Resources/CombatMixer.mixer",
//        "groups": ["Music", "SFX", "UI"],
//        "snapshots": {"Explore": {"Music": 0, "SFX": -10}, "Combat": {"Music": -12, "SFX": 0}}})
// Exposed names: "<Group>Vol" for each child group (snapshot-driven) and "MasterVol" (Master, left
// to the player's volume slider: snapshots store it but never change it).
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using UnityEditor;
using UnityEngine;
using UnityEngine.Audio;

namespace AgentKit.Gameplay
{
    public static class GameplayAudio
    {
        const BindingFlags All = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static;
        static readonly Assembly Ed = typeof(Editor).Assembly;

        static Type T(string name) => Ed.GetType(name) ?? throw new MissingMemberException("internal type missing in this Unity version: " + name);

        static MethodInfo M(Type t, string name, int args = -1)
        {
            var m = t.GetMethods(All).FirstOrDefault(x => x.Name == name && (args < 0 || x.GetParameters().Length == args));
            return m ?? throw new MissingMethodException(t.FullName, name);
        }

        static PropertyInfo P(Type t, string name) => t.GetProperty(name, All) ?? throw new MissingMemberException(t.FullName, name);

        public static void CreateCombatMixer()
        {
            AgentJob.Run(() =>
            {
                var path = AgentJob.Str("path", GameplayScenes.Root + "/Resources/CombatMixer.mixer");
                var groups = AgentJob.Has("groups") ? AgentJob.List("groups").Select(o => o.ToString()).ToList() : new List<string> { "Music", "SFX", "UI" };
                var snaps = AgentJob.Dict("snapshots");
                if (snaps.Count == 0)
                    snaps = new Dictionary<string, object>
                    {
                        { "Explore", new Dictionary<string, object> { { "Music", 0.0 }, { "SFX", -10.0 } } },
                        { "Combat", new Dictionary<string, object> { { "Music", -12.0 }, { "SFX", 0.0 } } },
                    };
                Directory.CreateDirectory(Path.GetDirectoryName(path));
                if (AssetDatabase.LoadAssetAtPath<AudioMixer>(path) != null)
                {
                    if (!AgentJob.Bool("overwrite", false)) return Describe(path, "kept existing mixer (pass overwrite=true to regenerate)");
                    AssetDatabase.MoveAssetToTrash(path);          // recoverable from the OS trash, never deleted
                }

                var tCtl = T("UnityEditor.Audio.AudioMixerController");
                var tGroup = T("UnityEditor.Audio.AudioMixerGroupController");
                var tSnap = T("UnityEditor.Audio.AudioMixerSnapshotController");
                var tPath = T("UnityEditor.Audio.AudioGroupParameterPath");
                var ctl = M(tCtl, "CreateMixerControllerAtPath").Invoke(null, new object[] { path });
                var master = P(tCtl, "masterGroup").GetValue(ctl);

                var created = new Dictionary<string, object>();   // name -> group controller
                created["Master"] = master;
                foreach (var g in groups)
                {
                    var grp = M(tCtl, "CreateNewGroup").Invoke(ctl, new object[] { g, false });
                    M(tCtl, "AddChildToParent").Invoke(ctl, new object[] { grp, master });
                    created[g] = grp;
                }

                // expose the volume of every group, then rename "MyExposedParam..." to "<Group>Vol"
                var ctor = tPath.GetConstructors(All).First(c => c.GetParameters().Length == 2);
                var guidToName = new Dictionary<string, string>();
                foreach (var kv in created)
                {
                    var guid = M(tGroup, "GetGUIDForVolume").Invoke(kv.Value, null);
                    M(tCtl, "AddExposedParameter").Invoke(ctl, new object[] { ctor.Invoke(new object[] { kv.Value, guid }) });
                    guidToName[guid.ToString()] = kv.Key + "Vol";
                }
                var pExposed = P(tCtl, "exposedParameters");
                var arr = (Array)pExposed.GetValue(ctl);
                var tEp = arr.GetType().GetElementType();
                var fName = tEp.GetField("name", All); var fGuid = tEp.GetField("guid", All);
                for (int i = 0; i < arr.Length; i++)
                {
                    var boxed = arr.GetValue(i);
                    var g = fGuid.GetValue(boxed).ToString();
                    if (guidToName.TryGetValue(g, out var n)) { fName.SetValue(boxed, n); arr.SetValue(boxed, i); }
                }
                pExposed.SetValue(ctl, arr);
                M(tCtl, "OnChangedExposedParameter").Invoke(ctl, null);

                // snapshots: the default one is renamed to the first key, the rest are clones
                var pSnaps = P(tCtl, "snapshots");
                var pTarget = P(tCtl, "TargetSnapshot");
                var setVol = M(tGroup, "SetValueForVolume");
                int si = 0;
                var snapReport = new Dictionary<string, object>();
                foreach (var kv in snaps)
                {
                    if (si > 0) M(tCtl, "CloneNewSnapshotFromTarget").Invoke(ctl, new object[] { false });
                    var list = (Array)pSnaps.GetValue(ctl);
                    var snap = (UnityEngine.Object)list.GetValue(list.Length - 1);
                    snap.name = kv.Key;
                    pTarget.SetValue(ctl, snap);
                    var vols = kv.Value as Dictionary<string, object> ?? new Dictionary<string, object>();
                    foreach (var gv in vols)
                    {
                        if (!created.TryGetValue(gv.Key, out var grp)) throw new ArgumentException("snapshot " + kv.Key + " names unknown group " + gv.Key);
                        setVol.Invoke(grp, new object[] { ctl, snap, (float)AgentJson.ToDouble(gv.Value) });
                    }
                    snapReport[kv.Key] = vols;
                    si++;
                }
                var first = (UnityEngine.Object)((Array)pSnaps.GetValue(ctl)).GetValue(0);
                P(tCtl, "startSnapshot").SetValue(ctl, first);
                pTarget.SetValue(ctl, first);

                foreach (var o in AssetDatabase.LoadAllAssetsAtPath(path)) EditorUtility.SetDirty(o);
                AssetDatabase.SaveAssets();
                AssetDatabase.ImportAsset(path, ImportAssetOptions.ForceUpdate);

                var d = Describe(path, "created");
                d["snapshot_volumes_db"] = snapReport;
                return d;
            });
        }

        /// <summary>Read back through the public runtime API (groups, snapshots) plus the exposed names.</summary>
        public static Dictionary<string, object> Describe(string path, string status)
        {
            var mixer = AssetDatabase.LoadAssetAtPath<AudioMixer>(path);
            if (mixer == null) throw new FileNotFoundException("no AudioMixer at " + path);
            var names = new List<object>();
            var pExposed = T("UnityEditor.Audio.AudioMixerController").GetProperty("exposedParameters", All);
            if (pExposed != null)
                foreach (var o in (Array)pExposed.GetValue(mixer)) names.Add(o.GetType().GetField("name", All).GetValue(o));
            var snaps = new List<object>();
            var pSn = T("UnityEditor.Audio.AudioMixerController").GetProperty("snapshots", All);
            if (pSn != null) foreach (var o in (Array)pSn.GetValue(mixer)) snaps.Add(((UnityEngine.Object)o).name);
            return new Dictionary<string, object>
            {
                { "status", status }, { "path", path }, { "mixer", mixer.name },
                { "groups", mixer.FindMatchingGroups(string.Empty).Select(g => g.name).ToList() },
                { "exposed", names }, { "snapshots", snaps },
                { "snapshots_found_runtime_api", snaps.Count(n => mixer.FindSnapshot((string)n) != null) },
                { "internal_api", "UnityEditor.Audio.AudioMixerController (reflection), verified 6000.3.21f1" },
            };
        }
    }
}
