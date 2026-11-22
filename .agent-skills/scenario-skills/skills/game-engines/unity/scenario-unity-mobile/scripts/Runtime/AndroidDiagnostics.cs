// scenario-unity-mobile v0.2 (Unity Expert Skills, 2026-09-24). Android startup and exit diagnostics.
//
// StartupReport.Interactive(): Unity calls Activity.reportFullyDrawn as the first scene loads,
// before Awake; when that scene is a loader, call DiagnosticsReporting.CallReportFullyDrawn yourself
// on the first truly interactive frame (only the first call counts, and calling it disables the
// automatic one) (6.3 Manual, Optimize application startup times).
// ExitInfo: on the next launch, read why the previous process died (ANR, crash, low memory) with the
// Unity 6 ApplicationExitInfo API, and keep a small state summary (bitmask of "what the game was
// doing", at most 128 bytes) so a vague ANR stack still has context (Unity Android team,
// pezwIhA0e04 [00:41:40] to [00:42:45]). API names read from the 6000.3.21f1 UnityEngine.AndroidJNIModule
// documentation: ApplicationExitInfoProvider.GetHistoricalProcessExitInfo(string packageName, int pid,
// int maxNum), SetProcessStateSummary(sbyte[]), IApplicationExitInfo.reason/timestamp/description/
// processStateSummary, ExitReason.ANR/Crash/CrashNative/LowMemory.
// The Android calls compile whenever the editor targets Android (UNITY_ANDROID) and run only in a
// player on a device: compiled in Unity 6000.3.21f1 on 2026-09-24 (Android-target jobs and the AAB
// build of tests/code/unity-mobile/test_live_android_build.py); the state-summary codec is EditMode
// tested (ExitStateTests). Not run on a device (none connected).
using System;
using System.Collections.Generic;
using UnityEngine;
#if UNITY_ANDROID
using UnityEngine.Android;
#endif

namespace AgentKit.Mobile
{
    public static class StartupReport
    {
        static bool s_Reported;
        public static bool Reported => s_Reported;

        /// <summary>Call once, on the first frame the player can act (menu shown, input live).</summary>
        public static bool Interactive()
        {
            if (s_Reported) return false;
            s_Reported = true;
#if UNITY_ANDROID
            if (!Application.isEditor) DiagnosticsReporting.CallReportFullyDrawn();
#endif
            return true;
        }
    }

    /// <summary>State flags written into the process state summary: what the game was doing when
    /// Android killed it. Keep it to one bitmask plus a short scene label (128 bytes max).</summary>
    [Flags]
    public enum GameStateFlags : ushort
    {
        None = 0, Loading = 1, InMenu = 2, InGameplay = 4, AdShowing = 8, PurchaseFlow = 16,
        Saving = 32, Backgrounding = 64, NetworkCall = 128, SdkInit = 256,
    }

    public static class ExitStateCodec
    {
        public const int MaxBytes = 128;

        /// <summary>2 bytes of flags + an ASCII label, truncated to 128 bytes.</summary>
        public static sbyte[] Encode(GameStateFlags flags, string label)
        {
            var bytes = new List<sbyte> { (sbyte)((ushort)flags & 0xff), (sbyte)(((ushort)flags >> 8) & 0xff) };
            foreach (var c in label ?? "")
            {
                if (bytes.Count >= MaxBytes) break;
                bytes.Add((sbyte)(c < 128 ? c : '?'));
            }
            return bytes.ToArray();
        }

        public static GameStateFlags DecodeFlags(sbyte[] data)
            => data == null || data.Length < 2 ? GameStateFlags.None : (GameStateFlags)(ushort)((byte)data[0] | ((byte)data[1] << 8));

        public static string DecodeLabel(sbyte[] data)
        {
            if (data == null || data.Length <= 2) return "";
            var chars = new char[data.Length - 2];
            for (int i = 2; i < data.Length; i++) chars[i - 2] = (char)(byte)data[i];
            return new string(chars);
        }
    }

    public struct PreviousExit
    {
        public string reason;          // "ANR", "Crash", "CrashNative", "LowMemory", ... or "none"
        public long timestampMs;
        public string description;
        public GameStateFlags flags;
        public string label;
    }

    public static class ExitInfo
    {
        /// <summary>Record the current state (cheap: call on state changes, not every frame).</summary>
        public static void SetState(GameStateFlags flags, string label)
        {
#if UNITY_ANDROID
            if (!Application.isEditor) ApplicationExitInfoProvider.SetProcessStateSummary(ExitStateCodec.Encode(flags, label));
#endif
        }

        /// <summary>On launch: why did the previous process exit? Report ANR and crash reasons to your
        /// crash reporter with the decoded state. Returns reason "none" in the Editor or off Android.</summary>
        public static PreviousExit Previous()
        {
            var r = new PreviousExit { reason = "none", description = "", label = "" };
#if UNITY_ANDROID
            if (Application.isEditor) return r;
            var list = ApplicationExitInfoProvider.GetHistoricalProcessExitInfo(Application.identifier, 0, 1);
            if (list == null || list.Length == 0) return r;
            var e = list[0];
            r.reason = e.reason.ToString();
            r.timestampMs = e.timestamp;
            r.description = e.description ?? "";
            r.flags = ExitStateCodec.DecodeFlags(e.processStateSummary);
            r.label = ExitStateCodec.DecodeLabel(e.processStateSummary);
#endif
            return r;
        }
    }
}
