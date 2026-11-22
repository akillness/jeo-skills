// AgentKit.Vfx v0.2 (Unity Expert Skills, scenario-unity-vfx, 2026-09-24).
// Mesh-first mobile effects: a shockwave ring and a slash arc, each ONE mesh particle with ONE uber material
// whose texture scrolls over the mesh, and a particle-cloud shockwave built the usual way for comparison.
// Expert decisions encoded here:
//   - "At least 90% of all the effects in the game is some texture moving over some kind of a mesh"; particles are
//     secondary fluff, and a scrolling texture on a mesh gives more control and less overdraw (Nikola Damjanov,
//     Nordeus, YZWK [00:28:02], [00:35:33]).
//   - One uber shader with toggles (LUT ramp, channel options, erosion, linear fade, second alpha) instead of many
//     stock shaders (YZWK [00:13:49] to [00:24:01]); LUTs uncompressed (YZWK [00:49:26]).
//   - Per-particle variation through Custom Data and custom vertex streams: erosion curve (Custom1.x), emission
//     over life (Custom1.y), a random UV offset per particle (Custom2.x) and a wipe position (Custom2.y), so one
//     material serves every instance (Hovl Studio 5Sos [00:07:34] to [00:17:32]).
//   - Motion: no linear curves (ease-out expansion, ease-in erosion), something always moving (scrolling noise),
//     a burst at the start (Nordeus YZWK [00:11:47] to [00:12:19], [00:36:39]).
//   - A slash lives as long as the swing (Hovl 5Sos [00:02:37]: about 0.3 s).
// Job: AgentKit.Vfx.VfxMeshFx.Build  args: folder (Assets/VFX/MeshFx), seed (5)
using System.Collections.Generic;
using UnityEditor;
using UnityEngine;

namespace AgentKit.Vfx
{
    public static class VfxMeshFx
    {
        static ParticleSystem.Burst Burst(float t, int min, int max) => new ParticleSystem.Burst(t, (short)min, (short)max);

        static Gradient HoldFade(float fadeIn, float holdEnd) => VfxShuriken.Grad(
            (0f, new Color(1, 1, 1, 0)), (fadeIn, Color.white), (holdEnd, Color.white), (1f, new Color(1, 1, 1, 0)));

        public static void Build()
        {
            AgentJob.Run(() =>
            {
                var folder = AgentJob.Str("folder", "Assets/VFX/MeshFx");
                int seed = AgentJob.Int("seed", 5);
                // channel-packed DATA (gray, emission mask, alpha): linear, not sRGB. Imported as sRGB, a 0.5 gray reads 0.21 in the
                // shader and the effect turns dark and eroded (observed on the first build of this kit) [added]
                var repeat = new VfxTextures.ImportSpec { maxSize = 256, wrap = TextureWrapMode.Repeat, alphaIsTransparency = false, sRGB = false };
                var lut = new VfxTextures.ImportSpec { maxSize = 256, mipmaps = false, compression = TextureImporterCompression.Uncompressed, alphaIsTransparency = false };
                var packed = VfxTextures.WritePng(folder + "/Textures/T_Energy_Packed.png", VfxTextures.Packed(256, seed), 256, 256, repeat);
                var gEnergy = VfxShuriken.Grad((0f, new Color(0.10f, 0.25f, 0.55f)), (0.25f, new Color(0.40f, 0.75f, 1f)), (0.6f, new Color(0.80f, 0.95f, 1f)), (1f, Color.white));
                var gFire = VfxShuriken.Grad((0f, new Color(0.08f, 0.02f, 0.01f)), (0.45f, new Color(0.9f, 0.25f, 0.05f)), (0.8f, new Color(1f, 0.75f, 0.2f)), (1f, Color.white));
                var rampEnergy = VfxTextures.WritePng(folder + "/Textures/T_Ramp_Energy.png", VfxTextures.Ramp(gEnergy, 256), 256, 1, lut);
                var rampFire = VfxTextures.WritePng(folder + "/Textures/T_Ramp_Fire.png", VfxTextures.Ramp(gFire, 256), 256, 1, lut);
                var puffTex = VfxTextures.WritePng(folder + "/Textures/T_Puff_2x2.png", VfxTextures.Variants(256, 2, 2, "smoke", seed + 50), 256, 256, new VfxTextures.ImportSpec { maxSize = 256 });

                var ring = VfxMeshes.Save(VfxMeshes.Ring(64, 0.5f, 1f), folder + "/Meshes/VFX_Ring.asset");
                var arc = VfxMeshes.Save(VfxMeshes.Ring(48, 0.55f, 1f, 150f, 1f, 0.18f, 0.7f), folder + "/Meshes/VFX_Arc150.asset");
                var cone = VfxMeshes.Save(VfxMeshes.Cone(32, 0.6f, 0.25f, 2f), folder + "/Meshes/VFX_Cone.asset");

                var mShock = VfxUber.Create(folder + "/Materials/M_Uber_Shockwave.mat", new UberSpec
                {
                    blend = VfxBlend.Additive, main = packed, mainTiling = new Vector2(6f, 1f), mainScroll = new Vector2(0.8f, 0f), tint = new Color(5f, 5f, 5f, 1f),
                    ramp = rampEnergy, emission = new Color(1.5f, 2.2f, 3f, 1f), erosion = 0f, erosionWidth = 0.35f,
                    secondAlpha = packed, secondTiling = new Vector2(2f, 1f), secondScroll = new Vector2(-0.35f, 0.1f), customData = true,
                });
                var mSlash = VfxUber.Create(folder + "/Materials/M_Uber_Slash.mat", new UberSpec
                {
                    blend = VfxBlend.Additive, main = packed, mainTiling = new Vector2(3f, 1f), mainScroll = new Vector2(1.2f, 0f), tint = new Color(1.8f, 1.8f, 1.8f, 1f),
                    ramp = rampFire, emission = new Color(2f, 0.9f, 0.3f, 1f), linearFade = new Vector4(1f, 0f, 0f, 0.25f),
                    erosion = 0f, erosionWidth = 0.3f, customData = true,
                });
                var mPuff = VfxMaterials.Particle(folder + "/Materials/M_Puff_Add.mat", VfxBlend.Additive, puffTex, new Color(0.45f, 0.8f, 1f, 1f));

                // shockwave, mesh version: ONE mesh particle (1 draw call), authored at a 1 m radius
                var shock = new GameObject("FX_Shockwave_Mesh");
                VfxShuriken.Root(shock, 0.7f, false, ParticleSystemStopAction.Destroy);
                VfxShuriken.Build(shock.transform, new Layer
                {
                    name = "Ring", material = mShock, mesh = ring, alignment = ParticleSystemRenderSpace.Local, duration = 0.3f,
                    lifetime = new Vector2(0.6f, 0.6f), speed = Vector2.zero, size = new Vector2(1f, 1f), yawDeg = new Vector2(0f, 360f),
                    bursts = { Burst(0f, 1, 1) }, maxParticles = 1, shapeEnabled = false, localPosition = new Vector3(0f, 0.03f, 0f),
                    sizeOverLife = VfxShuriken.EaseOut(0.25f, 1f), colorOverLife = HoldFade(0.04f, 0.75f),
                    custom1X = new ParticleSystem.MinMaxCurve(1f, VfxShuriken.EaseIn(0f, 0.9f)),        // erosion over life
                    custom1Y = new ParticleSystem.MinMaxCurve(1f, VfxShuriken.EaseOut(1.6f, 0.2f)),     // emission over life
                    custom2X = new ParticleSystem.MinMaxCurve(0f, 1f),                                   // random UV offset per particle
                    sortingOrder = 0,
                }, (uint)seed);
                var tierShock = shock.AddComponent<VfxTier>();
                tierShock.importance = VfxImportance.Damaging; tierShock.gameplayRadius = 1f;

                // shockwave, particle-cloud version (the habit the mesh replaces): 36 additive puffs on an expanding circle
                var cloud = new GameObject("FX_Shockwave_Particles");
                VfxShuriken.Root(cloud, 0.7f, false, ParticleSystemStopAction.Destroy);
                VfxShuriken.Build(cloud.transform, new Layer
                {
                    name = "Ring_Puffs", material = mPuff, duration = 0.3f, lifetime = new Vector2(0.55f, 0.6f), speed = new Vector2(2.6f, 2.8f),
                    size = new Vector2(0.45f, 0.55f), bursts = { Burst(0f, 36, 36) }, maxParticles = 36, shape = ParticleSystemShapeType.Circle,
                    shapeRadius = 0.2f, radiusThickness = 0f, shapeRotation = new Vector3(90f, 0f, 0f), drag = 3f,
                    tilesX = 2, tilesY = 2, randomFrame = true, localPosition = new Vector3(0f, 0.25f, 0f),
                    sizeOverLife = VfxShuriken.EaseOut(0.6f, 1.2f), colorOverLife = HoldFade(0.04f, 0.6f), sortingOrder = 0,
                }, (uint)seed + 1);
                var tierCloud = cloud.AddComponent<VfxTier>();
                tierCloud.importance = VfxImportance.Damaging; tierCloud.gameplayRadius = 1f;

                // slash: one arc mesh particle, lifetime = the swing, wiped from the tail and eroded at the end
                var slash = new GameObject("FX_Slash_Mesh");
                VfxShuriken.Root(slash, 0.45f, false, ParticleSystemStopAction.Destroy);
                VfxShuriken.Build(slash.transform, new Layer
                {
                    name = "Slash", material = mSlash, mesh = arc, alignment = ParticleSystemRenderSpace.Local, duration = 0.2f,
                    lifetime = new Vector2(0.35f, 0.35f), speed = Vector2.zero, size = new Vector2(1f, 1f), rotationDeg = Vector2.zero,
                    bursts = { Burst(0f, 1, 1) }, maxParticles = 1, shapeEnabled = false, localPosition = new Vector3(0f, 0.9f, 0f),
                    sizeOverLife = VfxShuriken.EaseOut(0.85f, 1.05f), colorOverLife = HoldFade(0.03f, 0.85f),
                    custom1X = new ParticleSystem.MinMaxCurve(1f, VfxShuriken.EaseIn(0f, 0.85f)),       // erosion at the end
                    custom1Y = new ParticleSystem.MinMaxCurve(1f, VfxShuriken.EaseOut(2f, 0.4f)),       // hot at the start
                    custom2X = new ParticleSystem.MinMaxCurve(0f, 1f),                                   // random noise offset (Hovl)
                    custom2Y = new ParticleSystem.MinMaxCurve(1f, VfxShuriken.EaseIn(-0.3f, 1.0f)),     // wipe: tail first
                    sortingOrder = 1,
                }, (uint)seed + 2);
                var tierSlash = slash.AddComponent<VfxTier>();
                tierSlash.importance = VfxImportance.Basic; tierSlash.frequent = true;

                var prefabs = new Dictionary<string, object>();
                var facts = new Dictionary<string, object>();
                foreach (var go in new[] { shock, cloud, slash })
                {
                    var path = folder + "/" + go.name + ".prefab";
                    var desc = new List<object>();
                    foreach (var r in go.GetComponentsInChildren<ParticleSystemRenderer>(true))
                    {
                        if (!r.enabled) continue;
                        var ps = r.GetComponent<ParticleSystem>();
                        var st = new List<ParticleSystemVertexStream>();
                        r.GetActiveVertexStreams(st);
                        desc.Add(new Dictionary<string, object>
                        {
                            { "system", r.name }, { "mode", r.renderMode.ToString() }, { "material", r.sharedMaterial.name },
                            { "streams", st.ConvertAll(x => x.ToString()) }, { "custom_data", ps.customData.enabled },
                            { "uber_streams_ok", !VfxUber.IsUber(r.sharedMaterial) || VfxUber.StreamsMatch(r) },
                        });
                    }
                    facts[go.name] = new Dictionary<string, object> { { "draw_call_estimate", VfxShuriken.DrawCallEstimate(go) }, { "renderers", desc } };
                    prefabs[go.name] = VfxFireballKit.SavePrefab(go, path);
                }
                AssetDatabase.SaveAssets();
                return new Dictionary<string, object>
                {
                    { "prefabs", prefabs }, { "facts", facts },
                    { "materials", new List<object> { VfxUber.Describe(mShock), VfxUber.Describe(mSlash), VfxMaterials.Describe(mPuff) } },
                    { "shader_errors", ShaderUtil.ShaderHasError(mShock.shader) },
                    { "meshes", new Dictionary<string, object> { { "ring_tris", ring.triangles.Length / 3 }, { "arc_tris", arc.triangles.Length / 3 }, { "cone_tris", cone.triangles.Length / 3 } } },
                };
            });
        }
    }
}
