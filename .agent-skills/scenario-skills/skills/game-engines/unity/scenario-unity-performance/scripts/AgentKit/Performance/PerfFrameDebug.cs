// scenario-unity-performance v0.2 (2026-09-24). The Frame Debugger, headless: which renderers actually went
// through the GPU Resident Drawer, and why the others did not batch.
//
// Job (async: launch WITHOUT -quit and WITH graphics):
//   ut_run.run_method(P, "AgentKit.Performance.PerfFrameDebug.Capture",
//                     {"scene": "Assets/Scenes/X.unity", "warmup": 30, "details": 12}, quit=False, graphics=True)
// Flow: open the scene, enter Play mode (state in SessionState across the domain reload), render
// Camera.main to an offscreen target (batch mode has no Game view), count renderers that carry a
// MaterialPropertyBlock NOW (scripts often set it in Start, invisible to an edit-time audit), then
// enable the Frame Debugger through its internal utility
// (UnityEditorInternal.FrameDebuggerInternal.FrameDebuggerUtility, 6000.3.21f1, reflection only:
// internal API, may change), read every event name and object, and for `details` draw events step
// the event limit to read the batch-break cause (the text the window shows under "Why this draw
// call can't be batched with the previous one").
// Why: the 6.3 Manual verifies GPU Resident Drawer coverage by draws named "Hybrid Batch Group"
// in the Frame Debugger ("Analyze the GPU Resident Drawer"); a SetPass count alone cannot say
// which renderers fell out (MaterialPropertyBlock, LPPV, realtime GI, non-DOTS shader, skinned).
// Result: events, draw events, draws per name (top 20), hybrid_batch_group draws and the objects
// behind the other draws, runtime property blocks, detail rows with batch-break causes.
// Observed in 6000.3.21f1: FrameDebuggerUtility.locallySupported is FALSE in a batch editor (no event
// is ever captured, with or without explicit Camera.Render calls). In batch mode the job therefore
// returns "runtime_eligibility": PerfRendering.GrdEligibility evaluated in Play mode after Start(),
// which sees MaterialPropertyBlocks set by scripts; the event list needs a GUI editor.
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-performance/test_live_perf.py (step grd).
using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace AgentKit.Performance
{
    public static class PerfFrameDebug
    {
        public const string StateKey = "AgentKit.Performance.FrameDebug.State";

        public static void Capture()
        {
            AgentJob.Run(() =>
            {
                AgentJob.BeginAsync();
                var scene = AgentJob.Str("scene");
                if (!string.IsNullOrEmpty(scene)) EditorSceneManager.OpenScene(scene, OpenSceneMode.Single);
                var st = new Dictionary<string, object>
                {
                    { "phase", "entering" }, { "warmup", AgentJob.Int("warmup", 30) }, { "details", AgentJob.Int("details", 12) },
                    { "width", AgentJob.Int("width", 1280) }, { "height", AgentJob.Int("height", 720) },
                    { "scene", EditorSceneManager.GetActiveScene().path },
                };
                SessionState.SetString(StateKey, AgentJson.Serialize(st));
                PerfFrameDebugDriver.Hook();
                EditorApplication.EnterPlaymode();
                return null;
            });
        }
    }

    [InitializeOnLoad]
    static class PerfFrameDebugDriver
    {
        static bool s_Hooked;
        static Dictionary<string, object> s_State;
        static int s_Frames, s_Wait, s_DetailIdx;
        static RenderTexture s_RT;
        static Camera s_Cam;
        static Type s_Util, s_DataType;
        static List<int> s_DetailEvents;
        static List<object> s_Details;
        static Dictionary<string, object> s_Result;
        static string[] s_Causes;

        static PerfFrameDebugDriver()
        {
            if (!string.IsNullOrEmpty(SessionState.GetString(PerfFrameDebug.StateKey, ""))) Hook();
        }

        public static void Hook()
        {
            if (s_Hooked) return;
            s_Hooked = true;
            EditorApplication.update += Tick;
        }

        const BindingFlags k_Static = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static;

        static object Call(string name, params object[] a)
        {
            var m = s_Util.GetMethods(k_Static).First(x => x.Name == name && x.GetParameters().Length == a.Length);
            return m.Invoke(null, a);
        }

        static object Prop(string name) => s_Util.GetProperty(name, k_Static)?.GetValue(null);

        static void Tick()
        {
            if (s_State == null)
            {
                var raw = SessionState.GetString(PerfFrameDebug.StateKey, "");
                if (string.IsNullOrEmpty(raw)) { EditorApplication.update -= Tick; s_Hooked = false; return; }
                s_State = AgentJson.ParseObject(raw);
            }
            var st = s_State;
            var phase = st["phase"] as string;
            try
            {
                if (!EditorApplication.isPlaying && phase != "exiting") return;
                if (phase == "entering")
                {
                    if (s_Cam == null && Camera.main != null)
                    {
                        s_Cam = Camera.main;
                        s_RT = new RenderTexture((int)AgentJson.ToDouble(st["width"], 1280), (int)AgentJson.ToDouble(st["height"], 720), 24) { name = "FrameDebugTarget" };
                        s_Cam.targetTexture = s_RT;
                    }
                    if (++s_Frames < (int)AgentJson.ToDouble(st["warmup"], 30)) return;
                    s_Util = Type.GetType("UnityEditorInternal.FrameDebuggerInternal.FrameDebuggerUtility, UnityEditor.CoreModule");
                    s_DataType = Type.GetType("UnityEditorInternal.FrameDebuggerInternal.FrameDebuggerEventData, UnityEditor.CoreModule");
                    if (s_Util == null) throw new InvalidOperationException("FrameDebuggerUtility not found in this editor version");
                    var rs = UnityEngine.Object.FindObjectsByType<Renderer>(FindObjectsInactive.Exclude, FindObjectsSortMode.None);
                    st["runtime_renderers"] = rs.Length;
                    st["runtime_property_blocks"] = rs.Count(r => r.HasPropertyBlock());
                    // the static eligibility check again, now that Start() has run: MaterialPropertyBlocks
                    // set by scripts at runtime are visible here
                    st["runtime_eligibility"] = PerfRendering.GrdEligibility(rs);
                    st["locally_supported"] = Prop("locallySupported");
                    if (!(st["locally_supported"] is bool sup && sup))
                    {
                        // observed 6000.3.21f1: FrameDebuggerUtility.locallySupported is false in a batch
                        // editor, and no event is ever captured. Return the runtime eligibility instead;
                        // the Frame Debugger itself needs a GUI editor (window, or this job through ut_live).
                        s_Result = new Dictionary<string, object> { { "frame_debugger", "not supported in batch mode (locallySupported false): use the window or run this job in a GUI editor through ut_live" } };
                        s_Details = new List<object>();
                        st["phase"] = "done";
                        return;
                    }
                    var setEnabled = s_Util.GetMethods(k_Static).First(x => x.Name == "SetEnabled");
                    var pars = setEnabled.GetParameters();
                    int target = UnityEditorInternal.ProfilerDriver.connectedProfiler;   // the Editor/Play mode target, as the window passes it
                    st["set_enabled_signature"] = string.Join(", ", pars.Select(p => p.ParameterType.Name + " " + p.Name));
                    st["connected_profiler"] = target;
                    setEnabled.Invoke(null, pars.Length == 2 ? new object[] { true, target } : new object[] { true });
                    st["phase"] = "capturing";
                    s_Wait = 0;
                }
                else if (phase == "capturing")
                {
                    // batch mode has no Game view to repaint: render the camera explicitly so the
                    // Frame Debugger has a frame to intercept
                    if (s_Cam != null) s_Cam.Render();
                    int count = Convert.ToInt32(Prop("count"));
                    if (count <= 0 && ++s_Wait < 300) return;
                    if (count <= 0)
                        throw new InvalidOperationException("Frame Debugger captured no events in 300 ticks (locallySupported=" + st["locally_supported"]
                            + ", SetEnabled(" + st["set_enabled_signature"] + "), target " + st["connected_profiler"] + "): use the window (gui-paths.md) or the static audit");
                    if (++s_Wait < 5) return;   // let the event list settle
                    s_Result = ReadEvents(count, (int)AgentJson.ToDouble(st["details"], 12));
                    s_Details = new List<object>();
                    s_DetailIdx = 0;
                    s_Wait = 0;
                    st["phase"] = s_DetailEvents.Count > 0 ? "details" : "done";
                }
                else if (phase == "details")
                {
                    int ev = s_DetailEvents[s_DetailIdx];
                    if (s_Wait == 0) { s_Util.GetProperty("limit", k_Static).SetValue(null, ev + 1); }
                    if (++s_Wait < 4) return;
                    s_Details.Add(ReadDetail(ev));
                    s_Wait = 0;
                    if (++s_DetailIdx >= s_DetailEvents.Count) st["phase"] = "done";
                }
                else if (phase == "done")
                {
                    s_Result["details"] = s_Details;
                    s_Result["runtime_renderers"] = st["runtime_renderers"];
                    s_Result["runtime_property_blocks"] = st["runtime_property_blocks"];
                    s_Result["locally_supported"] = st["locally_supported"];
                    s_Result["runtime_eligibility"] = st["runtime_eligibility"];
                    s_Result["scene"] = st["scene"];
                    if (st["locally_supported"] is bool on && on)
                    {
                        var setEnabled = s_Util.GetMethods(k_Static).First(x => x.Name == "SetEnabled");
                        setEnabled.Invoke(null, setEnabled.GetParameters().Length == 2 ? new object[] { false, 0 } : new object[] { false });
                    }
                    Release();
                    st["phase"] = "exiting";
                    st["result"] = s_Result;
                    SessionState.SetString(PerfFrameDebug.StateKey, AgentJson.Serialize(st));
                    EditorApplication.ExitPlaymode();
                }
                else if (phase == "exiting" && !EditorApplication.isPlaying && !EditorApplication.isPlayingOrWillChangePlaymode)
                {
                    SessionState.EraseString(PerfFrameDebug.StateKey);
                    EditorApplication.update -= Tick;
                    s_Hooked = false;
                    s_State = null;
                    AgentJob.Succeed(st["result"]);
                }
            }
            catch (Exception e)
            {
                SessionState.EraseString(PerfFrameDebug.StateKey);
                EditorApplication.update -= Tick;
                s_Hooked = false;
                s_State = null;
                Release();
                if (EditorApplication.isPlaying) EditorApplication.ExitPlaymode();
                AgentJob.Fail("frame debug: " + (e.InnerException ?? e).Message, null, e.InnerException ?? e);
            }
        }

        static void Release()
        {
            if (s_Cam != null) s_Cam.targetTexture = null;
            if (s_RT != null) { s_RT.Release(); UnityEngine.Object.DestroyImmediate(s_RT); }
            s_Cam = null; s_RT = null;
        }

        static Dictionary<string, object> ReadEvents(int count, int details)
        {
            var events = (Array)Call("GetFrameEvents");
            var names = new Dictionary<string, int>();
            var types = new Dictionary<string, int>();
            var nonHybridObjects = new Dictionary<string, int>();
            int draws = 0, hybrid = 0;
            s_DetailEvents = new List<int>();
            var hybridIdx = new List<int>();
            for (int i = 0; i < events.Length; i++)
            {
                var e = events.GetValue(i);
                var type = e.GetType().GetField("m_Type", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance)?.GetValue(e)?.ToString() ?? "?";
                var obj = e.GetType().GetField("m_Obj", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance)?.GetValue(e) as UnityEngine.Object;
                string name;
                try { name = Call("GetFrameEventInfoName", i) as string ?? ""; } catch (Exception) { name = ""; }
                types[type] = (types.TryGetValue(type, out var t) ? t : 0) + 1;
                bool isDraw = type.IndexOf("Mesh", StringComparison.OrdinalIgnoreCase) >= 0 || type.IndexOf("Draw", StringComparison.OrdinalIgnoreCase) >= 0
                    || type.IndexOf("Batch", StringComparison.OrdinalIgnoreCase) >= 0 || type.IndexOf("Instanced", StringComparison.OrdinalIgnoreCase) >= 0;
                if (!isDraw) continue;
                draws++;
                var key = string.IsNullOrEmpty(name) ? type : name;
                names[key] = (names.TryGetValue(key, out var n) ? n : 0) + 1;
                bool isHybrid = name.IndexOf("Hybrid Batch Group", StringComparison.OrdinalIgnoreCase) >= 0;
                if (isHybrid) { hybrid++; if (hybridIdx.Count < 2) hybridIdx.Add(i); }
                else
                {
                    var on = obj != null ? obj.name : "(no object)";
                    nonHybridObjects[on] = (nonHybridObjects.TryGetValue(on, out var c) ? c : 0) + 1;
                    if (s_DetailEvents.Count < details) s_DetailEvents.Add(i);
                }
            }
            s_DetailEvents.AddRange(hybridIdx);
            try { s_Causes = Call("GetBatchBreakCauseStrings") as string[]; } catch (Exception) { s_Causes = null; }
            return new Dictionary<string, object>
            {
                { "events", count }, { "draw_events", draws }, { "hybrid_batch_group_draws", hybrid },
                { "other_draws", draws - hybrid },
                { "draws_by_name", names.OrderByDescending(kv => kv.Value).Take(20).ToDictionary(kv => kv.Key, kv => (object)kv.Value) },
                { "event_types", types.ToDictionary(kv => kv.Key, kv => (object)kv.Value) },
                { "objects_behind_other_draws", nonHybridObjects.OrderByDescending(kv => kv.Value).Take(15).ToDictionary(kv => kv.Key, kv => (object)kv.Value) },
                { "distinct_objects_behind_other_draws", nonHybridObjects.Count },
            };
        }

        static Dictionary<string, object> ReadDetail(int ev)
        {
            var row = new Dictionary<string, object> { { "event", ev } };
            try { row["name"] = Call("GetFrameEventInfoName", ev); } catch (Exception) { }
            if (s_DataType == null) return row;
            var data = Activator.CreateInstance(s_DataType);
            object ok;
            try { ok = Call("GetFrameEventData", ev, data); } catch (Exception e) { row["error"] = (e.InnerException ?? e).Message; return row; }
            row["data_ok"] = ok;
            const BindingFlags inst = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance;
            object F(string n) => s_DataType.GetField(n, inst)?.GetValue(data);
            int cause = Convert.ToInt32(F("m_BatchBreakCause") ?? -1);
            row["batch_break_cause"] = cause;
            if (s_Causes != null && cause >= 0 && cause < s_Causes.Length) row["batch_break_reason"] = s_Causes[cause];
            row["shader"] = F("m_RealShaderName") ?? F("m_OriginalShaderName");
            row["pass"] = F("m_PassName");
            row["instances"] = F("m_InstanceCount");
            row["draw_calls"] = F("m_DrawCallCount");
            var mesh = F("m_Mesh") as UnityEngine.Object;
            row["mesh"] = mesh != null ? mesh.name : null;
            return row;
        }
    }
}
