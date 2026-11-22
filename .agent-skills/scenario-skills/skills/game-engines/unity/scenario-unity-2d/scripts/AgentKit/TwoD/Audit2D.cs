// AgentKit 2D v0.1 (scenario-unity-2d skill, 2026-09-24). One audit for a 2D scene, in the core findings
// format ({severity, code, path, message, fix}) so the lead can merge it with AgentAudit reports.
// Checks come from the 2D cluster digests: pixel imports and PPU vs the Pixel Perfect Camera, no
// Built-in pixel-perfect package, orthographic camera, Global light present and not zero, one Global
// light per blend style per sorting layer, Normal Maps enabled on lights that hit normal-mapped
// sprites, deprecated Parametric lights, shadow-casting light count, Sorting Group on multi-sprite
// roots, renderers left on the Default sorting layer, static merged tilemap collision, Dynamic bodies
// with interpolation, player root scale 1, Sprite-Lit material for sprites under 2D lights.
//
// v0.2: hazards whose hitbox is not smaller than their art (Celeste forgiveness, GMTK yorTG9at90g [00:09:28]),
// Normal Map Quality Accurate on a low tier (e-book p. 131), one-way platforms without Used By Effector.
// Job: AgentKit.TwoD.Audit2D.Scene  args: scene, pixel_folders [..], ppu, max_shadow_lights (2), tier ("desktop"|"mobile"|"low")
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-2d/test_live_2d.py (P9, clean + seeded faults).
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.Tilemaps;

namespace AgentKit.TwoD
{
    public static class Audit2D
    {
        public static void Scene()
        {
            AgentJob.Run(() =>
            {
                var scenePath = AgentJob.Str("scene", "Assets/Scenes/Level2D.unity");
                var scene = EditorSceneManager.OpenScene(scenePath, OpenSceneMode.Single);
                var f = new AgentAudit.Findings();
                int ppu = AgentJob.Int("ppu", 16);
                int maxShadow = AgentJob.Int("max_shadow_lights", 2);
                string tier = AgentJob.Str("tier", "desktop");

                // ---- project
                var manifest = File.ReadAllText(Path.Combine(AgentJob.ProjectRoot, "Packages", "manifest.json"));
                if (manifest.Contains("\"com.unity.2d.pixel-perfect\""))
                    f.Add("error", "2d.pp_package", "Packages/manifest.json", "com.unity.2d.pixel-perfect is Built-in only", "remove it; URP ships PixelPerfectCamera");
                var rp = GraphicsSettings.currentRenderPipeline as UniversalRenderPipelineAsset;
                if (rp == null) f.Add("error", "2d.pipeline", "Graphics", "not URP: 2D lights need URP with the 2D Renderer", "Universal 2D template or a Renderer2DData");

                // ---- imports of every sprite used in the scene
                // source paths through the SPRITE asset: with Sprite Atlas V2 enabled, sprite.texture in the
                // editor can already be the atlas page (observed), whose path is the .spriteatlasv2
                var usedTextures = new HashSet<string>();
                foreach (var sr in Object.FindObjectsByType<SpriteRenderer>(FindObjectsSortMode.None))
                    if (sr.sprite != null) usedTextures.Add(AssetDatabase.GetAssetPath(sr.sprite));
                foreach (var tm in Object.FindObjectsByType<Tilemap>(FindObjectsSortMode.None))
                    foreach (var p in tm.cellBounds.allPositionsWithin)
                    {
                        var sp = tm.GetSprite(p);
                        if (sp != null) usedTextures.Add(AssetDatabase.GetAssetPath(sp));
                    }
                var pixelFolders = TwoDUtil.ListOr("pixel_folders", "Assets/Art/Pixel").Select(x => x.ToString()).ToList();
                foreach (var t in usedTextures.Where(p => pixelFolders.Any(p.StartsWith)))
                {
                    var ti = AssetImporter.GetAtPath(t) as TextureImporter;
                    if (ti == null) continue;
                    if (ti.filterMode != FilterMode.Point) f.Add("error", "2d.filter", t, "pixel sprite filtered " + ti.filterMode, "Filter Mode Point");
                    if (System.Math.Abs(ti.spritePixelsPerUnit - ppu) > 0.01f) f.Add("error", "2d.ppu", t, "PPU " + ti.spritePixelsPerUnit + " != " + ppu, "one PPU = Assets PPU");
                    if (ti.textureCompression != TextureImporterCompression.Uncompressed) f.Add("error", "2d.compression", t, "compressed pixel art", "Compression None");
                }

                // ---- camera
                var cam = CameraJobs.MainCamera(false);
                if (cam == null) f.Add("error", "2d.camera", scenePath, "no camera", "add a Main Camera");
                else
                {
                    if (!cam.orthographic) f.Add("warn", "2d.camera_persp", cam.name, "perspective camera (fine only for Z-parallax designs)", "orthographic for pixel art");
                    var ppc = cam.GetComponent<PixelPerfectCamera>();
                    if (ppc == null) f.Add("info", "2d.no_ppc", cam.name, "no Pixel Perfect Camera", "add it for pixel art");
                    else if (ppc.assetsPPU != ppu) f.Add("error", "2d.ppc_ppu", cam.name, "Assets PPU " + ppc.assetsPPU + " != sprite PPU " + ppu, "match them");
                }

                // ---- lights
                var lights = Object.FindObjectsByType<Light2D>(FindObjectsSortMode.None);
                var globals = lights.Where(l => l.lightType == Light2D.LightType.Global).ToList();
                if (globals.Count == 0) f.Add("warn", "2d.no_global", scenePath, "no Global Light 2D: unlit areas go pitch black", "tinted Global light at low intensity (0.25 in Happy Harvest)");
                foreach (var g in globals.Where(g => g.intensity <= 0.01f)) f.Add("warn", "2d.global_zero", g.name, "Global light intensity " + g.intensity, "never ship a pitch-black area");
                var pairs = new Dictionary<string, int>();
                foreach (var g in globals)
                    foreach (var id in g.targetSortingLayers)
                    {
                        var k = g.blendStyleIndex + "/" + SortingLayer.IDToName(id);
                        pairs[k] = pairs.TryGetValue(k, out var n) ? n + 1 : 1;
                    }
                foreach (var kv in pairs.Where(p => p.Value > 1))
                    f.Add("error", "2d.global_dup", kv.Key, kv.Value + " Global lights on one blend style and sorting layer", "one Global light per blend style per sorting layer");
                foreach (var l in lights.Where(l => l.lightType == Light2D.LightType.Parametric))
                    f.Add("warn", "2d.parametric", l.name, "Parametric light type is deprecated", "Freeform or Spot (Point)");
                bool anyNormals = usedTextures.Any(t => (AssetImporter.GetAtPath(t) as TextureImporter)?.secondarySpriteTextures.Any(s => s.name == "_NormalMap") == true);
                if (anyNormals)
                    foreach (var l in lights.Where(l => (l.lightType == Light2D.LightType.Point || l.lightType == Light2D.LightType.Freeform) && l.normalMapQuality == Light2D.NormalMapQuality.Disabled))
                        f.Add("warn", "2d.light_normals_off", l.name, "Normal Maps disabled on a light while sprites carry _NormalMap: flat, washed-out look", "Light 2D > Normal Maps Fast/Accurate (SerializedObject m_NormalMapQuality)");
                if (tier != "desktop")
                    foreach (var l in lights.Where(l => l.normalMapQuality == Light2D.NormalMapQuality.Accurate))
                        f.Add("warn", "2d.light_normal_quality", l.name, "Normal Map Quality Accurate on a " + tier + " tier", "Fast on low tiers (e-book p. 131)");
                int shadowLights = lights.Count(l => l.shadowsEnabled && l.lightType != Light2D.LightType.Global);
                if (shadowLights > maxShadow) f.Add("warn", "2d.shadow_lights", scenePath, shadowLights + " shadow-casting lights (budget " + maxShadow + ")", "shadows only where they read; each costs fill rate");

                // ---- renderers and sorting
                foreach (var anim in Object.FindObjectsByType<Animator>(FindObjectsSortMode.None))
                {
                    // a character made of several sprites (layered or rigged) must sort as one unit
                    if (anim.GetComponentsInChildren<SpriteRenderer>(true).Length >= 2 && anim.GetComponentInParent<SortingGroup>() == null)
                        f.Add("warn", "2d.sorting_group", anim.name, "multi-sprite animated object without a Sorting Group: its parts interleave with other characters", "Sorting Group on the root (2D e-book p. 27)");
                }
                foreach (var r in Object.FindObjectsByType<Renderer>(FindObjectsSortMode.None).Where(r => r is SpriteRenderer || r is TilemapRenderer))
                {
                    if (r.sortingLayerID == 0) f.Add("info", "2d.default_layer", r.name, "renderer on the Default sorting layer", "put gameplay renderers on a named sorting layer");
                    if (r is SpriteRenderer s && s.sharedMaterial != null && s.sharedMaterial.shader.name == "Sprites/Default")
                        f.Add("warn", "2d.legacy_sprite_shader", r.name, "legacy Sprites-Default in URP 2D: not SRP Batcher compatible, ignores 2D lights", "Sprite-Lit-Default (or Sprite-Unlit-Default for emissive)");
                }

                // ---- physics
                foreach (var tc in Object.FindObjectsByType<TilemapCollider2D>(FindObjectsSortMode.None))
                {
                    var comp = tc.GetComponent<CompositeCollider2D>();
                    var rb = tc.GetComponent<Rigidbody2D>();
                    if (comp == null || tc.compositeOperation != Collider2D.CompositeOperation.Merge)
                        f.Add("info", "2d.tile_collider_unmerged", tc.name, "per-tile colliders (fine only if tiles change at runtime)", "Composite Operation Merge + Composite Collider 2D");
                    if (rb != null && rb.bodyType != RigidbodyType2D.Static)
                        f.Add("error", "2d.tile_body", tc.name, "tilemap body is " + rb.bodyType + ": the level falls or moves", "Rigidbody 2D Body Type Static");
                }
                foreach (var hz in Object.FindObjectsByType<Hazard2D>(FindObjectsSortMode.None))
                {
                    var ratio = hz.HitboxToArtRatio();
                    var box = hz.GetComponent<BoxCollider2D>();
                    if (box != null && !box.isTrigger) f.Add("error", "2d.hazard_solid", hz.name, "hazard collider is solid: the player stands on it", "Is Trigger on");
                    if (ratio.x >= 0.999f || ratio.y >= 0.999f)
                        f.Add("warn", "2d.hazard_hitbox", hz.name, "hazard hitbox is " + ratio.x.ToString("0.00") + " x " + ratio.y.ToString("0.00") + " of its art: touching the drawn tip hurts", "smaller than the art (Celeste small spike hitboxes, GMTK [00:09:28]): Hazard2D.FitHitbox");
                }
                foreach (var pe in Object.FindObjectsByType<PlatformEffector2D>(FindObjectsSortMode.None))
                    if (!pe.GetComponents<Collider2D>().Any(c => c.usedByEffector))
                        f.Add("error", "2d.effector_unused", pe.name, "Platform Effector 2D with no collider set to Used By Effector: it does nothing", "Collider2D.usedByEffector = true");
                foreach (var rb in Object.FindObjectsByType<Rigidbody2D>(FindObjectsSortMode.None).Where(b => b.bodyType == RigidbodyType2D.Dynamic))
                {
                    if (rb.GetComponent<PlatformerController2D>() != null)
                    {
                        if (rb.transform.lossyScale != Vector3.one) f.Add("error", "2d.player_scale", rb.name, "player scale " + rb.transform.lossyScale + ": casts use local collider size", "scale 1, size the sprite with PPU");
                        if (rb.gameObject.layer == 0) f.Add("warn", "2d.player_layer", rb.name, "player on Default layer: ground casts may hit other Default objects' logic", "own physics layer = PlatformerStats.PlayerLayer");
                    }
                    if (rb.sleepMode == RigidbodySleepMode2D.NeverSleep) f.Add("warn", "2d.never_sleep", rb.name, "Never Sleep", "Start Awake");
                }
                return new Dictionary<string, object>
                {
                    { "scene", scenePath }, { "counts", f.Counts() }, { "findings", f.items },
                    { "lights", lights.Length }, { "global_lights", globals.Count }, { "shadow_lights", shadowLights },
                    { "sprites_used", usedTextures.Count }, { "sprite_sources", usedTextures.OrderBy(x => x).ToList() },
                };
            });
        }
    }
}
