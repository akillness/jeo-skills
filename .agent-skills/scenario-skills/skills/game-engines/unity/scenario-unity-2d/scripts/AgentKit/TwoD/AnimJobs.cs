// AgentKit 2D v0.1 (scenario-unity-2d skill, 2026-09-24). Frame-by-frame sprite animation by script.
//
// Rules (Brackeys hkaysu1Z-N8, Sasquatch IXwEsV8yXk4, whzomFgjT50): sprite clips at a deliberate
// sample rate (12, not the 60 default); transitions between sprite-sheet clips have Has Exit Time
// OFF and Duration 0 (there is nothing to blend); Any State transitions need Can Transition To Self
// OFF or the target restarts every frame and freezes on its first sprite; physical-outcome
// parameters (grounded, landed) come from the controller, never from input.
// The Animator window is a visual editor; agents author through UnityEditor.Animations.
//
// Jobs:
//   AgentKit.TwoD.AnimJobs.BuildSpriteAnimator  args: sheet, out_dir (Assets/Animation), controller
//        (Assets/Animation/Player.controller), clips {Name: {frames:[sprite names], fps, loop}}
//   AgentKit.TwoD.AnimJobs.LintAnimator         args: controllers [paths], fps_range [4, 24] ([added] range)
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-2d/test_live_2d.py (P8).
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Animations;
using UnityEngine;

namespace AgentKit.TwoD
{
    public static class AnimJobs
    {
        public static void BuildSpriteAnimator()
        {
            AgentJob.Run(() =>
            {
                var sheet = AgentJob.Str("sheet", "Assets/Art/Pixel/player.png");
                var dir = AgentJob.Str("out_dir", "Assets/Animation");
                var ctrlPath = AgentJob.Str("controller", dir + "/Player.controller");
                TwoDUtil.EnsureFolder(dir);
                var spec = AgentJob.Dict("clips");
                var clips = new Dictionary<string, AnimationClip>();
                foreach (var kv in spec)
                {
                    var c = (Dictionary<string, object>)kv.Value;
                    var frames = ((List<object>)c["frames"]).Select(x => TwoDUtil.Sprite(sheet, x.ToString())).ToList();
                    float fps = (float)AgentJson.ToDouble(c.TryGetValue("fps", out var f) ? f : null, 12);
                    bool loop = !c.TryGetValue("loop", out var l) || (l is bool lb && lb);
                    clips[kv.Key] = SpriteClip(dir + "/Player_" + kv.Key + ".anim", frames, fps, loop);
                }

                var ctrl = ResetOrCreate(ctrlPath);    // rebuilt from the spec on every run: idempotent, no file deleted
                ctrl.AddParameter("Speed", AnimatorControllerParameterType.Float);
                ctrl.AddParameter("VelocityY", AnimatorControllerParameterType.Float);
                ctrl.AddParameter("Grounded", AnimatorControllerParameterType.Bool);
                var sm = ctrl.layers[0].stateMachine;
                var states = new Dictionary<string, AnimatorState>();
                foreach (var kv in clips)
                {
                    var st = sm.AddState(kv.Key);
                    st.motion = kv.Value;
                    st.writeDefaultValues = false;
                    states[kv.Key] = st;
                }
                if (states.TryGetValue("Idle", out var idle)) sm.defaultState = idle;

                AnimatorStateTransition T(AnimatorState from, AnimatorState to)
                {
                    var t = from.AddTransition(to);
                    t.hasExitTime = false;
                    t.duration = 0f;
                    t.hasFixedDuration = true;
                    return t;
                }
                AnimatorStateTransition Any(AnimatorState to)
                {
                    var t = sm.AddAnyStateTransition(to);
                    t.hasExitTime = false;
                    t.duration = 0f;
                    t.canTransitionToSelf = false;        // Brackeys [00:16:17]: otherwise it restarts every frame
                    return t;
                }
                if (states.ContainsKey("Idle") && states.ContainsKey("Run"))
                {
                    var a = T(states["Idle"], states["Run"]);
                    a.AddCondition(AnimatorConditionMode.Greater, 0.01f, "Speed");
                    a.AddCondition(AnimatorConditionMode.If, 0, "Grounded");
                    var b = T(states["Run"], states["Idle"]);
                    b.AddCondition(AnimatorConditionMode.Less, 0.01f, "Speed");
                }
                if (states.ContainsKey("Jump"))
                {
                    var j = Any(states["Jump"]);
                    j.AddCondition(AnimatorConditionMode.IfNot, 0, "Grounded");
                    j.AddCondition(AnimatorConditionMode.Greater, 0.1f, "VelocityY");
                }
                if (states.ContainsKey("Fall"))
                {
                    var fl = Any(states["Fall"]);
                    fl.AddCondition(AnimatorConditionMode.IfNot, 0, "Grounded");
                    fl.AddCondition(AnimatorConditionMode.Less, -0.1f, "VelocityY");
                }
                foreach (var air in new[] { "Jump", "Fall" }.Where(states.ContainsKey))
                {
                    if (states.ContainsKey("Idle"))
                    {
                        var t = T(states[air], states["Idle"]);
                        t.AddCondition(AnimatorConditionMode.If, 0, "Grounded");
                        t.AddCondition(AnimatorConditionMode.Less, 0.01f, "Speed");
                    }
                    if (states.ContainsKey("Run"))
                    {
                        var t = T(states[air], states["Run"]);
                        t.AddCondition(AnimatorConditionMode.If, 0, "Grounded");
                        t.AddCondition(AnimatorConditionMode.Greater, 0.01f, "Speed");
                    }
                }
                EditorUtility.SetDirty(ctrl);
                AssetDatabase.SaveAssets();
                return new Dictionary<string, object>
                {
                    { "controller", ctrlPath }, { "states", states.Keys.ToList() },
                    { "clips", clips.ToDictionary(k => k.Key, k => (object)new Dictionary<string, object> { { "fps", k.Value.frameRate }, { "length", k.Value.length }, { "loop", k.Value.isLooping } }) },
                    { "transitions", sm.states.Sum(s => s.state.transitions.Length) + sm.anyStateTransitions.Length },
                    { "lint", Lint(ctrl, 4, 24).items },
                };
            });
        }

        /// <summary>Load the controller and empty it (parameters, states, Any State transitions), or create it.</summary>
        public static AnimatorController ResetOrCreate(string path)
        {
            var ctrl = AssetDatabase.LoadAssetAtPath<AnimatorController>(path);
            if (ctrl == null) return AnimatorController.CreateAnimatorControllerAtPath(path);
            foreach (var p in ctrl.parameters.ToArray()) ctrl.RemoveParameter(p);
            var sm = ctrl.layers[0].stateMachine;
            foreach (var t in sm.anyStateTransitions.ToArray()) sm.RemoveAnyStateTransition(t);
            foreach (var t in sm.entryTransitions.ToArray()) sm.RemoveEntryTransition(t);
            foreach (var cs in sm.states.ToArray()) sm.RemoveState(cs.state);
            return ctrl;
        }

        /// <summary>Clip with an object-reference curve on SpriteRenderer.m_Sprite (what dragging frames into
        /// the Animation window creates). No extra "hold" key: Unity already gives the last sprite key one
        /// frame (length = last key + 1/fps, observed: 4 frames at 12 fps = 0.333 s).</summary>
        public static AnimationClip SpriteClip(string path, IList<Sprite> frames, float fps, bool loop)
        {
            var clip = AssetDatabase.LoadAssetAtPath<AnimationClip>(path);
            bool isNew = clip == null;
            if (isNew) clip = new AnimationClip();
            clip.frameRate = fps;
            var binding = EditorCurveBinding.PPtrCurve("", typeof(SpriteRenderer), "m_Sprite");
            var keys = new ObjectReferenceKeyframe[frames.Count];
            for (int i = 0; i < frames.Count; i++) keys[i] = new ObjectReferenceKeyframe { time = i / fps, value = frames[i] };
            AnimationUtility.SetObjectReferenceCurve(clip, binding, keys);
            var settings = AnimationUtility.GetAnimationClipSettings(clip);
            settings.loopTime = loop;
            AnimationUtility.SetAnimationClipSettings(clip, settings);
            if (isNew) AssetDatabase.CreateAsset(clip, path);
            EditorUtility.SetDirty(clip);
            return clip;
        }

        public static void LintAnimator()
        {
            AgentJob.Run(() =>
            {
                var range = TwoDUtil.ListOr("fps_range", 4, 24);
                float lo = (float)AgentJson.ToDouble(range[0], 4), hi = (float)AgentJson.ToDouble(range[range.Count - 1], 24);
                var f = new AgentAudit.Findings();
                foreach (var p in TwoDUtil.ListOr("controllers", "Assets/Animation/Player.controller"))
                {
                    var c = AssetDatabase.LoadAssetAtPath<AnimatorController>(p.ToString()) ?? throw new InvalidOperationException("no controller " + p);
                    Lint(c, lo, hi, f);
                }
                return new Dictionary<string, object> { { "counts", f.Counts() }, { "findings", f.items } };
            });
        }

        static bool SpriteOnly(Motion m)
        {
            var clip = m as AnimationClip;
            if (clip == null) return false;
            return AnimationUtility.GetObjectReferenceCurveBindings(clip).Any(b => b.propertyName == "m_Sprite")
                   && AnimationUtility.GetCurveBindings(clip).Length == 0;
        }

        public static AgentAudit.Findings Lint(AnimatorController c, float fpsLo, float fpsHi, AgentAudit.Findings f = null)
        {
            f = f ?? new AgentAudit.Findings();
            var path = AssetDatabase.GetAssetPath(c);
            var used = new HashSet<string>(c.parameters.Select(p => p.name));
            foreach (var layer in c.layers)
            {
                var sm = layer.stateMachine;
                foreach (var cs in sm.states)
                {
                    var st = cs.state;
                    if (st.motion is AnimationClip clip)
                    {
                        if (SpriteOnly(clip) && (clip.frameRate < fpsLo || clip.frameRate > fpsHi))
                            f.Add("warn", "2d.anim_fps", path + ":" + st.name, "sprite clip at " + clip.frameRate + " samples/s", "12 is the usual sprite rate; 60 is the default and plays too fast");
                        if (!AnimationUtility.GetObjectReferenceCurveBindings(clip).Any() && !AnimationUtility.GetCurveBindings(clip).Any())
                            f.Add("error", "2d.anim_empty", path + ":" + st.name, "clip has no curves", "key m_Sprite frames");
                    }
                    foreach (var t in st.transitions)
                    {
                        bool spriteToSprite = SpriteOnly(st.motion) && t.destinationState != null && SpriteOnly(t.destinationState.motion);
                        if (spriteToSprite && (t.hasExitTime || t.duration > 0f))
                            f.Add("error", "2d.anim_blend", path + ":" + st.name + "->" + t.destinationState.name, "sprite-sheet transition with exit time " + t.hasExitTime + ", duration " + t.duration, "Has Exit Time off, Transition Duration 0");
                        foreach (var cond in t.conditions)
                            if (!used.Contains(cond.parameter))
                                f.Add("error", "2d.anim_param", path + ":" + st.name, "condition on unknown parameter '" + cond.parameter + "' (names are case sensitive)", "fix the name");
                    }
                }
                foreach (var t in sm.anyStateTransitions)
                    if (t.canTransitionToSelf && t.destinationState != null)
                        f.Add("error", "2d.anim_any_self", path + ":Any->" + t.destinationState.name, "Any State transition can transition to self: the state restarts every frame", "Can Transition To Self off");
            }
            return f;
        }
    }
}
