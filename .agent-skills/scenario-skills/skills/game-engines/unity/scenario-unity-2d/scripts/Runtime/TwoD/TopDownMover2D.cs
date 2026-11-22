// AgentKit 2D v0.1 (scenario-unity-2d skill, 2026-09-24). Top-down movement, Unity 6.3 port of the
// Brackeys pattern (whzomFgjT50): input read in Update, Rigidbody2D moved in FixedUpdate, gravity 0,
// rotation frozen. Fixes the two defects of the original [added]: diagonals are normalized
// (raw (1,1) is 1.41x faster) and the last facing is kept for the idle blend tree (the original
// idle always faced down). Uses linearVelocity (plays well with Interpolate and other forces);
// MovePosition is the alternative for kinematic bodies (6.3 Manual).
// Run in Unity 6000.3.21f1 on 2026-09-24: TopDownTests.DiagonalSpeedEqualsAxisSpeed.
using UnityEngine;
using UnityEngine.InputSystem;

namespace AgentKit.TwoD
{
    [RequireComponent(typeof(Rigidbody2D))]
    public class TopDownMover2D : MonoBehaviour
    {
        public float moveSpeed = 5f;          // Brackeys value, units per second
        public bool normalizeDiagonals = true;
        public Animator animator;             // optional: Horizontal, Vertical, Speed, LastX, LastY

        Rigidbody2D m_Rb;
        InputAction m_Move;
        Vector2 m_Input;
        public Vector2 LastFacing { get; private set; } = Vector2.down;
        public Vector2 CurrentInput => m_Input;

        static readonly int k_H = Animator.StringToHash("Horizontal"), k_V = Animator.StringToHash("Vertical"),
            k_S = Animator.StringToHash("Speed"), k_LX = Animator.StringToHash("LastX"), k_LY = Animator.StringToHash("LastY");

        void Awake()
        {
            m_Rb = GetComponent<Rigidbody2D>();
            m_Rb.gravityScale = 0f;
            m_Rb.freezeRotation = true;
            m_Rb.interpolation = RigidbodyInterpolation2D.Interpolate;
            m_Move = new InputAction("Move", InputActionType.Value, expectedControlType: "Vector2");
            // Composite mode 2 = Analog: keep raw axes so the normalization below is the only rule.
            m_Move.AddCompositeBinding("2DVector(mode=2)").With("Up", "<Keyboard>/w").With("Down", "<Keyboard>/s")
                .With("Left", "<Keyboard>/a").With("Right", "<Keyboard>/d");
            m_Move.AddBinding("<Gamepad>/leftStick");
        }

        void OnEnable() => m_Move.Enable();
        void OnDisable() => m_Move.Disable();
        void OnDestroy() => m_Move.Dispose();

        void Update()
        {
            var v = m_Move.ReadValue<Vector2>();
            if (normalizeDiagonals) v = Vector2.ClampMagnitude(v, 1f);
            m_Input = v;
            if (v.sqrMagnitude > 0.0001f) LastFacing = v.normalized;
            if (animator != null && animator.runtimeAnimatorController != null)
            {
                animator.SetFloat(k_H, v.x);
                animator.SetFloat(k_V, v.y);
                animator.SetFloat(k_S, v.sqrMagnitude);
                animator.SetFloat(k_LX, LastFacing.x);
                animator.SetFloat(k_LY, LastFacing.y);
            }
        }

        void FixedUpdate() => m_Rb.linearVelocity = m_Input * moveSpeed;
    }
}
