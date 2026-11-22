// AgentKit.Architecture (scenario-unity-architecture skill, 2026-09-24): Play-mode probes run by the editor itself.
// DoublePlay enters and exits Play mode N times under a chosen Enter Play Mode setting and records watched
// static members and ScriptableObject fields (memory and disk) in Play mode, right after exit, and after a
// settle delay. It is how an agent proves "the 2nd and 3rd Play behave like the 1st" (6.3 Manual,
// domain-reloading). PlayProbe is the same job with one session by default: play a scene, fire events,
// read the results (the debug plan of Hipple, raQ3iHhE_Kk [00:36:07], without a mouse).
//   ut_run.run_method(P, "AgentKit.Architecture.ArchPlayMode.DoublePlay", {
//       "scene": "Assets/X.unity", "mode": "reload_scene_only", "sessions": 2, "frames": 10, "play_seconds": 1.0,
//       "settle_seconds": 0.5, "watch": ["Ns.Type.StaticField"],
//       "assets": [{"path": "Assets/Data/S.asset", "field": "value"},          # serialized field: memory, disk, dirty
//                  {"path": "Assets/Data/EVT.asset", "member": "ListenerCount"}],  # any field or property, by reflection
//       "so_guard": {"folders": ["Assets/Game/Data"], "allow": []},   # in-memory SO writes during Play
//       "invoke": [{"path": "Assets/Data/EVT.asset", "method": "RaiseDebug"},   # instance method on an asset
//                  {"type": "Ns.Type", "method": "Static", "args": [1]}],       # or a static method
//       "invoke_frames": 3, "save_assets_at_end": false}, quit=False, timeout=600)
// so_guard: a Play-mode write to a ScriptableObject stays in Editor memory with IsDirty false and never
// reaches the .asset (observed, procedures.md A4), so only a comparison made in THIS process sees it:
// EditorJsonUtility hashes before Play vs in Play and after exit ("so_changed_in_memory").
// invoke: runs once per session when frames and play_seconds are reached, then waits invoke_frames frames
// before the in_play reading, so responses to the event are visible.
// The job state lives in SessionState and an [InitializeOnLoad] driver resumes it, so it survives the
// domain reload of "reload_all". The original Enter Play Mode setting is restored at the end.
// Ran in Unity 6000.3.21f1 on 2026-09-24 (procedures.md A1, A4, A8, A11).
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text.RegularExpressions;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using Object = UnityEngine.Object;

namespace AgentKit.Architecture
{
    public static class ArchPlayMode
    {
        public const string StateKey = "AgentKit.Architecture.DoublePlay";

        public static void DoublePlay() => Begin(2);

        /// <summary>One Play session by default: play, invoke, read (same arguments as DoublePlay).</summary>
        public static void PlayProbe() => Begin(1);

        static void Begin(int defaultSessions)
        {
            AgentJob.Run(() =>
            {
                AgentJob.BeginAsync();
                var scene = AgentJob.Str("scene");
                if (!string.IsNullOrEmpty(scene)) EditorSceneManager.OpenScene(scene, OpenSceneMode.Single);
                var st = new Dictionary<string, object>
                {
                    { "phase", "enter" }, { "session", 0 },
                    { "sessions", AgentJob.Int("sessions", defaultSessions) }, { "frames", AgentJob.Int("frames", 10) },
                    { "play_seconds", AgentJob.Float("play_seconds", 0f) },   // batch -nographics runs frames uncapped: wait on time too
                    { "settle", AgentJob.Float("settle_seconds", 0.5f) },
                    { "mode", AgentJob.Str("mode", "reload_scene_only") },
                    { "orig_enabled", EditorSettings.enterPlayModeOptionsEnabled },
                    { "orig_options", (int)EditorSettings.enterPlayModeOptions },
                    { "watch", AgentJob.List("watch") }, { "assets", AgentJob.List("assets") },
                    { "save_assets_at_end", AgentJob.Bool("save_assets_at_end", false) },
                    { "invoke", AgentJob.List("invoke") }, { "invoke_frames", AgentJob.Int("invoke_frames", 3) },
                    { "records", new List<object>() },
                };
                if (AgentJob.Has("so_guard"))
                {
                    var guard = AgentJob.Args.TryGetValue("so_guard", out var g) ? g as Dictionary<string, object> : null;
                    if (guard == null) throw new ArgumentException("so_guard must be an object {folders, allow}");
                    st["so_guard"] = guard;
                    st["so_baseline"] = ArchJobs.SoMemoryHashes(GuardFolders(guard)).ToDictionary(kv => kv.Key, kv => (object)kv.Value);
                }
                ArchJobs.ApplyEnterPlayMode((string)st["mode"]);
                st["baseline"] = ReadAll(st);
                ArchPlayModeDriver.Save(st);
                ArchPlayModeDriver.Hook();
                ArchPlayModeDriver.ResetFrame();
                EditorApplication.EnterPlaymode();
                return null;
            });
        }

        // ------------------------------------------------------------------ reading
        internal static Dictionary<string, object> ReadAll(Dictionary<string, object> st)
        {
            var d = new Dictionary<string, object>();
            if (st["watch"] is List<object> w) foreach (var o in w) if (o is string p) d[p] = ReadStatic(p);
            if (st["assets"] is List<object> a)
                foreach (var o in a)
                {
                    if (!(o is Dictionary<string, object> spec) || !spec.TryGetValue("path", out var po)) continue;
                    if (spec.TryGetValue("field", out var fo)) d[po + ":" + fo] = ReadAssetField((string)po, (string)fo);
                    else if (spec.TryGetValue("member", out var mo)) d[po + ":" + mo] = ReadAssetMember((string)po, (string)mo);
                }
            if (st.TryGetValue("so_guard", out var g) && g is Dictionary<string, object> guard
                && st.TryGetValue("so_baseline", out var b) && b is Dictionary<string, object> baseline)
            {
                var allow = new HashSet<string>(((guard.TryGetValue("allow", out var al) ? al as List<object> : null) ?? new List<object>()).Select(x => x as string));
                var now = ArchJobs.SoMemoryHashes(GuardFolders(guard));
                var changed = now.Where(kv => baseline.TryGetValue(kv.Key, out var h) && (h as string) != kv.Value).Select(kv => kv.Key).OrderBy(x => x).ToList();
                d["so_changed_in_memory"] = changed.Where(x => !allow.Contains(x)).ToList();
                d["so_changed_allowed"] = changed.Where(x => allow.Contains(x)).ToList();
            }
            return d;
        }

        static string[] GuardFolders(Dictionary<string, object> guard)
        {
            var list = guard.TryGetValue("folders", out var f) ? f as List<object> : null;
            var folders = (list ?? new List<object>()).Select(x => x as string).Where(x => !string.IsNullOrEmpty(x)).ToArray();
            return folders.Length > 0 ? folders : new[] { "Assets" };
        }

        public static object ReadAssetMember(string path, string member)
        {
            var obj = AssetDatabase.LoadAssetAtPath<Object>(path);
            if (obj == null) return "asset not found";
            const BindingFlags F = BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic;
            for (var t = obj.GetType(); t != null; t = t.BaseType)
            {
                var pi = t.GetProperty(member, F | BindingFlags.DeclaredOnly);
                if (pi != null && pi.GetIndexParameters().Length == 0) return Simple(pi.GetValue(obj));
                var fi = t.GetField(member, F | BindingFlags.DeclaredOnly);
                if (fi != null) return Simple(fi.GetValue(obj));
            }
            return "member not found";
        }

        /// <summary>Runs the "invoke" list: instance methods on assets ("path") or static methods ("type").</summary>
        internal static List<object> RunInvokes(Dictionary<string, object> st)
        {
            var results = new List<object>();
            if (!(st.TryGetValue("invoke", out var io) && io is List<object> list)) return results;
            const BindingFlags F = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static | BindingFlags.FlattenHierarchy;
            foreach (var o in list)
            {
                if (!(o is Dictionary<string, object> spec)) continue;
                string method = spec.TryGetValue("method", out var mo) && mo is string ms ? ms : "RaiseDebug";
                var entry = new Dictionary<string, object> { { "method", method } };
                try
                {
                    object target = null;
                    Type type;
                    if (spec.TryGetValue("path", out var po) && po is string path)
                    {
                        target = AssetDatabase.LoadAssetAtPath<Object>(path);
                        if (target == null) throw new ArgumentException("asset not found: " + path);
                        type = target.GetType();
                        entry["path"] = path;
                    }
                    else if (spec.TryGetValue("type", out var to) && to is string tn)
                    {
                        type = ArchJobs.FindType(tn) ?? throw new ArgumentException("type not found: " + tn);
                        entry["type"] = tn;
                    }
                    else throw new ArgumentException("invoke needs \"path\" (asset) or \"type\" (static)");
                    var args = (spec.TryGetValue("args", out var ao) ? ao as List<object> : null) ?? new List<object>();
                    var mi = type.GetMethods(F).FirstOrDefault(m => m.Name == method && m.GetParameters().Length == args.Count && (m.IsStatic || target != null))
                             ?? throw new ArgumentException(type.Name + "." + method + " with " + args.Count + " argument(s) not found");
                    var pars = mi.GetParameters();
                    var conv = new object[args.Count];
                    for (int i = 0; i < args.Count; i++) conv[i] = args[i] == null ? null : Convert.ChangeType(args[i], pars[i].ParameterType);
                    entry["returned"] = Simple(mi.Invoke(mi.IsStatic ? null : target, conv));
                    entry["ok"] = true;
                }
                catch (Exception e)
                {
                    entry["ok"] = false;
                    entry["error"] = (e.InnerException ?? e).Message;
                }
                entry["frame"] = Time.frameCount;
                results.Add(entry);
            }
            return results;
        }

        public static object ReadStatic(string path)
        {
            int dot = path.LastIndexOf('.');
            if (dot <= 0) return "bad path";
            var type = ArchJobs.FindType(path.Substring(0, dot));
            if (type == null) return "type not found";
            string member = path.Substring(dot + 1);
            const BindingFlags F = BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.FlattenHierarchy;
            var fi = type.GetField(member, F);
            if (fi != null) return Simple(fi.GetValue(null));
            var pi = type.GetProperty(member, F);
            if (pi != null) return Simple(pi.GetValue(null));
            return "member not found";
        }

        static object Simple(object v)
        {
            if (v == null || v is string || v is bool || v is int || v is long || v is float || v is double) return v;
            if (v is Delegate del) return del.GetInvocationList().Length;   // subscriber count of a static event
            if (v is System.Collections.ICollection c) return c.Count;
            if (v is Object uo) return uo != null ? uo.name : "destroyed";
            return v.ToString();
        }

        public static object ReadAssetField(string path, string field)
        {
            var obj = AssetDatabase.LoadAssetAtPath<Object>(path);
            object mem = null;
            if (obj != null)
            {
                var p = new SerializedObject(obj).FindProperty(field);
                if (p != null)
                    switch (p.propertyType)
                    {
                        case SerializedPropertyType.Integer: mem = p.intValue; break;
                        case SerializedPropertyType.Float: mem = p.floatValue; break;
                        case SerializedPropertyType.Boolean: mem = p.boolValue; break;
                        case SerializedPropertyType.String: mem = p.stringValue; break;
                        default: mem = p.propertyType.ToString(); break;
                    }
            }
            return new Dictionary<string, object> { { "memory", mem }, { "disk", ReadDisk(path, field) }, { "dirty", obj != null && EditorUtility.IsDirty(obj) } };
        }

        public static string ReadDisk(string path, string field)
        {
            var full = Path.Combine(AgentJob.ProjectRoot, path);
            if (!File.Exists(full)) return null;
            var m = Regex.Match(File.ReadAllText(full), "^\\s*" + Regex.Escape(field) + ":\\s*(.*)$", RegexOptions.Multiline);
            return m.Success ? m.Groups[1].Value.Trim() : null;
        }
    }

    [InitializeOnLoad]
    static class ArchPlayModeDriver
    {
        static bool s_Hooked;
        static int s_StartFrame = -1;
        static double s_StartTime;
        static Dictionary<string, object> s_State;

        static ArchPlayModeDriver()
        {
            if (!string.IsNullOrEmpty(SessionState.GetString(ArchPlayMode.StateKey, ""))) Hook();
        }

        public static void Hook()
        {
            if (s_Hooked) return;
            s_Hooked = true;
            EditorApplication.update += Tick;
        }

        public static void ResetFrame() => s_StartFrame = -1;

        public static void Save(Dictionary<string, object> st)
        {
            s_State = st;
            SessionState.SetString(ArchPlayMode.StateKey, AgentJson.Serialize(st));
        }

        static void Unhook()
        {
            SessionState.EraseString(ArchPlayMode.StateKey);
            EditorApplication.update -= Tick;
            s_Hooked = false;
            s_State = null;
        }

        static void Tick()
        {
            if (s_State == null)
            {
                var raw = SessionState.GetString(ArchPlayMode.StateKey, "");
                if (string.IsNullOrEmpty(raw)) { Unhook(); return; }
                s_State = AgentJson.ParseObject(raw);
            }
            var st = s_State;
            try
            {
                string phase = (string)st["phase"];
                int session = (int)AgentJson.ToDouble(st["session"]);
                var records = st["records"] as List<object>;
                if (phase == "enter" && EditorApplication.isPlaying)
                {
                    if (s_StartFrame < 0) { s_StartFrame = Time.frameCount; s_StartTime = EditorApplication.timeSinceStartup; }
                    if (Time.frameCount - s_StartFrame < (int)AgentJson.ToDouble(st["frames"])) return;
                    if (EditorApplication.timeSinceStartup - s_StartTime < AgentJson.ToDouble(st["play_seconds"])) return;
                    if (st["invoke"] is List<object> inv && inv.Count > 0)
                    {
                        st["invoke_results"] = ArchPlayMode.RunInvokes(st);
                        st["invoke_frame"] = Time.frameCount;
                        st["phase"] = "after_invoke";
                        Save(st);
                        return;
                    }
                    RecordInPlay(st, records, session);
                }
                else if (phase == "after_invoke" && EditorApplication.isPlaying)
                {
                    if (Time.frameCount - (int)AgentJson.ToDouble(st["invoke_frame"]) < (int)AgentJson.ToDouble(st["invoke_frames"])) return;
                    RecordInPlay(st, records, session);
                }
                else if (phase == "exiting" && !EditorApplication.isPlaying && !EditorApplication.isPlayingOrWillChangePlaymode)
                {
                    var rec = (Dictionary<string, object>)records[records.Count - 1];
                    rec["after_exit"] = ArchPlayMode.ReadAll(st);
                    st["exit_time"] = EditorApplication.timeSinceStartup;
                    st["phase"] = "settle";
                    Save(st);
                }
                else if (phase == "settle" && EditorApplication.timeSinceStartup - AgentJson.ToDouble(st["exit_time"]) >= AgentJson.ToDouble(st["settle"]))
                {
                    var rec = (Dictionary<string, object>)records[records.Count - 1];
                    rec["after_settle"] = ArchPlayMode.ReadAll(st);
                    session++;
                    st["session"] = session;
                    if (session < (int)AgentJson.ToDouble(st["sessions"]))
                    {
                        st["phase"] = "enter";
                        Save(st);
                        s_StartFrame = -1;
                        EditorApplication.EnterPlaymode();
                        return;
                    }
                    Finish(st, records);
                }
            }
            catch (Exception e)
            {
                Restore(st);
                Unhook();
                if (EditorApplication.isPlaying) EditorApplication.ExitPlaymode();
                AgentJob.Fail("double play: " + e.Message, null, e);
            }
        }

        static void RecordInPlay(Dictionary<string, object> st, List<object> records, int session)
        {
            var rec = new Dictionary<string, object> { { "session", session + 1 }, { "frames_in_play", Time.frameCount - s_StartFrame }, { "in_play", ArchPlayMode.ReadAll(st) } };
            if (st.TryGetValue("invoke_results", out var ir)) { rec["invoked"] = ir; st.Remove("invoke_results"); }
            records.Add(rec);
            st["phase"] = "exiting";
            Save(st);
            EditorApplication.ExitPlaymode();
        }

        static void Restore(Dictionary<string, object> st)
        {
            EditorSettings.enterPlayModeOptions = (EnterPlayModeOptions)(int)AgentJson.ToDouble(st["orig_options"]);
            EditorSettings.enterPlayModeOptionsEnabled = st["orig_enabled"] is bool b && b;
        }

        static void Finish(Dictionary<string, object> st, List<object> records)
        {
            var result = new Dictionary<string, object>
            {
                { "mode", st["mode"] }, { "sessions", st["sessions"] }, { "baseline", st["baseline"] }, { "records", records },
            };
            if (st["save_assets_at_end"] is bool save && save)
            {
                AssetDatabase.SaveAssets();
                result["after_save_assets"] = ArchPlayMode.ReadAll(st);
            }
            Restore(st);
            result["restored_enter_play_mode"] = ArchJobs.EnterPlayModeName();
            Unhook();
            AgentJob.Succeed(result);
        }
    }
}
