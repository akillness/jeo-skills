// AgentKit 2D v0.1 (scenario-unity-2d skill, 2026-09-24). Tuning data of PlatformerController2D.
// Defaults are the Tarodev Ultimate 2D Controller ScriptableStats values (MIT,
// github.com/Matthew-J-Spencer/Ultimate-2D-Controller); the apex, jump-cut and corner-correction
// fields are added from Dawnosaur (2S3g8CgBG1g), GMTK/Celeste (yorTG9at90g) and Tarodev's video
// feature list (3sWTzMsmdx8), which the free repo does not implement. Units: world units, seconds.
// v0.2 (2026-09-24 refactor): one toggle per forgiveness trick so feel can be A/B tested (Tarodev
// 3sWTzMsmdx8 [00:02:24], Nijman AJdEqssNZ-U [00:31:43]); a third variable-height method (Sustain,
// Celeste); the air-friction choice documented (GMTK yorTG9at90g [00:04:14]); one-way platforms.
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-2d (PlatformerFeelTests, ForgivenessTests).
using UnityEngine;

namespace AgentKit.TwoD
{
    public enum JumpCutMode
    {
        /// <summary>Tarodev: gravity x JumpEndEarlyGravityModifier while rising after release (smooth arc).</summary>
        GravityMultiplier,
        /// <summary>Super Meat Boy (per Dawnosaur): vertical speed x JumpCutVelocityFactor on release (precise, short hops).</summary>
        VelocityCut,
        /// <summary>Celeste (VarJumpTime in its public Player.cs, recalled in the GMTK note, unverified): the jump speed is
        /// HELD while the button is held, for up to SustainTime; release (or the time limit) hands over to normal
        /// gravity. Long, controllable rise; a tap still gives a short hop.</summary>
        Sustain,
    }

    [CreateAssetMenu(menuName = "AgentKit 2D/Platformer Stats", fileName = "PlatformerStats")]
    public class PlatformerStats : ScriptableObject
    {
        [Header("Layers")]
        [Tooltip("Layer(s) of the player: ground and ceiling casts use ~PlayerLayer (Tarodev)")]
        public LayerMask PlayerLayer;

        [Header("Input")]
        [Tooltip("Snap analog input to -1/0/1 so a gamepad never walks slower than a keyboard (Tarodev)")]
        public bool SnapInput = true;
        [Range(0.01f, 0.99f)] public float VerticalDeadZoneThreshold = 0.3f;
        [Range(0.01f, 0.99f)] public float HorizontalDeadZoneThreshold = 0.1f;

        [Header("Movement")]
        public float MaxSpeed = 14f;
        public float Acceleration = 120f;
        public float GroundDeceleration = 60f;
        [Tooltip("Deceleration in the air once input stops. This is the AIR FRICTION CHOICE: Tarodev 30 (half of ground: the body drifts about 3.3 units, 6 body widths, after release at top speed) vs a precision profile where release drops the character almost straight down (Celeste 'massive air friction', GMTK [00:04:14]); e.g. 240 stops in 3 steps. Decide by the level: small landings and spikes want high air friction")]
        public float AirDeceleration = 30f;
        [Tooltip("Constant small downward velocity while grounded: keeps the ground cast stable, helps on slopes")]
        [Range(-10f, 0f)] public float GroundingForce = -1.5f;
        [Tooltip("Ground and ceiling cast distance")]
        [Range(0f, 0.5f)] public float GrounderDistance = 0.05f;

        [Header("Jump")]
        public float JumpPower = 36f;
        public float MaxFallSpeed = 40f;
        [Tooltip("In-air gravity (units/s^2)")]
        public float FallAcceleration = 110f;
        [Tooltip("Forgiveness toggle: clamp the fall at MaxFallSpeed (Tarodev, Dawnosaur: falling stays readable and dodgeable)")]
        public bool UseFallClamp = true;
        [Tooltip("Forgiveness toggle: releasing jump early lowers the jump (variable height). Off = every jump is full height")]
        public bool UseVariableJump = true;
        [Tooltip("Variable-height METHOD, a feel decision (Dawnosaur [00:00:36]): GravityMultiplier = smooth arc (Tarodev x3); VelocityCut = precise short hops (Super Meat Boy 0.5); Sustain = long controllable rise (Celeste)")]
        public JumpCutMode JumpCut = JumpCutMode.GravityMultiplier;
        [Tooltip("Gravity multiplier while rising after an early release (Tarodev x3)")]
        public float JumpEndEarlyGravityModifier = 3f;
        [Tooltip("VelocityCut mode: vertical speed multiplier on release (Super Meat Boy 0.5, per Dawnosaur)")]
        [Range(0f, 1f)] public float JumpCutVelocityFactor = 0.5f;
        [Tooltip("Sustain mode: longest time the jump speed is held while the button is held (Celeste VarJumpTime 0.2 s, recalled, unverified)")]
        public float SustainTime = 0.2f;
        [Tooltip("Forgiveness toggle: coyote time (GMTK [00:09:28])")]
        public bool UseCoyoteTime = true;
        [Tooltip("Grace after leaving a ledge (s)")]
        public float CoyoteTime = 0.15f;
        [Tooltip("Forgiveness toggle: jump buffer, 'possibly the most vital hidden feature' (Tarodev [00:01:06])")]
        public bool UseJumpBuffer = true;
        [Tooltip("Grace for a press before landing (s)")]
        public float JumpBuffer = 0.2f;

        [Header("Apex hang [added: Dawnosaur, Celeste, Tarodev video]")]
        public bool UseApexModifier = true;
        [Tooltip("|vy| below this (units/s) while jump is held counts as the apex band")]
        public float ApexThreshold = 5f;
        [Tooltip("Gravity multiplier inside the apex band (0.5 = half gravity)")]
        public float ApexGravityMultiplier = 0.5f;
        [Tooltip("Horizontal acceleration multiplier inside the apex band (small boost)")]
        public float ApexAccelerationMultiplier = 1.5f;

        [Header("Corner correction [added: Tarodev video, Celeste]")]
        public bool UseCornerCorrection = true;
        [Tooltip("Max sideways nudge (units) when the head clips a ceiling corner; 0.25 = 4 px at 16 PPU")]
        public float CornerCorrection = 0.25f;
        [Min(1)] public int CornerCorrectionSteps = 4;

        [Header("One-way platforms (Platform Effector 2D, Use One Way) [added]")]
        [Tooltip("Down + jump on a one-way platform drops through it; collisions with that platform are ignored this long (s) [added value]")]
        public float DropThroughTime = 0.25f;
    }
}
