// AgentKit 2D v0.1 (scenario-unity-2d skill, 2026-09-24). Sprite import for pixel art and HD art.
//
// Pixel art (URP Pixel Perfect Camera doc, 6.3 Manual; Unity video 2qeNu2QApAM): ONE PPU for every
// sprite (= tile size in pixels, so one tile is one unit), Filter Point, Compression None, Max
// Size >= the texture's largest side, mipmaps off [added], pivots on whole pixels; normal maps as
// secondary textures named _NormalMap on the sprite ASSET (one shared Sprite-Lit material, 2D
// e-book p. 102), imported as Normal map type (GDC 2023 YhrwKF_i-BI) with Point filtering [added].
// HD art: PPU = target vertical resolution / (ortho size x 2) at the closest zoom (e-book p. 21).
// Sources that go into an atlas stay uncompressed: the atlas compresses once (hXlpnwD-TgY).
//
// Jobs:
//   AgentKit.TwoD.SpriteJobs.ImportPixelArt  args: textures [{path, ppu, cell:[w,h] (slices a sheet),
//        names:[..], pivot:[px,py] in PIXELS, mesh:"FullRect"|"Tight", normal_map:"<path>"}], ppu (default)
//   AgentKit.TwoD.SpriteJobs.ImportHD        args: paths[], target_height, ortho_size, rig_factor (1.0)
//   AgentKit.TwoD.SpriteJobs.AuditSprites    args: folders[], ppu, mode "pixel"|"hd"
//   AgentKit.TwoD.SpriteJobs.SetPhysicsOutline args: path, outline [[x,y]..] in PIXELS from the sprite's
//        bottom-left (a Custom Physics Shape by script: ISpritePhysicsOutlineDataProvider). Observed on 16 px
//        pixel art: the generated fallback physics shape is a 4-point rectangle, so shaped tiles and props
//        need a custom outline (Sprite Editor > Custom Physics Shape, or this job).
// Slicing uses the 2D Sprite package data provider (ISpriteEditorDataProvider), not the obsolete
// TextureImporter.spritesheet.
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-2d/test_live_2d.py (P1, P2).
using System;
using System.Collections.Generic;
using System.Linq;
using UnityEditor;
using UnityEditor.U2D.Sprites;
using UnityEngine;

namespace AgentKit.TwoD
{
    public static class SpriteJobs
    {
        public static void ImportPixelArt()
        {
            AgentJob.Run(() =>
            {
                int defPpu = AgentJob.Int("ppu", 16);
                var results = new List<object>();
                var specs = AgentJob.List("textures");
                // normal maps first: the colour textures reference them as secondary textures
                foreach (Dictionary<string, object> spec in specs)
                    if (spec.TryGetValue("normal_map", out var nm) && nm is string nmp)
                        ImportNormalMap(nmp);
                foreach (Dictionary<string, object> spec in specs)
                    results.Add(ImportOne(spec, defPpu));
                return new Dictionary<string, object> { { "textures", results }, { "ppu", defPpu } };
            });
        }

        public static void ImportNormalMap(string path)
        {
            var ti = (TextureImporter)AssetImporter.GetAtPath(path) ?? throw new InvalidOperationException("no texture at " + path);
            ti.textureType = TextureImporterType.NormalMap;   // GDC 2023: "for optimal sprite atlasing"
            ti.convertToNormalmap = false;                   // already a tangent-space normal map
            ti.filterMode = FilterMode.Point;                // pixel art: no smoothing across art pixels
            ti.textureCompression = TextureImporterCompression.Uncompressed;
            ti.mipmapEnabled = false;
            ti.wrapMode = TextureWrapMode.Clamp;
            ti.SaveAndReimport();
        }

        static Dictionary<string, object> ImportOne(Dictionary<string, object> spec, int defPpu)
        {
            var path = (string)spec["path"];
            var ti = (TextureImporter)AssetImporter.GetAtPath(path) ?? throw new InvalidOperationException("no texture at " + path);
            int ppu = spec.TryGetValue("ppu", out var p) ? (int)AgentJson.ToDouble(p, defPpu) : defPpu;
            ti.GetSourceTextureWidthAndHeight(out int w, out int h);
            bool sheet = spec.ContainsKey("cell");

            ti.textureType = TextureImporterType.Sprite;
            ti.spriteImportMode = sheet ? SpriteImportMode.Multiple : SpriteImportMode.Single;
            ti.spritePixelsPerUnit = ppu;
            ti.filterMode = FilterMode.Point;
            ti.textureCompression = TextureImporterCompression.Uncompressed;
            ti.mipmapEnabled = false;
            ti.wrapMode = TextureWrapMode.Clamp;
            ti.alphaIsTransparency = true;
            ti.isReadable = false;
            ti.maxTextureSize = NextPow2(Math.Max(w, h));    // never below the real size (2qeNu2QApAM [00:03:38])
            var settings = new TextureImporterSettings();
            ti.ReadTextureSettings(settings);
            var mesh = spec.TryGetValue("mesh", out var m) ? (string)m : "Tight";
            settings.spriteMeshType = mesh == "FullRect" ? SpriteMeshType.FullRect : SpriteMeshType.Tight;
            settings.spriteExtrude = 1;
            ti.SetTextureSettings(settings);

            Vector2 pivotPx = spec.TryGetValue("pivot", out var pv) ? TwoDUtil.ToVector2(pv, Vector2.zero) : new Vector2(-1, -1);
            if (!sheet && pivotPx.x >= 0)
            {
                // set through the settings struct: SetTextureSettings would overwrite ti.spritePivot
                settings.spritePivot = new Vector2(pivotPx.x / w, pivotPx.y / h);
                settings.spriteAlignment = (int)SpriteAlignment.Custom;
                ti.SetTextureSettings(settings);
            }

            if (spec.TryGetValue("normal_map", out var nm) && nm is string nmp)
            {
                var ntex = AssetDatabase.LoadAssetAtPath<Texture2D>(nmp) ?? throw new InvalidOperationException("normal map not found " + nmp);
                ti.secondarySpriteTextures = new[] { new SecondarySpriteTexture { name = "_NormalMap", texture = ntex } };
            }
            ti.SaveAndReimport();

            int sliced = 0;
            if (sheet)
            {
                var cell = TwoDUtil.ToVector2(spec["cell"], new Vector2(16, 16));
                var names = spec.TryGetValue("names", out var n) && n is List<object> nl ? nl.Select(x => x.ToString()).ToList() : null;
                sliced = SliceGrid(ti, (int)cell.x, (int)cell.y, names, pivotPx.x >= 0 ? pivotPx : new Vector2(cell.x / 2f, cell.y / 2f));
            }

            // read back what Unity actually stored
            var back = (TextureImporter)AssetImporter.GetAtPath(path);
            var sprites = TwoDUtil.Sprites(path);
            var pivotsPx = sprites.Select(s => new Vector2(s.pivot.x, s.pivot.y)).ToList();
            bool pivotsWhole = pivotsPx.All(v => Mathf.Abs(v.x - Mathf.Round(v.x)) < 1e-3f && Mathf.Abs(v.y - Mathf.Round(v.y)) < 1e-3f);
            return new Dictionary<string, object>
            {
                { "path", path }, { "size", new[] { w, h } }, { "ppu", back.spritePixelsPerUnit },
                { "filter", back.filterMode.ToString() }, { "compression", back.textureCompression.ToString() },
                { "mipmaps", back.mipmapEnabled }, { "max_size", back.maxTextureSize }, { "mode", back.spriteImportMode.ToString() },
                { "sprites", sprites.Count }, { "sliced", sliced }, { "sprite_names", sprites.Take(20).Select(s => s.name).ToList() },
                { "pivots_whole_pixels", pivotsWhole }, { "first_pivot_px", pivotsPx.Count > 0 ? (object)pivotsPx[0] : null },
                { "secondary", back.secondarySpriteTextures.Select(s => s.name + "=" + (s.texture ? s.texture.name : "null")).ToList() },
                { "unit_size", sprites.Count > 0 ? (object)(sprites[0].rect.size / back.spritePixelsPerUnit) : null },
            };
        }

        /// <summary>Slice a sheet into a grid of cells (row 0 = top of the image), pivots in pixels.</summary>
        public static int SliceGrid(TextureImporter ti, int cw, int ch, IList<string> names, Vector2 pivotPx)
        {
            ti.GetSourceTextureWidthAndHeight(out int w, out int h);
            var factory = new SpriteDataProviderFactories();
            factory.Init();
            var dp = factory.GetSpriteEditorDataProviderFromObject(ti);
            dp.InitSpriteEditorDataProvider();
            var existing = dp.GetSpriteRects().ToDictionary(r => r.name, r => r.spriteID);
            var rects = new List<SpriteRect>();
            int cols = w / cw, rows = h / ch, i = 0;
            for (int r = 0; r < rows; r++)
                for (int c = 0; c < cols; c++, i++)
                {
                    var name = names != null && i < names.Count ? names[i] : System.IO.Path.GetFileNameWithoutExtension(ti.assetPath) + "_" + i;
                    rects.Add(new SpriteRect
                    {
                        name = name,
                        rect = new Rect(c * cw, h - (r + 1) * ch, cw, ch),   // sprite rects start bottom-left
                        alignment = SpriteAlignment.Custom,
                        pivot = new Vector2(pivotPx.x / cw, pivotPx.y / ch),
                        spriteID = existing.TryGetValue(name, out var id) ? id : GUID.Generate(),   // keep IDs: references survive a re-slice
                    });
                }
            dp.SetSpriteRects(rects.ToArray());
            var nameIds = dp.GetDataProvider<ISpriteNameFileIdDataProvider>();
            if (nameIds != null) nameIds.SetNameFileIdPairs(rects.Select(r => new SpriteNameFileIdPair(r.name, r.spriteID)).ToList());
            dp.Apply();
            ti.SaveAndReimport();
            return rects.Count;
        }

        public static void SetPhysicsOutline()
        {
            AgentJob.Run(() =>
            {
                var path = AgentJob.Str("path");
                var ti = AssetImporter.GetAtPath(path) as TextureImporter ?? throw new InvalidOperationException("not a texture: " + path);
                var pts = AgentJob.List("outline").Select(o => TwoDUtil.ToVector2(o, Vector2.zero)).ToArray();
                if (pts.Length < 3) throw new ArgumentException("outline needs 3+ points");
                var factory = new SpriteDataProviderFactories();
                factory.Init();
                var dp = factory.GetSpriteEditorDataProviderFromObject(ti);
                dp.InitSpriteEditorDataProvider();
                var rects = dp.GetSpriteRects();
                var phys = dp.GetDataProvider<ISpritePhysicsOutlineDataProvider>();
                foreach (var r in rects)
                {
                    // outlines are stored relative to the sprite rect's centre, in pixels
                    var c = r.rect.size * 0.5f;
                    phys.SetOutlines(r.spriteID, new List<Vector2[]> { pts.Select(q => q - c).ToArray() });
                    phys.SetTessellationDetail(r.spriteID, 0f);
                }
                dp.Apply();
                ti.SaveAndReimport();
                var sp = AssetDatabase.LoadAssetAtPath<Sprite>(path);
                var buf = new List<Vector2>();
                var counts = new List<int>();
                for (int i = 0; i < sp.GetPhysicsShapeCount(); i++) counts.Add(sp.GetPhysicsShape(i, buf));
                return new Dictionary<string, object> { { "path", path }, { "sprites", rects.Length }, { "physics_shapes", sp.GetPhysicsShapeCount() }, { "points", counts } };
            });
        }

        public static void ImportHD()
        {
            AgentJob.Run(() =>
            {
                float targetH = AgentJob.Float("target_height", 2160);
                float ortho = AgentJob.Float("ortho_size", 5);
                float rig = AgentJob.Float("rig_factor", 1f);
                float ppu = targetH / (ortho * 2f) * rig;          // e-book p. 21: 2160 / (5 x 2) = 216
                var outp = new List<object>();
                foreach (var o in AgentJob.List("paths"))
                {
                    var path = o.ToString();
                    var ti = (TextureImporter)AssetImporter.GetAtPath(path) ?? throw new InvalidOperationException("no texture " + path);
                    ti.GetSourceTextureWidthAndHeight(out int w, out int h);
                    ti.textureType = TextureImporterType.Sprite;
                    ti.spriteImportMode = SpriteImportMode.Single;
                    ti.spritePixelsPerUnit = ppu;
                    ti.filterMode = FilterMode.Bilinear;
                    ti.mipmapEnabled = false;                      // 2D at fixed zoom [added]; turn on if the camera zooms far out
                    ti.textureCompression = TextureImporterCompression.Uncompressed;   // atlas compresses once
                    ti.maxTextureSize = NextPow2(Math.Max(w, h));
                    ti.alphaIsTransparency = true;
                    var s = new TextureImporterSettings();
                    ti.ReadTextureSettings(s);
                    s.spriteMeshType = SpriteMeshType.Tight;
                    ti.SetTextureSettings(s);
                    ti.SaveAndReimport();
                    var sp = AssetDatabase.LoadAssetAtPath<Sprite>(path);
                    outp.Add(new Dictionary<string, object>
                    {
                        { "path", path }, { "size", new[] { w, h } }, { "ppu", ti.spritePixelsPerUnit },
                        { "world_size", sp != null ? (object)sp.bounds.size : null }, { "filter", ti.filterMode.ToString() },
                    });
                }
                return new Dictionary<string, object>
                {
                    { "formula", "PPU = target_height / (ortho_size * 2) * rig_factor" }, { "target_height", targetH },
                    { "ortho_size", ortho }, { "ppu", ppu }, { "textures", outp },
                };
            });
        }

        public static void AuditSprites()
        {
            AgentJob.Run(() =>
            {
                var f = new AgentAudit.Findings();
                var folders = TwoDUtil.ListOr("folders", "Assets/Art/Pixel").Select(x => x.ToString()).ToArray();
                int ppu = AgentJob.Int("ppu", 16);
                string mode = AgentJob.Str("mode", "pixel");
                var rows = new List<object>();
                var ppus = new HashSet<float>();
                foreach (var guid in AssetDatabase.FindAssets("t:Texture2D", folders))
                {
                    var path = AssetDatabase.GUIDToAssetPath(guid);
                    var ti = AssetImporter.GetAtPath(path) as TextureImporter;
                    if (ti == null) continue;
                    ti.GetSourceTextureWidthAndHeight(out int w, out int h);
                    if (ti.textureType == TextureImporterType.NormalMap)
                    {
                        if (mode == "pixel" && ti.filterMode != FilterMode.Point)
                            f.Add("warn", "2d.normal_filter", path, "normal map of pixel art is " + ti.filterMode, "Point filter, like the colour sprite");
                        continue;
                    }
                    if (ti.textureType != TextureImporterType.Sprite)
                    {
                        f.Add("warn", "2d.not_sprite", path, "texture in a sprite folder imported as " + ti.textureType, "Texture Type Sprite (2D and UI)");
                        continue;
                    }
                    ppus.Add(ti.spritePixelsPerUnit);
                    if (mode == "pixel")
                    {
                        if (Math.Abs(ti.spritePixelsPerUnit - ppu) > 0.01f)
                            f.Add("error", "2d.ppu", path, "PPU " + ti.spritePixelsPerUnit + " != project pixel PPU " + ppu, "one PPU for every pixel sprite = Pixel Perfect Camera Assets PPU");
                        if (ti.filterMode != FilterMode.Point)
                            f.Add("error", "2d.filter", path, "Filter " + ti.filterMode + ": pixel art blurs", "Filter Mode Point");
                        if (ti.textureCompression != TextureImporterCompression.Uncompressed)
                            f.Add("error", "2d.compression", path, "Compression " + ti.textureCompression + " shifts pixel colours", "Compression None");
                        if (ti.mipmapEnabled)
                            f.Add("warn", "2d.mipmaps", path, "mipmaps on a pixel sprite", "Generate Mip Maps off");
                    }
                    else if (ti.textureCompression != TextureImporterCompression.Uncompressed)
                        f.Add("warn", "2d.double_compression", path, "source compressed (" + ti.textureCompression + "): double compression once packed", "source Compression None, compress on the atlas");
                    if (ti.maxTextureSize < Math.Max(w, h))
                        f.Add("error", "2d.max_size", path, "Max Size " + ti.maxTextureSize + " < " + Math.Max(w, h) + ": Unity resamples the sprite", "Max Size >= largest side");
                    if (ti.isReadable)
                        f.Add("warn", "2d.readable", path, "Read/Write on: source kept in memory next to the atlas", "Read/Write off unless CPU pixel access is needed");
                    rows.Add(new Dictionary<string, object> { { "path", path }, { "ppu", ti.spritePixelsPerUnit }, { "filter", ti.filterMode.ToString() }, { "compression", ti.textureCompression.ToString() } });
                }
                if (mode == "pixel" && ppus.Count > 1)
                    f.Add("error", "2d.ppu_mixed", string.Join(",", folders), "mixed PPU values: " + string.Join(", ", ppus), "one PPU for the whole pixel-art set");
                return new Dictionary<string, object> { { "counts", f.Counts() }, { "findings", f.items }, { "textures", rows.Count }, { "ppus", ppus.ToList() } };
            });
        }

        public static int NextPow2(int v)
        {
            int p = 32;
            while (p < v) p <<= 1;
            return Math.Min(Math.Max(p, 32), 16384);
        }
    }
}
