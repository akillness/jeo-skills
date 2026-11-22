// AgentKit 2D v0.1 (scenario-unity-2d skill, 2026-09-24). Drives Animator parameters from what the
// controller DID, never from input (Brackeys hkaysu1Z-N8 [00:18:57]: a refused crouch under a
// ceiling must not play a stand-up; a blocked run must not play Run). Parameters (hashed once):
// Speed (|vx|), VelocityY, Grounded (Any State -> Jump/Fall read Grounded + VelocityY, no trigger).
// Sprite faces the input direction (Tarodev PlayerAnimator), via flipX (visual only; use a Y
// rotation or scale when child offsets must follow the facing, Sasquatch 9dzBrLUIF8g [00:03:26]).
// Run in Unity 6000.3.21f1 on 2026-09-24: PlatformerFeelTests.AnimatorFollowsControllerOutcome.
using UnityEngine;

namespace AgentKit.TwoD
{
    [RequireComponent(typeof(PlatformerController2D))]
    public class PlatformerAnimatorBridge : MonoBehaviour
    {
        public Animator animator;
        public SpriteRenderer spriteRenderer;

        static readonly int k_Speed = Animator.StringToHash("Speed");
        static readonly int k_VelocityY = Animator.StringToHash("VelocityY");
        static readonly int k_Grounded = Animator.StringToHash("Grounded");

        PlatformerController2D m_Controller;

        void Awake()
        {
            m_Controller = GetComponent<PlatformerController2D>();
            if (animator == null) animator = GetComponentInChildren<Animator>();
            if (spriteRenderer == null) spriteRenderer = GetComponentInChildren<SpriteRenderer>();
        }

        void Update()
        {
            if (animator == null || animator.runtimeAnimatorController == null) return;
            var v = m_Controller.FrameVelocity;
            animator.SetFloat(k_Speed, Mathf.Abs(v.x));
            animator.SetFloat(k_VelocityY, v.y);
            animator.SetBool(k_Grounded, m_Controller.Grounded);
            if (spriteRenderer != null && m_Controller.MoveInput.x != 0f) spriteRenderer.flipX = m_Controller.MoveInput.x < 0f;
        }
    }
}
