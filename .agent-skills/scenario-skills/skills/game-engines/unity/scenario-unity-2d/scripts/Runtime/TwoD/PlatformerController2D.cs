// AgentKit 2D v0.1 (scenario-unity-2d skill, 2026-09-24). Platformer controller for Unity 6.3.
// Structure and numbers: Tarodev Ultimate 2D Controller (MIT), ported to Unity 6.3:
//   Rigidbody2D.linearVelocity (not velocity), Input System actions (6.3 templates disable the
//   legacy Input Manager). Added: apex hang, selectable jump cut, corner correction, ceiling
//   arrival, test-facing read-only state.
// Order of operations (Tarodev): input read and latched in Update; in FixedUpdate collisions ->
// jump -> horizontal -> gravity -> apply. The controller owns the velocity and writes it every
// physics step; physics only resolves contacts. Body: Dynamic, gravityScale 0, rotation frozen,
// Interpolate (set in Awake). External forces must be added into the frame velocity (AddImpulse).
// v0.2 (2026-09-24 refactor): per-trick toggles (coyote, buffer, variable jump, fall clamp, apex, corner),
// the Sustain variable-height method, one-way platforms (Platform Effector 2D: the ceiling cast ignores
// them, the ground cast accepts only their top while falling, Down + Jump drops through).
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-2d (PlatformerFeelTests, ForgivenessTests).
using System;
using UnityEngine;
using UnityEngine.InputSystem;

namespace AgentKit.TwoD
{
    [RequireComponent(typeof(Rigidbody2D), typeof(CapsuleCollider2D))]
    [DisallowMultipleComponent]
    public class PlatformerController2D : MonoBehaviour
    {
        [SerializeField] PlatformerStats stats;
        [Tooltip("Optional: actions from an .inputactions asset (Vector2 Move, Button Jump). Empty = built-in bindings (WASD/arrows/stick, Space/C/South).")]
        [SerializeField] InputActionReference moveAction;
        [SerializeField] InputActionReference jumpAction;

        Rigidbody2D m_Rb;
        CapsuleCollider2D m_Col;
        InputAction m_Move, m_Jump;
        bool m_OwnsActions;
        bool m_CachedQueriesStartInColliders;
        readonly Collider2D[] m_Overlap = new Collider2D[8];
        readonly RaycastHit2D[] m_Hits = new RaycastHit2D[8];
        Collider2D m_GroundCollider;
        Collider2D m_DropCollider;
        float m_DropUntil = float.MinValue;
        float m_SustainLeft;

        float m_Time;
        Vector2 m_FrameVelocity;
        Vector2 m_MoveInput;
        bool m_JumpHeld, m_JumpToConsume;
        // float.MinValue, not 0: the Tarodev repo leaves this at 0, so a player who lands within the first
        // JumpBuffer seconds of play gets a phantom buffered jump (observed in the PlayMode tests, 2026-09-24)
        float m_TimeJumpWasPressed = float.MinValue;

        bool m_Grounded;
        float m_FrameLeftGrounded = float.MinValue;
        bool m_CoyoteUsable, m_BufferedJumpUsable, m_EndedJumpEarly;
        bool m_InApexBand;
        bool m_InJump;           // apex hang only after a real jump, not when walking off a ledge with jump held

        /// <summary>(grounded, impact speed) on every landing and take-off (Tarodev's juice hook).</summary>
        public event Action<bool, float> GroundedChanged;
        public event Action Jumped;

        public PlatformerStats Stats { get => stats; set => stats = value; }
        public bool Grounded => m_Grounded;
        public Vector2 FrameVelocity => m_FrameVelocity;
        public Vector2 MoveInput => m_MoveInput;
        public bool JumpHeld => m_JumpHeld;
        public bool InApexBand => m_InApexBand;
        /// <summary>Controller clock (sum of Update deltaTime), the clock coyote and buffer compare against.</summary>
        public float ControllerTime => m_Time;
        public float LeftGroundTime => m_FrameLeftGrounded;
        public float LastJumpPressTime { get; private set; } = float.MinValue;
        public float LastJumpTime { get; private set; } = float.MinValue;
        public int JumpCount { get; private set; }
        public int CornerCorrections { get; private set; }
        public int DropThroughs { get; private set; }
        /// <summary>Most negative vertical speed reached since the last ResetState (fall clamp test).</summary>
        public float MinVelocityY { get; private set; }

        void Awake()
        {
            m_Rb = GetComponent<Rigidbody2D>();
            m_Col = GetComponent<CapsuleCollider2D>();
            if (stats == null) stats = ScriptableObject.CreateInstance<PlatformerStats>();
            m_CachedQueriesStartInColliders = Physics2D.queriesStartInColliders;
            m_Rb.bodyType = RigidbodyType2D.Dynamic;
            m_Rb.gravityScale = 0f;                 // the controller integrates gravity itself
            m_Rb.freezeRotation = true;
            m_Rb.interpolation = RigidbodyInterpolation2D.Interpolate;
            m_Rb.collisionDetectionMode = CollisionDetectionMode2D.Continuous;
            SetupInput();
        }

        void SetupInput()
        {
            if (moveAction != null && jumpAction != null)
            {
                m_Move = moveAction.action;
                m_Jump = jumpAction.action;
                return;
            }
            m_Move = new InputAction("Move", InputActionType.Value, expectedControlType: "Vector2");
            m_Move.AddCompositeBinding("2DVector").With("Up", "<Keyboard>/w").With("Down", "<Keyboard>/s")
                .With("Left", "<Keyboard>/a").With("Right", "<Keyboard>/d");
            m_Move.AddCompositeBinding("2DVector").With("Up", "<Keyboard>/upArrow").With("Down", "<Keyboard>/downArrow")
                .With("Left", "<Keyboard>/leftArrow").With("Right", "<Keyboard>/rightArrow");
            m_Move.AddBinding("<Gamepad>/leftStick");
            m_Jump = new InputAction("Jump", InputActionType.Button);
            m_Jump.AddBinding("<Keyboard>/space");
            m_Jump.AddBinding("<Keyboard>/c");
            m_Jump.AddBinding("<Gamepad>/buttonSouth");
            m_OwnsActions = true;
        }

        void OnEnable() { m_Move?.Enable(); m_Jump?.Enable(); }
        void OnDisable() { if (m_OwnsActions) { m_Move?.Disable(); m_Jump?.Disable(); } }
        void OnDestroy() { if (m_OwnsActions) { m_Move?.Dispose(); m_Jump?.Dispose(); } }

        /// <summary>Teleport and reset every timer (tests, respawn). Position is the Rigidbody2D position.</summary>
        public void ResetState(Vector2 position)
        {
            m_Rb.position = position;
            transform.position = position;
            m_Rb.linearVelocity = Vector2.zero;
            m_FrameVelocity = Vector2.zero;
            m_Grounded = false;
            m_FrameLeftGrounded = float.MinValue;
            m_CoyoteUsable = m_BufferedJumpUsable = m_EndedJumpEarly = m_JumpToConsume = m_InJump = false;
            m_TimeJumpWasPressed = float.MinValue;
            LastJumpPressTime = LastJumpTime = float.MinValue;
            JumpCount = 0;
            CornerCorrections = 0;
            DropThroughs = 0;
            MinVelocityY = 0f;
            m_SustainLeft = 0f;
            RestoreDropCollision();
        }

        /// <summary>External impulse (knockback, springs): added to the controller's own velocity, since
        /// the velocity is overwritten every step and forces on the body would be lost (Tarodev caveat).</summary>
        public void AddImpulse(Vector2 deltaVelocity) => m_FrameVelocity += deltaVelocity;

        void Update()
        {
            m_Time += Time.deltaTime;
            GatherInput();
        }

        void GatherInput()
        {
            var move = m_Move.ReadValue<Vector2>();
            if (stats.SnapInput)
            {
                move.x = Mathf.Abs(move.x) < stats.HorizontalDeadZoneThreshold ? 0 : Mathf.Sign(move.x);
                move.y = Mathf.Abs(move.y) < stats.VerticalDeadZoneThreshold ? 0 : Mathf.Sign(move.y);
            }
            m_MoveInput = move;
            m_JumpHeld = m_Jump.IsPressed();
            if (m_Jump.WasPressedThisFrame())
            {
                // latch: consumed by the next FixedUpdate even if 0 or 2+ physics steps run this frame
                m_JumpToConsume = true;
                m_TimeJumpWasPressed = m_Time;
                LastJumpPressTime = m_Time;
            }
        }

        void FixedUpdate()
        {
            if (m_DropCollider != null && m_Time >= m_DropUntil) RestoreDropCollision();
            CheckCollisions();
            HandleJump();
            HandleDirection();
            HandleGravity();
            m_Rb.linearVelocity = m_FrameVelocity;
            if (m_FrameVelocity.y < MinVelocityY) MinVelocityY = m_FrameVelocity.y;
        }

        // ---------------------------------------------------------------- one-way platforms
        static bool IsOneWay(Collider2D c) =>
            c != null && c.usedByEffector && c.TryGetComponent<PlatformEffector2D>(out var pe) && pe.enabled && pe.useOneWay;

        /// <summary>Nearest capsule-cast hit that counts: one-way platforms never block the head, and block the
        /// feet only on their top face while not rising (the effector lets the body pass from below).</summary>
        RaycastHit2D Cast(Vector2 center, Vector2 dir, float distance, int mask)
        {
            var filter = new ContactFilter2D { useLayerMask = true, layerMask = mask, useTriggers = false };
            int n = Physics2D.CapsuleCast(center, m_Col.size, m_Col.direction, 0f, dir, filter, m_Hits, distance);
            RaycastHit2D best = default;
            for (int i = 0; i < n; i++)
            {
                var h = m_Hits[i];
                if (h.collider == null || h.collider == m_Col) continue;
                if (h.collider == m_DropCollider) continue;
                if (IsOneWay(h.collider) && (dir.y > 0f || h.normal.y < 0.7f || m_FrameVelocity.y > 0.01f)) continue;
                if (best.collider == null || h.distance < best.distance) best = h;
            }
            return best;
        }

        void RestoreDropCollision()
        {
            if (m_DropCollider != null && m_Col != null) Physics2D.IgnoreCollision(m_Col, m_DropCollider, false);
            m_DropCollider = null;
        }

        // ---------------------------------------------------------------- collisions
        void CheckCollisions()
        {
            Physics2D.queriesStartInColliders = false;
            int mask = ~stats.PlayerLayer.value;
            Vector2 c = m_Col.bounds.center;
            var ground = Cast(c, Vector2.down, stats.GrounderDistance, mask);
            bool groundHit = ground.collider != null;
            m_GroundCollider = ground.collider;

            if (m_FrameVelocity.y > 0f)
            {
                float look = Mathf.Max(stats.GrounderDistance, m_FrameVelocity.y * Time.fixedDeltaTime);
                var hit = Cast(c, Vector2.up, look, mask);
                if (hit.collider != null)
                {
                    if (stats.UseCornerCorrection && TryCornerCorrect(c, hit, look, mask)) { }
                    else if (hit.distance <= stats.GrounderDistance) m_FrameVelocity.y = 0f;   // head bonk
                    else m_FrameVelocity.y = Mathf.Min(m_FrameVelocity.y, hit.distance / Time.fixedDeltaTime);
                }
            }

            if (!m_Grounded && groundHit)
            {
                m_Grounded = true;
                m_CoyoteUsable = true;
                m_BufferedJumpUsable = true;
                m_EndedJumpEarly = false;
                m_InJump = false;
                GroundedChanged?.Invoke(true, Mathf.Abs(m_FrameVelocity.y));
            }
            else if (m_Grounded && !groundHit)
            {
                m_Grounded = false;
                m_FrameLeftGrounded = m_Time;
                GroundedChanged?.Invoke(false, 0f);
            }
            Physics2D.queriesStartInColliders = m_CachedQueriesStartInColliders;
        }

        bool TryCornerCorrect(Vector2 center, RaycastHit2D hit, float look, int mask)
        {
            int steps = Mathf.Max(1, stats.CornerCorrectionSteps);
            float step = stats.CornerCorrection / steps;
            float away = hit.point.x > center.x ? -1f : 1f;   // slide away from the corner that was hit
            for (int i = 1; i <= steps; i++)
            {
                var off = new Vector2(away * step * i, 0f);
                if (Blocked(center + off, mask)) continue;
                var h = Cast(center + off, Vector2.up, look, mask);
                if (h.collider != null) continue;
                m_Rb.position += off;
                CornerCorrections++;
                return true;
            }
            return false;
        }

        bool Blocked(Vector2 center, int mask)
        {
            var filter = new ContactFilter2D { useLayerMask = true, layerMask = mask, useTriggers = false };
            int n = Physics2D.OverlapCapsule(center, m_Col.size, m_Col.direction, 0f, filter, m_Overlap);
            for (int i = 0; i < n; i++)
                if (m_Overlap[i] != null && m_Overlap[i] != m_Col && !IsOneWay(m_Overlap[i])) return true;
            return false;
        }

        // ---------------------------------------------------------------- jump
        // Strict "<" as in Tarodev: a press exactly JumpBuffer (or CoyoteTime) away sits on a float boundary of the
        // accumulated clock and may go either way; gates test one step inside (accepted) and one step outside (refused).
        bool HasBufferedJump => stats.UseJumpBuffer && m_BufferedJumpUsable && m_Time < m_TimeJumpWasPressed + stats.JumpBuffer;
        bool CanUseCoyote => stats.UseCoyoteTime && m_CoyoteUsable && !m_Grounded && m_Time < m_FrameLeftGrounded + stats.CoyoteTime;

        void HandleJump()
        {
            if (stats.UseVariableJump && !m_EndedJumpEarly && !m_Grounded && !m_JumpHeld && m_Rb.linearVelocity.y > 0f)
            {
                m_EndedJumpEarly = true;
                if (stats.JumpCut == JumpCutMode.VelocityCut) m_FrameVelocity.y *= stats.JumpCutVelocityFactor;
                m_SustainLeft = 0f;
            }
            if (!m_JumpToConsume && !HasBufferedJump) return;
            if (m_Grounded && m_MoveInput.y < 0f && m_JumpToConsume && IsOneWay(m_GroundCollider))
            {
                DropThrough(m_GroundCollider);
                m_JumpToConsume = false;
                m_TimeJumpWasPressed = float.MinValue;
                return;
            }
            if (m_Grounded || CanUseCoyote) ExecuteJump();
            m_JumpToConsume = false;
        }

        void DropThrough(Collider2D platform)
        {
            RestoreDropCollision();
            m_DropCollider = platform;
            m_DropUntil = m_Time + stats.DropThroughTime;
            Physics2D.IgnoreCollision(m_Col, platform, true);
            m_Grounded = false;
            m_FrameLeftGrounded = m_Time;
            m_CoyoteUsable = false;                  // dropping is not walking off a ledge: no coyote jump
            DropThroughs++;
            GroundedChanged?.Invoke(false, 0f);
        }

        void ExecuteJump()
        {
            m_EndedJumpEarly = false;
            m_TimeJumpWasPressed = float.MinValue;
            m_BufferedJumpUsable = false;
            m_CoyoteUsable = false;
            m_FrameVelocity.y = stats.JumpPower;
            m_InJump = true;
            m_SustainLeft = stats.JumpCut == JumpCutMode.Sustain ? stats.SustainTime : 0f;
            JumpCount++;
            LastJumpTime = m_Time;
            Jumped?.Invoke();
        }

        // ---------------------------------------------------------------- horizontal and gravity
        void HandleDirection()
        {
            float dt = Time.fixedDeltaTime;
            if (m_MoveInput.x == 0f)
            {
                float decel = m_Grounded ? stats.GroundDeceleration : stats.AirDeceleration;
                m_FrameVelocity.x = Mathf.MoveTowards(m_FrameVelocity.x, 0f, decel * dt);
            }
            else
            {
                float accel = stats.Acceleration * (m_InApexBand ? stats.ApexAccelerationMultiplier : 1f);
                m_FrameVelocity.x = Mathf.MoveTowards(m_FrameVelocity.x, m_MoveInput.x * stats.MaxSpeed, accel * dt);
            }
        }

        void HandleGravity()
        {
            m_InApexBand = false;
            if (m_Grounded && m_FrameVelocity.y <= 0f)
            {
                m_FrameVelocity.y = stats.GroundingForce;
                return;
            }
            float dt = Time.fixedDeltaTime;
            if (m_SustainLeft > 0f && m_InJump && (m_JumpHeld || !stats.UseVariableJump) && m_FrameVelocity.y > 0f)
            {
                // Sustain (Celeste): hold the jump speed, no gravity, while held and time remains
                // (variable jump off: always the full sustain)
                m_SustainLeft -= dt;
                m_FrameVelocity.y = Mathf.Max(m_FrameVelocity.y, stats.JumpPower);
                return;
            }
            float g = stats.FallAcceleration;
            if (m_EndedJumpEarly && m_FrameVelocity.y > 0f)
            {
                if (stats.JumpCut == JumpCutMode.GravityMultiplier) g *= stats.JumpEndEarlyGravityModifier;
            }
            else if (stats.UseApexModifier && m_InJump && m_JumpHeld && Mathf.Abs(m_FrameVelocity.y) < stats.ApexThreshold)
            {
                g *= stats.ApexGravityMultiplier;
                m_InApexBand = true;
            }
            if (stats.UseFallClamp) m_FrameVelocity.y = Mathf.MoveTowards(m_FrameVelocity.y, -stats.MaxFallSpeed, g * dt);
            else m_FrameVelocity.y -= g * dt;
        }
    }
}
