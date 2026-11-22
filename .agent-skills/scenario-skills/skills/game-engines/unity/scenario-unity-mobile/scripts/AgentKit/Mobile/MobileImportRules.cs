// scenario-unity-mobile v0.2 (Unity Expert Skills, 2026-09-24). Import rules locked in with an
// AssetPostprocessor, so assets added after the audit arrive compliant instead of waiting for the
// next FixTextures / FixAudio pass (Unity Enterprise Support, j4YAY36xjwE [00:19:07] to [00:20:18];
// Unity mobile e-book, Automate your import settings with Presets and AssetPostprocessor).
// Active only when Assets/AgentMobile/import_rules.json exists (nothing changes silently), and only on
// the FIRST import of an asset (assetImporter.importSettingsMissing), so a later deliberate manual
// change is respected. Example config:
//   { "folders": ["Assets/Art"], "ui_folders": ["Assets/Art/UI"], "large_min": 2048,
//     "formats": {"default":"ASTC_6x6","ui":"ASTC_4x4","normal":"ASTC_6x6","large":"ASTC_8x8","hdr":"ASTC_HDR_6x6"},
//     "caps": {"default":1024,"large":1024,"ui":512,"normal":1024,"hdr":256},
//     "audio": true, "sfx_rate": 22050, "meshes_read_write_off": true }
// Same categories and formats as MobileTextures.FixTextures and MobileAudio.FixAudio.
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-mobile/test_live_assets.py.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEngine;

namespace AgentKit.Mobile
{
    public class MobileImportRules : AssetPostprocessor
    {
        public const string RulesPath = "Assets/AgentMobile/import_rules.json";
        public override int GetPostprocessOrder() => 50;

        static Dictionary<string, object> Rules()
        {
            if (!File.Exists(RulesPath)) return null;
            try { return AgentJson.ParseObject(File.ReadAllText(RulesPath)); }
            catch (Exception e) { Debug.LogWarning("import_rules.json unreadable: " + e.Message); return null; }
        }

        static List<string> Strings(Dictionary<string, object> d, string k)
            => d != null && d.TryGetValue(k, out var v) && v is List<object> l ? l.Select(x => x.ToString().TrimEnd('/')).ToList() : new List<string>();

        static bool Under(string path, List<string> folders) => folders.Count == 0 || folders.Any(f => path.StartsWith(f + "/", StringComparison.Ordinal));

        static int Int(Dictionary<string, object> d, string k, int def) => d != null && d.TryGetValue(k, out var v) ? (int)AgentJson.ToDouble(v, def) : def;

        void OnPreprocessTexture()
        {
            if (!assetImporter.importSettingsMissing) return;
            var r = Rules();
            if (r == null || !Under(assetPath, Strings(r, "folders"))) return;
            var ti = (TextureImporter)assetImporter;
            if (Under(assetPath, Strings(r, "ui_folders")) && Strings(r, "ui_folders").Count > 0)
            {
                ti.textureType = TextureImporterType.Sprite;
                ti.spriteImportMode = SpriteImportMode.Single;
            }
            int w = 0, h = 0;
            try { ti.GetSourceTextureWidthAndHeight(out w, out h); } catch (Exception) { }
            var cat = MobileTextures.Category(ti, w, h, Int(r, "large_min", 2048));
            var formats = r.TryGetValue("formats", out var fv) ? fv as Dictionary<string, object> : null;
            var caps = r.TryGetValue("caps", out var cv) ? cv as Dictionary<string, object> : null;
            var def = cat == "ui" ? "ASTC_4x4" : cat == "large" ? "ASTC_8x8" : cat == "hdr" ? "ASTC_HDR_6x6" : "ASTC_6x6";
            var fmtName = formats != null && formats.TryGetValue(cat, out var f) ? f.ToString() : def;
            if (!Enum.TryParse(fmtName, out TextureImporterFormat fmt)) { Debug.LogWarning("import_rules: unknown format " + fmtName); return; }
            int cap = caps != null && caps.TryGetValue(cat, out var c) ? (int)AgentJson.ToDouble(c, 1024) : (cat == "ui" ? 512 : cat == "hdr" ? 256 : 1024);
            if (w > 0) cap = Math.Min(cap, Math.Max(32, Mathf.NextPowerOfTwo(Math.Max(w, h))));
            ti.isReadable = false;
            if (cat == "ui") ti.mipmapEnabled = false;
            ti.crunchedCompression = false;
            foreach (var p in new[] { "Android", "iPhone" })
            {
                var s = ti.GetPlatformTextureSettings(p);
                s.overridden = true; s.format = fmt; s.maxTextureSize = cap; s.compressionQuality = 50;
                ti.SetPlatformTextureSettings(s);
            }
        }

        void OnPreprocessAudio()
        {
            if (!assetImporter.importSettingsMissing) return;
            var r = Rules();
            if (r == null || !Under(assetPath, Strings(r, "folders"))) return;
            if (r.TryGetValue("audio", out var on) && on is bool b && !b) return;
            var ai = (AudioImporter)assetImporter;
            long bytes = 0;
            try { bytes = new FileInfo(assetPath).Length; } catch (Exception) { }
            var size = MobileAudio.Bucket(bytes, Int(r, "small_kb", 200), Int(r, "large_kb", 400));
            ai.defaultSampleSettings = MobileAudio.Wanted(ai.defaultSampleSettings, size, Int(r, "sfx_rate", 22050));
            if (size == MobileAudio.Size.Small && !Strings(r, "stereo_ok").Contains(assetPath)) ai.forceToMono = true;
        }

        void OnPreprocessModel()
        {
            if (!assetImporter.importSettingsMissing) return;
            var r = Rules();
            if (r == null || !Under(assetPath, Strings(r, "folders"))) return;
            if (r.TryGetValue("meshes_read_write_off", out var on) && on is bool b && !b) return;
            ((ModelImporter)assetImporter).isReadable = false;
        }
    }
}
