// scenario-unity-mobile v0.2 (Unity Expert Skills, 2026-09-24). Mobile texture import audit and fix
// (ASTC by category), plus a report of what the ACTIVE build target actually imported.
//
// Jobs (launch with build_target="Android" or "iOS" so the imported format is the device one):
//   AuditTextures  args: folders ["Assets"], platforms ["Android","iPhone"], caps {default, ui, normal}, allow_etc2
//   FixTextures    args: folders, formats {default:"ASTC_6x6", ui:"ASTC_4x4", normal:"ASTC_6x6", large:"ASTC_8x8",
//                  hdr:"ASTC_HDR_6x6"}, caps, large_min (px), readable_whitelist [paths]
//   ImportedFormats args: folders -> per texture: Texture2D.format, size, mip count, runtime memory (editor, active target)
// Expert basis: ASTC is the default for LDR on iOS A8+ and GLES 3.1/Vulkan Android; a format the
// GPU cannot sample is decompressed on the CPU to RGBA32 (6.3 Manual); Android HDR = ASTC HDR only,
// else RGB9e5 or RGBA Half (2x memory); lower Max Size first, Read/Write doubles memory, no mips
// for UI/sprites (Unity mobile e-book); crunch does not change an ASTC texture (Unity,
// 2J0kDtUGlrY [frame 00:26:18]); ASTC block per class: small blocks for UI and faces, 8x8 for big
// environment maps [added]. PVRTC is deprecated in 6.1 and removed in 6.4.
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-mobile/test_live_textures.py.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEngine;
using UnityEngine.Profiling;

namespace AgentKit.Mobile
{
    public static class MobileTextures
    {
        static readonly string[] Compressed = { "ASTC", "ETC", "EAC", "PVRTC", "BC", "DXT" };

        public static bool IsCompressed(TextureImporterFormat f)
        {
            if (f == TextureImporterFormat.Automatic) return true; // resolved elsewhere
            var n = f.ToString();
            return Compressed.Any(p => n.StartsWith(p, StringComparison.Ordinal)) || n.Contains("Crunched");
        }

        static IEnumerable<string> TexturePaths(IList<object> folders)
        {
            var fs = (folders == null || folders.Count == 0) ? new[] { "Assets" } : folders.Select(f => f.ToString()).ToArray();
            return AssetDatabase.FindAssets("t:Texture2D", fs).Select(AssetDatabase.GUIDToAssetPath)
                .Where(p => p.StartsWith("Assets/") && !p.Contains("/Editor/") && AssetImporter.GetAtPath(p) is TextureImporter)
                .Distinct().OrderBy(p => p);
        }

        internal static string Category(TextureImporter ti, int w, int h, int largeMin)
        {
            var ext = Path.GetExtension(ti.assetPath).ToLowerInvariant();
            if (ext == ".exr" || ext == ".hdr") return "hdr";
            if (ti.textureType == TextureImporterType.Sprite || ti.textureType == TextureImporterType.GUI) return "ui";
            if (ti.textureType == TextureImporterType.NormalMap) return "normal";
            if (Math.Max(w, h) >= largeMin && ti.textureType == TextureImporterType.Default) return "large";
            return "default";
        }

        static int Cap(Dictionary<string, object> caps, string cat, int def)
        {
            if (caps == null) return def;
            if (caps.TryGetValue(cat, out var v)) return (int)AgentJson.ToDouble(v, def);
            if (cat == "large" && caps.TryGetValue("default", out var d)) return (int)AgentJson.ToDouble(d, def);
            return def;
        }

        // ------------------------------------------------------------------ AuditTextures
        public static void AuditTextures()
        {
            AgentJob.Run(() =>
            {
                var f = new AgentAudit.Findings();
                var platforms = AgentJob.List("platforms").Select(p => p.ToString()).ToList();
                if (platforms.Count == 0) platforms = new List<string> { "Android", "iPhone" };
                var caps = AgentJob.Dict("caps");
                bool allowEtc2 = AgentJob.Bool("allow_etc2");
                int largeMin = AgentJob.Int("large_min", 2048);
                var list = new List<object>();
                foreach (var path in TexturePaths(AgentJob.List("folders")))
                {
                    var ti = (TextureImporter)AssetImporter.GetAtPath(path);
                    ti.GetSourceTextureWidthAndHeight(out int w, out int h);
                    var cat = Category(ti, w, h, largeMin);
                    var d = new Dictionary<string, object>
                    {
                        { "path", path }, { "category", cat }, { "type", ti.textureType.ToString() }, { "source_size", new[] { w, h } },
                        { "mipmaps", ti.mipmapEnabled }, { "readable", ti.isReadable }, { "crunched", ti.crunchedCompression },
                        { "compression", ti.textureCompression.ToString() }, { "max_size", ti.maxTextureSize },
                    };
                    var plats = new Dictionary<string, object>();
                    foreach (var p in platforms)
                    {
                        var s = ti.GetPlatformTextureSettings(p);
                        var auto = ti.GetAutomaticFormat(p);
                        var eff = s.overridden ? s.format : auto;
                        int effMax = s.overridden ? s.maxTextureSize : ti.maxTextureSize;
                        plats[p] = new Dictionary<string, object>
                        {
                            { "overridden", s.overridden }, { "format", s.format.ToString() }, { "automatic", auto.ToString() },
                            { "effective", eff.ToString() }, { "max_size", effMax },
                        };
                        var where = path + "@" + p;
                        var en = eff.ToString();
                        bool uncompressed = !IsCompressed(eff) || (!s.overridden && ti.textureCompression == TextureImporterCompression.Uncompressed);
                        if (uncompressed)
                            f.Add("error", "mobile.texture.uncompressed", where, $"{en} on {p}: {w}x{h} stays uncompressed ({Math.Min(w, effMax) * Math.Min(h, effMax) * 4 / 1048576f:0.0} MB before mips)",
                                  "ASTC override (" + (cat == "ui" ? "4x4" : cat == "large" ? "8x8" : "6x6") + ")");
                        else if (en.StartsWith("PVRTC"))
                            f.Add("error", "mobile.texture.pvrtc", where, "PVRTC: deprecated in 6.1, removed in 6.4", "ASTC");
                        else if (en.StartsWith("ETC_") || en == "ETC_RGB4")
                            f.Add("warn", "mobile.texture.etc1", where, en + ": ETC1 has no alpha and is only for very old GPUs", "ASTC (or ETC2 if the min-spec requires it)");
                        else if (en.StartsWith("ETC2") && !allowEtc2)
                            f.Add("warn", "mobile.texture.etc2", where, en + " on " + p + ": larger and lower quality than ASTC on GLES 3.1/Vulkan-class GPUs", "ASTC, unless the min-spec GPU list lacks ASTC");
                        if (cat == "hdr" && p == "Android" && !en.StartsWith("ASTC_HDR"))
                            f.Add("warn", "mobile.texture.hdr_fallback", where, "HDR texture as " + en + " on Android: only ASTC HDR is compressed; devices without it fall back to RGB9e5 (no alpha) or RGBA Half (2x memory)", "ASTC_HDR_6x6 override");
                        if (ti.crunchedCompression && en.StartsWith("ASTC"))
                            f.Add("info", "mobile.texture.crunch_on_astc", where, "Use Crunch Compression is ticked but the platform format is ASTC: crunch does not apply", "untick crunch (it only helps DXT/ETC download size, never GPU memory)");
                        if (!s.overridden)
                            f.Add("info", "mobile.texture.no_override", where, "no " + p + " override: the format follows the platform default (" + auto + ")", "set an explicit ASTC override per category");
                    }
                    d["platforms"] = plats;
                    int cap = Cap(caps, cat, 2048);
                    if (ti.isReadable) f.Add("warn", "mobile.texture.readable", path, "Read/Write on: CPU copy plus GPU copy (double memory)", "untick unless scripts read pixels");
                    if (cat == "ui" && ti.mipmapEnabled) f.Add("warn", "mobile.texture.ui_mipmaps", path, "mipmaps on a UI or sprite texture (a third more memory, blur)", "Generate Mip Maps off for constant-size UI and sprites");
                    if (Math.Max(w, h) > cap && ti.maxTextureSize > cap && platforms.All(p => !ti.GetPlatformTextureSettings(p).overridden || ti.GetPlatformTextureSettings(p).maxTextureSize > cap))
                        f.Add("warn", "mobile.texture.over_cap", path, $"source {w}x{h} can import at {ti.maxTextureSize} (cap for {cat}: {cap})", "lower Max Size in the mobile overrides, then check the blur at gameplay scale");
                    list.Add(d);
                }
                return new Dictionary<string, object>
                {
                    { "textures", list }, { "findings", f.items }, { "counts", f.Counts() },
                    { "active_target", EditorUserBuildSettings.activeBuildTarget.ToString() },
                    { "android_texture_compression_formats", PlayerSettings.Android.textureCompressionFormats.Select(x => x.ToString()).ToList() },
                    { "android_build_subtarget", EditorUserBuildSettings.androidBuildSubtarget.ToString() },
                    { "import_override", EditorUserBuildSettings.overrideTextureCompression.ToString() },
                };
            });
        }

        // ------------------------------------------------------------------ FixTextures
        public static void FixTextures()
        {
            AgentJob.Run(() =>
            {
                var platforms = AgentJob.List("platforms").Select(p => p.ToString()).ToList();
                if (platforms.Count == 0) platforms = new List<string> { "Android", "iPhone" };
                var formats = AgentJob.Dict("formats") ?? new Dictionary<string, object>();
                var caps = AgentJob.Dict("caps");
                int largeMin = AgentJob.Int("large_min", 2048);
                var whitelist = new HashSet<string>(AgentJob.List("readable_whitelist").Select(x => x.ToString()));
                string Fmt(string cat)
                {
                    var def = cat == "ui" ? "ASTC_4x4" : cat == "large" ? "ASTC_8x8" : cat == "hdr" ? "ASTC_HDR_6x6" : "ASTC_6x6";
                    return formats.TryGetValue(cat, out var v) ? v.ToString() : (cat == "large" && formats.TryGetValue("default", out var dv) ? dv.ToString() : def);
                }
                var changed = new List<object>();
                AssetDatabase.StartAssetEditing();
                try
                {
                    foreach (var path in TexturePaths(AgentJob.List("folders")))
                    {
                        var ti = (TextureImporter)AssetImporter.GetAtPath(path);
                        ti.GetSourceTextureWidthAndHeight(out int w, out int h);
                        var cat = Category(ti, w, h, largeMin);
                        var fmtName = Fmt(cat);
                        if (!Enum.TryParse(fmtName, out TextureImporterFormat fmt)) throw new ArgumentException("unknown TextureImporterFormat " + fmtName);
                        int cap = Math.Min(Cap(caps, cat, 2048), Math.Max(32, Mathf.NextPowerOfTwo(Math.Max(w, h))));
                        var edits = new List<string>();
                        if (ti.isReadable && !whitelist.Contains(path)) { ti.isReadable = false; edits.Add("readable=false"); }
                        if (cat == "ui" && ti.mipmapEnabled) { ti.mipmapEnabled = false; edits.Add("mipmaps=false"); }
                        if (ti.crunchedCompression && fmtName.StartsWith("ASTC")) { ti.crunchedCompression = false; edits.Add("crunch=false"); }
                        foreach (var p in platforms)
                        {
                            var s = ti.GetPlatformTextureSettings(p);
                            if (s.overridden && s.format == fmt && s.maxTextureSize <= cap) continue;
                            int prevMax = s.overridden ? s.maxTextureSize : ti.maxTextureSize;
                            s.overridden = true;
                            s.format = fmt;
                            s.maxTextureSize = Math.Min(prevMax > 0 ? prevMax : cap, cap);
                            s.compressionQuality = 50;
                            ti.SetPlatformTextureSettings(s);
                            edits.Add(p + "=" + fmtName + "@" + s.maxTextureSize);
                        }
                        if (edits.Count == 0) continue;
                        ti.SaveAndReimport();
                        changed.Add(new Dictionary<string, object> { { "path", path }, { "category", cat }, { "edits", edits } });
                    }
                }
                finally { AssetDatabase.StopAssetEditing(); }
                return new Dictionary<string, object> { { "changed", changed }, { "count", changed.Count } };
            });
        }

        // ------------------------------------------------------------------ ImportedFormats
        public static void ImportedFormats()
        {
            AgentJob.Run(() =>
            {
                var list = new List<object>();
                long total = 0;
                foreach (var path in TexturePaths(AgentJob.List("folders")))
                {
                    var tex = AssetDatabase.LoadAssetAtPath<Texture2D>(path);
                    if (tex == null) continue;
                    long mem = Profiler.GetRuntimeMemorySizeLong(tex);
                    total += mem;
                    list.Add(new Dictionary<string, object>
                    {
                        { "path", path }, { "format", tex.format.ToString() }, { "size", new[] { tex.width, tex.height } },
                        { "mips", tex.mipmapCount }, { "memory_kb", Math.Round(mem / 1024.0, 1) }, { "readable", tex.isReadable },
                    });
                }
                return new Dictionary<string, object>
                {
                    { "active_target", EditorUserBuildSettings.activeBuildTarget.ToString() }, { "textures", list },
                    { "total_memory_mb", Math.Round(total / 1048576.0, 3) },
                };
            });
        }
    }
}
