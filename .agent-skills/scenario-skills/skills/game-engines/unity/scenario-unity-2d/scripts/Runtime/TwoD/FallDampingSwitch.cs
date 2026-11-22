// AgentKit 2D v0.2 (scenario-unity-2d skill, 2026-09-24 refactor). Asymmetric vertical camera damping with
// hysteresis (Hollow Knight camera, Sasquatch B Studios 9dzBrLUIF8g [00:05:37], [00:06:43], [00:07:14]):
// loose while rising or hopping, tight once the player falls faster than a threshold, so what is below
// shows up in time ("an enemy below you ... isn't really fair" otherwise). Two rules from the video:
// switch only past a speed THRESHOLD (small vertical changes must not flip it), switch back when the
// vertical speed is at least 0 (landed or rising): entering at -threshold and leaving at 0 is the
// hysteresis band. The damping is LERPED, never snapped, so Cinemachine stays in charge.
// Pure logic, no Cinemachine dependency: CinemachineFallDamping (AgentKit.TwoD.Cinemachine) applies it
// to CinemachinePositionComposer.Damping.y. Sasquatch's own values are shown on screen only, so every
// default below is [added]: tune them against the level's jump and fall speeds.
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-2d (CameraFeelTests).
using System;
using UnityEngine;

namespace AgentKit.TwoD
{
    [Serializable]
    public class FallDampingSwitch
    {
        [Tooltip("Vertical damping (s) while rising, standing or falling slowly: loose [added default]")]
        public float looseDamping = 0.6f;
        [Tooltip("Vertical damping (s) once falling fast: tight, the camera keeps up [added default]")]
        public float tightDamping = 0.1f;
        [Tooltip("Switch to tight when vertical speed drops below minus this (units/s). Above an ordinary hop's early fall, below a real drop [added default: about 40% of Tarodev MaxFallSpeed 40]")]
        public float fallSpeedThreshold = 15f;
        [Tooltip("Switch back to loose once vertical speed is at least this (Sasquatch: 0 = landed or rising)")]
        public float releaseSpeed = 0f;
        [Tooltip("Seconds to lerp from one damping to the other (never snap) [added default]")]
        public float blendTime = 0.2f;

        public bool Falling { get; private set; }
        public float Current { get; private set; } = -1f;
        public int Switches { get; private set; }

        public void Reset()
        {
            Falling = false;
            Current = looseDamping;
            Switches = 0;
        }

        /// <summary>Feed the target's vertical speed each frame; returns the damping to apply on Y.</summary>
        public float Step(float verticalSpeed, float dt)
        {
            if (Current < 0f) Current = looseDamping;
            if (!Falling && verticalSpeed < -fallSpeedThreshold) { Falling = true; Switches++; }
            else if (Falling && verticalSpeed >= releaseSpeed) { Falling = false; Switches++; }
            float target = Falling ? tightDamping : looseDamping;
            float rate = blendTime > 0f ? Mathf.Abs(looseDamping - tightDamping) / blendTime : float.MaxValue;
            Current = Mathf.MoveTowards(Current, target, rate * dt);
            return Current;
        }
    }
}
