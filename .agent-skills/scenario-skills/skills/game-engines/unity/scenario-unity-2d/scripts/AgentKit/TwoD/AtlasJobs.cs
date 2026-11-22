// AgentKit 2D v0.1 (scenario-unity-2d skill, 2026-09-24). Sprite Atlas V2: create, pack, audit.
//
// What an atlas buys in Unity 6 URP (Unity, hXlpnwD-TgY): under the SRP Batcher with URP sprite
// shaders it changes neither the Batches count nor SetPass (2 with or without it, [00:05:21] to
// [00:06:27]; measured 21/21 and 2/2 here); it cuts used textures and, when page usage is high, texture
// memory ([00:07:32]). Judge it by used textures and texture bytes, never by Batches or SetPass.
// Pixel-art pages stay Compression None (compression shifts pixel colours, 2qeNu2QApAM [00:02:24]);
// HD pages compress once, here, with uncompressed sources. The ten
// mistakes (Sprite Atlas Analyzer, 6.3): wrong grouping (no tool catches it: pack what is on screen
// or loaded together), single-sprite atlases, wasted space (> 400 KB), Full Rect where Tight fits,
// more than one page, Read/Write on, double compression (compressed sources), blanket compression,
// mixed secondary-texture sets, and no "Enabled for Builds" mode on big projects.
//
// Jobs:
//   AgentKit.TwoD.AtlasJobs.BuildAtlas   args: path (.spriteatlasv2), packables [folders or assets],
//        padding (4), rotation (false), tight (false), alpha_dilation (false), filter ("Point"|"Bilinear"),
//        max_size (2048), compression ("None"|"Normal"|"High"|"Low"), include_in_build (true), mips (false)
//   AgentKit.TwoD.AtlasJobs.AuditAtlases args: paths [] (default: every atlas in Assets)
// Page count comes from UnityEditor.Sprites.SpriteUtility.GetSpriteTexture(sprite, true) after
// SpriteAtlasUtility.PackAtlases: the distinct atlas textures the sprites resolve to.
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-2d/test_live_2d.py (P3).
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.U2D;
using UnityEngine;
using UnityEngine.U2D;

namespace AgentKit.TwoD
{
    public static class AtlasJobs
    {
        public static void BuildAtlas()
        {
            AgentJob.Run(() =>
            {
                var path = AgentJob.Str("path", "Assets/Atlases/Level.spriteatlasv2");
                if (!path.EndsWith(".spriteatlasv2")) throw new ArgumentException("Sprite Atlas V2 assets end with .spriteatlasv2");
                TwoDUtil.EnsureFolder(Path.GetDirectoryName(path));
                var objs = new List<UnityEngine.Object>();
                foreach (var p in AgentJob.List("packables"))
                {
                    var o = AssetDatabase.LoadAssetAtPath<UnityEngine.Object>(p.ToString());
                    if (o == null) throw new InvalidOperationException("packable not found: " + p);
                    objs.Add(o);
                }
                var asset = new SpriteAtlasAsset();
                asset.Add(objs.ToArray());
                SpriteAtlasAsset.Save(asset, path);
                AssetDatabase.ImportAsset(path, ImportAssetOptions.ForceUpdate);

                var imp = (SpriteAtlasImporter)AssetImporter.GetAtPath(path);
                imp.packingSettings = new SpriteAtlasPackingSettings
                {
                    padding = AgentJob.Int("padding", 4),
                    enableRotation = AgentJob.Bool("rotation", false),      // tiles: no rotation (e-book anti-bleeding)
                    enableTightPacking = AgentJob.Bool("tight", false),
                    enableAlphaDilation = AgentJob.Bool("alpha_dilation", false),
                    blockOffset = 1,
                };
                imp.textureSettings = new SpriteAtlasTextureSettings
                {
                    filterMode = AgentJob.Str("filter", "Point") == "Point" ? FilterMode.Point : FilterMode.Bilinear,
                    generateMipMaps = AgentJob.Bool("mips", false),
                    readable = false,
                    sRGB = true,
                    anisoLevel = 0,
                };
                var comp = AgentJob.Str("compression", "None");
                imp.SetPlatformSettings(new TextureImporterPlatformSettings
                {
                    name = "DefaultTexturePlatform",
                    maxTextureSize = AgentJob.Int("max_size", 2048),
                    format = TextureImporterFormat.Automatic,
                    textureCompression = comp == "None" ? TextureImporterCompression.Uncompressed
                        : comp == "High" ? TextureImporterCompression.CompressedHQ
                        : comp == "Low" ? TextureImporterCompression.CompressedLQ : TextureImporterCompression.Compressed,
                });
                imp.includeInBuild = AgentJob.Bool("include_in_build", true);
                imp.SaveAndReimport();

                var atlas = AssetDatabase.LoadAssetAtPath<SpriteAtlas>(path) ?? throw new InvalidOperationException("atlas did not import: " + path);
                SpriteAtlasUtility.PackAtlases(new[] { atlas }, EditorUserBuildSettings.activeBuildTarget, false);
                var report = Describe(path, atlas, new AgentAudit.Findings());
                report["sprite_packer_mode"] = EditorSettings.spritePackerMode.ToString();
                return report;
            });
        }

        public static void AuditAtlases()
        {
            AgentJob.Run(() =>
            {
                var f = new AgentAudit.Findings();
                var paths = TwoDUtil.ListOr("paths", AssetDatabase.FindAssets("t:SpriteAtlas", new[] { "Assets" })
                    .Select(g => (object)AssetDatabase.GUIDToAssetPath(g)).ToArray()).Select(x => x.ToString()).ToList();
                var atlases = new List<object>();
                foreach (var p in paths)
                {
                    var atlas = AssetDatabase.LoadAssetAtPath<SpriteAtlas>(p);
                    if (atlas == null) continue;
                    SpriteAtlasUtility.PackAtlases(new[] { atlas }, EditorUserBuildSettings.activeBuildTarget, false);
                    atlases.Add(Describe(p, atlas, f));
                }
                if (EditorSettings.spritePackerMode != SpritePackerMode.SpriteAtlasV2 && EditorSettings.spritePackerMode != SpritePackerMode.SpriteAtlasV2Build)
                    f.Add("warn", "2d.atlas_mode", "ProjectSettings/EditorSettings.asset", "Sprite Atlas mode " + EditorSettings.spritePackerMode, "Sprite Atlas V2 (Enabled, or Enabled for Builds on large projects)");
                return new Dictionary<string, object> { { "atlases", atlases }, { "counts", f.Counts() }, { "findings", f.items } };
            });
        }

        /// <summary>Pack result and the Analyzer-style checks for one atlas.</summary>
        public static Dictionary<string, object> Describe(string path, SpriteAtlas atlas, AgentAudit.Findings f)
        {
            var packed = new Sprite[atlas.spriteCount];
            atlas.GetSprites(packed);
            // source sprites: the packables' sprites (GetSprites returns clones bound to the atlas)
            var sources = new List<Sprite>();
            var srcTextures = new HashSet<string>();
            foreach (var o in atlas.GetPackables())
            {
                var op = AssetDatabase.GetAssetPath(o);
                if (AssetDatabase.IsValidFolder(op))
                {
                    foreach (var g in AssetDatabase.FindAssets("t:Sprite", new[] { op }))
                    {
                        var sp = AssetDatabase.GUIDToAssetPath(g);
                        srcTextures.Add(sp);
                        sources.AddRange(AssetDatabase.LoadAllAssetsAtPath(sp).OfType<Sprite>());
                    }
                }
                else
                {
                    srcTextures.Add(op);
                    sources.AddRange(AssetDatabase.LoadAllAssetsAtPath(op).OfType<Sprite>());
                }
            }
            sources = sources.Distinct().ToList();
            var pages = new Dictionary<Texture2D, int>();
            long usedPx = 0;
            foreach (var s in sources)
            {
                var t = UnityEditor.Sprites.SpriteUtility.GetSpriteTexture(s, true);
                if (t == null) continue;
                pages[t] = pages.TryGetValue(t, out var n) ? n + 1 : 1;
                usedPx += (long)(s.rect.width * s.rect.height);
            }
            long pagePx = pages.Keys.Sum(t => (long)t.width * t.height);
            var secondarySets = new Dictionary<string, List<string>>();
            foreach (var tp in srcTextures)
            {
                var ti = AssetImporter.GetAtPath(tp) as TextureImporter;
                if (ti == null) continue;
                var set = string.Join("+", ti.secondarySpriteTextures.Select(x => x.name).OrderBy(x => x));
                if (!secondarySets.TryGetValue(set, out var l)) secondarySets[set] = l = new List<string>();
                l.Add(tp);
                if (ti.textureCompression != TextureImporterCompression.Uncompressed || ti.crunchedCompression)
                    f.Add("error", "2d.atlas_double_compression", tp, "source compressed (" + ti.textureCompression + (ti.crunchedCompression ? ", crunch" : "") + ") inside atlas " + path, "source Compression None, lossless PNG; compress on the atlas");
                if (ti.isReadable)
                    f.Add("warn", "2d.atlas_readable", tp, "Read/Write on: source and atlas both resident", "Read/Write off");
                var st = new TextureImporterSettings();
                ti.ReadTextureSettings(st);
                if (st.spriteMeshType == SpriteMeshType.FullRect && ti.DoesSourceTextureHaveAlpha() && !tp.Contains("tile"))
                    f.Add("info", "2d.atlas_fullrect", tp, "Full Rect mesh on a sprite with alpha: overdraw and wasted atlas space unless it is rectangular", "Mesh Type Tight (Full Rect only for rectangles)");
            }
            if (sources.Count <= 1) f.Add("warn", "2d.atlas_single_sprite", path, "atlas with " + sources.Count + " sprite", "merge into an atlas of co-visible sprites");
            if (pages.Count > 1) f.Add("error", "2d.atlas_pages", path, pages.Count + " pages: sprites from different pages break batching", "regroup, or split by frequency (common vs rare)");
            if (secondarySets.Count > 1) f.Add("warn", "2d.atlas_secondary_mismatch", path, "mixed secondary texture sets: " + string.Join(" | ", secondarySets.Keys.Select(k => k == "" ? "(none)" : k)), "split 'with normal maps' and 'without', or give placeholders (flat normal) to all");
            long pageBytes = pages.Keys.Sum(t => (long)UnityEngine.Profiling.Profiler.GetRuntimeMemorySizeLong(t));
            double usage = pagePx > 0 ? (double)usedPx / pagePx : 0;
            long wastedBytes = (long)(pageBytes * (1 - usage));
            if (wastedBytes > 400 * 1024) f.Add("warn", "2d.atlas_waste", path, "about " + (wastedBytes / 1024) + " KB unused (usage " + (usage * 100).ToString("0.0") + "%)", "trim sources, lower Max Texture Size, regroup");
            var imp = AssetImporter.GetAtPath(path) as SpriteAtlasImporter;
            return new Dictionary<string, object>
            {
                { "path", path }, { "sprite_count", atlas.spriteCount }, { "source_sprites", sources.Count },
                { "pages", pages.Count },
                { "page_textures", pages.Keys.Select(t => new Dictionary<string, object> { { "name", t.name }, { "size", new[] { t.width, t.height } }, { "format", t.format.ToString() }, { "filter", t.filterMode.ToString() }, { "sprites", pages[t] } }).ToList() },
                { "usage", Math.Round(usage, 4) }, { "page_bytes", pageBytes },
                { "include_in_build", imp != null && imp.includeInBuild },
                { "packing", imp != null ? (object)new Dictionary<string, object> { { "padding", imp.packingSettings.padding }, { "rotation", imp.packingSettings.enableRotation }, { "tight", imp.packingSettings.enableTightPacking } } : null },
                { "packed_clone_texture", packed.Length > 0 && packed[0] != null && packed[0].texture != null ? packed[0].texture.name : null },
                { "secondary_sets", secondarySets.Keys.ToList() },
                { "counts", f.Counts() }, { "findings", f.items.Where(i => ((string)i["path"]).Contains(path) || srcTextures.Contains((string)i["path"])).ToList() },
            };
        }
    }
}
