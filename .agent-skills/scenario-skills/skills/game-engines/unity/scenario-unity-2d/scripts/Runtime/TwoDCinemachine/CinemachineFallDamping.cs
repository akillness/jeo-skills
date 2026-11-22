// AgentKit 2D v0.2 (scenario-unity-2d skill, 2026-09-24 refactor). Applies FallDampingSwitch (asymmetric vertical
// damping with hysteresis, Sasquatch 9dzBrLUIF8g [00:05:37], [00:07:14]) to the CinemachinePositionComposer
// of the camera it sits on: loose while rising, tight while falling fast, lerped between the two.
// Runs before the Brain (DefaultExecutionOrder -100; the Brain moves cameras in LateUpdate).
// Compiled only with Cinemachine 3 (AGENTKIT_CM3). Run in Unity 6000.3.21f1 on 2026-09-24 with CM 3.1.7:
// tests/code/unity-2d (CameraFeelTests.FallDampingShowsMoreBelow).
using Unity.Cinemachine;
using UnityEngine;

namespace AgentKit.TwoD
{
    [DefaultExecutionOrder(-100)]
    [RequireComponent(typeof(CinemachinePositionComposer))]
    public class CinemachineFallDamping : MonoBehaviour
    {
        [Tooltip("Body whose vertical speed drives the switch (default: the camera's Follow target)")]
        public Rigidbody2D target;
        public FallDampingSwitch settings = new FallDampingSwitch();

        CinemachinePositionComposer m_Composer;

        public float CurrentDamping => settings.Current;
        public bool Falling => settings.Falling;

        void OnEnable()
        {
            m_Composer = GetComponent<CinemachinePositionComposer>();
            settings.Reset();
            if (target == null)
            {
                var cam = GetComponent<CinemachineCamera>();
                if (cam != null && cam.Follow != null) target = cam.Follow.GetComponentInParent<Rigidbody2D>();
            }
        }

        void LateUpdate()
        {
            if (m_Composer == null || target == null) return;
            var d = m_Composer.Damping;
            d.y = settings.Step(target.linearVelocity.y, Time.deltaTime);
            m_Composer.Damping = d;
        }
    }
}
