// AgentKit.Animation v0.1 (Unity Expert Skills, 2026-09-24). Run a job through real Play mode at a fixed frame
// rate, from a batch editor (launch with ut_run.run_method(..., quit=False, graphics=True)).
//
// Why: some animation behaviour exists only on Playback evaluations (Timeline markers and signals, OnAnimatorMove
// with a CharacterController, Cinemachine's own Update). The template default reloads the domain on Play, which
// kills an editor job's statics (lead trap O10); this helper switches Enter Play Mode Options to "no domain
// reload" for the run and restores the project setting afterwards. Time.captureFramerate makes every frame exactly
// 1/fps whatever the machine speed, so results are deterministic and fast (600 frames in about 5 s here).
// Run in Unity 6000.3.21f1 on 2026-09-24: AnimTimeline.PlayCutscene, AnimProcedural.RootMotionPlay.
using System;
using System.Collections.Generic;
using UnityEditor;
using UnityEngine;

namespace AgentKit.Animation
{
    public static class AnimPlayMode
    {
        /// <summary>onStart runs on the first Play-mode frame (find objects there: the scene is reloaded);
        /// perFrame(frame) returns true to stop and must copy every value it needs; finish() runs after Play mode
        /// has exited, when the Play-mode objects are already destroyed (a component read there is Unity-null:
        /// observed, the marker receiver "vanished").</summary>
        public static void Run(float fps, int maxFrames, Action onStart, Func<int, bool> perFrame, Func<Dictionary<string, object>> finish)
        {
            AgentJob.BeginAsync();
            bool keepEnabled = EditorSettings.enterPlayModeOptionsEnabled;
            var keepOptions = EditorSettings.enterPlayModeOptions;
            EditorSettings.enterPlayModeOptionsEnabled = true;
            EditorSettings.enterPlayModeOptions = EnterPlayModeOptions.DisableDomainReload;
            bool started = false, stopping = false;
            int frame = 0;
            Dictionary<string, object> result = null;
            string error = null;
            EditorApplication.CallbackFunction tick = null;
            tick = () =>
            {
                try
                {
                    if (stopping)
                    {
                        if (EditorApplication.isPlaying) return;
                        EditorApplication.update -= tick;
                        EditorSettings.enterPlayModeOptionsEnabled = keepEnabled;
                        EditorSettings.enterPlayModeOptions = keepOptions;
                        if (error != null) { AgentJob.Fail(error, result); return; }
                        result = finish();
                        AgentJob.Succeed(result);
                        return;
                    }
                    if (!EditorApplication.isPlaying) return;
                    if (!started)
                    {
                        started = true;
                        Time.captureFramerate = Mathf.RoundToInt(fps);
                        onStart();
                        return;
                    }
                    frame++;
                    if (perFrame(frame) || frame >= maxFrames)
                    {
                        Time.captureFramerate = 0;
                        stopping = true;
                        EditorApplication.ExitPlaymode();
                    }
                }
                catch (Exception e)
                {
                    error = e.GetType().Name + ": " + e.Message;
                    Time.captureFramerate = 0;
                    stopping = true;
                    if (EditorApplication.isPlaying) EditorApplication.ExitPlaymode();
                }
            };
            EditorApplication.update += tick;
            EditorApplication.EnterPlaymode();
        }
    }
}
