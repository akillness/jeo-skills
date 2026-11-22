// AgentKit.Animation runtime v0.1 (Unity Expert Skills, 2026-09-24). Root motion into a CharacterController
// (Ketra Games, mNxEetKzc04): ONE Move per frame inside OnAnimatorMove, fed by animator.deltaPosition plus the
// computed vertical speed. Splitting axes between systems jitters ("the character controller and animation
// movement battle with each other" [00:07:21]); deltaPosition is already this frame's displacement, never
// multiply it by Time.deltaTime [00:07:59]. With this script present the Animator shows "Handled by Script".
// Input is not read here: a controller script (Input System in 6.3 templates) sets Speed / IsMoving and yaw.
// Run in Unity 6000.3.21f1 on 2026-09-24 in Play mode through AnimProcedural.RootMotionPlay (test_live_animation.py::test_10).
using UnityEngine;

namespace AgentKit.Animation.Runtime
{
    [RequireComponent(typeof(Animator)), RequireComponent(typeof(CharacterController))]
    public class AgentRootMotionMover : MonoBehaviour
    {
        // Who owns vertical motion. Script: gravity and jump speed from this component, the clip's vertical root
        // motion is discarded (a scripted jump height: import the jump clip with Y NOT baked, Based Upon Feet, so its
        // pose does not add the hip rise on top). ClipWhenUnbaked: Animator.gravityWeight is 1 on Y-baked clips and 0
        // on Y-unbaked ones, blended across transitions (6.3 Manual, Root Transform Position (Y)); the lerp lets a
        // Y-unbaked drop or vault clip move the character vertically and hands back to gravity through the
        // transition [added formula].
        public enum VerticalSource { Script, ClipWhenUnbaked }
        public VerticalSource vertical = VerticalSource.Script;
        public float gravity = -9.81f;
        public float jumpSpeed = 0f;          // set by gameplay for one frame to jump
        [HideInInspector] public int moves;   // Move calls this session (a test asserts one per frame)
        [HideInInspector] public float lastGravityWeight = 1f;
        Animator animator;
        CharacterController controller;
        float ySpeed;

        void Awake()
        {
            animator = GetComponent<Animator>();
            controller = GetComponent<CharacterController>();
        }

        void Update()
        {
            // vertical speed only; no Move here
            if (controller.isGrounded && ySpeed < 0f) ySpeed = -0.5f;   // keep the controller pressed to the ground
            if (jumpSpeed > 0f && controller.isGrounded) { ySpeed = jumpSpeed; jumpSpeed = 0f; }
            ySpeed += gravity * Time.deltaTime;
        }

        void OnAnimatorMove()
        {
            Vector3 velocity = animator.deltaPosition;   // already per frame: no Time.deltaTime here
            float scripted = ySpeed * Time.deltaTime;    // only the computed vertical speed is scaled by dt
            lastGravityWeight = animator.gravityWeight;
            velocity.y = vertical == VerticalSource.ClipWhenUnbaked
                ? Mathf.Lerp(animator.deltaPosition.y, scripted, lastGravityWeight)
                : scripted;
            controller.Move(velocity);
            transform.rotation *= animator.deltaRotation;
            moves++;
        }
    }
}
