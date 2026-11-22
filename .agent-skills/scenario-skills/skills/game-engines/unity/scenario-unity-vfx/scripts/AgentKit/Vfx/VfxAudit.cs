// AgentKit.Vfx v0.2 (Unity Expert Skills, scenario-unity-vfx, 2026-09-24).
// VFX audit of prefabs (and optionally scenes), in the core findings format so scenario-unity-expert can merge it.
// Job: AgentKit.Vfx.VfxAudit.AuditPrefabs  args: folders ["Assets/VFX"], tier "mobile"|"pc", scenes [..]
// Rules and their sources (codes vfx.*):
//   legacy_shader        Built-in particle shader in URP: still draws (observed) but no URP particle features, not
//                        SRP Batcher compatible [added], skipped by URP's converter (upgrader list)
//   sg_no_procedural     Mesh particles + Shader Graph shader without instancing_options procedural:
//                        silent fallback to dynamic batching in 6.3 (Fred Moreau, Posts 2, 3, 10)
//   mesh_no_instancing   Mesh render mode with GPU instancing off (6.3 Manual, Apply GPU instancing)
//   trail_no_material    Trails module on, no trail material: renders magenta (Brackeys FEA [00:08:05])
//   world_collision      World collision on many particles: "pretty taxing" (Brackeys FEA [00:06:19])
//   max_particles_tier   maxParticles above the tier cap (Nordeus: 100 per emitter on mobile)
//   same_sorting_order   non-additive stacked layers sharing a sorting order flicker (Gabriel wvK [00:11:31]);
//                        additive-only stacks are order independent [added]
//   root_duration        one-shot root shorter than its longest child life: cleanup cuts the fade (Gabriel xen)
//   shadow_cast          shadow casting on a URP particle shader: no ShadowCaster pass in 6.3 (Fred Post 11)
//   flipbook_streams     _FLIPBOOKBLENDING_ON without UV2 + AnimBlend streams (non-instanced path, Fred Post 11)
//   texture_size         VFX texture import size above the tier cap (Nordeus 256 typical, 512 max)
//   draw_calls_tier      renderers x materials above the tier's high-level spell budget (Nordeus 8 to 10)
//   lights_module        particle lights: each is a real light (Brackeys: low ratio) [added: flagged on mobile]
//   vfx_no_asset         Visual Effect without an asset; vfx_output_event: Output Event Handler disables
//                        instancing for that asset (VFX Graph 17.3 manual, Instancing)
//   vfx_legacy_input_binder VFX Input Axis/Button/Key binders are silent no-ops without the legacy
//                        Input Manager (VFX Graph 17.3 source, ENABLE_LEGACY_INPUT_MANAGER)
// v0.2 (craft and data-flow rules):
//   stream_mismatch      uber material with _CUSTOMDATA_ON but the renderer streams are not Position, Color, UV,
//                        Custom1.xy, Custom2.xy, or the Custom Data module is off: the shader reads zeros or the
//                        wrong values, silently (Hovl 5Sos [00:07:34]: "invisible until the streams are set")
//   lut_import           LUT ramp compressed, mipmapped or not clamped: banding and bleeding (Nordeus: everything
//                        compressed except LUTs, YZWK [00:49:26])
//   distortion_order     URP particle distortion drawn after a transparent layer of the same effect: URP samples the
//                        opaque scene color, which holds no transparents, so it erases that layer (Hovl 5Sos [00:23:11]:
//                        distortion behind the element; observed in P17)
//   distortion_no_opaque URP assets without the Opaque Texture: distortion samples nothing useful on those tiers
//   linear_curve         Size over Lifetime, Custom Data or a one-cycle Frame over Time curve that is a straight ramp
//                        (Nordeus: "linear animation curves are a big no-no" except loops, YZWK [00:11:47])
//   no_speed_contrast    moving layers of one effect all within 3x of each other's speed (Nordeus: mix fast and slow,
//                        [00:12:19]) [added threshold]
//   loop_no_start_burst  looping effect with no burst at its start (Nordeus: a burst at the start of a loop, [00:36:39])
//   texture_border       sprite (Clamp) whose cells touch their border: hard cut on the quad (Sirhaian 5Mw6 [00:14:14])
//   data_texture_srgb    uber main or second-alpha texture imported as sRGB: channel data read darker [added, observed]
//   mesh_color_format    Mesh-mode particle whose mesh stores float vertex colors: read as 8-bit, garbage [observed]
//   no_tier              effect root without VfxTier: brightness and duration cannot be audited by importance (Keyser)
//   mesh_no_instancing   now only above 8 max particles: a single mesh particle (ring, slash) gains nothing from
//                        instancing and the non-instanced path is what feeds Custom Data streams [added]
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.VFX;

namespace AgentKit.Vfx
{
    public static class VfxAudit
    {
        public static void AuditGameObject(GameObject root, string path, string tier, AgentAudit.Findings f, Dictionary<string, bool> shaderGraphCache)
        {
            bool mobile = tier == "mobile";
            int maxCap = mobile ? 100 : 1000;
            int dcCap = mobile ? 10 : 20;
            var renderers = root.GetComponentsInChildren<ParticleSystemRenderer>(true);
            var orders = new Dictionary<int, List<string>>();
            var distortion = new List<ParticleSystemRenderer>();
            var transparents = new List<ParticleSystemRenderer>();
            var speeds = new List<(string name, float speed)>();
            bool anyStartBurst = false;
            float longestChild = 0f;
            foreach (var r in renderers)
            {
                var ps = r.GetComponent<ParticleSystem>();
                var main = ps.main;
                string p = path + ":" + HierarchyPath(root.transform, r.transform);
                if (ps != root.GetComponent<ParticleSystem>() && !main.loop)
                {
                    // last emission time: the whole duration for rate emitters, the last burst for burst-only systems
                    float lastEmit = 0f;
                    var em = ps.emission;
                    if (em.rateOverTime.constantMax > 0 || em.rateOverDistance.constantMax > 0) lastEmit = main.duration;
                    for (int b = 0; b < em.burstCount; b++) lastEmit = Mathf.Max(lastEmit, em.GetBurst(b).time);
                    longestChild = Mathf.Max(longestChild, main.startDelay.constantMax + lastEmit + main.startLifetime.constantMax);
                }
                for (int b = 0; b < ps.emission.burstCount; b++) if (ps.emission.GetBurst(b).time <= 0.05f) anyStartBurst = true;
                if (!r.enabled) continue;
                var mat = r.sharedMaterial;
                LintMotion(ps, p, f);
                if (r.renderMode != ParticleSystemRenderMode.None)
                {
                    float sp = MaxOf(main.startSpeed);
                    if (sp > 0.05f) speeds.Add((r.name, sp));
                    if (mat != null && mat.HasProperty("_DistortionEnabled") && mat.GetFloat("_DistortionEnabled") > 0.5f) distortion.Add(r);
                    else transparents.Add(r);
                    if (mat == null) f.Add("error", "vfx.no_material", p, "renderer has no material", "assign a URP Particles material");
                    else { CheckMaterial(mat, p, f, r, ps, shaderGraphCache, mobile); CheckStreams(mat, r, ps, p, f); }
                    if (!orders.ContainsKey(r.sortingOrder)) orders[r.sortingOrder] = new List<string>();
                    // additive over additive is order independent; a shared order only flickers when an alpha,
                    // premultiplied or multiply layer is in the stack (Gabriel's flicker was two alpha trails)
                    bool additive = IsAdditive(mat);
                    orders[r.sortingOrder].Add(r.name + (additive ? "" : "*"));
                }
                if (ps.trails.enabled && r.trailMaterial == null)
                    f.Add("error", "vfx.trail_no_material", p, "Trails module on but Renderer > Trail Material is empty (renders magenta)", "assign a trail material");
                if (ps.collision.enabled && ps.collision.type == ParticleSystemCollisionType.World && main.maxParticles > 50)
                    f.Add("warn", "vfx.world_collision", p, "World collision with maxParticles " + main.maxParticles, "use Planes, lower Collision Quality, or fewer particles");
                if (main.maxParticles > maxCap)
                    f.Add(mobile ? "error" : "warn", "vfx.max_particles_tier", p, "maxParticles " + main.maxParticles + " > " + maxCap + " (" + tier + ")", "cap the emitter; prefer textures on meshes (Nordeus)");
                if (ps.lights.enabled && mobile)
                    f.Add("warn", "vfx.lights_module", p, "Lights module on (max " + ps.lights.maxLights + ") on a mobile tier", "fake the light with an additive glow layer");
                if (r.shadowCastingMode != ShadowCastingMode.Off && mat != null && mat.shader != null && mat.shader.name.StartsWith("Universal Render Pipeline/Particles/"))
                    f.Add("info", "vfx.shadow_cast", p, "Cast Shadows on a URP particle shader: no ShadowCaster pass in 6.3, does nothing", "turn it off, or use a custom shader with a ShadowCaster pass");
            }
            foreach (var kv in orders.Where(o => o.Value.Count > 1 && o.Value.Any(n => n.EndsWith("*"))))
                f.Add("info", "vfx.same_sorting_order", path, "non-additive layers share sorting order " + kv.Key + " (* = not additive): " + string.Join(", ", kv.Value),
                      "give stacked layers distinct orders (body < additive <= sparks < glow)");
            var rootPs = root.GetComponent<ParticleSystem>();
            if (rootPs != null && !rootPs.main.loop && renderers.Length > 1 && rootPs.main.duration + 0.01f < longestChild &&
                rootPs.main.stopAction != ParticleSystemStopAction.None)
                f.Add("warn", "vfx.root_duration", path, string.Format("root duration {0:0.00}s < longest child {1:0.00}s with a Stop Action", rootPs.main.duration, longestChild),
                      "set the root duration to the longest child lifetime");
            foreach (var d in distortion)
                foreach (var o in transparents)
                {
                    bool after = d.sortingOrder > o.sortingOrder || (d.sortingOrder == o.sortingOrder && d.sortingFudge <= o.sortingFudge);
                    if (after)
                        f.Add("warn", "vfx.distortion_order", path + ":" + HierarchyPath(root.transform, d.transform),
                              "distortion '" + d.name + "' draws after '" + o.name + "' (order " + d.sortingOrder + "/" + o.sortingOrder + ", fudge " + d.sortingFudge + "/" + o.sortingFudge + "): URP distortion samples the opaque scene color and erases that transparent layer",
                              "draw the distortion first: lower sorting order, or equal order and a larger Sorting Fudge (Hovl: 2)");
                }
            if (distortion.Count > 0)
            {
                var noOpaque = new List<string>();
                for (int q = 0; q < QualitySettings.names.Length; q++)
                {
                    var rp = QualitySettings.GetRenderPipelineAssetAt(q) as UniversalRenderPipelineAsset;
                    if (rp == null) rp = GraphicsSettings.defaultRenderPipeline as UniversalRenderPipelineAsset;
                    if (rp != null && !rp.supportsCameraOpaqueTexture) noOpaque.Add(QualitySettings.names[q] + " (" + rp.name + ")");
                }
                if (noOpaque.Count > 0)
                    f.Add("warn", "vfx.distortion_no_opaque", path, "particle distortion, but these quality levels have no Opaque Texture: " + string.Join(", ", noOpaque),
                          "turn Opaque Texture on for tiers that keep distortion, or drop the distortion layer there (least important layer first)");
            }
            if (rootPs != null && rootPs.main.loop && renderers.Length > 1 && !anyStartBurst)
                f.Add("info", "vfx.loop_no_start_burst", path, "looping effect without a burst at its start",
                      "add a short burst when the loop starts as an attention grabber (Nordeus), unless a separate start effect (muzzle, cast) plays it");
            if (speeds.Count >= 2)
            {
                float hi = speeds.Max(x => x.speed), lo = speeds.Min(x => x.speed);
                if (hi < 3f * lo)
                    f.Add("info", "vfx.no_speed_contrast", path, string.Format("moving layers within {0:0.0}x of each other ({1})", hi / lo, string.Join(", ", speeds.Select(x => x.name + " " + x.speed.ToString("0.##")))),
                          "mix fast and slow elements (sparks fast, smoke and glow slow): Nordeus's contrast of speeds");
            }
            if (rootPs != null && root.GetComponent<VfxTier>() == null)
                f.Add("info", "vfx.no_tier", path, "no VfxTier on the effect root", "add VfxTier (importance, gameplay radius, duration) so brightness and duration can be audited by importance (Keyser)");
            int dc = VfxShuriken.DrawCallEstimate(root);
            if (dc > dcCap) f.Add("warn", "vfx.draw_calls_tier", path, "about " + dc + " draw calls (renderers x materials) > " + dcCap, "merge layers, share materials, or use a mesh with a scrolling texture");

            foreach (var vfx in root.GetComponentsInChildren<VisualEffect>(true))
            {
                string p = path + ":" + HierarchyPath(root.transform, vfx.transform);
                if (vfx.visualEffectAsset == null) f.Add("error", "vfx.vfx_no_asset", p, "Visual Effect without an asset", "assign the .vfx asset");
                foreach (var mb in vfx.GetComponents<MonoBehaviour>())
                {
                    if (mb == null) continue;
                    var tn = mb.GetType().Name;
                    var bt = mb.GetType().BaseType;
                    if (bt != null && bt.Name == "VFXOutputEventAbstractHandler")
                        f.Add("warn", "vfx.vfx_output_event", p, tn + " (Output Event Handler) disables instancing for this asset", "drive lights from a MonoBehaviour instead where possible");
                    if (tn == "VFXInputAxisBinder" || tn == "VFXInputButtonBinder" || tn == "VFXInputKeyBinder")
                    {
#if !ENABLE_LEGACY_INPUT_MANAGER
                        f.Add("error", "vfx.vfx_legacy_input_binder", p, tn + " does nothing without the legacy Input Manager", "write a VFXBinderBase against the Input System");
#endif
                    }
                }
            }
        }

        static void CheckMaterial(Material mat, string p, AgentAudit.Findings f, ParticleSystemRenderer r, ParticleSystem ps,
                                  Dictionary<string, bool> sgCache, bool mobile)
        {
            var sh = mat.shader;
            if (sh == null) return;
            if (VfxMaterials.LegacyBlend(sh.name) != null)
                f.Add("warn", "vfx.legacy_shader", p, "legacy Built-in particle shader '" + sh.name + "': still draws in 6.3 URP (untagged pass) but outside URP features (soft particles, flipbook blending, distortion) and the SRP Batcher, and URP's converter skips it",
                      "run AgentKit.Vfx.VfxMaterials.MigrateLegacyJob, then compare before/after captures");
            if (!sh.isSupported) f.Add("error", "vfx.shader_unsupported", p, "shader '" + sh.name + "' not supported here", "use a URP particle shader");
            if (r.renderMode == ParticleSystemRenderMode.Mesh)
            {
                var pm = r.mesh;
                if (pm != null && pm.HasVertexAttribute(UnityEngine.Rendering.VertexAttribute.Color) &&
                    pm.GetVertexAttributeFormat(UnityEngine.Rendering.VertexAttribute.Color) != UnityEngine.Rendering.VertexAttributeFormat.UNorm8)
                    f.Add("warn", "vfx.mesh_color_format", p, "mesh '" + pm.name + "' stores vertex colors as " + pm.GetVertexAttributeFormat(UnityEngine.Rendering.VertexAttribute.Color) + ": Mesh-mode particles read them as 8-bit and draw garbage (flat dark blue, alpha about 0.25)",
                          "rebuild the mesh with Mesh.SetColors(List<Color32>) (UNorm8), or reimport; a MeshRenderer reads either format [observed]");
                if (!r.enableGPUInstancing && ps.main.maxParticles > 8)
                    f.Add("warn", "vfx.mesh_no_instancing", p, "Mesh particles without GPU instancing (CPU vertex transforms), maxParticles " + ps.main.maxParticles, "tick Enable GPU Instancing with an instancing shader");
                var sp = AssetDatabase.GetAssetPath(sh);
                if (sp.EndsWith(".shadergraph", StringComparison.OrdinalIgnoreCase))
                {
                    if (!sgCache.TryGetValue(sp, out bool has))
                    {
                        has = File.ReadAllText(Path.Combine(AgentJob.ProjectRoot, sp)).Contains("instancing_options procedural");
                        sgCache[sp] = has;
                    }
                    if (!has)
                        f.Add("error", "vfx.sg_no_procedural", p, "Shader Graph '" + Path.GetFileName(sp) + "' on mesh particles has no 'instancing_options procedural': 6.3 falls back to dynamic batching",
                              "scenario-unity-shaders: inject #pragma instancing_options procedural:ParticleInstancingSetup + URP ParticlesInstancing.hlsl (Custom Function), or use a copy of URP ParticlesUnlit.shader");
                }
            }
            if (mat.IsKeywordEnabled("_FLIPBOOKBLENDING_ON") && !(r.renderMode == ParticleSystemRenderMode.Mesh && r.enableGPUInstancing))
            {
                var streams = new List<ParticleSystemVertexStream>();
                r.GetActiveVertexStreams(streams);
                if (!streams.Contains(ParticleSystemVertexStream.UV2) || !streams.Contains(ParticleSystemVertexStream.AnimBlend))
                    f.Add("warn", "vfx.flipbook_streams", p, "flipbook blending on but UV2/AnimBlend streams missing", "SetActiveVertexStreams(Position, Color, UV, UV2, AnimBlend)");
            }
            if (VfxUber.IsUber(mat))
                foreach (var prop in new[] { "_BaseMap", "_SecondAlphaTex" })
                    if (mat.GetTexture(prop) is Texture2D dataTex && AssetImporter.GetAtPath(AssetDatabase.GetAssetPath(dataTex)) is TextureImporter di && di.sRGBTexture)
                        f.Add("warn", "vfx.data_texture_srgb", AssetDatabase.GetAssetPath(dataTex), prop + " of an uber material is imported as sRGB: its gray, emission and alpha channels are data and read darker (0.5 becomes 0.21)",
                              "untick sRGB (Color Texture) on channel-packed and grayscale data textures; keep sRGB on the LUT, which holds colors [added, observed]");
            if (mat.HasProperty("_RampTex") && mat.IsKeywordEnabled("_RAMP_ON") && mat.GetTexture("_RampTex") is Texture2D ramp)
            {
                var rp = AssetDatabase.GetAssetPath(ramp);
                var ri = AssetImporter.GetAtPath(rp) as TextureImporter;
                if (ri != null && (ri.textureCompression != TextureImporterCompression.Uncompressed || ri.mipmapEnabled || ri.wrapMode != TextureWrapMode.Clamp))
                    f.Add("warn", "vfx.lut_import", rp, string.Format("LUT ramp imported with compression {0}, mipmaps {1}, wrap {2}", ri.textureCompression, ri.mipmapEnabled, ri.wrapMode),
                          "LUTs uncompressed, no mipmaps, Clamp (Nordeus: everything compressed except LUTs)");
            }
            if (r.renderMode != ParticleSystemRenderMode.Mesh && r.renderMode != ParticleSystemRenderMode.None)
            {
                var main = mat.HasProperty("_BaseMap") ? mat.GetTexture("_BaseMap") as Texture2D : null;
                var tsa = ps.textureSheetAnimation;
                int tx = tsa.enabled ? Mathf.Max(1, tsa.numTilesX) : 1, ty = tsa.enabled ? Mathf.Max(1, tsa.numTilesY) : 1;
                if (main != null)
                {
                    float leak = BorderLeak(main, tx, ty);
                    if (leak > 0.02f)
                        f.Add("warn", "vfx.texture_border", AssetDatabase.GetAssetPath(main), string.Format("{0:P0} of the cell border pixels are not transparent ({1} x {2} cells): hard edge on the quad", leak, tx, ty),
                              "keep every value away from the cell borders (Sirhaian); fade the edges or pad the sprite");
                }
            }
            int texCap = mobile ? 512 : 2048;
            foreach (var name in mat.GetTexturePropertyNames())
            {
                var tex = mat.GetTexture(name) as Texture2D;
                if (tex == null) continue;
                var tp = AssetDatabase.GetAssetPath(tex);
                var ti = AssetImporter.GetAtPath(tp) as TextureImporter;
                if (ti != null && ti.maxTextureSize > texCap)
                    f.Add("warn", "vfx.texture_size", tp, "import max size " + ti.maxTextureSize + " > " + texCap + " for this tier", "author big, import small (256 typical on mobile)");
            }
        }

        static readonly Dictionary<string, float> s_Border = new Dictionary<string, float>();

        /// <summary>Share of cell-border pixels above 2% (alpha when the source has alpha, else luminance) for a Clamp
        /// sprite read from its PNG or JPG file; tileable (Repeat) textures are exempt. -1 when unreadable.</summary>
        public static float BorderLeak(Texture2D tex, int tx, int ty)
        {
            var path = AssetDatabase.GetAssetPath(tex);
            var ti = AssetImporter.GetAtPath(path) as TextureImporter;
            if (ti == null || ti.wrapMode != TextureWrapMode.Clamp) return -1f;
            var ext = Path.GetExtension(path).ToLowerInvariant();
            if (ext != ".png" && ext != ".jpg" && ext != ".jpeg") return -1f;
            var key = path + "|" + tx + "x" + ty;
            if (s_Border.TryGetValue(key, out float v)) return v;
            var t = new Texture2D(2, 2, TextureFormat.RGBA32, false);
            try
            {
                if (!t.LoadImage(File.ReadAllBytes(Path.Combine(AgentJob.ProjectRoot, path)))) return -1f;
                bool alpha = ti.DoesSourceTextureHaveAlpha();
                var px = t.GetPixels32();
                int w = t.width, h = t.height, cw = w / tx, ch = h / ty, n = 0, bad = 0;
                for (int cy = 0; cy < ty; cy++)
                    for (int cx = 0; cx < tx; cx++)
                        for (int i = 0; i < cw; i++)
                            foreach (var (x, y) in new[] { (cx * cw + i, cy * ch), (cx * cw + i, cy * ch + ch - 1), (cx * cw, cy * ch + Mathf.Min(i, ch - 1)), (cx * cw + cw - 1, cy * ch + Mathf.Min(i, ch - 1)) })
                            {
                                var c = px[y * w + x];
                                float val = alpha ? c.a / 255f : (0.2126f * c.r + 0.7152f * c.g + 0.0722f * c.b) / 255f;
                                n++;
                                if (val > 0.02f) bad++;
                            }
                v = n > 0 ? bad / (float)n : 0f;
            }
            finally { UnityEngine.Object.DestroyImmediate(t); }
            s_Border[key] = v;
            return v;
        }

        public static bool IsAdditive(Material mat)
        {
            if (mat == null) return false;
            if (mat.HasProperty("_Blend") && !VfxUber.IsUber(mat)) return (int)mat.GetFloat("_Blend") == (int)VfxBlend.Additive;
            return mat.HasProperty("_DstBlend") && (int)mat.GetFloat("_DstBlend") == (int)BlendMode.One;
        }

        static float MaxOf(ParticleSystem.MinMaxCurve c) =>
            c.mode == ParticleSystemCurveMode.Constant ? c.constant : c.mode == ParticleSystemCurveMode.TwoConstants ? c.constantMax : c.curveMultiplier;

        /// <summary>A curve that is one straight ramp: range above 5% of its magnitude and every sample within 2% of
        /// the range from the chord between its ends.</summary>
        public static bool IsLinearRamp(ParticleSystem.MinMaxCurve c)
        {
            if (c.mode != ParticleSystemCurveMode.Curve && c.mode != ParticleSystemCurveMode.TwoCurves) return false;
            var curve = c.curveMax;
            if (curve == null || curve.length < 2) return false;
            float a = curve.Evaluate(0f), b = curve.Evaluate(1f), range = Mathf.Abs(b - a);
            if (range < 0.05f * Mathf.Max(Mathf.Abs(a), Mathf.Max(Mathf.Abs(b), 1e-3f))) return false;
            float dev = 0f;
            for (int i = 1; i < 10; i++) { float t = i / 10f; dev = Mathf.Max(dev, Mathf.Abs(curve.Evaluate(t) - Mathf.Lerp(a, b, t))); }
            return dev < 0.02f * range;
        }

        static void LintMotion(ParticleSystem ps, string p, AgentAudit.Findings f)
        {
            var hits = new List<string>();
            var sol = ps.sizeOverLifetime;
            if (sol.enabled && IsLinearRamp(sol.separateAxes ? sol.x : sol.size)) hits.Add("Size over Lifetime");
            var cd = ps.customData;
            if (cd.enabled)
                foreach (var stream in new[] { ParticleSystemCustomData.Custom1, ParticleSystemCustomData.Custom2 })
                    if (cd.GetMode(stream) == ParticleSystemCustomDataMode.Vector)
                        for (int i = 0; i < cd.GetVectorComponentCount(stream); i++)
                            if (IsLinearRamp(cd.GetVector(stream, i))) hits.Add(stream + "." + "xyzw"[i]);
            var tsa = ps.textureSheetAnimation;
            if (tsa.enabled && tsa.cycleCount <= 1 && IsLinearRamp(tsa.frameOverTime)) hits.Add("Frame over Time (one cycle)");
            if (hits.Count > 0)
                f.Add("warn", "vfx.linear_curve", p, "linear curve(s): " + string.Join(", ", hits),
                      "ease them (VfxShuriken.EaseOut/EaseIn/Decelerate): fast then slow for expansion and flipbooks, slow then fast for erosion; linear only for loops (Nordeus)");
        }

        static void CheckStreams(Material mat, ParticleSystemRenderer r, ParticleSystem ps, string p, AgentAudit.Findings f)
        {
            if (!VfxUber.IsUber(mat) || !mat.IsKeywordEnabled("_CUSTOMDATA_ON")) return;
            var st = new List<ParticleSystemVertexStream>();
            r.GetActiveVertexStreams(st);
            bool streamsOk = VfxUber.StreamsMatch(r), dataOk = VfxUber.CustomDataReady(ps);
            if (!streamsOk || !dataOk)
                f.Add("error", "vfx.stream_mismatch", p, string.Format("uber material with Custom Data: streams [{0}] (expected Position, Color, UV, Custom1XY, Custom2XY), Custom Data module {1}",
                      string.Join(", ", st), dataOk ? "ok" : "off or not Vector"),
                      "renderer.SetActiveVertexStreams(VfxUber.Streams) and enable Custom Data (Custom1, Custom2 as 2-component vectors)");
            if (r.renderMode == ParticleSystemRenderMode.Mesh && r.enableGPUInstancing)
                f.Add("warn", "vfx.stream_mismatch", p, "GPU instancing on a Custom Data mesh particle: the instanced path reads unity_ParticleInstanceData, not the streams",
                      "turn Enable GPU Instancing off for this renderer (few particles), or use an instancing shader with a matching UNITY_PARTICLE_INSTANCE_DATA (scenario-unity-shaders)");
        }

        static string HierarchyPath(Transform root, Transform t)
        {
            var parts = new List<string>();
            for (var x = t; x != null && x != root.parent; x = x.parent) parts.Insert(0, x.name);
            return string.Join("/", parts);
        }

        public static void AuditPrefabs()
        {
            AgentJob.Run(() =>
            {
                var folders = AgentJob.List("folders").Select(o => o.ToString()).ToArray();
                if (folders.Length == 0) folders = new[] { "Assets" };
                var tier = AgentJob.Str("tier", "mobile");
                var f = new AgentAudit.Findings();
                var sg = new Dictionary<string, bool>();
                var scanned = new List<string>();
                foreach (var guid in AssetDatabase.FindAssets("t:Prefab", folders))
                {
                    var path = AssetDatabase.GUIDToAssetPath(guid);
                    var go = PrefabUtility.LoadPrefabContents(path);
                    try
                    {
                        if (go.GetComponentInChildren<ParticleSystem>(true) == null && go.GetComponentInChildren<VisualEffect>(true) == null) continue;
                        scanned.Add(path);
                        AuditGameObject(go, path, tier, f, sg);
                    }
                    finally { PrefabUtility.UnloadPrefabContents(go); }
                }
                foreach (var sc in AgentJob.List("scenes").Select(o => o.ToString()))
                {
                    var scene = EditorSceneManager.OpenScene(sc, OpenSceneMode.Single);
                    foreach (var root in scene.GetRootGameObjects()) AuditGameObject(root, sc + ":" + root.name, tier, f, sg);
                    scanned.Add(sc);
                }
                var byPath = new Dictionary<string, object>();
                foreach (var grp in f.items.GroupBy(i => ((string)i["path"]).Split(':')[0]))
                    byPath[grp.Key] = grp.Select(i => (string)i["code"]).Distinct().ToList();
                return new Dictionary<string, object>
                {
                    { "tier", tier }, { "scanned", scanned }, { "counts", f.Counts() }, { "codes_by_asset", byPath }, { "findings", f.items },
                };
            });
        }

        /// <summary>Test fixture: a deliberately bad prefab (legacy shader, trails without material, mesh
        /// particles with a Shader Graph particle template and no instancing, 500 max particles, equal sorting
        /// orders, root shorter than its child). args: folder</summary>
        public static void MakeBadFixture()
        {
            AgentJob.Run(() =>
            {
                var folder = AgentJob.Str("folder", "Assets/VFX/AuditFixtures");
                Directory.CreateDirectory(Path.Combine(AgentJob.ProjectRoot, folder));
                var legacy = new Material(Shader.Find("Legacy Shaders/Particles/Additive")) { name = "M_Legacy_Additive" };
                AssetDatabase.CreateAsset(legacy, folder + "/M_Legacy_Additive.mat");
                const string sgTemplate = "Packages/com.unity.shadergraph/GraphTemplates/Cross Pipeline/0_Particle Unlit.shadergraph";
                var sgPath = folder + "/SG_ParticleUnlit_Copy.shadergraph";
                bool copied = AssetDatabase.CopyAsset(sgTemplate, sgPath);
                AssetDatabase.ImportAsset(sgPath, ImportAssetOptions.ForceSynchronousImport);
                var sgShader = AssetDatabase.LoadAssetAtPath<Shader>(sgPath);
                Material sgMat = null;
                if (sgShader != null)
                {
                    sgMat = new Material(sgShader) { name = "M_SG_Particle" };
                    AssetDatabase.CreateAsset(sgMat, folder + "/M_SG_Particle.mat");
                }
                var root = new GameObject("FX_Bad");
                VfxShuriken.Root(root, 0.2f, false, ParticleSystemStopAction.Destroy);
                var a = VfxShuriken.Build(root.transform, new Layer { name = "LegacyGlow", material = legacy, maxParticles = 500, lifetime = new Vector2(1.5f, 2f), bursts = { new ParticleSystem.Burst(0, 20) }, sortingOrder = 0 }, 1);
                var b = VfxShuriken.Build(root.transform, new Layer { name = "TrailNoMat", material = legacy, trails = true, maxParticles = 20, bursts = { new ParticleSystem.Burst(0, 5) }, sortingOrder = 0 }, 2);
                b.GetComponent<ParticleSystemRenderer>().trailMaterial = null;
                var c = VfxShuriken.Build(root.transform, new Layer { name = "MeshSG", material = sgMat, maxParticles = 50, renderMode = ParticleSystemRenderMode.Mesh, bursts = { new ParticleSystem.Burst(0, 10) }, sortingOrder = 1 }, 3);
                var cr = c.GetComponent<ParticleSystemRenderer>();
                cr.mesh = Resources.GetBuiltinResource<Mesh>("Cube.fbx");
                cr.enableGPUInstancing = false;
                var coll = a.collision; coll.enabled = true; coll.type = ParticleSystemCollisionType.World;
                var path = folder + "/FX_Bad.prefab";
                PrefabUtility.SaveAsPrefabAsset(root, path);
                UnityEngine.Object.DestroyImmediate(root);
                AssetDatabase.SaveAssets();
                return new Dictionary<string, object> { { "prefab", path }, { "shadergraph_copied", copied }, { "shadergraph_shader", sgShader != null ? sgShader.name : null },
                                                        { "legacy_shader", legacy.shader.name } };
            });
        }

        /// <summary>Test fixture for the v0.2 craft rules: an uber Custom Data material on a renderer with default
        /// streams, a compressed mipmapped LUT, a distortion layer drawn over an additive layer, a linear size curve,
        /// a sprite that fills its whole cell, and no VfxTier. args: folder</summary>
        public static void MakeCraftFixture()
        {
            AgentJob.Run(() =>
            {
                var folder = AgentJob.Str("folder", "Assets/VFX/AuditFixtures");
                Directory.CreateDirectory(Path.Combine(AgentJob.ProjectRoot, folder));
                var badLut = VfxTextures.WritePng(folder + "/T_Ramp_Compressed.png", VfxTextures.Ramp(VfxShuriken.Grad((0f, Color.black), (1f, Color.white)), 256), 256, 1,
                                                  new VfxTextures.ImportSpec { maxSize = 256, mipmaps = true, compression = TextureImporterCompression.Compressed, wrap = TextureWrapMode.Repeat });
                var full = new Color[64 * 64];
                for (int i = 0; i < full.Length; i++) full[i] = Color.white;
                var square = VfxTextures.WritePng(folder + "/T_Square_Full.png", full, 64, 64, new VfxTextures.ImportSpec { maxSize = 64 });
                var glow = VfxTextures.WritePng(folder + "/T_Fixture_Glow.png", VfxTextures.Glow(64), 64, 64, new VfxTextures.ImportSpec { maxSize = 64 });
                var uber = VfxUber.Create(folder + "/M_Uber_BadStreams.mat", new UberSpec { main = glow, ramp = badLut, customData = true, erosion = 0f });
                var square_m = VfxMaterials.Particle(folder + "/M_Square_Add.mat", VfxBlend.Additive, square, Color.white);
                var glow_m = VfxMaterials.Particle(folder + "/M_Glow_Add_Fixture.mat", VfxBlend.Additive, glow, Color.white);
                var dist = VfxMaterials.Particle(folder + "/M_Distortion.mat", VfxBlend.Alpha, glow, Color.white);
                dist.SetFloat("_DistortionEnabled", 1f);
                VfxMaterials.ApplyInspectorLogic(dist);
                var quad = VfxMeshes.Save(VfxMeshes.QuadXZ(1f), folder + "/VFX_QuadXZ_Fixture.asset");
                var floatMesh = new Mesh { name = "VFX_Quad_FloatColors" };            // float vertex colors: what mesh particles misread
                floatMesh.SetVertices(new List<Vector3>(quad.vertices));
                floatMesh.SetUVs(0, new List<Vector2>(quad.uv));
                floatMesh.SetColors(new List<Color> { Color.white, Color.white, Color.white, Color.white });
                floatMesh.SetTriangles(quad.triangles, 0);
                floatMesh.RecalculateBounds();
                AssetDatabase.CreateAsset(floatMesh, folder + "/VFX_Quad_FloatColors.asset");
                var root = new GameObject("FX_Bad_Craft");
                VfxShuriken.Root(root, 1f, false, ParticleSystemStopAction.Destroy);
                VfxShuriken.Build(root.transform, new Layer { name = "Uber_DefaultStreams", material = uber, mesh = quad, alignment = ParticleSystemRenderSpace.Local,
                    rotationDeg = Vector2.zero, bursts = { new ParticleSystem.Burst(0, 1) }, maxParticles = 1, lifetime = new Vector2(0.5f, 0.5f), sortingOrder = 0 }, 1);
                VfxShuriken.Build(root.transform, new Layer { name = "Glow_Under", material = glow_m, bursts = { new ParticleSystem.Burst(0, 3) }, maxParticles = 3,
                    lifetime = new Vector2(0.5f, 0.5f), sortingOrder = 1 }, 2);
                VfxShuriken.Build(root.transform, new Layer { name = "Distortion_OnTop", material = dist, bursts = { new ParticleSystem.Burst(0, 2) }, maxParticles = 2,
                    lifetime = new Vector2(0.5f, 0.5f), sortingOrder = 2 }, 3);
                VfxShuriken.Build(root.transform, new Layer { name = "Linear_Size_Square", material = square_m, bursts = { new ParticleSystem.Burst(0, 4) }, maxParticles = 4,
                    lifetime = new Vector2(0.5f, 0.5f), sizeOverLife = AnimationCurve.Linear(0f, 0.2f, 1f, 1f), sortingOrder = 3 }, 4);
                VfxShuriken.Build(root.transform, new Layer { name = "Float_Color_Mesh", material = glow_m, mesh = floatMesh, alignment = ParticleSystemRenderSpace.Local,
                    bursts = { new ParticleSystem.Burst(0, 1) }, maxParticles = 1, lifetime = new Vector2(0.5f, 0.5f), sortingOrder = 4 }, 5);
                var path = folder + "/FX_Bad_Craft.prefab";
                PrefabUtility.SaveAsPrefabAsset(root, path);
                UnityEngine.Object.DestroyImmediate(root);
                AssetDatabase.SaveAssets();
                return new Dictionary<string, object> { { "prefab", path }, { "distortion_keyword", dist.IsKeywordEnabled("_DISTORTION_ON") }, { "uber_keywords", VfxUber.Describe(uber)["keywords"] } };
            });
        }
    }
}
