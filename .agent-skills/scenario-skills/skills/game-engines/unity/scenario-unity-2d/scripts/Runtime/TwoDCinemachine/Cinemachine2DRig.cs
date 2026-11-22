// AgentKit 2D v0.1 (scenario-unity-2d skill, 2026-09-24). A Cinemachine 3 camera for a pixel-art 2D level:
// CinemachineCamera + CinemachinePositionComposer (follow with target offset and damping) +
// CinemachineConfiner2D (bounds that hide what is outside the level, Sasquatch 9dzBrLUIF8g [00:02:10])
// + CinemachinePixelPerfect (works with URP's PixelPerfectCamera). This assembly only compiles when
// com.unity.cinemachine >= 3.0 is installed (asmdef versionDefines + defineConstraints AGENTKIT_CM3):
// the 6000.3.21f1 editor defaults to Cinemachine 2.10.7, so add "com.unity.cinemachine": "3.1.7".
// Editor jobs call it by reflection (CameraJobs.Cinemachine2D), so projects without CM3 still compile.
// Batch/edit mode: nothing ticks the Brain, so Settle() calls CinemachineBrain.ManualUpdate(frame, dt);
// CinemachinePixelPerfect acts in edit mode only when the PixelPerfectCamera has runInEditMode on.
// Run in Unity 6000.3.21f1 on 2026-09-24 with Cinemachine 3.1.7: tests/code/unity-2d/test_live_2d.py (P13).
using System.Collections.Generic;
using Unity.Cinemachine;
using UnityEngine;
using UnityEngine.Rendering.Universal;

namespace AgentKit.TwoD
{
    public static class Cinemachine2DRig
    {
        static T GetOrAdd<T>(GameObject go) where T : Component
        {
            var c = go.GetComponent<T>();
            return c != null ? c : go.AddComponent<T>();
        }

        /// <summary>Build or update the rig. Returns plain values (no Cinemachine types) for reflection callers.</summary>
        public static Dictionary<string, object> Build(Camera cam, Transform follow, Collider2D bounds, float orthoSize,
                                                       Vector3 targetOffset, Vector3 damping, bool confine)
        {
            var brain = GetOrAdd<CinemachineBrain>(cam.gameObject);
            brain.DefaultBlend = new CinemachineBlendDefinition(CinemachineBlendDefinition.Styles.EaseInOut, 0.5f);
            var go = GameObject.Find("CM Room Camera") ?? new GameObject("CM Room Camera");
            var vcam = GetOrAdd<CinemachineCamera>(go);
            vcam.Follow = follow;
            var lens = vcam.Lens;
            lens.OrthographicSize = orthoSize;
            lens.ModeOverride = LensSettings.OverrideModes.Orthographic;
            vcam.Lens = lens;
            var composer = GetOrAdd<CinemachinePositionComposer>(go);
            composer.CameraDistance = 10f;
            composer.TargetOffset = targetOffset;      // facing bias / look-ahead lives here (Sasquatch: X = 1)
            composer.Damping = damping;                // loose rising, tight falling: switch at runtime by fall speed
            var confiner = GetOrAdd<CinemachineConfiner2D>(go);
            confiner.BoundingShape2D = bounds;         // a trigger CompositeCollider2D (Polygons) built from boxes
            confiner.enabled = confine;
            confiner.InvalidateBoundingShapeCache();
            GetOrAdd<CinemachinePixelPerfect>(go);
            return new Dictionary<string, object>
            {
                { "vcam", go.name }, { "brain", cam.name }, { "confiner", confine }, { "bounds", bounds != null ? bounds.name : null },
                { "components", new[] { "CinemachineCamera", "CinemachinePositionComposer", "CinemachineConfiner2D", "CinemachinePixelPerfect" } },
            };
        }

        /// <summary>Tick the Brain by hand (no player loop in batch mode) until the confiner is baked.</summary>
        public static Dictionary<string, object> Settle(Camera cam, int frames, float dt)
        {
            var brain = cam.GetComponent<CinemachineBrain>();
            var ppc = cam.GetComponent<PixelPerfectCamera>();
            if (ppc != null) ppc.runInEditMode = true;
            var vcam = Object.FindFirstObjectByType<CinemachineCamera>();
            var confiner = vcam != null ? vcam.GetComponent<CinemachineConfiner2D>() : null;
            int used = 0;
            for (int i = 0; i < frames; i++)
            {
                brain.ManualUpdate(1000 + i, dt);
                used = i + 1;
                if (i > 10 && (confiner == null || !confiner.enabled || confiner.BoundingShapeIsBaked)) break;
            }
            return new Dictionary<string, object>
            {
                { "frames", used }, { "baked", confiner != null && confiner.BoundingShapeIsBaked },
                { "camera_position", new[] { cam.transform.position.x, cam.transform.position.y } },
                { "ortho_size", cam.orthographicSize }, { "aspect", cam.aspect },
            };
        }
    }
}
