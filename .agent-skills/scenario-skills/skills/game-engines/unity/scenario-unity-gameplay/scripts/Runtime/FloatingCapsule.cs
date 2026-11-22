// scenario-unity-gameplay runtime (Unity Expert Skills v0.1, 2026-09-24). The floating-capsule Rigidbody
// character from Toyful Games (Very Very Valet, qdskE8PJy6Q): a dynamic Rigidbody held above the
// ground by a damped spring on a down ray LONGER than the ride height (sticks to slopes, clears
// small bumps), kept upright by a damped torque spring instead of frozen rotation (collisions still
// tilt it), moved by a goal velocity limited by acceleration and a max force (mass matters when
// pushing), with a reversal boost. The audio gives the structure; the exact formulas follow the
// common implementation of the talk [added]. Everything runs in FixedUpdate.
using UnityEngine;

namespace AgentKit.Gameplay
{
    [RequireComponent(typeof(Rigidbody))]
    public class FloatingCapsule : MonoBehaviour
    {
        [Header("Ride spring")]
        public float rideHeight = 1.0f;
        public float rayLength = 1.6f;              // longer than rideHeight: the slope-stick buffer
        public float rideSpringStrength = 400f;
        public float rideSpringDamper = 40f;
        [Tooltip("Add m*g to the spring so it rests AT rideHeight. Without it the body sags by m*g/k (2.5 cm at k = 400, m = 1: measured).")]
        public bool gravityCompensation = true;
        public LayerMask groundMask = ~0;

        [Header("Upright spring")]
        public float uprightStrength = 60f;
        public float uprightDamper = 8f;

        [Header("Movement")]
        public float maxSpeed = 6f;
        public float acceleration = 40f;
        public float maxAccelForce = 60f;
        public AnimationCurve turnFactorByDot = new AnimationCurve(new Keyframe(-1f, 2f), new Keyframe(0f, 1.5f), new Keyframe(1f, 1f));

        [System.NonSerialized] public Vector3 moveInput;   // world XZ, magnitude <= 1 (from the Input System)
        public bool Grounded { get; private set; }
        public float GroundDistance { get; private set; }

        Rigidbody m_Rb;
        Vector3 m_GoalVel;

        void Awake()
        {
            m_Rb = GetComponent<Rigidbody>();
            m_Rb.constraints = RigidbodyConstraints.None;   // no frozen rotation: the torque spring keeps it up
            m_Rb.interpolation = RigidbodyInterpolation.Interpolate; // camera-tracked body
        }

        void FixedUpdate()
        {
            RideSpring();
            UprightSpring();
            Move();
        }

        void RideSpring()
        {
            var down = Vector3.down;
            Grounded = Physics.Raycast(m_Rb.position, down, out var hit, rayLength, groundMask, QueryTriggerInteraction.Ignore);
            GroundDistance = Grounded ? hit.distance : float.PositiveInfinity;
            if (!Grounded) return;
            var otherVel = hit.rigidbody != null ? hit.rigidbody.linearVelocity : Vector3.zero;
            float rayDirVel = Vector3.Dot(down, m_Rb.linearVelocity);
            float otherDirVel = Vector3.Dot(down, otherVel);
            float relVel = rayDirVel - otherDirVel;
            float x = hit.distance - rideHeight;
            float spring = x * rideSpringStrength - relVel * rideSpringDamper;
            if (gravityCompensation) spring -= m_Rb.mass * Vector3.Dot(Physics.gravity, down);   // hold m*g at x = 0
            m_Rb.AddForce(down * spring);
            if (hit.rigidbody != null) hit.rigidbody.AddForceAtPosition(down * -spring, hit.point); // landing on a car bounces it
        }

        void UprightSpring()
        {
            var yawFwd = Vector3.ProjectOnPlane(transform.forward, Vector3.up);
            if (yawFwd.sqrMagnitude < 1e-4f) yawFwd = Vector3.forward;
            var goal = Quaternion.LookRotation(yawFwd.normalized, Vector3.up);
            var toGoal = goal * Quaternion.Inverse(m_Rb.rotation);
            if (toGoal.w < 0f) { toGoal.x = -toGoal.x; toGoal.y = -toGoal.y; toGoal.z = -toGoal.z; toGoal.w = -toGoal.w; } // shortest arc
            toGoal.ToAngleAxis(out float deg, out Vector3 axis);
            if (float.IsNaN(axis.x) || deg < 1e-3f) axis = Vector3.zero;
            m_Rb.AddTorque(axis.normalized * (deg * Mathf.Deg2Rad * uprightStrength) - m_Rb.angularVelocity * uprightDamper);
        }

        void Move()
        {
            var ideal = Vector3.ClampMagnitude(new Vector3(moveInput.x, 0f, moveInput.z), 1f) * maxSpeed;
            var velXZ = new Vector3(m_Rb.linearVelocity.x, 0f, m_Rb.linearVelocity.z);
            float dot = (ideal.sqrMagnitude > 1e-4f && m_GoalVel.sqrMagnitude > 1e-4f) ? Vector3.Dot(ideal.normalized, m_GoalVel.normalized) : 1f;
            float turn = turnFactorByDot.Evaluate(dot);                    // x2 on reversals, x1 when aligned
            m_GoalVel = Vector3.MoveTowards(m_GoalVel, ideal, acceleration * turn * Time.fixedDeltaTime);
            var needed = (m_GoalVel - velXZ) / Time.fixedDeltaTime;
            needed = Vector3.ClampMagnitude(needed, maxAccelForce * turn);
            m_Rb.AddForce(needed * m_Rb.mass);
        }
    }
}
