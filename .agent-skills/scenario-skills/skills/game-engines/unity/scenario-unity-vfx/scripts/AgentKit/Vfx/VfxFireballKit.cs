// AgentKit.Vfx v0.2 (Unity Expert Skills, scenario-unity-vfx, 2026-09-24).
// A mobile-safe fireball kit built entirely with the Particle System from C#: projectile (core,
// flame trail, ribbon, embers), muzzle, impact and explosion prefabs sharing six materials.
//
// Expert decisions encoded here (full attributions in references/expert-notes.md):
//   - Shuriken, not VFX Graph, because it must run on every target phone and is scriptable module by module
//     (6.3 Manual comparison table; VFX Graph needs compute and is supported on Android only on a subset of
//     high-end devices with URP, e-book; on the Web only through WebGPU, experimental in 6.3).
//   - Weapon kit anatomy: projectile + muzzle + hit, derived from one family look (Gabriel Aguiar xen).
//   - Explosion = flash, fire, sparks, smoke, each one job, smoke drawn behind the fire (Gabriel adge).
//   - Dark alpha body under additive layers, glow always on top (Sirhaian 5Mw6 [00:16:28]).
//   - Big soft additive glow layer = fake bloom, since low-end mobile runs without post (Nordeus YZWK).
//   - Budgets: <= 100 particles per emitter (Nordeus), few renderers x materials per effect (Nordeus draw
//     call tiers), muzzle and flash 0.1 to 0.2 s (Gabriel), trail time short (0.15 to 0.2 s).
//   - Visual boundary = damage boundary: the explosion is authored at a 1 m radius and scaled to the
//     gameplay radius (Jason Keyser BOE8 [00:11:21]).
//   - Fade in and out, randomize every value, decelerating flipbook for the billow (consensus; Truempler).
//   - v0.2: no linear size curves (Nordeus: ease them; the motion lint found six in v0.1), sparks shrink while fire
//     grows (Sirhaian), a two-layer mark on the hit surface: dark scorch, then a smaller hot core that fades first
//     (Gabriel Aguiar qh3 [00:13:42]: scorch 1.75 to 2, core 0.75 to 1.3), and a VfxTier on every root
//     (projectile, muzzle, impact: frequent basic attack, subdued; explosion: damaging, radius 1 m authored).
// Job: AgentKit.Vfx.VfxFireballKit.Build  args: folder (Assets/VFX/Fireball), mobile (true), seed (7)
using System.Collections.Generic;
using UnityEditor;
using UnityEngine;

namespace AgentKit.Vfx
{
    public static class VfxFireballKit
    {
        public const float AuthoredRadius = 1f;   // explosion authored at 1 m; scale root to the gameplay radius

        public class Mats
        {
            public Material flame, puff, glow, spark, smoke, billow, ribbon, scorch;
        }

        public static Mats MakeMaterials(string folder, Dictionary<string, string> tex)
        {
            Texture T(string k) => AssetDatabase.LoadAssetAtPath<Texture2D>(tex[k]);
            return new Mats
            {
                flame = VfxMaterials.Particle(folder + "/M_Fire_Add.mat", VfxBlend.Additive, T("flame"), Color.white),
                puff = VfxMaterials.Particle(folder + "/M_Puff_Add.mat", VfxBlend.Additive, T("smoke"), Color.white),
                glow = VfxMaterials.Particle(folder + "/M_Glow_Add.mat", VfxBlend.Additive, T("glow"), Color.white),
                spark = VfxMaterials.Particle(folder + "/M_Spark_Add.mat", VfxBlend.Additive, T("spark"), Color.white),
                smoke = VfxMaterials.Particle(folder + "/M_Smoke_Alpha.mat", VfxBlend.Alpha, T("smoke"), Color.white),
                billow = VfxMaterials.Particle(folder + "/M_Billow_Add.mat", VfxBlend.Additive, T("billow"), Color.white, flipbookBlending: true),
                ribbon = VfxMaterials.Particle(folder + "/M_Ribbon_Add.mat", VfxBlend.Additive, T("streak"), Color.white),
                scorch = VfxMaterials.Particle(folder + "/M_Scorch_Alpha.mat", VfxBlend.Alpha, T("scorch"), Color.white),
            };
        }

        static readonly Color Yellow = new Color(1f, 0.85f, 0.45f, 1f);
        static readonly Color Orange = new Color(1f, 0.45f, 0.08f, 1f);
        static readonly Color DeepRed = new Color(0.6f, 0.08f, 0.02f, 1f);

        static Gradient FireFade(float peakAlpha = 1f) => VfxShuriken.Grad(
            (0f, new Color(1f, 0.95f, 0.7f, 0f)), (0.08f, new Color(Yellow.r, Yellow.g, Yellow.b, peakAlpha)),
            (0.45f, new Color(Orange.r, Orange.g, Orange.b, peakAlpha * 0.9f)), (1f, new Color(DeepRed.r, DeepRed.g, DeepRed.b, 0f)));

        static Gradient Fade(Color c, float fadeIn = 0.1f, float peak = 1f) => VfxShuriken.Grad(
            (0f, new Color(c.r, c.g, c.b, 0f)), (fadeIn, new Color(c.r, c.g, c.b, peak)), (1f, new Color(c.r, c.g, c.b, 0f)));

        static ParticleSystem.Burst Burst(float t, int min, int max) => new ParticleSystem.Burst(t, (short)min, (short)max);

        // ------------------------------------------------------------------ projectile
        public static GameObject Projectile(Mats m, bool mobile, uint seed)
        {
            var root = new GameObject("FX_Fireball_Projectile");
            VfxShuriken.Root(root, 1f, true, ParticleSystemStopAction.None);
            var layers = new List<Layer>
            {
                new Layer { name = "Core_Glow", material = m.glow, loop = true, prewarm = true, lifetime = new Vector2(0.3f, 0.3f),
                    speed = Vector2.zero, size = new Vector2(1.1f, 1.3f), rateOverTime = 7, maxParticles = 3, shapeEnabled = false,
                    colorA = new Color(1f, 0.5f, 0.12f, 0.55f), colorB = new Color(1f, 0.5f, 0.12f, 0.55f), colorOverLife = Fade(Color.white, 0.3f), sortingOrder = 3 },
                new Layer { name = "Core_Flame", material = m.flame, loop = true, prewarm = true, lifetime = new Vector2(0.16f, 0.26f),
                    speed = new Vector2(0.2f, 0.7f), size = new Vector2(0.45f, 0.6f), rateOverTime = 28, maxParticles = 10, shapeRadius = 0.05f,
                    tilesX = 2, tilesY = 2, randomFrame = true, rotationDeg = new Vector2(-20f, 20f), colorOverLife = FireFade(), sortingOrder = 2 },
                new Layer { name = "Trail_Flame", material = m.puff, loop = true, lifetime = new Vector2(0.22f, 0.32f),
                    speed = new Vector2(0f, 0.3f), size = new Vector2(0.34f, 0.5f), rateOverDistance = 9, maxParticles = 36, shapeRadius = 0.06f,
                    space = ParticleSystemSimulationSpace.World, tilesX = 2, tilesY = 2, randomFrame = true,
                    sizeOverLife = VfxShuriken.EaseIn(1f, 0.1f), colorOverLife = FireFade(0.85f), sortingOrder = 1 },
                new Layer { name = "Trail_Ribbon", material = m.ribbon, trailMaterial = m.ribbon, loop = true, lifetime = new Vector2(0.18f, 0.18f),
                    speed = Vector2.zero, size = new Vector2(0.26f, 0.26f), rateOverDistance = 8, maxParticles = 20, shapeEnabled = false,
                    space = ParticleSystemSimulationSpace.World, colorA = Orange, colorB = Orange, renderParticles = false, trails = true,
                    trailWidth = VfxShuriken.Curve(0f, 1f, 1f, 0f), trailColor = Fade(Color.white, 0.01f), sortingOrder = 1 },
                new Layer { name = "Embers", material = m.spark, loop = true, lifetime = new Vector2(0.3f, 0.6f),
                    speed = new Vector2(0.4f, 1.4f), size = new Vector2(0.04f, 0.08f), rateOverDistance = 2, maxParticles = 16, shapeRadius = 0.1f,
                    space = ParticleSystemSimulationSpace.World, gravity = -0.08f, renderMode = ParticleSystemRenderMode.Stretch, velocityScale = 0.08f,
                    colorA = Yellow, colorB = Orange, colorOverLife = Fade(Color.white, 0.05f), sortingOrder = 3 },
            };
            if (!mobile)
                layers.Add(new Layer { name = "Trail_Smoke", material = m.smoke, loop = true, lifetime = new Vector2(0.4f, 0.6f),
                    speed = new Vector2(0f, 0.2f), size = new Vector2(0.3f, 0.45f), rateOverDistance = 3, maxParticles = 20, shapeRadius = 0.05f,
                    space = ParticleSystemSimulationSpace.World, tilesX = 2, tilesY = 2, randomFrame = true, sizeOverLife = VfxShuriken.EaseOut(0.8f, 1.6f),
                    colorA = new Color(0.12f, 0.1f, 0.09f), colorB = new Color(0.2f, 0.17f, 0.15f), colorOverLife = Fade(Color.white, 0.15f, 0.35f), sortingOrder = 0 });
            uint s = seed;
            foreach (var L in layers) { L.maxParticleSize = mobile ? 0.35f : 0.5f; VfxShuriken.Build(root.transform, L, s++); }
            return root;
        }

        // ------------------------------------------------------------------ muzzle
        public static GameObject Muzzle(Mats m, bool mobile, uint seed)
        {
            var root = new GameObject("FX_Fireball_Muzzle");
            VfxShuriken.Root(root, 0.4f, false, ParticleSystemStopAction.Destroy);
            var layers = new List<Layer>
            {
                new Layer { name = "Flash", material = m.glow, duration = 0.2f, lifetime = new Vector2(0.1f, 0.1f), speed = Vector2.zero,
                    size = new Vector2(1.2f, 1.4f), bursts = { Burst(0f, 1, 1) }, maxParticles = 1, shapeEnabled = false,
                    colorA = new Color(1f, 0.6f, 0.2f, 0.9f), colorB = new Color(1f, 0.6f, 0.2f, 0.9f), sizeOverLife = VfxShuriken.EaseOut(1f, 0.2f), sortingOrder = 3 },
                new Layer { name = "Flame_Burst", material = m.flame, duration = 0.2f, lifetime = new Vector2(0.1f, 0.2f), speed = new Vector2(1f, 3f),
                    size = new Vector2(0.4f, 0.7f), bursts = { Burst(0f, 3, 5) }, maxParticles = 5, shape = ParticleSystemShapeType.Cone,
                    shapeAngle = 15f, shapeRadius = 0.05f, tilesX = 2, tilesY = 2, randomFrame = true, rotationDeg = new Vector2(-20f, 20f), colorOverLife = FireFade(), sortingOrder = 2 },
                new Layer { name = "Sparks", material = m.spark, duration = 0.2f, lifetime = new Vector2(0.15f, 0.35f), speed = new Vector2(4f, 10f),
                    size = new Vector2(0.03f, 0.06f), bursts = { Burst(0f, 8, 12) }, maxParticles = 12, shape = ParticleSystemShapeType.Cone,
                    shapeAngle = 12f, shapeRadius = 0.1f, renderMode = ParticleSystemRenderMode.Stretch, velocityScale = 0.04f,
                    drag = 2f, colorA = Yellow, colorB = Orange, colorOverLife = Fade(Color.white, 0.02f), sortingOrder = 3 },
            };
            uint s = seed;
            foreach (var L in layers) { L.maxParticleSize = mobile ? 0.35f : 0.5f; VfxShuriken.Build(root.transform, L, s++); }
            return root;
        }

        // ------------------------------------------------------------------ impact (oriented: up = surface normal)
        public static GameObject Impact(Mats m, bool mobile, uint seed, Mesh quad = null)
        {
            var root = new GameObject("FX_Fireball_Impact");
            VfxShuriken.Root(root, quad != null ? 1.05f : 0.6f, false, ParticleSystemStopAction.Destroy);   // root covers the longest child (the scorch)
            var layers = new List<Layer>
            {
                new Layer { name = "Flash", material = m.glow, duration = 0.2f, lifetime = new Vector2(0.08f, 0.08f), speed = Vector2.zero,
                    size = new Vector2(1.6f, 1.6f), bursts = { Burst(0f, 1, 1) }, maxParticles = 1, shapeEnabled = false,
                    localPosition = new Vector3(0f, 0.4f, 0f),   // off the surface along the normal: centred on the hit, half the glow was cut by it
                    colorA = new Color(1f, 0.8f, 0.5f, 1f), colorB = new Color(1f, 0.8f, 0.5f, 1f), sizeOverLife = VfxShuriken.EaseOut(0.6f, 1f), sortingOrder = 3 },
                new Layer { name = "Sparks", material = m.spark, duration = 0.2f, lifetime = new Vector2(0.2f, 0.5f), speed = new Vector2(3f, 9f),
                    size = new Vector2(0.05f, 0.1f), bursts = { Burst(0f, mobile ? 12 : 16, mobile ? 16 : 22) }, maxParticles = 22,
                    shape = ParticleSystemShapeType.Hemisphere, shapeRadius = 0.05f, shapeRotation = new Vector3(-90, 0, 0), renderMode = ParticleSystemRenderMode.Stretch,
                    velocityScale = 0.04f, drag = 3f, gravity = 0.6f, colorA = Yellow, colorB = Orange, colorOverLife = Fade(Color.white, 0.02f),
                    sizeOverLife = VfxShuriken.EaseIn(1f, 0.3f), sortingOrder = 3 },
            };
            if (quad != null)
            {
                // two stacked marks on the hit surface (the root's up = surface normal): a dark scorch that stays a little,
                // then a smaller hot core on top that fades first (Gabriel qh3 [00:13:42]); flat quads, not decals: mobile-safe
                layers.Add(new Layer { name = "Scorch", material = m.scorch, mesh = quad, alignment = ParticleSystemRenderSpace.Local, duration = 0.2f,
                    lifetime = new Vector2(1.0f, 1.0f), speed = Vector2.zero, size = new Vector2(1.1f, 1.3f), yawDeg = new Vector2(0f, 360f),
                    bursts = { Burst(0f, 1, 1) }, maxParticles = 1, shapeEnabled = false, localPosition = new Vector3(0f, 0.02f, 0f),
                    colorA = new Color(0.05f, 0.04f, 0.035f, 0.85f), colorB = new Color(0.08f, 0.06f, 0.05f, 0.85f),
                    colorOverLife = VfxShuriken.Grad((0f, new Color(1, 1, 1, 0)), (0.04f, Color.white), (0.6f, new Color(1, 1, 1, 0.8f)), (1f, new Color(1, 1, 1, 0))),
                    sortingOrder = -3 });
                layers.Add(new Layer { name = "Scorch_Core", material = m.glow, mesh = quad, alignment = ParticleSystemRenderSpace.Local, duration = 0.2f,
                    lifetime = new Vector2(0.45f, 0.45f), speed = Vector2.zero, size = new Vector2(0.55f, 0.65f), yawDeg = new Vector2(0f, 360f),
                    bursts = { Burst(0f, 1, 1) }, maxParticles = 1, shapeEnabled = false, localPosition = new Vector3(0f, 0.03f, 0f),
                    colorA = new Color(1f, 0.45f, 0.1f, 1f), colorB = new Color(1f, 0.55f, 0.15f, 1f),
                    colorOverLife = VfxShuriken.Grad((0f, Color.white), (0.3f, new Color(1f, 0.6f, 0.3f, 0.8f)), (1f, new Color(0.6f, 0.1f, 0.02f, 0f))),
                    sortingOrder = -2 });
            }
            uint s = seed;
            foreach (var L in layers) { L.maxParticleSize = mobile ? 0.35f : 0.5f; VfxShuriken.Build(root.transform, L, s++); }
            return root;
        }

        // ------------------------------------------------------------------ explosion (authored at 1 m radius)
        public static GameObject Explosion(Mats m, bool mobile, uint seed)
        {
            var root = new GameObject("FX_Fireball_Explosion");
            VfxShuriken.Root(root, 1.4f, false, ParticleSystemStopAction.Destroy);
            var layers = new List<Layer>
            {
                new Layer { name = "Flash", material = m.glow, duration = 0.3f, lifetime = new Vector2(0.12f, 0.12f), speed = Vector2.zero,
                    size = new Vector2(2.4f, 2.4f), bursts = { Burst(0f, 1, 1) }, maxParticles = 1, shapeEnabled = false,
                    colorA = new Color(1f, 0.75f, 0.4f, 1f), colorB = new Color(1f, 0.75f, 0.4f, 1f), sizeOverLife = VfxShuriken.EaseOut(0.55f, 1f),
                    colorOverLife = VfxShuriken.Grad((0f, Color.white), (1f, new Color(1, 1, 1, 0))), sortingOrder = 3 },
                new Layer { name = "Fireball_Billow", material = m.billow, duration = 0.3f, lifetime = new Vector2(0.35f, 0.55f), speed = new Vector2(0.6f, 1.6f),
                    size = new Vector2(0.7f, 1.0f), bursts = { Burst(0f, mobile ? 7 : 10, mobile ? 9 : 12) }, maxParticles = 12, shapeRadius = 0.3f,
                    drag = 4f, tilesX = 4, tilesY = 4, frameOverTime = VfxShuriken.Decelerate(), flipbookBlend = true,
                    sizeOverLife = VfxShuriken.EaseOut(0.7f, 1.1f), colorOverLife = FireFade(), sortingOrder = 1 },
                new Layer { name = "Sparks", material = m.spark, duration = 0.3f, lifetime = new Vector2(0.25f, 0.7f), speed = new Vector2(4f, 10f),
                    size = new Vector2(0.06f, 0.12f), bursts = { Burst(0f, mobile ? 12 : 15, mobile ? 18 : 25) }, maxParticles = 25, shapeRadius = 0.2f,
                    renderMode = ParticleSystemRenderMode.Stretch, velocityScale = 0.06f, drag = 2f, gravity = 0.8f,
                    colorA = Yellow, colorB = Orange, colorOverLife = Fade(Color.white, 0.02f), sizeOverLife = VfxShuriken.EaseIn(1f, 0.3f), sortingOrder = 2 },
                new Layer { name = "Smoke", material = m.smoke, duration = 0.3f, startDelay = 0.05f, lifetime = new Vector2(0.7f, 1.1f), speed = new Vector2(0.4f, 1.2f),
                    size = mobile ? new Vector2(0.7f, 1.0f) : new Vector2(0.9f, 1.3f), bursts = { Burst(0f, mobile ? 3 : 7, mobile ? 3 : 9) }, maxParticles = 9, shapeRadius = 0.35f,
                    drag = 1.5f, gravity = -0.06f, tilesX = 2, tilesY = 2, randomFrame = true, sizeOverLife = VfxShuriken.EaseOut(0.6f, 1.3f),
                    colorA = new Color(0.1f, 0.08f, 0.07f), colorB = new Color(0.18f, 0.15f, 0.13f), colorOverLife = Fade(Color.white, 0.12f, 0.6f), sortingOrder = -1 },
            };
            uint s = seed;
            foreach (var L in layers) { L.maxParticleSize = mobile ? 0.35f : 0.5f; VfxShuriken.Build(root.transform, L, s++); }
            return root;
        }

        public static string SavePrefab(GameObject go, string path)
        {
            System.IO.Directory.CreateDirectory(System.IO.Path.Combine(AgentJob.ProjectRoot, System.IO.Path.GetDirectoryName(path)));
            PrefabUtility.SaveAsPrefabAsset(go, path);
            Object.DestroyImmediate(go);
            return path;
        }

        /// <summary>Job: textures, six materials, four prefabs. Idempotent (overwrites the same paths).</summary>
        public static void Build()
        {
            AgentJob.Run(() =>
            {
                var folder = AgentJob.Str("folder", "Assets/VFX/Fireball");
                bool mobile = AgentJob.Bool("mobile", true);
                uint seed = (uint)AgentJob.Int("seed", 7);
                var tex = VfxTextures.MakeStandardSet(folder + "/Textures", (int)seed);
                var mats = MakeMaterials(folder + "/Materials", tex);
                var quad = VfxMeshes.Save(VfxMeshes.QuadXZ(1f), folder + "/Meshes/VFX_QuadXZ.asset");
                AssetDatabase.SaveAssets();
                var prefabs = new Dictionary<string, object>();
                var facts = new Dictionary<string, object>();
                foreach (var kv in new (string, GameObject)[] {
                    ("projectile", Projectile(mats, mobile, seed * 10)), ("muzzle", Muzzle(mats, mobile, seed * 20)),
                    ("impact", Impact(mats, mobile, seed * 30, quad)), ("explosion", Explosion(mats, mobile, seed * 40)) })
                {
                    var go = kv.Item2;
                    var tier = go.AddComponent<VfxTier>();   // Keyser's importance scale: the frequent basic attack stays subdued
                    tier.importance = kv.Item1 == "explosion" ? VfxImportance.Damaging : VfxImportance.Basic;
                    tier.frequent = kv.Item1 != "explosion";
                    tier.gameplayRadius = kv.Item1 == "explosion" ? AuthoredRadius : 0f;
                    int maxSum = 0;
                    foreach (var ps in go.GetComponentsInChildren<ParticleSystem>(true)) maxSum += ps.GetComponent<ParticleSystemRenderer>().enabled ? ps.main.maxParticles : 0;
                    facts[kv.Item1] = new Dictionary<string, object>
                    {
                        { "systems", VfxShuriken.Describe(go) }, { "draw_call_estimate", VfxShuriken.DrawCallEstimate(go) },
                        { "max_particles_sum", maxSum },
                    };
                    prefabs[kv.Item1] = SavePrefab(go, folder + "/" + go.name + ".prefab");
                }
                AssetDatabase.SaveAssets();
                var matInfo = new Dictionary<string, object>();
                foreach (var mm in new[] { mats.flame, mats.puff, mats.glow, mats.spark, mats.smoke, mats.billow, mats.ribbon, mats.scorch }) matInfo[mm.name] = VfxMaterials.Describe(mm);
                return new Dictionary<string, object>
                {
                    { "mobile", mobile }, { "textures", tex }, { "materials", matInfo }, { "prefabs", prefabs }, { "facts", facts },
                };
            });
        }
    }
}
