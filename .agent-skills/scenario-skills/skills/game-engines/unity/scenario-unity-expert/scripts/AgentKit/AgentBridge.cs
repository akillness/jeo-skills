// AgentKit v0.1 (Unity Expert Skills, 2026-09-24). A live channel into an editor that is already
// running (the user's GUI editor, or a resident headless editor started without -quit), with no
// package, no network port and no MCP server: request files in, result files out.
//
//   <project>/Library/AgentKit/bridge/inbox/<id>.json   {"id", "method", "args"}   (written by ut_live)
//   <project>/Library/AgentKit/bridge/jobs/<id>/        args.json, result.json (AgentJob envelope)
//   <project>/Library/AgentKit/bridge/heartbeat.json    pid, epoch (domain load time), compiling,
//                                                       playing, compile errors, every second
// The bridge polls on EditorApplication.update (5 times a second), runs one request at a time on
// the main thread through the same AgentJob protocol as batch jobs (so every AgentKit job works
// live), and never runs while the editor compiles or imports. Batch mode would refuse a project
// the GUI editor holds (the lock rule), so this is how an agent keeps working next to the user.
// It is off in one-shot batch jobs (-agentJob with -quit) and test runs (-runTests).
// Security: it runs static methods named in files under Library/, as the local user; it never
// opens a socket. Quit refuses to close a GUI editor.
// Run in Unity 6000.3.21f1 on 2026-09-24 against a resident headless editor
// (tests/code/unity-expert/test_live_bridge.py); the GUI case uses the same code path [not run:
// no GUI windows on this machine during tests].
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using UnityEditor;
using UnityEditor.Compilation;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace AgentKit
{
    [InitializeOnLoad]
    public static class AgentBridge
    {
        public const string Version = "0.1";
        static readonly double s_Epoch;
        static double s_NextPoll, s_NextBeat;
        static readonly List<Dictionary<string, object>> s_CompileMessages = new List<Dictionary<string, object>>();
        static double s_LastCompileFinished;
        static bool s_Enabled;

        /// <summary>Set by measurement jobs (AgentProfile) so the bridge's own polling and heartbeat
        /// file writes do not show up in the frames being measured.</summary>
        public static bool Paused;

        public static string Root => Path.Combine(AgentJob.ProjectRoot, "Library", "AgentKit", "bridge");

        static AgentBridge()
        {
            s_Epoch = UnixNow();
            if (AgentJob.HasArg("-runTests")) return;
            if (AgentJob.HasArg("-agentJob") && AgentJob.HasArg("-quit")) return;
            if (AgentJob.HasArg("-agentNoBridge")) return;
            s_Enabled = true;
            Directory.CreateDirectory(Path.Combine(Root, "inbox"));
            EditorApplication.update += Tick;
            CompilationPipeline.assemblyCompilationFinished += OnAssemblyCompiled;
            CompilationPipeline.compilationStarted += _ => { lock (s_CompileMessages) s_CompileMessages.Clear(); };
            CompilationPipeline.compilationFinished += _ => { s_LastCompileFinished = UnixNow(); WriteHeartbeat(); };
            EditorApplication.quitting += () => SafeWrite(Path.Combine(Root, "heartbeat.json"), "{\"stopped\":true}");
        }

        static double UnixNow() => (DateTime.UtcNow - new DateTime(1970, 1, 1)).TotalSeconds;

        static void OnAssemblyCompiled(string assembly, CompilerMessage[] messages)
        {
            lock (s_CompileMessages)
            {
                foreach (var m in messages)
                {
                    if (m.type != CompilerMessageType.Error && s_CompileMessages.Count > 200) continue;
                    s_CompileMessages.Add(new Dictionary<string, object>
                    {
                        { "assembly", Path.GetFileName(assembly) }, { "type", m.type.ToString() }, { "file", m.file },
                        { "line", m.line }, { "column", m.column }, { "message", m.message },
                    });
                }
            }
        }

        static void SafeWrite(string path, string text)
        {
            try
            {
                var tmp = path + ".tmp";
                File.WriteAllText(tmp, text);
                if (File.Exists(path)) File.Replace(tmp, path, null); // atomic: readers never see half a file
                else File.Move(tmp, path);
            }
            catch (Exception) { }
        }

        static void WriteHeartbeat()
        {
            List<Dictionary<string, object>> msgs;
            lock (s_CompileMessages) msgs = s_CompileMessages.Where(m => (string)m["type"] == "Error").Take(50).ToList();
            var hb = new Dictionary<string, object>
            {
                { "pid", System.Diagnostics.Process.GetCurrentProcess().Id },
                { "time", UnixNow() },
                { "epoch", s_Epoch },
                { "unity", Application.unityVersion },
                { "batch", Application.isBatchMode },
                { "project", AgentJob.ProjectRoot },
                { "compiling", EditorApplication.isCompiling },
                { "updating", EditorApplication.isUpdating },
                { "playing", EditorApplication.isPlaying },
                { "compile_failed", EditorUtility.scriptCompilationFailed },
                { "last_compile_finished", s_LastCompileFinished },
                { "compile_errors", msgs },
                { "scene", EditorSceneManager.GetActiveScene().path },
                { "graphics", SystemInfo.graphicsDeviceType.ToString() },
                { "agentkit", Version },
            };
            SafeWrite(Path.Combine(Root, "heartbeat.json"), AgentJson.Serialize(hb));
        }

        static void Tick()
        {
            if (!s_Enabled || Paused) return;
            double now = EditorApplication.timeSinceStartup;
            if (now >= s_NextBeat) { s_NextBeat = now + 1.0; WriteHeartbeat(); }
            if (now < s_NextPoll) return;
            s_NextPoll = now + 0.2;
            if (EditorApplication.isCompiling || EditorApplication.isUpdating) return;
            if (!string.IsNullOrEmpty(SessionState.GetString("AgentKit.Job.Context", ""))) return; // an async job is running
            var inbox = Path.Combine(Root, "inbox");
            if (!Directory.Exists(inbox)) return;
            var next = Directory.GetFiles(inbox, "*.json").OrderBy(p => p, StringComparer.Ordinal).FirstOrDefault();
            if (next == null) return;
            Process(next);
        }

        static void Process(string requestPath)
        {
            Dictionary<string, object> req;
            try { req = AgentJson.ParseObject(File.ReadAllText(requestPath)); }
            catch (Exception) { return; } // half-written file: next tick
            var id = req.TryGetValue("id", out var i) ? Convert.ToString(i) : Path.GetFileNameWithoutExtension(requestPath);
            var method = req.TryGetValue("method", out var m) ? Convert.ToString(m) : null;
            var jobDir = Path.Combine(Root, "jobs", id);
            Directory.CreateDirectory(jobDir);
            File.WriteAllText(Path.Combine(jobDir, "args.json"),
                AgentJson.Serialize(req.TryGetValue("args", out var a) && a != null ? a : new Dictionary<string, object>(), true));
            var done = Path.Combine(Root, "done");
            Directory.CreateDirectory(done);
            try { File.Move(requestPath, Path.Combine(done, Path.GetFileName(requestPath))); } catch (Exception) { }

            AgentJob.SetBridgeContext(id, jobDir, method);
            try
            {
                var mi = FindMethod(method);
                if (mi == null) AgentJob.Fail("bridge: static method '" + method + "' not found in loaded assemblies (did it compile? was the editor refreshed?)");
                else
                {
                    mi.Invoke(null, null);
                    if (!AgentJob.Finished && string.IsNullOrEmpty(SessionState.GetString("AgentKit.Job.Context", "")))
                        AgentJob.Fail("bridge: '" + method + "' returned without reporting (wrap its body in AgentJob.Run)");
                }
            }
            catch (TargetInvocationException e)
            {
                var inner = e.InnerException ?? e;
                AgentJob.Fail(inner.GetType().Name + ": " + inner.Message, null, inner);
            }
            catch (Exception e)
            {
                AgentJob.Fail(e.GetType().Name + ": " + e.Message, null, e);
            }
            finally
            {
                AgentJob.ClearBridgeContext();
            }
        }

        public static MethodInfo FindMethod(string full)
        {
            if (string.IsNullOrEmpty(full)) return null;
            int dot = full.LastIndexOf('.');
            if (dot <= 0) return null;
            var typeName = full.Substring(0, dot);
            var methodName = full.Substring(dot + 1);
            foreach (var asm in AppDomain.CurrentDomain.GetAssemblies())
            {
                var t = asm.GetType(typeName, false);
                if (t == null) continue;
                var mi = t.GetMethod(methodName, BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic, null, Type.EmptyTypes, null);
                if (mi != null) return mi;
            }
            return null;
        }

        // ------------------------------------------------------------------ built-in bridge jobs
        public static void Ping()
        {
            AgentJob.Run(() => new Dictionary<string, object>
            {
                { "pid", System.Diagnostics.Process.GetCurrentProcess().Id },
                { "unity", Application.unityVersion }, { "batch", Application.isBatchMode },
                { "playing", EditorApplication.isPlaying }, { "scene", EditorSceneManager.GetActiveScene().path },
                { "dirty_scenes", Enumerable.Range(0, EditorSceneManager.sceneCount).Select(EditorSceneManager.GetSceneAt).Count(s => s.isDirty) },
                { "epoch", s_Epoch }, { "graphics", SystemInfo.graphicsDeviceType.ToString() },
                { "echo", AgentJob.Args },
            });
        }

        /// <summary>AssetDatabase.Refresh so new or edited scripts compile; the domain reloads after
        /// this job returns (watch heartbeat.epoch and last_compile_finished).</summary>
        public static void Refresh()
        {
            AgentJob.Run(() =>
            {
                AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);
                CompilationPipeline.RequestScriptCompilation();
                return new Dictionary<string, object> { { "requested", true }, { "epoch", s_Epoch } };
            });
        }

        /// <summary>Compile messages of the last compilation (errors first).</summary>
        public static void LastCompile()
        {
            AgentJob.Run(() =>
            {
                List<Dictionary<string, object>> msgs;
                lock (s_CompileMessages) msgs = s_CompileMessages.OrderBy(x => (string)x["type"] == "Error" ? 0 : 1).ToList();
                return new Dictionary<string, object> { { "failed", EditorUtility.scriptCompilationFailed }, { "messages", msgs } };
            });
        }

        /// <summary>Quit a resident headless editor this toolkit started. Refuses a GUI editor (it
        /// belongs to the user: unsaved work) unless args.force is true.</summary>
        public static void Quit()
        {
            AgentJob.Run(() =>
            {
                if (!Application.isBatchMode && !AgentJob.Bool("force"))
                    throw new InvalidOperationException("refusing to quit a GUI editor: ask the user to save and close it");
                EditorApplication.delayCall += () => EditorApplication.Exit(0);
                return new Dictionary<string, object> { { "quitting", true } };
            });
        }

        /// <summary>Save open scenes and assets (live edits are lost otherwise).</summary>
        public static void SaveAll()
        {
            AgentJob.Run(() =>
            {
                bool scenes = EditorSceneManager.SaveOpenScenes();
                AssetDatabase.SaveAssets();
                return new Dictionary<string, object> { { "scenes_saved", scenes } };
            });
        }
    }
}
