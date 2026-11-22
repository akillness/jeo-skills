// AgentKit v0.2 (Unity Expert Skills, 2026-09-24). The job protocol shared by every agent job.
//
// Runner side (ut_run.run_method / ut_live.call) writes <jobdir>/args.json and launches
//   Unity -batchmode [-nographics] [-quit] -projectPath P -logFile <jobdir>/unity.log
//         -executeMethod Ns.Class.Method -agentJob <jobdir>
// Job side:
//   public static void MyJob() { AgentJob.Run(() => { var n = AgentJob.Int("count", 3); ...; return result; }); }
// Run() catches everything and ends with exactly one envelope, written to <jobdir>/result.json and
// printed on one log line:  AGENT_RESULT {"ok":true,"job":"...","method":"...","result":{...},...}
// Exit codes: 0 on success; 1 on failure (EditorApplication.Exit(1), also with -quit).
// Async jobs (play mode, anything that must survive a domain reload or wait for editor ticks)
// call AgentJob.BeginAsync() and later AgentJob.Succeed()/Fail(); launch them WITHOUT -quit
// (ut_run.run_method(..., quit=False)): Succeed/Fail then call EditorApplication.Exit(code).
// Inside a live editor (AgentBridge request) the same calls write the result file and never exit.
// Arguments: List(key)/Dict(key) NEVER return null (an empty collection when the key is missing),
// so `?? fallback` after them never fires. To tell "missing" from "empty" use Has(key),
// TryList/TryDict, or ListOrNull/DictOrNull (null when missing, so `??` works) (v0.2).
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-expert/test_live_toolkit.py.
using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using UnityEditor;
using UnityEngine;
using Debug = UnityEngine.Debug;

namespace AgentKit
{
    public static class AgentJob
    {
        public const string Version = "0.2";
        const string SessionKey = "AgentKit.Job.Context";
        const int MaxLineChars = 60000;

        static string s_JobDir, s_JobId, s_Method;
        static bool s_Bridge, s_Resolved, s_Finished, s_Async;
        static Dictionary<string, object> s_Args;
        static readonly List<string> s_Warnings = new List<string>();
        static Stopwatch s_Watch;

        // ------------------------------------------------------------------ context
        public static string ProjectRoot => Directory.GetParent(Application.dataPath).FullName;
        public static string JobDir { get { Resolve(); return s_JobDir; } }
        public static string JobId { get { Resolve(); return s_JobId; } }
        public static string Method { get { Resolve(); return s_Method; } }
        public static bool InBridge { get { Resolve(); return s_Bridge; } }
        public static bool Finished => s_Finished;
        public static bool HasQuitFlag => HasArg("-quit");
        public static IReadOnlyList<string> Warnings => s_Warnings;

        public static bool HasArg(string flag)
        {
            foreach (var a in Environment.GetCommandLineArgs())
                if (string.Equals(a, flag, StringComparison.OrdinalIgnoreCase)) return true;
            return false;
        }

        public static string CommandLineValue(string flag)
        {
            var a = Environment.GetCommandLineArgs();
            for (int i = 0; i < a.Length - 1; i++)
                if (string.Equals(a[i], flag, StringComparison.OrdinalIgnoreCase)) return a[i + 1];
            return null;
        }

        static void Resolve()
        {
            if (s_Resolved) return;
            s_Resolved = true;
            s_Watch = Stopwatch.StartNew();
            // 1. a bridge job that survived a domain reload
            var saved = SessionState.GetString(SessionKey, "");
            if (!string.IsNullOrEmpty(saved))
            {
                var d = AgentJson.ParseObject(saved);
                s_JobDir = d.TryGetValue("dir", out var dir) ? dir as string : null;
                s_JobId = d.TryGetValue("id", out var id) ? id as string : null;
                s_Method = d.TryGetValue("method", out var m) ? m as string : null;
                s_Bridge = d.TryGetValue("bridge", out var b) && b is bool bb && bb;
                s_Async = true;
            }
            // 2. a one-shot batch job
            if (s_JobDir == null)
            {
                s_JobDir = CommandLineValue("-agentJob");
                s_Method = CommandLineValue("-executeMethod");
                s_JobId = s_JobDir != null ? Path.GetFileName(s_JobDir.TrimEnd('/', '\\')) : "adhoc";
            }
            s_Args = new Dictionary<string, object>();
            if (s_JobDir != null)
            {
                var argsPath = Path.Combine(s_JobDir, "args.json");
                if (File.Exists(argsPath)) s_Args = AgentJson.ParseObject(File.ReadAllText(argsPath));
            }
        }

        /// <summary>Called by AgentBridge before it invokes a method for a live request.</summary>
        public static void SetBridgeContext(string id, string dir, string method)
        {
            s_Resolved = false;
            SessionState.EraseString(SessionKey);
            Resolve();
            s_JobId = id; s_JobDir = dir; s_Method = method; s_Bridge = true;
            s_Finished = false; s_Async = false; s_Warnings.Clear();
            var argsPath = Path.Combine(dir, "args.json");
            s_Args = File.Exists(argsPath) ? AgentJson.ParseObject(File.ReadAllText(argsPath)) : new Dictionary<string, object>();
        }

        public static void ClearBridgeContext()
        {
            if (s_Async && !s_Finished) return; // an async bridge job keeps its context
            s_Resolved = false; s_Bridge = false; s_JobDir = null; s_JobId = null; s_Method = null;
        }

        // ------------------------------------------------------------------ arguments
        public static Dictionary<string, object> Args { get { Resolve(); return s_Args; } }
        /// <summary>True when the key is present with a non-null value (any JSON type).</summary>
        public static bool Has(string key) => Args.ContainsKey(key) && Args[key] != null;

        public static string Str(string key, string def = null)
        {
            return Args.TryGetValue(key, out var v) && v != null ? Convert.ToString(v, System.Globalization.CultureInfo.InvariantCulture) : def;
        }

        public static int Int(string key, int def = 0) => Has(key) ? (int)AgentJson.ToDouble(Args[key], def) : def;
        public static float Float(string key, float def = 0f) => Has(key) ? (float)AgentJson.ToDouble(Args[key], def) : def;

        public static bool Bool(string key, bool def = false)
        {
            if (!Has(key)) return def;
            var v = Args[key];
            if (v is bool b) return b;
            var s = Convert.ToString(v).ToLowerInvariant();
            return s == "1" || s == "true" || s == "yes";
        }

        /// <summary>JSON array argument. NEVER null: an empty list when the key is missing, null or
        /// not an array, so <c>AgentJob.List("k") ?? fallback</c> never uses the fallback (reported by
        /// scenario-unity-2d, 2026-09-24). Use <see cref="TryList"/>, <see cref="ListOrNull"/> or <see cref="Has"/>
        /// to tell a missing key from an empty list.</summary>
        public static List<object> List(string key)
        {
            return Has(key) && Args[key] is List<object> l ? l : new List<object>();
        }

        /// <summary>JSON object argument. NEVER null: an empty dictionary when the key is missing, null
        /// or not an object. Use <see cref="TryDict"/> or <see cref="DictOrNull"/> to detect a missing key.</summary>
        public static Dictionary<string, object> Dict(string key)
        {
            return Has(key) && Args[key] is Dictionary<string, object> d ? d : new Dictionary<string, object>();
        }

        /// <summary>True and the list when the key holds a JSON array; false and null otherwise
        /// (missing, null, or another type).</summary>
        public static bool TryList(string key, out List<object> list)
        {
            if (Has(key) && Args[key] is List<object> l) { list = l; return true; }
            list = null;
            return false;
        }

        /// <summary>True and the dictionary when the key holds a JSON object; false and null otherwise.</summary>
        public static bool TryDict(string key, out Dictionary<string, object> dict)
        {
            if (Has(key) && Args[key] is Dictionary<string, object> d) { dict = d; return true; }
            dict = null;
            return false;
        }

        /// <summary>The list, or null when the key is missing or not an array: <c>ListOrNull("k") ?? defaults</c> works.</summary>
        public static List<object> ListOrNull(string key) => TryList(key, out var l) ? l : null;

        /// <summary>The dictionary, or null when the key is missing or not an object.</summary>
        public static Dictionary<string, object> DictOrNull(string key) => TryDict(key, out var d) ? d : null;

        /// <summary>Absolute path: relative paths resolve against the project root (not the job dir).</summary>
        public static string ResolvePath(string p)
        {
            if (string.IsNullOrEmpty(p)) return p;
            return Path.IsPathRooted(p) ? p : Path.GetFullPath(Path.Combine(ProjectRoot, p));
        }

        /// <summary>Default output folder for files a job writes: &lt;jobdir&gt;/out, or Library/AgentKit/out.</summary>
        public static string OutDir(string sub = null)
        {
            var root = JobDir != null ? Path.Combine(JobDir, "out") : Path.Combine(ProjectRoot, "Library/AgentKit/out");
            var d = sub == null ? root : Path.Combine(root, sub);
            Directory.CreateDirectory(d);
            return d;
        }

        public static void Warn(string msg)
        {
            s_Warnings.Add(msg);
            Debug.LogWarning("[AgentKit] " + msg);
        }

        public static void Log(string msg) => Debug.Log("[AgentKit] " + msg);

        // ------------------------------------------------------------------ lifecycle
        /// <summary>Synchronous job: runs body, writes one envelope. Exceptions become ok=false.</summary>
        public static void Run(Func<object> body)
        {
            Resolve();
            s_Finished = false;
            object result;
            try
            {
                result = body();
            }
            catch (Exception e)
            {
                Fail(e.GetType().Name + ": " + e.Message, null, e);
                return;
            }
            if (s_Async) return; // body called BeginAsync: the job ends later with Succeed/Fail
            if (!s_Finished) Succeed(result);
        }

        /// <summary>Declare that this job finishes later (editor ticks, play mode, domain reloads).
        /// One-shot jobs must be launched without -quit (ut_run.run_method(..., quit=False)).</summary>
        public static void BeginAsync()
        {
            Resolve();
            if (!s_Bridge && HasQuitFlag && Application.isBatchMode)
                throw new InvalidOperationException("async job launched with -quit: the editor would quit before it ends. " +
                                                    "Launch it with ut_run.run_method(..., quit=False).");
            s_Async = true;
            var ctx = new Dictionary<string, object> { { "dir", s_JobDir }, { "id", s_JobId }, { "method", s_Method }, { "bridge", s_Bridge } };
            if (s_Bridge) SessionState.SetString(SessionKey, AgentJson.Serialize(ctx));
        }

        public static void Succeed(object result, IEnumerable<string> warnings = null)
        {
            if (warnings != null) s_Warnings.AddRange(warnings);
            Finish(true, result, null, null);
        }

        public static void Fail(string error, object partial = null, Exception ex = null)
        {
            Finish(false, partial, error, ex);
        }

        static void Finish(bool ok, object result, string error, Exception ex)
        {
            Resolve();
            if (s_Finished) return;
            s_Finished = true;
            var env = new Dictionary<string, object>
            {
                { "ok", ok },
                { "job", s_JobId },
                { "method", s_Method },
                { "result", result },
                { "error", error },
                { "exception", ex != null ? ex.GetType().FullName : null },
                { "stack", ex != null ? ex.ToString() : null },
                { "warnings", new List<string>(s_Warnings) },
                { "unity", Application.unityVersion },
                { "graphics", SystemInfo.graphicsDeviceType.ToString() },
                { "batch", Application.isBatchMode },
                { "bridge", s_Bridge },
                { "active_target", EditorUserBuildSettings.activeBuildTarget.ToString() },
                { "seconds_in_editor", s_Watch != null ? Math.Round(s_Watch.Elapsed.TotalSeconds, 3) : 0 },
                { "agentkit", Version },
            };
            string json = AgentJson.Serialize(env);
            string file = null;
            try
            {
                var dir = s_JobDir ?? Path.Combine(ProjectRoot, "Library/AgentKit");
                Directory.CreateDirectory(dir);
                file = Path.Combine(dir, s_JobDir != null ? "result.json" : "last_result.json");
                File.WriteAllText(file, AgentJson.Serialize(env, true));
            }
            catch (Exception we)
            {
                Debug.LogError("[AgentKit] could not write result file: " + we.Message);
            }
            string line = json;
            if (line.Length > MaxLineChars)
            {
                var small = new Dictionary<string, object>(env) { ["result"] = null };
                small["result_file"] = file;
                small["result_truncated"] = true;
                line = AgentJson.Serialize(small);
            }
            var prev = Application.GetStackTraceLogType(LogType.Log);
            Application.SetStackTraceLogType(LogType.Log, StackTraceLogType.None);
            Debug.Log("AGENT_RESULT " + line);
            Application.SetStackTraceLogType(LogType.Log, prev);
            SessionState.EraseString(SessionKey);
            s_Warnings.Clear();

            if (s_Bridge) return; // live editor: never exit
            if (!Application.isBatchMode) return;
            if (!ok) EditorApplication.Exit(1);
            else if (s_Async || !HasQuitFlag) EditorApplication.Exit(0);
            // ok and -quit: return, Unity quits with code 0 after the method returns.
        }

        // ------------------------------------------------------------------ built-in jobs
        /// <summary>Round-trip probe: echoes the args and reports editor facts.</summary>
        public static void Echo()
        {
            Run(() => new Dictionary<string, object>
            {
                { "echo", Args },
                { "unity", Application.unityVersion },
                { "platform", Application.platform.ToString() },
                { "graphics", SystemInfo.graphicsDeviceType.ToString() },
                { "render_pipeline", UnityEngine.Rendering.GraphicsSettings.currentRenderPipeline ? UnityEngine.Rendering.GraphicsSettings.currentRenderPipeline.name : "Built-in" },
                { "color_space", PlayerSettings.colorSpace.ToString() },
                { "active_target", EditorUserBuildSettings.activeBuildTarget.ToString() },
                { "quality_level", QualitySettings.names[QualitySettings.GetQualityLevel()] },
                { "project", ProjectRoot },
                { "enter_play_mode_options_enabled", EditorSettings.enterPlayModeOptionsEnabled },
                { "enter_play_mode_options", EditorSettings.enterPlayModeOptions.ToString() },
                { "scripting_backend", PlayerSettings.GetScriptingBackend(UnityEditor.Build.NamedBuildTarget.Standalone).ToString() },
                { "input_handler", ActiveInputHandler() },
            });
        }

        static string ActiveInputHandler()
        {
#if ENABLE_INPUT_SYSTEM && ENABLE_LEGACY_INPUT_MANAGER
            return "Both";
#elif ENABLE_INPUT_SYSTEM
            return "InputSystemPackage";
#else
            return "InputManager (legacy)";
#endif
        }
    }
}
