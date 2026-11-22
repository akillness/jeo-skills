// AgentKit.Animation v0.1 (Unity Expert Skills, 2026-09-24). AnimatorController from a JSON spec.
//
// The Animator window is a visual editor with no authoring surface for an agent; the documented
// substitute is UnityEditor.Animations.AnimatorController (6.3 Scripting API example: parameters, layers,
// state machines, states, blend trees, transitions). This job builds the whole controller from data,
// archives the previous asset instead of overwriting it, and returns a structure dump plus static
// findings, so the result is checked by numbers before anyone opens the Animator window.
//
//   ut_run.run_method(P, "AgentKit.Animation.AnimControllerBuilder.Build", {"spec": {...}})
//   ut_run.run_method(P, "AgentKit.Animation.AnimControllerBuilder.Audit", {"path": "Assets/.../Hero.controller"})
//
// Spec (see references/procedures.md P3 for a full example):
//   path, parameters[{name, type: Float|Int|Bool|Trigger, default}],
//   masks[{path, humanoid_off: [AvatarMaskBodyPart names], transforms_off: [paths]}],
//   layers[{name, weight, blending: Override|Additive, mask, ik_pass, sync_source, sync_timing,
//           default_state, states[{name, motion | tree, speed, speed_param, tag, position}],
//           transitions[{from: state|"Any", to: state|"Exit", conditions[[param, If|IfNot|Greater|Less|Equals|NotEqual, threshold]],
//                        has_exit_time, exit_time, duration, fixed_duration, offset, interruption, ordered_interruption,
//                        can_transition_to_self}],
//           sync_motions{state: motion}}],
//   hash_class{path, namespace, class}   (optional generated constants: Animator.StringToHash per state and parameter)
// motion = "Assets/Path/File.fbx::ClipName" or "Assets/Path/Clip.anim".
// tree = {type: Simple1D|SimpleDirectional2D|FreeformDirectional2D|FreeformCartesian2D|Direct, param, param_y,
//         auto: speed|speed_angular_deg|velocity_xz, children[{motion, pos: [x, y] | threshold, time_scale, mirror}]}
// "auto" places children from the clips' measured root motion (AnimationClip.averageSpeed / averageAngularSpeed),
// the scripted twin of the inspector's Compute Positions: graph coordinates become gameplay units (m/s, deg/s).
// Transition order in the spec is the priority order (earlier = higher priority, wins same-frame ties).
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-animation/test_live_animation.py::test_03.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using UnityEditor;
using UnityEditor.Animations;
using UnityEngine;

namespace AgentKit.Animation
{
    public static class AnimControllerBuilder
    {
        public static void Build()
        {
            AgentJob.Run(() => BuildFromSpec(AgentJob.Dict("spec")));
        }

        public static void Audit()
        {
            AgentJob.Run(() =>
            {
                var path = AgentJob.Str("path");
                var ac = AssetDatabase.LoadAssetAtPath<AnimatorController>(path);
                if (ac == null) throw new FileNotFoundException("no AnimatorController at " + path);
                var f = new AgentAudit.Findings();
                var dump = Dump(ac, f);
                return new Dictionary<string, object> { { "path", path }, { "controller", dump }, { "findings", f.items }, { "counts", f.Counts() } };
            });
        }

        // ------------------------------------------------------------------ build
        public static Dictionary<string, object> BuildFromSpec(Dictionary<string, object> spec)
        {
            if (spec.Count == 0) throw new ArgumentException("args.spec is empty");
            var path = S(spec, "path");
            if (string.IsNullOrEmpty(path) || !path.EndsWith(".controller")) throw new ArgumentException("spec.path must end with .controller");
            Directory.CreateDirectory(Path.GetDirectoryName(AgentJob.ResolvePath(path)));
            string archived = null;
            var ac = AssetDatabase.LoadAssetAtPath<AnimatorController>(path);
            if (ac != null)
            {
                // Version by COPY, rebuild IN PLACE. Moving the old asset away would take its GUID along and every
                // scene Animator would keep playing the archived controller (observed 2026-09-24: the lab scene
                // played a stale Idle until the builder stopped using MoveAsset).
                var dir = Path.GetDirectoryName(path).Replace('\\', '/');
                if (!AssetDatabase.IsValidFolder(dir + "/_archive")) AssetDatabase.CreateFolder(dir, "_archive");
                archived = dir + "/_archive/" + Path.GetFileNameWithoutExtension(path) + "_" + DateTime.Now.ToString("yyyyMMdd_HHmmss") + ".controller";
                if (!AssetDatabase.CopyAsset(path, archived)) throw new IOException("could not archive " + path);
                ac.layers = new AnimatorControllerLayer[0];
                ac.parameters = new AnimatorControllerParameter[0];
                foreach (var sub in AssetDatabase.LoadAllAssetsAtPath(path))
                    if (sub != null && sub != ac) UnityEngine.Object.DestroyImmediate(sub, true);   // old states, trees, transitions
                ac.AddLayer("Base Layer");
            }
            else ac = AnimatorController.CreateAnimatorControllerAtPath(path);
            foreach (var p in L(spec, "parameters"))
            {
                var d = (Dictionary<string, object>)p;
                var type = (AnimatorControllerParameterType)Enum.Parse(typeof(AnimatorControllerParameterType), S(d, "type", "Float"));
                ac.AddParameter(S(d, "name"), type);
                if (d.ContainsKey("default"))
                {
                    var ps = ac.parameters;                          // returns copies: edit, then assign back
                    var i = Array.FindIndex(ps, x => x.name == S(d, "name"));
                    if (type == AnimatorControllerParameterType.Float) ps[i].defaultFloat = F(d, "default");
                    else if (type == AnimatorControllerParameterType.Int) ps[i].defaultInt = (int)F(d, "default");
                    else if (type == AnimatorControllerParameterType.Bool) ps[i].defaultBool = B(d, "default");
                    ac.parameters = ps;
                }
            }
            var masks = new Dictionary<string, AvatarMask>();
            foreach (var m in L(spec, "masks")) { var d = (Dictionary<string, object>)m; masks[S(d, "path")] = BuildMask(d); }

            var layerSpecs = L(spec, "layers").Cast<Dictionary<string, object>>().ToList();
            var stateMaps = new List<Dictionary<string, AnimatorState>>();
            for (int li = 0; li < layerSpecs.Count; li++)
            {
                var ls = layerSpecs[li];
                if (li > 0) ac.AddLayer(S(ls, "name", "Layer " + li));
                var layers = ac.layers;
                var layer = layers[li];
                if (li == 0 && ls.ContainsKey("name")) layer.name = S(ls, "name");
                layer.defaultWeight = li == 0 ? 1f : F(ls, "weight", 0f);   // new layers start at weight 0: they do nothing
                layer.blendingMode = S(ls, "blending", "Override") == "Additive" ? AnimatorLayerBlendingMode.Additive : AnimatorLayerBlendingMode.Override;
                if (ls.ContainsKey("mask")) layer.avatarMask = masks.TryGetValue(S(ls, "mask"), out var am) ? am : AssetDatabase.LoadAssetAtPath<AvatarMask>(S(ls, "mask"));
                layer.iKPass = B(ls, "ik_pass");
                if (ls.ContainsKey("sync_source"))
                {
                    layer.syncedLayerIndex = Array.FindIndex(layers, x => x.name == S(ls, "sync_source"));
                    layer.syncedLayerAffectsTiming = B(ls, "sync_timing");
                }
                layers[li] = layer;
                ac.layers = layers;                                   // layers returns copies: assign back

                var map = new Dictionary<string, AnimatorState>();
                var sm = ac.layers[li].stateMachine;
                int k = 0;
                foreach (var so in L(ls, "states"))
                {
                    var st = (Dictionary<string, object>)so;
                    AnimatorState state;
                    if (st.ContainsKey("tree"))
                    {
                        state = ac.CreateBlendTreeInController(S(st, "name"), out BlendTree tree, li);
                        FillTree(tree, (Dictionary<string, object>)st["tree"]);
                    }
                    else
                    {
                        state = sm.AddState(S(st, "name"), new Vector3(300, 60 * k, 0));
                        if (st.ContainsKey("motion")) state.motion = LoadMotion(S(st, "motion"));
                    }
                    if (st.ContainsKey("speed")) state.speed = F(st, "speed");
                    if (st.ContainsKey("speed_param")) { state.speedParameter = S(st, "speed_param"); state.speedParameterActive = true; }
                    if (st.ContainsKey("tag")) state.tag = S(st, "tag");
                    if (st.ContainsKey("write_defaults")) state.writeDefaultValues = B(st, "write_defaults");
                    map[S(st, "name")] = state;
                    k++;
                }
                if (ls.ContainsKey("default_state")) sm.defaultState = map[S(ls, "default_state")];
                foreach (var to in L(ls, "transitions")) AddTransition(sm, map, (Dictionary<string, object>)to);
                stateMaps.Add(map);
            }
            // synced layers: motions are overrides stored on the layer, not states
            for (int li = 0; li < layerSpecs.Count; li++)
            {
                var ls = layerSpecs[li];
                if (!ls.ContainsKey("sync_motions")) continue;
                var layers = ac.layers;
                var src = stateMaps[layers[li].syncedLayerIndex];
                foreach (var kv in (Dictionary<string, object>)ls["sync_motions"])
                    layers[li].SetOverrideMotion(src[kv.Key], LoadMotion(kv.Value.ToString()));
                ac.layers = layers;
            }
            EditorUtility.SetDirty(ac);
            AssetDatabase.SaveAssets();
            string hashFile = null;
            if (spec.ContainsKey("hash_class")) hashFile = WriteHashClass(ac, (Dictionary<string, object>)spec["hash_class"]);
            var f = new AgentAudit.Findings();
            var dump = Dump(ac, f);
            return new Dictionary<string, object>
            {
                { "path", path }, { "archived_previous", archived }, { "hash_class", hashFile },
                { "controller", dump }, { "findings", f.items }, { "counts", f.Counts() },
            };
        }

        public static AvatarMask BuildMask(Dictionary<string, object> d)
        {
            var path = S(d, "path");
            var mask = AssetDatabase.LoadAssetAtPath<AvatarMask>(path);
            if (mask == null)
            {
                mask = new AvatarMask();
                Directory.CreateDirectory(Path.GetDirectoryName(AgentJob.ResolvePath(path)));
                AssetDatabase.CreateAsset(mask, path);
            }
            for (int i = 0; i < (int)AvatarMaskBodyPart.LastBodyPart; i++) mask.SetHumanoidBodyPartActive((AvatarMaskBodyPart)i, true);
            foreach (var o in L(d, "humanoid_off"))
                mask.SetHumanoidBodyPartActive((AvatarMaskBodyPart)Enum.Parse(typeof(AvatarMaskBodyPart), o.ToString()), false);
            var toff = L(d, "transforms_off").Select(x => x.ToString()).ToList();
            if (toff.Count > 0)
            {
                mask.transformCount = toff.Count;
                for (int i = 0; i < toff.Count; i++) { mask.SetTransformPath(i, toff[i]); mask.SetTransformActive(i, false); }
            }
            EditorUtility.SetDirty(mask);
            return mask;
        }

        static void FillTree(BlendTree tree, Dictionary<string, object> t)
        {
            tree.blendType = (BlendTreeType)Enum.Parse(typeof(BlendTreeType), S(t, "type", "Simple1D"));
            tree.blendParameter = S(t, "param", "Speed");
            if (t.ContainsKey("param_y")) tree.blendParameterY = S(t, "param_y");
            tree.useAutomaticThresholds = false;
            var auto = S(t, "auto");
            foreach (var co in L(t, "children"))
            {
                var c = (Dictionary<string, object>)co;
                var motion = LoadMotion(S(c, "motion"));
                var clip = motion as AnimationClip;
                bool is2D = tree.blendType != BlendTreeType.Simple1D && tree.blendType != BlendTreeType.Direct;
                if (is2D)
                {
                    Vector2 pos;
                    if (c.TryGetValue("pos", out var po) && po is List<object> pl) pos = new Vector2((float)AgentJson.ToDouble(pl[0]), (float)AgentJson.ToDouble(pl[1]));
                    else if (clip != null && auto == "velocity_xz") pos = new Vector2(clip.averageSpeed.x, clip.averageSpeed.z);
                    else if (clip != null && auto == "speed_angular_deg")
                        pos = new Vector2(new Vector2(clip.averageSpeed.x, clip.averageSpeed.z).magnitude, clip.averageAngularSpeed * Mathf.Rad2Deg);
                    else throw new ArgumentException("child " + S(c, "motion") + " has no pos and tree.auto is " + auto);
                    tree.AddChild(motion, pos);
                }
                else if (tree.blendType == BlendTreeType.Direct)
                {
                    tree.AddChild(motion);
                }
                else
                {
                    float th = c.ContainsKey("threshold") ? F(c, "threshold")
                             : clip != null ? new Vector2(clip.averageSpeed.x, clip.averageSpeed.z).magnitude : 0f;
                    tree.AddChild(motion, th);
                }
            }
            var kids = tree.children;                                 // copies: edit, then assign back
            var specKids = L(t, "children");
            for (int i = 0; i < kids.Length; i++)
            {
                var c = (Dictionary<string, object>)specKids[i];
                if (c.ContainsKey("time_scale")) kids[i].timeScale = F(c, "time_scale");
                if (c.ContainsKey("mirror")) kids[i].mirror = B(c, "mirror");
                if (tree.blendType == BlendTreeType.Direct && c.ContainsKey("param")) kids[i].directBlendParameter = S(c, "param");
            }
            tree.children = kids;
        }

        static void AddTransition(AnimatorStateMachine sm, Dictionary<string, AnimatorState> map, Dictionary<string, object> t)
        {
            var from = S(t, "from");
            var to = S(t, "to");
            AnimatorStateTransition tr;
            if (from == "Any") tr = sm.AddAnyStateTransition(map[to]);
            else if (to == "Exit") tr = map[from].AddExitTransition();
            else tr = map[from].AddTransition(map[to]);
            tr.hasExitTime = t.ContainsKey("has_exit_time") ? B(t, "has_exit_time") : t.ContainsKey("exit_time");
            if (t.ContainsKey("exit_time")) tr.exitTime = F(t, "exit_time");
            tr.hasFixedDuration = !t.ContainsKey("fixed_duration") || B(t, "fixed_duration");
            tr.duration = F(t, "duration", 0.15f);
            tr.offset = F(t, "offset", 0f);
            // transitions are uninterruptible by default (Catherine Proulx, Unity blog 2016)
            tr.interruptionSource = (TransitionInterruptionSource)Enum.Parse(typeof(TransitionInterruptionSource), S(t, "interruption", "None"));
            tr.orderedInterruption = !t.ContainsKey("ordered_interruption") || B(t, "ordered_interruption");
            if (from == "Any") tr.canTransitionToSelf = B(t, "can_transition_to_self");   // true re-enters every frame: flicker
            foreach (var co in L(t, "conditions"))
            {
                var c = (List<object>)co;
                var mode = (AnimatorConditionMode)Enum.Parse(typeof(AnimatorConditionMode), c[1].ToString());
                tr.AddCondition(mode, c.Count > 2 ? (float)AgentJson.ToDouble(c[2]) : 0f, c[0].ToString());
            }
        }

        public static Motion LoadMotion(string reference)
        {
            if (string.IsNullOrEmpty(reference)) return null;
            var parts = reference.Split(new[] { "::" }, StringSplitOptions.None);
            if (parts.Length == 1)
                return AnimUtil.Require(AssetDatabase.LoadAssetAtPath<Motion>(parts[0]), "motion not found: " + reference);
            var clip = AssetDatabase.LoadAllAssetsAtPath(parts[0]).OfType<AnimationClip>()
                .FirstOrDefault(c => c.name == parts[1] && !c.name.StartsWith("__preview__"));
            return AnimUtil.Require(clip, "clip " + parts[1] + " not found in " + parts[0]);
        }

        // ------------------------------------------------------------------ hashes
        static string WriteHashClass(AnimatorController ac, Dictionary<string, object> h)
        {
            var path = S(h, "path");
            var sb = new StringBuilder();
            sb.AppendLine("// Generated by AgentKit.Animation.AnimControllerBuilder from " + AssetDatabase.GetAssetPath(ac) + ". Do not edit.");
            sb.AppendLine("// Hashes, not strings (6.3 Manual, Mecanim performance): a renamed state or parameter breaks the build here,");
            sb.AppendLine("// not at runtime with \"Parameter 'Hash N' does not exist\".");
            sb.AppendLine("using UnityEngine;");
            var ns = S(h, "namespace");
            if (!string.IsNullOrEmpty(ns)) sb.AppendLine("namespace " + ns + " {");
            sb.AppendLine("public static class " + S(h, "class", "AnimIds"));
            sb.AppendLine("{");
            foreach (var p in ac.parameters)
                sb.AppendLine("    public static readonly int P_" + Ident(p.name) + " = Animator.StringToHash(\"" + p.name + "\");");
            foreach (var layer in ac.layers)
            {
                sb.AppendLine("    public const int L_" + Ident(layer.name) + " = " + Array.IndexOf(ac.layers.Select(x => x.name).ToArray(), layer.name) + ";");
                foreach (var cs in layer.stateMachine.states)
                    sb.AppendLine("    public static readonly int S_" + Ident(layer.name) + "_" + Ident(cs.state.name) +
                                  " = Animator.StringToHash(\"" + layer.name + "." + cs.state.name + "\");");
            }
            sb.AppendLine("}");
            if (!string.IsNullOrEmpty(ns)) sb.AppendLine("}");
            Directory.CreateDirectory(Path.GetDirectoryName(AgentJob.ResolvePath(path)));
            File.WriteAllText(AgentJob.ResolvePath(path), sb.ToString());
            AssetDatabase.ImportAsset(path);
            return path;
        }

        static string Ident(string s)
        {
            var sb = new StringBuilder();
            foreach (var ch in s) sb.Append(char.IsLetterOrDigit(ch) ? ch : '_');
            return sb.ToString();
        }

        // ------------------------------------------------------------------ dump and static audit
        public static Dictionary<string, object> Dump(AnimatorController ac, AgentAudit.Findings f)
        {
            var path = AssetDatabase.GetAssetPath(ac);
            var pnames = new HashSet<string>(ac.parameters.Select(p => p.name));
            var layers = new List<object>();
            var ls = ac.layers;
            for (int li = 0; li < ls.Length; li++)
            {
                var L = ls[li];
                var states = new List<object>();
                foreach (var cs in L.stateMachine.states)
                {
                    var s = cs.state;
                    var sd = new Dictionary<string, object> { { "name", s.name }, { "tag", s.tag }, { "speed", s.speed } };
                    if (s.motion is BlendTree bt) sd["tree"] = DumpTree(bt, pnames, f, path + ":" + L.name + "/" + s.name);
                    else { sd["motion"] = s.motion ? s.motion.name : null; sd["motion_path"] = s.motion ? AssetDatabase.GetAssetPath(s.motion) : null; }
                    if (s.motion == null && L.syncedLayerIndex < 0) f.Add("warn", "anim.state_without_motion", path + ":" + L.name + "/" + s.name, "state has no motion (plays the default pose)", "assign a clip");
                    var trs = new List<object>();
                    for (int ti = 0; ti < s.transitions.Length; ti++)
                    {
                        var td = DumpTransition(s.transitions[ti], pnames, f, path);
                        td["priority"] = ti;   // list order: 0 = highest; with Ordered Interruption only earlier ones can cut in
                        trs.Add(td);
                    }
                    sd["transitions"] = trs;
                    states.Add(sd);
                }
                var any = new List<object>();
                foreach (var t in L.stateMachine.anyStateTransitions)
                {
                    any.Add(DumpTransition(t, pnames, f, path));
                    if (t.canTransitionToSelf)
                        f.Add("warn", "anim.any_state_to_self", path + ":" + L.name + "/Any->" + (t.destinationState ? t.destinationState.name : "?"),
                              "Any State transition can re-enter its destination every frame while the condition holds (flicker)", "canTransitionToSelf = false, or use a trigger");
                }
                if (li > 0 && L.blendingMode == AnimatorLayerBlendingMode.Override && L.avatarMask == null && L.syncedLayerIndex < 0)
                    f.Add("warn", "layer.override_without_mask", path + ":" + L.name, "Override layer without an Avatar Mask replaces the whole body at weight > 0", "assign a mask (upper body: legs and root off)");
                if (li > 0 && L.blendingMode == AnimatorLayerBlendingMode.Override && L.avatarMask == null)
                {
                    var add = ls.Take(li).Skip(1).Where(x => x.blendingMode == AnimatorLayerBlendingMode.Additive).Select(x => x.name).ToList();
                    if (add.Count > 0) f.Add("warn", "layer.override_cancels_additive", path + ":" + L.name, "unmasked Override layer above additive layers " + string.Join(", ", add), "move it below them or mask it");
                }
                layers.Add(new Dictionary<string, object>
                {
                    { "index", li }, { "name", L.name }, { "weight", L.defaultWeight }, { "blending", L.blendingMode.ToString() },
                    { "mask", L.avatarMask ? AssetDatabase.GetAssetPath(L.avatarMask) : null },
                    { "mask_off", L.avatarMask ? MaskOff(L.avatarMask) : null }, { "ik_pass", L.iKPass },
                    { "synced_to", L.syncedLayerIndex }, { "sync_timing", L.syncedLayerAffectsTiming },
                    { "default_state", L.stateMachine.defaultState ? L.stateMachine.defaultState.name : null },
                    { "states", states }, { "any_state_transitions", any },
                });
            }
            // A bone-path clip among humanoid clips: usually an .anim duplicated before the rig became Humanoid
            // (iHeartGameDev BEZHVYk6Fa4 [00:12:03]). It animates nothing through the avatar.
            var clipsAll = ac.animationClips.Where(c => c != null).Distinct().ToList();
            if (clipsAll.Any(c => c.isHumanMotion))
                foreach (var c in clipsAll.Where(AnimImport.IsBonePathClip))
                    f.Add("warn", "anim.generic_clip_in_humanoid_controller", path + "::" + c.name + " (" + AssetDatabase.GetAssetPath(c) + ")",
                          "Generic bone-path clip in a controller of Humanoid clips: it moves nothing on a Humanoid character",
                          "re-duplicate it from the Humanoid FBX, or reference the FBX sub-asset clip");
            return new Dictionary<string, object>
            {
                { "parameters", ac.parameters.Select(p => (object)(p.name + ":" + p.type)).ToList() },
                { "layers", layers },
            };
        }

        static List<object> MaskOff(AvatarMask m)
        {
            var off = new List<object>();
            for (int i = 0; i < (int)AvatarMaskBodyPart.LastBodyPart; i++)
                if (!m.GetHumanoidBodyPartActive((AvatarMaskBodyPart)i)) off.Add(((AvatarMaskBodyPart)i).ToString());
            return off;
        }

        static Dictionary<string, object> DumpTree(BlendTree bt, HashSet<string> pnames, AgentAudit.Findings f, string where)
        {
            var kids = new List<object>();
            foreach (var c in bt.children)
                kids.Add(new Dictionary<string, object>
                {
                    { "motion", c.motion ? c.motion.name : null }, { "pos", c.position }, { "threshold", c.threshold },
                    { "time_scale", c.timeScale }, { "mirror", c.mirror },
                });
            bool is2D = bt.blendType != BlendTreeType.Simple1D && bt.blendType != BlendTreeType.Direct;
            if (!pnames.Contains(bt.blendParameter) && bt.blendType != BlendTreeType.Direct)
                f.Add("error", "tree.missing_parameter", where, "blend parameter " + bt.blendParameter + " does not exist", "AddParameter or fix the name");
            if (is2D && !pnames.Contains(bt.blendParameterY))
                f.Add("error", "tree.missing_parameter", where, "blend parameter Y " + bt.blendParameterY + " does not exist", "AddParameter or fix the name");
            if (is2D)
            {
                var ch = bt.children;
                for (int i = 0; i < ch.Length; i++)
                    for (int j = i + 1; j < ch.Length; j++)
                    {
                        if ((ch[i].position - ch[j].position).magnitude < 0.05f)
                            f.Add("warn", "tree.positions_too_close", where, "Two or more of the positions are too close to each other", "spread the children");
                        if (bt.blendType == BlendTreeType.SimpleDirectional2D && ch[i].position.magnitude > 0.05f && ch[j].position.magnitude > 0.05f)
                        {
                            var a = Vector2.Angle(ch[i].position, ch[j].position);
                            if (a < 1f) f.Add("error", "tree.simple_directional_same_direction", where, (ch[i].motion != null ? ch[i].motion.name : "null") + " and " + (ch[j].motion != null ? ch[j].motion.name : "null") + " share a direction: Simple Directional drops one", "use FreeformDirectional2D");
                            else if (a > 179f) f.Add("error", "tree.simple_directional_180", where, "Simple Directional blend should have motions with directions less than 180 degrees apart", "use FreeformDirectional2D");
                        }
                    }
                if (bt.children.Any(c => c.motion != null && System.Text.RegularExpressions.Regex.IsMatch(c.motion.name, "(?i)idle|stance")))
                    f.Add("info", "tree.idle_in_locomotion", where, "idle inside the locomotion tree: a dissimilar idle blends into walk and slides the feet at walk start (Ketra Games mNxEetKzc04 [00:08:54])", "idle as its own state, the tree starting at a slow walk");
            }
            foreach (var c in bt.children)
                if (c.motion == null) f.Add("error", "tree.child_without_motion", where, "blend tree child without a motion", "assign a clip");
            return new Dictionary<string, object>
            {
                { "type", bt.blendType.ToString() }, { "param", bt.blendParameter }, { "param_y", is2D ? bt.blendParameterY : null }, { "children", kids },
            };
        }

        static Dictionary<string, object> DumpTransition(AnimatorStateTransition t, HashSet<string> pnames, AgentAudit.Findings f, string where)
        {
            foreach (var c in t.conditions)
                if (!pnames.Contains(c.parameter))
                    f.Add("error", "transition.missing_parameter", where, "condition uses unknown parameter " + c.parameter, "AddParameter or fix the name");
            return new Dictionary<string, object>
            {
                { "to", t.destinationState ? t.destinationState.name : (t.isExit ? "Exit" : null) },
                { "conditions", t.conditions.Select(c => (object)(c.parameter + " " + c.mode + " " + c.threshold)).ToList() },
                { "has_exit_time", t.hasExitTime }, { "exit_time", t.exitTime }, { "duration", t.duration },
                { "fixed_duration", t.hasFixedDuration }, { "interruption", t.interruptionSource.ToString() },
                { "ordered_interruption", t.orderedInterruption }, { "can_transition_to_self", t.canTransitionToSelf },
            };
        }

        // ------------------------------------------------------------------ tiny spec readers
        static string S(Dictionary<string, object> d, string k, string def = null) => d.TryGetValue(k, out var v) && v != null ? v.ToString() : def;
        static float F(Dictionary<string, object> d, string k, float def = 0f) => d.TryGetValue(k, out var v) && v != null ? (float)AgentJson.ToDouble(v, def) : def;
        static bool B(Dictionary<string, object> d, string k, bool def = false) => d.TryGetValue(k, out var v) && v is bool b ? b : def;
        static List<object> L(Dictionary<string, object> d, string k) => d.TryGetValue(k, out var v) && v is List<object> l ? l : new List<object>();
    }
}
