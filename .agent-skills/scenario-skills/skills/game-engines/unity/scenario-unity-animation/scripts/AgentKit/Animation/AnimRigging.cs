// REQUIRES: com.unity.animation.rigging
// AgentKit.Animation v0.1 (Unity Expert Skills, 2026-09-24). Animation Rigging from code: an aim rig (chest and
// head Multi-Aim sharing one target) plus a Two Bone IK arm, built, evaluated and measured, and a rig audit.
//
// Rules this encodes (Animation Rigging 1.3 manual; Code Monkey luBBz5oeR4Q; Brackeys Htl7ysv10Qs):
//   - RigBuilder on the Animator's GameObject; one Rig per control rig; the Rig lives BESIDE the skeleton root;
//   - constraint solve order = depth-first hierarchy order: body before head or hand, or the later body rotation
//     carries the aimed bone off target (luBBz5oeR4Q [00:06:20]); partial body weight (0.7 or 0.3) reads natural;
//   - bone axes are rig-specific: discovered here by dot products instead of reading gizmos in Local mode;
//   - move the one target, never rebind constraint data at runtime (job data; Htl7ysv10Qs [00:13:41]).
//
// Jobs:
//   AgentKit.Animation.AnimRigging.BuildAimRig  args: scene, target, order: body_first|head_first, chest_weight,
//        head_limits[min,max], aim_target[x,y,z], hand_target[x,y,z], evaluate (true), capture{width,height}, save
//   AgentKit.Animation.AnimRigging.AuditRigs    args: scene
// Unity calls: RigBuilder (layers, Build, Evaluate), Rig.weight, RigLayer, MultiAimConstraint.data
// (constrainedObject, sourceObjects WeightedTransformArray, aimAxis, upAxis, limits), TwoBoneIKConstraint.data
// (root, mid, tip, target, hint), Transform.SetSiblingIndex.
// Run in Unity 6000.3.21f1, Animation Rigging 1.4.1, on 2026-09-24: test_live_animation.py::test_08.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Animations.Rigging;

namespace AgentKit.Animation
{
    public static class AnimRigging
    {
        static readonly (Vector3 v, MultiAimConstraintData.Axis a)[] Axes =
        {
            (Vector3.right, MultiAimConstraintData.Axis.X), (Vector3.left, MultiAimConstraintData.Axis.X_NEG),
            (Vector3.up, MultiAimConstraintData.Axis.Y), (Vector3.down, MultiAimConstraintData.Axis.Y_NEG),
            (Vector3.forward, MultiAimConstraintData.Axis.Z), (Vector3.back, MultiAimConstraintData.Axis.Z_NEG),
        };

        /// <summary>The signed local axis of bone b that points most along world direction dir.</summary>
        public static (Vector3 local, MultiAimConstraintData.Axis axis) BestAxis(Transform b, Vector3 dir)
        {
            var best = Axes.OrderByDescending(x => Vector3.Dot(b.TransformDirection(x.v), dir)).First();
            return (best.v, best.a);
        }

        static Transform Child(Transform parent, string name)
        {
            var t = parent.Find(name);
            if (t == null) { t = new GameObject(name).transform; t.SetParent(parent, false); }
            return t;
        }

        public static void BuildAimRig()
        {
            AgentJob.Run(() =>
            {
                var scene = AgentJob.Str("scene", AnimSampler.DefaultScene);
                if (EditorSceneManager.GetActiveScene().path != scene) EditorSceneManager.OpenScene(scene, OpenSceneMode.Single);
                var root = AnimUtil.Require(GameObject.Find(AgentJob.Str("target", "Hero")), "target not found");
                var animator = AnimUtil.Require(root.GetComponent<Animator>(), "target has no Animator");
                animator.cullingMode = AnimatorCullingMode.AlwaysAnimate;   // edit-mode evaluation writes nothing otherwise
                var rb = AnimUtil.GetOrAdd<RigBuilder>(root);                // on the Animator's GameObject
                var rigT = Child(root.transform, "AimRig");                   // beside the skeleton root, not inside it
                var rig = AnimUtil.GetOrAdd<Rig>(rigT.gameObject);
                rig.weight = 1f;
                if (!rb.layers.Any(l => l.rig == rig)) rb.layers.Add(new RigLayer(rig, true));

                var chest = AnimUtil.Or(animator.GetBoneTransform(HumanBodyBones.UpperChest), animator.GetBoneTransform(HumanBodyBones.Chest));
                chest = AnimUtil.Require(chest, "no chest bone");
                var head = AnimUtil.Require(animator.GetBoneTransform(HumanBodyBones.Head), "no head bone");
                var fwd = root.transform.forward;

                var target = Child(rigT, "AimTarget");                        // one shared target: move it, never rebind
                target.position = AgentJson.ToVector3(AgentJob.List("aim_target"), root.transform.position + fwd * 3f + Vector3.up * 1.6f);

                MultiAimConstraint Aim(string name, Transform bone, float weight, Vector2 limits)
                {
                    var go = Child(rigT, name).gameObject;
                    var c = AnimUtil.GetOrAdd<MultiAimConstraint>(go);
                    c.weight = weight;
                    var d = c.data;
                    d.constrainedObject = bone;
                    var src = new WeightedTransformArray(0) { new WeightedTransform(target, 1f) };
                    d.sourceObjects = src;
                    d.aimAxis = BestAxis(bone, fwd).axis;
                    d.upAxis = BestAxis(bone, Vector3.up).axis;
                    d.limits = limits;
                    d.constrainedXAxis = d.constrainedYAxis = d.constrainedZAxis = true;
                    c.data = d;
                    return c;
                }
                var hl = AgentJob.List("head_limits");
                var headLimits = hl.Count == 2 ? new Vector2((float)AgentJson.ToDouble(hl[0]), (float)AgentJson.ToDouble(hl[1])) : new Vector2(-100f, 100f);
                var chestAim = Aim("ChestAim", chest, AgentJob.Float("chest_weight", 0.7f), new Vector2(-180f, 180f));
                var headAim = Aim("HeadAim", head, 1f, headLimits);

                // off-hand Two Bone IK with a hint that sets the elbow direction
                var ikGo = Child(rigT, "LeftHandIK").gameObject;
                var ik = AnimUtil.GetOrAdd<TwoBoneIKConstraint>(ikGo);
                var up = animator.GetBoneTransform(HumanBodyBones.LeftUpperArm);
                var lo = animator.GetBoneTransform(HumanBodyBones.LeftLowerArm);
                var hand = animator.GetBoneTransform(HumanBodyBones.LeftHand);
                var handTarget = Child(ikGo.transform, "LeftHandTarget");
                var hint = Child(ikGo.transform, "LeftElbowHint");
                handTarget.position = AgentJson.ToVector3(AgentJob.List("hand_target"), root.transform.position + fwd * 0.35f + Vector3.up * 1.25f + root.transform.right * -0.1f);
                handTarget.rotation = hand.rotation;
                hint.position = lo.position - fwd * 0.3f + Vector3.down * 0.1f;   // behind: the elbow bends backwards, not "broken"
                var ikd = ik.data;
                ikd.root = up; ikd.mid = lo; ikd.tip = hand; ikd.target = handTarget; ikd.hint = hint;
                ikd.targetPositionWeight = 1f; ikd.targetRotationWeight = 0f; ikd.hintWeight = 1f;
                ik.data = ikd;
                ik.weight = 1f;

                // solve order is sibling order under the Rig (depth-first)
                var order = AgentJob.Str("order", "body_first");
                if (order == "body_first") { chestAim.transform.SetSiblingIndex(1); headAim.transform.SetSiblingIndex(2); }
                else { headAim.transform.SetSiblingIndex(1); chestAim.transform.SetSiblingIndex(2); }
                ikGo.transform.SetSiblingIndex(3);

                var res = new Dictionary<string, object>
                {
                    { "order", order }, { "chest_bone", chest.name },
                    { "hierarchy", Enumerable.Range(0, rigT.childCount).Select(i => (object)rigT.GetChild(i).name).ToList() },
                    { "chest_axes", chestAim.data.aimAxis + "/" + chestAim.data.upAxis }, { "head_axes", headAim.data.aimAxis + "/" + headAim.data.upAxis },
                };
                if (AgentJob.Bool("evaluate", true))
                {
                    var headAxis = BestAxis(head, fwd).local;
                    var chestAxis = BestAxis(chest, fwd).local;
                    float Err(Transform b, Vector3 axis) => Vector3.Angle(b.TransformDirection(axis), target.position - b.position);
                    res["head_error_before"] = Math.Round(Err(head, headAxis), 3);
                    res["hand_error_before_m"] = Math.Round((hand.position - handTarget.position).magnitude, 4);
                    res["arm_length_m"] = Math.Round((up.position - lo.position).magnitude + (lo.position - hand.position).magnitude, 4);
                    res["shoulder_to_target_m"] = Math.Round((up.position - handTarget.position).magnitude, 4);
                    // Evaluate the rig ON TOP of the character's own animation: one graph with the Animator Controller
                    // and the rig nodes (RigBuilder.Build(graph)). The rig graph alone in edit mode post-processes a
                    // default humanoid pose (observed: hips at the root, body sunk to the waist).
                    var graph = UnityEngine.Playables.PlayableGraph.Create("AgentRigEval");
                    graph.SetTimeUpdateMode(UnityEngine.Playables.DirectorUpdateMode.Manual);
                    if (animator.runtimeAnimatorController != null)
                    {
                        var output = UnityEngine.Animations.AnimationPlayableOutput.Create(graph, "Animator", animator);
                        UnityEngine.Playables.PlayableOutputExtensions.SetSourcePlayable(output,
                            UnityEngine.Animations.AnimatorControllerPlayable.Create(graph, animator.runtimeAnimatorController));
                    }
                    if (!rb.Build(graph)) throw new InvalidOperationException("RigBuilder.Build(graph) returned false");
                    graph.Play();
                    for (int i = 0; i < 30; i++) { rb.SyncLayers(); graph.Evaluate(1f / 60f); }
                    res["head_error_deg"] = Math.Round(Err(head, headAxis), 3);
                    res["chest_error_deg"] = Math.Round(Err(chest, chestAxis), 3);
                    res["hand_error_m"] = Math.Round((hand.position - handTarget.position).magnitude, 4);
                    res["elbow_side_dot"] = Math.Round(Vector3.Dot((lo.position - (up.position + hand.position) * 0.5f).normalized, (hint.position - lo.position).normalized), 3);
                    var cap = AgentJob.Dict("capture");
                    if (cap.Count > 0)
                    {
                        AgentCapture.RequireGraphics();
                        foreach (var smr in root.GetComponentsInChildren<SkinnedMeshRenderer>()) { smr.forceMatrixRecalculationPerRender = true; smr.updateWhenOffscreen = true; }
                        var marker = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                        marker.name = "AgentAimMarker";
                        marker.transform.position = target.position;
                        marker.transform.localScale = Vector3.one * 0.15f;
                        // debug laser along the head's aim axis (Code Monkey's stretched cube, luBBz5oeR4Q [00:04:40]):
                        // on target it runs through the sphere
                        var laser = GameObject.CreatePrimitive(PrimitiveType.Cube);
                        laser.name = "AgentAimLaser";
                        var dirW = head.TransformDirection(headAxis);
                        float len = (target.position - head.position).magnitude;
                        laser.transform.SetPositionAndRotation(head.position + dirW * len * 0.5f, Quaternion.LookRotation(dirW));
                        laser.transform.localScale = new Vector3(0.015f, 0.015f, len);
                        var pivot = root.transform.position;
                        var view = new Dictionary<string, object>
                        {
                            { "name", "aim_" + order }, { "position", new List<object> { (double)(pivot.x + 5.5f), 1.9, (double)(pivot.z + 1.25f) } },
                            { "look_at", new List<object> { (double)pivot.x + 0.6, 1.8, (double)pivot.z + 1.25 } }, { "fov", 40.0 },
                        };
                        var png = Path.Combine(AgentJob.OutDir("rig"), "aim_" + order + ".png");
                        AgentCapture.CaptureView(Camera.main, view, cap.TryGetValue("width", out var w) ? (int)AgentJson.ToDouble(w) : 640,
                                                 cap.TryGetValue("height", out var h) ? (int)AgentJson.ToDouble(h) : 480, png, 4);
                        UnityEngine.Object.DestroyImmediate(marker);
                        UnityEngine.Object.DestroyImmediate(laser);
                        res["png"] = png;
                    }
                    rb.Clear();
                    graph.Destroy();   // an undestroyed PlayableGraph logs an error (6.3 Manual, Playables)
                }
                if (AgentJob.Bool("save", false)) EditorSceneManager.SaveScene(EditorSceneManager.GetActiveScene());
                return res;
            });
        }

        public static void AuditRigs()
        {
            AgentJob.Run(() =>
            {
                var scene = AgentJob.Str("scene", AnimSampler.DefaultScene);
                if (EditorSceneManager.GetActiveScene().path != scene) EditorSceneManager.OpenScene(scene, OpenSceneMode.Single);
                var f = new AgentAudit.Findings();
                foreach (var rb in UnityEngine.Object.FindObjectsByType<RigBuilder>(FindObjectsSortMode.None))
                {
                    var an = rb.GetComponent<Animator>();
                    if (an == null) f.Add("error", "rig.builder_without_animator", rb.name, "RigBuilder not on the Animator's GameObject", "move it next to the Animator");
                    var hips = an != null ? an.GetBoneTransform(HumanBodyBones.Hips) : null;
                    foreach (var rig in rb.GetComponentsInChildren<Rig>(true))
                    {
                        if (!rb.layers.Any(l => l.rig == rig)) f.Add("error", "rig.not_in_layer", rig.name, "Rig not referenced by a RigLayer: it does nothing", "rigBuilder.layers.Add(new RigLayer(rig))");
                        if (hips != null && rig.transform.IsChildOf(hips)) f.Add("error", "rig.inside_skeleton", rig.name, "Rig inside the skeleton moves with the bones it drives", "parent it beside the skeleton root");
                        var cons = rig.GetComponentsInChildren<IRigConstraint>(true).Cast<Component>().ToList();   // depth-first = solve order
                        int FirstIdx(Func<Transform, bool> pred) => cons.FindIndex(c => c is MultiAimConstraint m && m.data.constrainedObject && pred(m.data.constrainedObject));
                        int lastBody = -1;
                        for (int i = 0; i < cons.Count; i++)
                            if (cons[i] is MultiAimConstraint m && m.data.constrainedObject && an &&
                                (m.data.constrainedObject == an.GetBoneTransform(HumanBodyBones.Spine) || m.data.constrainedObject == an.GetBoneTransform(HumanBodyBones.Chest) || m.data.constrainedObject == an.GetBoneTransform(HumanBodyBones.UpperChest)))
                                lastBody = i;
                        int firstHead = an ? FirstIdx(t => t == an.GetBoneTransform(HumanBodyBones.Head) || t == an.GetBoneTransform(HumanBodyBones.LeftHand) || t == an.GetBoneTransform(HumanBodyBones.RightHand)) : -1;
                        if (lastBody >= 0 && firstHead >= 0 && firstHead < lastBody)
                            f.Add("error", "rig.solve_order", rig.name, "a head or hand aim solves before a spine or chest aim: the body rotation carries it off target", "move the body constraint above (sibling order)");
                        foreach (var c in cons)
                        {
                            if (c is TwoBoneIKConstraint ik && ik.data.hint == null)
                                f.Add("warn", "rig.ik_no_hint", c.name, "Two Bone IK without a hint: elbow or knee direction is left to the solver", "add a hint behind the elbow / in front of the knee");
                            if (c is MultiAimConstraint ma && an && ma.data.constrainedObject == an.GetBoneTransform(HumanBodyBones.Head) && ma.data.limits.y >= 180f)
                                f.Add("info", "rig.head_unlimited", c.name, "head aim with +-180 limits over-twists the neck for targets behind", "limits about -100..100 and fade the rig weight (Htl7ysv10Qs [00:06:58])");
                        }
                    }
                }
                return new Dictionary<string, object> { { "findings", f.items }, { "counts", f.Counts() } };
            });
        }
    }
}
