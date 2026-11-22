// WebErrorReporter.cs (scenario-unity-web skill, 2026-09-24). Production error capture for a Unity 6.3 Web build.
// A release Web build logs C# exceptions to the browser console and nowhere else: nobody sees them.
// The 6.3 Manual ("Debug production Web builds > Report browser errors") says to hook page errors and
// forward them; this is the C# half. It installs itself before the first scene, listens to
// Application.logMessageReceived and forwards errors, asserts and exceptions (engine errors such as
// "Could not produce class with ID" included) through AgentWebBridge.jslib to the page reporter of the
// AgentWeb template (window.AgentWebReportError: console line + sendBeacon to AGENTWEB_ERROR_URL).
// On portals that ignore your index.html, set WebErrorReporter.endpoint from game code and the .jslib
// beacons there directly. Reports are capped per session (maxReports) so a per-frame error cannot flood
// the collector. Pair with Debug Symbols External + MethodMap.tsv to read the stacks (ut_web.archive_symbols).
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-web/test_live_web.py test_16.
using System.Runtime.InteropServices;
using UnityEngine;

namespace AgentWeb
{
    public static class WebErrorReporter
    {
        /// <summary>Collector URL used when the page has no reporter (portals). Empty: console line only.</summary>
        public static string endpoint = "";
        public static int maxReports = 20;
        static int s_Sent;

#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")] static extern void AgentWeb_ReportError(string kind, string message, string stack, string endpoint);
#else
        static void AgentWeb_ReportError(string kind, string message, string stack, string endpoint) { }
#endif

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void Install()
        {
            s_Sent = 0;
            Application.logMessageReceived -= OnLog;
            Application.logMessageReceived += OnLog;
        }

        static void OnLog(string condition, string stack, LogType type)
        {
            if (type != LogType.Exception && type != LogType.Error && type != LogType.Assert) return;
            if (s_Sent >= maxReports) return;
            s_Sent++;
            string kind = type == LogType.Exception ? "csharp_exception" : (type == LogType.Assert ? "csharp_assert" : "csharp_error");
            AgentWeb_ReportError(kind, condition ?? "", stack ?? "", endpoint ?? "");
        }
    }
}
