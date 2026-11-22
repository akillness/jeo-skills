// WebLeaderboard.cs (scenario-unity-web skill, 2026-09-24). C# side of AgentWebBridge.jslib.
// Pattern (6.3 Manual, "Create callbacks between Unity C#, JavaScript, and C/C++/C# code"):
// a [DllImport("__Internal")] extern per .jslib function, a static [MonoPInvokeCallback] method as
// the function pointer JavaScript calls back, and a request id to match answers to callers.
// Every extern is guarded by UNITY_WEBGL && !UNITY_EDITOR so Play mode and tests use the stub.
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-web/test_live_web.py (IL2CPP Web build,
// headless Chrome: submit -> page Promise -> callback -> rank logged).
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using AOT;
using UnityEngine;

namespace AgentWeb
{
    [Serializable]
    public class SubmitResult
    {
        public bool ok;
        public int rank;
        public string error;
        public string name;     // echoed by the page bridge: proves UTF-8 text survives C# -> JS -> C#
    }

    public static class WebLeaderboard
    {
        delegate void ResultCallback(int requestId, IntPtr json);

        static readonly Dictionary<int, Action<SubmitResult>> s_Pending = new Dictionary<int, Action<SubmitResult>>();
        static int s_NextId;

#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")] static extern void AgentWeb_SubmitScore(string name, int score, int requestId, ResultCallback callback);
        [DllImport("__Internal")] static extern void AgentWeb_Signal(string evt, string payload);
#else
        // Editor and non-Web stand-ins: same flow, answered locally.
        static void AgentWeb_SubmitScore(string name, int score, int requestId, ResultCallback callback)
        {
            Deliver(requestId, JsonUtility.ToJson(new SubmitResult { ok = true, rank = 1, error = "editor stub", name = name }));
        }
        static void AgentWeb_Signal(string evt, string payload)
        {
            Debug.Log("AGENTWEB_SIGNAL " + evt + " " + payload);
        }
#endif

        /// <summary>Send a score to window.StudioLeaderboard.submit on the page; done runs on the main thread
        /// when the page's Promise settles (ok=false when the page has no leaderboard).</summary>
        public static void SubmitScore(string playerName, int score, Action<SubmitResult> done)
        {
            int id = ++s_NextId;
            s_Pending[id] = done;
            AgentWeb_SubmitScore(playerName ?? "", score, id, OnSubmitResult);
        }

        /// <summary>Game -> page event (for example "gameplay_start"). The page forwards it to a portal SDK.</summary>
        public static void Signal(string evt, string payload = "")
        {
            AgentWeb_Signal(evt, payload ?? "");
        }

        [MonoPInvokeCallback(typeof(ResultCallback))]
        static void OnSubmitResult(int requestId, IntPtr json)
        {
            // copy before returning: the .jslib frees the buffer right after this call
            Deliver(requestId, Marshal.PtrToStringUTF8(json));
        }

        static void Deliver(int requestId, string json)
        {
            SubmitResult res;
            try { res = JsonUtility.FromJson<SubmitResult>(json); }
            catch (Exception e) { res = new SubmitResult { ok = false, rank = -1, error = "bad json: " + e.Message }; }
            if (s_Pending.TryGetValue(requestId, out var cb))
            {
                s_Pending.Remove(requestId);
                cb?.Invoke(res);
            }
        }
    }
}
