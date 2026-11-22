// AgentKit.Vfx v0.2 (Unity Expert Skills, scenario-unity-vfx, 2026-09-24).
// The Particle System (Shuriken) authored entirely from C#: every Inspector module is a struct on
// ParticleSystem (fetch it, set fields, no reassignment). This file is the vocabulary the kit
// builders use: a Layer spec (one job per layer, the expert consensus) -> one child ParticleSystem.
// 6.3 API notes: SetActiveVertexStreams(List<ParticleSystemVertexStream>) replaces the deprecated
// EnableVertexStreams / ParticleSystemVertexStreams; randomSeed can only be set while stopped.
using System;
using System.Collections.Generic;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;

namespace AgentKit.Vfx
{
    public class Layer
    {
        public string name = "Layer";
        public Material material;
        public Material trailMaterial;
        public bool loop;
        public bool prewarm;
        public float duration = 1f;
        public Vector2 lifetime = new Vector2(0.5f, 1f);
        public Vector2 speed = new Vector2(1f, 2f);
        public Vector2 size = new Vector2(0.2f, 0.4f);
        public Vector2 rotationDeg = new Vector2(0f, 360f);
        public Color colorA = Color.white, colorB = Color.white;   // start colour: random between the two
        public Gradient colorOverLife;          // fade in and out, never pop (consensus)
        public AnimationCurve sizeOverLife;     // multiplies the start size
        public float gravity;
        public float drag;                      // Limit Velocity over Lifetime drag: fast start, slow end (Brackeys)
        public int maxParticles = 50;           // Nordeus: hard cap 100 per emitter on mobile
        public float rateOverTime;
        public float rateOverDistance;
        public List<ParticleSystem.Burst> bursts = new List<ParticleSystem.Burst>();
        public ParticleSystemShapeType shape = ParticleSystemShapeType.Sphere;
        public bool shapeEnabled = true;
        public float shapeRadius = 0.1f, shapeAngle = 25f, radiusThickness = 1f;
        public Vector3 shapeRotation;
        public ParticleSystemSimulationSpace space = ParticleSystemSimulationSpace.Local;
        public ParticleSystemRenderMode renderMode = ParticleSystemRenderMode.Billboard;
        public float velocityScale, lengthScale = 1f;
        public int sortingOrder;
        public float maxParticleSize = 0.5f;    // fraction of the screen a particle may cover (renderer)
        public int tilesX = 1, tilesY = 1;
        public bool randomFrame;                // one random cell per particle (Sirhaian 5Mw6 [00:05:58])
        public AnimationCurve frameOverTime;    // playback curve, normalised 0..1 over the sheet
        public bool flipbookBlend;              // needs UV2 + AnimBlend streams when not instanced (Fred Moreau)
        public float noiseStrength, noiseFrequency = 1f;
        public bool trails;                     // Trails module
        public ParticleSystemTrailMode trailMode = ParticleSystemTrailMode.Ribbon;
        public float trailLifetime = 0.2f, trailMinVertexDistance = 0.05f;
        public AnimationCurve trailWidth;
        public Gradient trailColor;
        public bool renderParticles = true;     // false: render only the trails (renderMode None)
        public float startDelay;
        public ParticleSystemStopAction stopAction = ParticleSystemStopAction.None;
        // v0.2: mesh particles, per-particle Custom Data, placement
        public Mesh mesh;                       // non-null: Mesh render mode (a ring, arc, cone or quad from VfxMeshes)
        public ParticleSystemRenderSpace alignment = ParticleSystemRenderSpace.View;   // Local for meshes oriented by the root
        public bool gpuInstancing;              // mesh particles: off when a Custom Data shader reads the streams (non-instanced path)
        public Vector2? yawDeg;                 // random 3D start rotation around local Y (meshes), instead of rotationDeg
        public ParticleSystem.MinMaxCurve? custom1X, custom1Y, custom2X, custom2Y;   // any set: Custom Data on, streams = VfxUber.Streams
        public Vector3 localPosition;
        public float sortingFudge;              // larger = drawn earlier (behind) among equal sorting orders (distortion goes behind, Hovl)
    }

    public static class VfxShuriken
    {
        public static Gradient Grad(params (float t, Color c)[] keys)
        {
            var g = new Gradient();
            var ck = new GradientColorKey[keys.Length];
            var ak = new GradientAlphaKey[keys.Length];
            for (int i = 0; i < keys.Length; i++)
            {
                ck[i] = new GradientColorKey(new Color(keys[i].c.r, keys[i].c.g, keys[i].c.b), keys[i].t);
                ak[i] = new GradientAlphaKey(keys[i].c.a, keys[i].t);
            }
            g.SetKeys(ck, ak);
            return g;
        }

        public static AnimationCurve Curve(params float[] tv)
        {
            var c = new AnimationCurve();
            for (int i = 0; i + 1 < tv.Length; i += 2) c.AddKey(new Keyframe(tv[i], tv[i + 1]));
            for (int i = 0; i < c.length; i++) c.SmoothTangents(i, 0f);
            return c;
        }

        /// <summary>Decelerating playback: fast at the start, slow at the end, like smoke slowed by air
        /// friction (Truempler KaN [00:13:07]; Orson Favrel samples texIndex from a curve, uNz [00:12:13]).</summary>
        public static AnimationCurve Decelerate(float firstThirdShare = 0.6f)
        {
            return new AnimationCurve(new Keyframe(0, 0, 0, 3.2f), new Keyframe(0.3f, firstThirdShare), new Keyframe(1, 0.999f, 0.15f, 0));
        }

        /// <summary>Ease-out from a to b over life: fast change first, slow settle (explosions and shockwaves expand
        /// fast then slow). Nordeus: "linear animation curves, they're a big no-no" except loops (YZWK [00:11:47]).</summary>
        public static AnimationCurve EaseOut(float a, float b, float strength = 2.6f)
        {
            return new AnimationCurve(new Keyframe(0f, a, 0f, strength * (b - a)), new Keyframe(1f, b, 0f, 0f));
        }

        /// <summary>Ease-in from a to b over life: slow start, fast end (erosion that eats the shape at the end).</summary>
        public static AnimationCurve EaseIn(float a, float b, float strength = 2.6f)
        {
            return new AnimationCurve(new Keyframe(0f, a, 0f, 0f), new Keyframe(1f, b, strength * (b - a), 0f));
        }

        static ParticleSystem.MinMaxCurve Range(Vector2 v) =>
            Mathf.Approximately(v.x, v.y) ? new ParticleSystem.MinMaxCurve(v.x) : new ParticleSystem.MinMaxCurve(v.x, v.y);

        /// <summary>Get-or-create a child ParticleSystem named layer.name under parent and configure every module.</summary>
        public static ParticleSystem Build(Transform parent, Layer L, uint seed)
        {
            var t = parent.Find(L.name);
            var go = t != null ? t.gameObject : new GameObject(L.name);
            go.transform.SetParent(parent, false);
            go.transform.localPosition = L.localPosition;
            var ps = go.GetComponent<ParticleSystem>();
            if (ps == null) ps = go.AddComponent<ParticleSystem>();   // never '??' on UnityEngine.Object: fake null in the editor
            ps.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            ps.useAutoRandomSeed = false;           // deterministic captures and tests
            ps.randomSeed = seed;

            var main = ps.main;
            main.playOnAwake = true;
            main.loop = L.loop;
            main.prewarm = L.prewarm && L.loop;     // prewarmed rate-driven glow is visible on the first frame (Gabriel xen [00:01:12])
            main.duration = Mathf.Max(0.05f, L.duration);
            main.startDelay = L.startDelay;
            main.startLifetime = Range(L.lifetime);
            main.startSpeed = Range(L.speed);
            main.startSize = Range(L.size);
            if (L.yawDeg.HasValue)
            {
                var yaw = L.yawDeg.Value;
                main.startRotation3D = true;
                main.startRotationX = 0f;
                main.startRotationY = new ParticleSystem.MinMaxCurve(yaw.x * Mathf.Deg2Rad, yaw.y * Mathf.Deg2Rad);
                main.startRotationZ = 0f;
            }
            else
            {
                main.startRotation3D = false;
                main.startRotation = new ParticleSystem.MinMaxCurve(L.rotationDeg.x * Mathf.Deg2Rad, L.rotationDeg.y * Mathf.Deg2Rad);
            }
            main.startColor = L.colorA == L.colorB ? new ParticleSystem.MinMaxGradient(L.colorA) : new ParticleSystem.MinMaxGradient(L.colorA, L.colorB);
            main.gravityModifier = L.gravity;
            main.maxParticles = L.maxParticles;
            main.simulationSpace = L.space;
            main.scalingMode = ParticleSystemScalingMode.Hierarchy;   // scaling the root scales the effect (hitbox matching)
            main.stopAction = L.stopAction;
            main.cullingMode = ParticleSystemCullingMode.Automatic;

            var em = ps.emission;
            em.enabled = true;
            em.rateOverTime = L.rateOverTime;
            em.rateOverDistance = L.rateOverDistance;
            em.SetBursts(L.bursts.ToArray());

            var sh = ps.shape;
            sh.enabled = L.shapeEnabled;
            sh.shapeType = L.shape;
            sh.radius = L.shapeRadius;
            sh.angle = L.shapeAngle;
            sh.radiusThickness = L.radiusThickness;
            sh.rotation = L.shapeRotation;

            var col = ps.colorOverLifetime;
            col.enabled = L.colorOverLife != null;
            if (L.colorOverLife != null) col.color = new ParticleSystem.MinMaxGradient(L.colorOverLife);

            var sol = ps.sizeOverLifetime;
            sol.enabled = L.sizeOverLife != null;
            if (L.sizeOverLife != null) sol.size = new ParticleSystem.MinMaxCurve(1f, L.sizeOverLife);

            var lim = ps.limitVelocityOverLifetime;
            lim.enabled = L.drag > 0f;
            if (L.drag > 0f) { lim.drag = L.drag; lim.multiplyDragByParticleSize = false; lim.multiplyDragByParticleVelocity = true; }

            var noise = ps.noise;
            noise.enabled = L.noiseStrength > 0f;
            if (L.noiseStrength > 0f) { noise.strength = L.noiseStrength; noise.frequency = L.noiseFrequency; noise.scrollSpeed = 0.5f; noise.quality = ParticleSystemNoiseQuality.Medium; }

            var tsa = ps.textureSheetAnimation;
            tsa.enabled = L.tilesX * L.tilesY > 1;
            if (tsa.enabled)
            {
                tsa.mode = ParticleSystemAnimationMode.Grid;
                tsa.numTilesX = L.tilesX;
                tsa.numTilesY = L.tilesY;
                tsa.animation = ParticleSystemAnimationType.WholeSheet;
                if (L.randomFrame)
                    tsa.frameOverTime = new ParticleSystem.MinMaxCurve(0f, 0.999f);   // random between two constants = fixed random cell
                else if (L.frameOverTime != null)
                    tsa.frameOverTime = new ParticleSystem.MinMaxCurve(1f, L.frameOverTime);
                tsa.cycleCount = 1;
            }

            var tr = ps.trails;
            tr.enabled = L.trails;
            if (L.trails)
            {
                tr.mode = L.trailMode;
                tr.lifetime = L.trailLifetime;
                tr.minVertexDistance = L.trailMinVertexDistance;
                tr.worldSpace = true;
                tr.dieWithParticles = true;
                tr.sizeAffectsWidth = true;
                tr.inheritParticleColor = true;
                tr.textureMode = ParticleSystemTrailTextureMode.Stretch;
                if (L.trailWidth != null) tr.widthOverTrail = new ParticleSystem.MinMaxCurve(1f, L.trailWidth);
                if (L.trailColor != null) tr.colorOverTrail = new ParticleSystem.MinMaxGradient(L.trailColor);
            }

            // Custom Data: per-particle values the shader reads from the vertex streams (Hovl 5Sos [00:07:34]):
            // Custom1 and Custom2 as 2-component vectors, each component a constant, a curve over life or a random range
            bool useCd = L.custom1X.HasValue || L.custom1Y.HasValue || L.custom2X.HasValue || L.custom2Y.HasValue;
            var cd = ps.customData;
            cd.enabled = useCd;
            if (useCd)
            {
                cd.SetMode(ParticleSystemCustomData.Custom1, ParticleSystemCustomDataMode.Vector);
                cd.SetVectorComponentCount(ParticleSystemCustomData.Custom1, 2);
                cd.SetVector(ParticleSystemCustomData.Custom1, 0, L.custom1X ?? new ParticleSystem.MinMaxCurve(0f));
                cd.SetVector(ParticleSystemCustomData.Custom1, 1, L.custom1Y ?? new ParticleSystem.MinMaxCurve(1f));
                cd.SetMode(ParticleSystemCustomData.Custom2, ParticleSystemCustomDataMode.Vector);
                cd.SetVectorComponentCount(ParticleSystemCustomData.Custom2, 2);
                cd.SetVector(ParticleSystemCustomData.Custom2, 0, L.custom2X ?? new ParticleSystem.MinMaxCurve(0f));
                cd.SetVector(ParticleSystemCustomData.Custom2, 1, L.custom2Y ?? new ParticleSystem.MinMaxCurve(0f));
            }

            var r = go.GetComponent<ParticleSystemRenderer>();
            var mode = L.mesh != null ? ParticleSystemRenderMode.Mesh : L.renderMode;
            r.renderMode = L.renderParticles ? mode : ParticleSystemRenderMode.None;
            if (L.mesh != null) { r.mesh = L.mesh; r.enableGPUInstancing = L.gpuInstancing; }
            r.sortingFudge = L.sortingFudge;
            r.sharedMaterial = L.material;
            r.trailMaterial = L.trails ? (L.trailMaterial != null ? L.trailMaterial : L.material) : null;
            r.velocityScale = L.velocityScale;
            r.lengthScale = L.lengthScale;
            r.sortingOrder = L.sortingOrder;         // explicit order per layer: equal orders flicker (Gabriel wvK [00:11:31])
            r.maxParticleSize = L.maxParticleSize;
            r.shadowCastingMode = ShadowCastingMode.Off;   // URP 6.3 particle shaders have no ShadowCaster pass anyway
            r.receiveShadows = false;
            r.alignment = L.alignment;
            List<ParticleSystemVertexStream> streams;
            if (useCd)
            {
                // the uber shader's contract (VfxUber.Streams); flipbook blending is not part of it
                if (L.flipbookBlend) throw new ArgumentException(L.name + ": Custom Data streams and flipbook blending (UV2 + AnimBlend) are two different stream layouts");
                streams = new List<ParticleSystemVertexStream>(VfxUber.Streams);
            }
            else
            {
                streams = new List<ParticleSystemVertexStream> { ParticleSystemVertexStream.Position, ParticleSystemVertexStream.Color, ParticleSystemVertexStream.UV };
                if (L.flipbookBlend) { streams.Add(ParticleSystemVertexStream.UV2); streams.Add(ParticleSystemVertexStream.AnimBlend); }
            }
            r.SetActiveVertexStreams(streams);
            return ps;
        }

        /// <summary>Root container: a ParticleSystem with emission and rendering off, so the whole set previews and
        /// plays together (Sirhaian 5Mw6 [00:04:47]); its duration covers the longest child lifetime so a
        /// Stop Action or a duration-based cleanup never cuts a child mid-fade (Gabriel xen [00:31:08]).</summary>
        public static ParticleSystem Root(GameObject go, float duration, bool loop, ParticleSystemStopAction stop)
        {
            var ps = go.GetComponent<ParticleSystem>();
            if (ps == null) ps = go.AddComponent<ParticleSystem>();   // never '??' on UnityEngine.Object: fake null in the editor
            ps.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            var main = ps.main;
            main.loop = loop;
            main.duration = duration;
            main.startLifetime = 0.05f;
            main.maxParticles = 1;
            main.stopAction = stop;
            main.scalingMode = ParticleSystemScalingMode.Hierarchy;
            var em = ps.emission; em.enabled = false;
            var sh = ps.shape; sh.enabled = false;
            var r = go.GetComponent<ParticleSystemRenderer>();
            r.enabled = false;
            return ps;
        }

        /// <summary>All systems in a hierarchy with facts useful for budgets.</summary>
        public static List<Dictionary<string, object>> Describe(GameObject root)
        {
            var list = new List<Dictionary<string, object>>();
            foreach (var ps in root.GetComponentsInChildren<ParticleSystem>(true))
            {
                var r = ps.GetComponent<ParticleSystemRenderer>();
                var main = ps.main;
                list.Add(new Dictionary<string, object>
                {
                    { "name", ps.name }, { "max_particles", main.maxParticles }, { "loop", main.loop },
                    { "duration", main.duration }, { "lifetime_max", main.startLifetime.constantMax },
                    { "rate", ps.emission.rateOverTime.constantMax }, { "rate_distance", ps.emission.rateOverDistance.constantMax },
                    { "bursts", ps.emission.burstCount }, { "space", main.simulationSpace.ToString() },
                    { "render", r != null && r.enabled ? r.renderMode.ToString() : "disabled" },
                    { "material", r != null && r.sharedMaterial ? r.sharedMaterial.name : null },
                    { "trail_material", r != null && r.trailMaterial ? r.trailMaterial.name : null },
                    { "sorting_order", r != null ? r.sortingOrder : 0 },
                });
            }
            return list;
        }

        /// <summary>Estimated draw-call cost of a prefab: renderers x materials (particles + trails), the proxy
        /// Nordeus budgets per spell tier (8 to 10 high, 5 to 6 low, 2 to 3 multi-target, YZWK [00:25:08]).</summary>
        public static int DrawCallEstimate(GameObject root)
        {
            int n = 0;
            foreach (var r in root.GetComponentsInChildren<ParticleSystemRenderer>(true))
            {
                if (!r.enabled) continue;
                if (r.renderMode != ParticleSystemRenderMode.None && r.sharedMaterial != null) n++;
                var ps = r.GetComponent<ParticleSystem>();
                if (ps != null && ps.trails.enabled && r.trailMaterial != null) n++;
            }
            foreach (var tr in root.GetComponentsInChildren<TrailRenderer>(true)) if (tr.enabled) n++;
            return n;
        }
    }
}
