// AgentKit 2D v0.1 (scenario-unity-2d skill, 2026-09-24). Unity 6.3 LowLevelPhysics2D (Box2D v3) spike.
// A second 2D physics system, separate from Rigidbody2D/Collider2D: no components, struct handles,
// several isolated worlds, up to 64 cores, 64 layers, most calls usable from jobs; needs
// compute-shader platforms (6.3 Manual; Unite 2025 SdrMgxChrRQ). Renamed PhysicsCore2D in namespace
// Unity.U2D.Physics in 6.5: guard code that must survive upgrades with #if UNITY_6000_5_OR_NEWER.
// Job: AgentKit.TwoD.PhysicsJobs.LowLevelSpike  args: steps (150), dt (0.02)
//   -> an isolated world in Script simulation mode, a static box ground and a dynamic circle.
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-2d/test_live_2d.py (P11).
using System.Collections.Generic;
using UnityEngine;
#if !UNITY_6000_5_OR_NEWER
using UnityEngine.LowLevelPhysics2D;
#endif

namespace AgentKit.TwoD
{
    public static class PhysicsJobs
    {
        public static void LowLevelSpike()
        {
            AgentJob.Run(() =>
            {
#if UNITY_6000_5_OR_NEWER
                throw new System.NotSupportedException("6.5+: port to Unity.U2D.Physics.PhysicsCore2D");
#else
                int steps = AgentJob.Int("steps", 150);
                float dt = AgentJob.Float("dt", 0.02f);
                var def = PhysicsWorldDefinition.defaultDefinition;
                def.simulateType = PhysicsWorld.SimulationType.Script;       // we step it; nothing else does
                var world = PhysicsWorld.Create(def);
                try
                {
                    var groundDef = PhysicsBodyDefinition.defaultDefinition;
                    groundDef.type = PhysicsBody.BodyType.Static;
                    groundDef.position = new Vector2(0f, -0.5f);
                    var ground = world.CreateBody(groundDef);
                    ground.CreateShape(PolygonGeometry.CreateBox(new Vector2(20f, 1f), 0f, false));   // top surface at y = 0

                    var ballDef = PhysicsBodyDefinition.defaultDefinition;
                    ballDef.type = PhysicsBody.BodyType.Dynamic;
                    ballDef.position = new Vector2(0f, 5f);
                    var ball = world.CreateBody(ballDef);
                    ball.CreateShape(CircleGeometry.Create(0.25f));

                    float y0 = ball.position.y;
                    for (int i = 0; i < steps; i++) world.Simulate(dt);
                    return new Dictionary<string, object>
                    {
                        { "api", "UnityEngine.LowLevelPhysics2D" }, { "world_gravity", world.gravity },
                        { "start_y", y0 }, { "rest_y", ball.position.y }, { "expected_y", 0.25f },
                        { "error", ball.position.y - 0.25f }, { "awake", ball.awake }, { "steps", steps }, { "dt", dt },
                        { "graphics", SystemInfo.graphicsDeviceType.ToString() }, { "compute_shaders", SystemInfo.supportsComputeShaders },
                    };
                }
                finally
                {
                    world.Destroy();
                }
#endif
            });
        }
    }
}
