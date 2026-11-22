// AgentKit.Animation v0.1 (Unity Expert Skills, 2026-09-24). Live checks of the runtime pieces: second-order
// dynamics, the Playables one-shot graph, and root motion through a CharacterController in Play mode.
//
// Jobs:
//   AgentKit.Animation.AnimProcedural.SecondOrderCheck   args: f, zeta, r, fps, hitch_f
//   AgentKit.Animation.AnimProcedural.GraphOneShotCheck  args: scene, target, idle, walk, oneshot (motion refs), fps
//   AgentKit.Animation.AnimProcedural.RootMotionPlay     args: scene, target, params{}, seconds, fps, vertical (Script |
//        ClipWhenUnbaked)  (quit=False)
// Run in Unity 6000.3.21f1 on 2026-09-24: test_live_animation.py::test_09, test_10.
using System;
using System.Collections.Generic;
using System.Linq;
using AgentKit.Animation.Runtime;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Playables;   // PlayableExtensions: GetInput, GetInputWeight on any playable struct

namespace AgentKit.Animation
{
    public static class AnimProcedural
    {
        public static void SecondOrderCheck()
        {
            AgentJob.Run(() =>
            {
                float f = AgentJob.Float("f", 2f), zeta = AgentJob.Float("zeta", 0.5f), r = AgentJob.Float("r", 0f), fps = AgentJob.Float("fps", 60f);
                var s = new SecondOrderDynamics(f, zeta, r, Vector3.zero);
                float T = 1f / fps, peak = 0f, low = 0f;
                var trace = new List<object>();
                for (int i = 1; i <= Mathf.RoundToInt(10f * fps); i++)
                {
                    var y = s.Update(T, Vector3.right).x;   // unit step at t = 0
                    peak = Mathf.Max(peak, y); low = Mathf.Min(low, y);
                    if (i % Mathf.RoundToInt(fps / 10f) == 0 && i <= fps * 2) trace.Add(Math.Round(y, 5));
                }
                // stability: a fast filter hit by one 250 ms frame (a hitch) must stay finite and settle
                float hf = AgentJob.Float("hitch_f", 30f);
                var h = new SecondOrderDynamics(hf, 1f, 0f, Vector3.zero);
                bool finite = true;
                for (int i = 0; i < 120; i++)
                {
                    var v = h.Update(i == 60 ? 0.25f : 1f / 30f, Vector3.one).x;
                    finite &= !(float.IsNaN(v) || float.IsInfinity(v) || Mathf.Abs(v) > 10f);
                }
                return new Dictionary<string, object>
                {
                    { "f", f }, { "zeta", zeta }, { "r", r }, { "final", Math.Round(s.Value.x, 6) }, { "peak", Math.Round(peak, 5) },
                    { "min", Math.Round(low, 5) }, { "t_critical", Math.Round(s.CriticalTimestep, 6) }, { "trace_0_2s", trace },
                    { "hitch_f", hf }, { "hitch_finite", finite }, { "hitch_final", Math.Round(h.Value.x, 5) },
                };
            });
        }

        public static void GraphOneShotCheck()
        {
            AgentJob.Run(() =>
            {
                var scene = AgentJob.Str("scene", AnimSampler.DefaultScene);
                if (EditorSceneManager.GetActiveScene().path != scene) EditorSceneManager.OpenScene(scene, OpenSceneMode.Single);
                var a = AnimSampler.FindTarget(AgentJob.Str("target", "Hero"));
                var keep = a.runtimeAnimatorController;
                var idle = (AnimationClip)AnimControllerBuilder.LoadMotion(AgentJob.Str("idle"));
                var walk = (AnimationClip)AnimControllerBuilder.LoadMotion(AgentJob.Str("walk"));
                var shot = (AnimationClip)AnimControllerBuilder.LoadMotion(AgentJob.Str("oneshot"));
                a.runtimeAnimatorController = null;   // a graph and a controller on one Animator: run only one (fQzKJO-0dS8 [00:13:25])
                float fps = AgentJob.Float("fps", 30f), dt = 1f / fps;
                var g = new AgentAnimationGraph(a, idle, walk, manual: true);
                var rows = new List<object>();
                float maxSumErr = 0f;
                bool destroyed;
                try
                {
                    g.UpdateLocomotion(0.8f, 1.08f);
                    g.PlayOneShot(shot);
                    g.PlayOneShot(shot);                  // same clip again: ignored, still one playable on input 1
                    int inputsAfterDouble = g.Top.GetInput(1).IsValid() ? 1 : 0;
                    float total = shot.length + 0.5f;
                    for (int i = 0; i <= Mathf.RoundToInt(total * fps); i++)
                    {
                        g.Tick(i == 0 ? 0f : dt);
                        g.Graph.Evaluate(i == 0 ? 0f : dt);
                        float w0 = g.Top.GetInputWeight(0), w1 = g.Top.GetInputWeight(1);
                        maxSumErr = Mathf.Max(maxSumErr, Mathf.Abs(w0 + w1 - 1f));
                        if (i % Mathf.RoundToInt(fps / 4f) == 0)
                            rows.Add(new Dictionary<string, object> { { "t", Math.Round(i * dt, 3) }, { "w_loco", Math.Round(w0, 4) }, { "w_shot", Math.Round(w1, 4) }, { "active", g.OneShotActive } });
                    }
                    var res = new Dictionary<string, object>
                    {
                        { "clip", shot.name }, { "length", Math.Round(shot.length, 3) }, { "blend", Math.Round(AgentAnimationGraph.BlendDuration(shot.length), 4) },
                        { "inputs_after_double_play", inputsAfterDouble }, { "max_weight_sum_error", Math.Round(maxSumErr, 6) },
                        { "active_at_end", g.OneShotActive }, { "rows", rows },
                    };
                    g.Destroy();
                    destroyed = !g.Graph.IsValid();
                    res["graph_valid_after_destroy"] = !destroyed;
                    return res;
                }
                finally
                {
                    g.Destroy();
                    a.runtimeAnimatorController = keep;
                }
            });
        }

        public static void RootMotionPlay()
        {
            AgentJob.Run(() =>
            {
                var scene = AgentJob.Str("scene", AnimSampler.DefaultScene);
                if (EditorSceneManager.GetActiveScene().path != scene) EditorSceneManager.OpenScene(scene, OpenSceneMode.Single);
                var targetName = AgentJob.Str("target", "Hero");
                var pars = AgentJob.Dict("params");
                float fps = AgentJob.Float("fps", 60f), seconds = AgentJob.Float("seconds", 3f), warm = AgentJob.Float("warmup", 1f);
                Animator a = null; AgentRootMotionMover mover = null; CharacterController cc = null;
                Vector3 start = Vector3.zero; int startMoves = 0, startFrame = 0;
                var result = new Dictionary<string, object>();
                int n = Mathf.RoundToInt((seconds + warm) * fps);
                AnimPlayMode.Run(fps, n + 5,
                    onStart: () =>
                    {
                        var go = AnimUtil.Require(GameObject.Find(targetName), "no " + targetName);
                        a = go.GetComponent<Animator>();
                        a.applyRootMotion = true;
                        a.cullingMode = AnimatorCullingMode.AlwaysAnimate;   // no camera renders in a batch Play mode
                        a.updateMode = AnimatorUpdateMode.Normal;            // Normal with a CharacterController (Animate Physics suits Rigidbodies)
                        cc = AnimUtil.GetOrAdd<CharacterController>(go);
                        cc.height = 1.8f; cc.center = new Vector3(0, 0.92f, 0); cc.radius = 0.28f;
                        mover = AnimUtil.GetOrAdd<AgentRootMotionMover>(go);
                        mover.vertical = AgentJob.Str("vertical", "Script") == "ClipWhenUnbaked"
                            ? AgentRootMotionMover.VerticalSource.ClipWhenUnbaked : AgentRootMotionMover.VerticalSource.Script;
                        foreach (var kv in pars) { if (kv.Value is bool b) a.SetBool(kv.Key, b); else a.SetFloat(kv.Key, (float)AgentJson.ToDouble(kv.Value)); }
                    },
                    perFrame: f =>
                    {
                        if (f == Mathf.RoundToInt(warm * fps)) { start = a.transform.position; startMoves = mover.moves; startFrame = f; }
                        if (f < n) return false;
                        var end = a.transform.position;
                        float dist = new Vector2(end.x - start.x, end.z - start.z).magnitude;
                        result["ground_speed"] = Math.Round(dist / seconds, 4);
                        result["moves_per_frame"] = Math.Round((mover.moves - startMoves) / (float)(f - startFrame), 4);
                        result["grounded"] = cc.isGrounded;
                        result["y"] = Math.Round(end.y, 4);
                        result["state"] = AnimSampler.CurrentStateName(a, 0);
                        result["vertical"] = mover.vertical.ToString();
                        result["gravity_weight"] = Math.Round(mover.lastGravityWeight, 4);
                        result["frames"] = f;
                        return true;
                    },
                    finish: () => result);
                return null;
            });
        }
    }
}
