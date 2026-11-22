// scenario-unity-mobile v0.2 (Unity Expert Skills, 2026-09-24). Mobile audio import audit and fix, the
// memory the imported clips really take, and a mesh Read/Write check.
//
// Jobs (launch with build_target="Android" or "iOS"):
//   AuditAudio     args: folders ["Assets"], small_kb (200), large_kb (400), sfx_rate (22050), stereo_ok [paths]
//   FixAudio       same args; writes the default sample settings (and Android/iOS overrides when present)
//   ImportedAudio  args: folders -> per clip: load type, channels, frequency, length, imported size (active target)
//   AuditMeshes    args: folders -> ModelImporter Read/Write (doubles memory), mesh compression (disk only)
// Expert basis (Unity mobile e-book, Audio; Import textures correctly; Adjust mesh import settings):
// import uncompressed WAV sources (a compressed source is decoded and re-encoded: two lossy passes);
// 3D sounds mono or Force To Mono; sound effects at most 22,050 Hz on mobile; load type by clip size:
// small (< 200 KB) Decompress On Load or Compressed In Memory with ADPCM (fixed 3.5:1), medium
// (>= 200 KB) Compressed In Memory when memory matters, large (> 350 to 400 KB) Streaming, which has
// about 200 KB overhead so never for small clips; Vorbis for most sounds, ADPCM for short frequent
// ones. "Clip size" is read here as the source file size [added interpretation]; mono is applied to
// small clips unless listed in stereo_ok [added default: music and stereo UI stings stay stereo].
// Read/Write on meshes doubles memory; mesh compression shrinks disk, not runtime memory.
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-mobile/test_live_assets.py.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEngine;

namespace AgentKit.Mobile
{
    public static class MobileAudio
    {
        public enum Size { Small, Medium, Large }

        public static Size Bucket(long bytes, int smallKb = 200, int largeKb = 400)
            => bytes < smallKb * 1024L ? Size.Small : bytes > largeKb * 1024L ? Size.Large : Size.Medium;

        static IEnumerable<string> ClipPaths(IList<object> folders)
        {
            var fs = (folders == null || folders.Count == 0) ? new[] { "Assets" } : folders.Select(f => f.ToString()).ToArray();
            return AssetDatabase.FindAssets("t:AudioClip", fs).Select(AssetDatabase.GUIDToAssetPath)
                .Where(p => p.StartsWith("Assets/") && AssetImporter.GetAtPath(p) is AudioImporter).Distinct().OrderBy(p => p);
        }

        static long SourceBytes(string path) { try { return new FileInfo(path).Length; } catch (Exception) { return 0; } }

        /// <summary>The settings the rules want for a clip of this size (shared with MobileImportRules).</summary>
        public static AudioImporterSampleSettings Wanted(AudioImporterSampleSettings s, Size size, int sfxRate)
        {
            switch (size)
            {
                case Size.Small:
                    s.loadType = AudioClipLoadType.CompressedInMemory; s.compressionFormat = AudioCompressionFormat.ADPCM;
                    s.sampleRateSetting = AudioSampleRateSetting.OverrideSampleRate; s.sampleRateOverride = (uint)sfxRate; break;
                case Size.Medium:
                    s.loadType = AudioClipLoadType.CompressedInMemory; s.compressionFormat = AudioCompressionFormat.Vorbis; s.quality = 0.5f; break;
                default:
                    s.loadType = AudioClipLoadType.Streaming; s.compressionFormat = AudioCompressionFormat.Vorbis; s.quality = 0.5f;
                    s.sampleRateSetting = AudioSampleRateSetting.PreserveSampleRate; break;
            }
            return s;
        }

        // ------------------------------------------------------------------ AuditAudio
        public static void AuditAudio()
        {
            AgentJob.Run(() =>
            {
                var f = new AgentAudit.Findings();
                int smallKb = AgentJob.Int("small_kb", 200), largeKb = AgentJob.Int("large_kb", 400), rate = AgentJob.Int("sfx_rate", 22050);
                var stereoOk = new HashSet<string>(AgentJob.List("stereo_ok").Select(x => x.ToString()));
                var list = new List<object>();
                foreach (var path in ClipPaths(AgentJob.List("folders")))
                {
                    var ai = (AudioImporter)AssetImporter.GetAtPath(path);
                    long bytes = SourceBytes(path);
                    var size = Bucket(bytes, smallKb, largeKb);
                    var ext = Path.GetExtension(path).ToLowerInvariant();
                    var clip = AssetDatabase.LoadAssetAtPath<AudioClip>(path);
                    var s = ai.defaultSampleSettings;
                    foreach (var plat in new[] { "Android", "iOS" })
                        if (ai.ContainsSampleSettingsOverride(plat)) s = ai.GetOverrideSampleSettings(plat);   // the device reads the override
                    list.Add(new Dictionary<string, object>
                    {
                        { "path", path }, { "source_kb", Math.Round(bytes / 1024.0, 1) }, { "bucket", size.ToString().ToLowerInvariant() },
                        { "load_type", s.loadType.ToString() }, { "format", s.compressionFormat.ToString() },
                        { "sample_rate", s.sampleRateSetting == AudioSampleRateSetting.OverrideSampleRate ? (int)s.sampleRateOverride : (clip ? clip.frequency : 0) },
                        { "channels", clip ? clip.channels : 0 }, { "force_mono", ai.forceToMono }, { "length_s", clip ? Math.Round(clip.length, 2) : 0 },
                    });
                    if (ext == ".mp3" || ext == ".ogg")
                        f.Add("warn", "mobile.audio.compressed_source", path, ext + " source: Unity decodes and re-encodes it at build (two lossy passes)", "import the uncompressed WAV original");
                    if (size == Size.Small && s.loadType == AudioClipLoadType.Streaming)
                        f.Add("warn", "mobile.audio.stream_small", path, "Streaming a " + (bytes / 1024) + " KB clip: about 200 KB overhead per stream", "Compressed In Memory + ADPCM, or Decompress On Load");
                    if (size == Size.Large && s.loadType == AudioClipLoadType.DecompressOnLoad)
                        f.Add("warn", "mobile.audio.large_decompressed", path, "Decompress On Load on a " + (bytes / 1024) + " KB clip: the whole PCM stays in memory", "Streaming (Vorbis) for music, ambience and long dialog");
                    else if (size == Size.Large && s.loadType == AudioClipLoadType.CompressedInMemory)
                        f.Add("info", "mobile.audio.large_in_memory", path, "large clip Compressed In Memory", "Streaming unless it must start instantly or loop seamlessly");
                    if (s.compressionFormat == AudioCompressionFormat.PCM && size != Size.Small)
                        f.Add("warn", "mobile.audio.pcm", path, "PCM (uncompressed) on a " + size.ToString().ToLowerInvariant() + " clip", "Vorbis (ADPCM for short frequent sounds)");
                    int effRate = s.sampleRateSetting == AudioSampleRateSetting.OverrideSampleRate ? (int)s.sampleRateOverride : (clip ? clip.frequency : 0);
                    if (size == Size.Small && effRate > rate)
                        f.Add("warn", "mobile.audio.sfx_sample_rate", path, "sound effect at " + effRate + " Hz", "Override Sample Rate " + rate + " Hz (e-book: at most 22,050 Hz for mobile SFX)");
                    if (size == Size.Small && clip && clip.channels > 1 && !ai.forceToMono && !stereoOk.Contains(path))
                        f.Add("info", "mobile.audio.stereo_sfx", path, "stereo sound effect", "Force To Mono (3D sounds are flattened to mono at runtime anyway), or list it in stereo_ok");
                }
                return new Dictionary<string, object> { { "clips", list }, { "findings", f.items }, { "counts", f.Counts() }, { "active_target", EditorUserBuildSettings.activeBuildTarget.ToString() } };
            });
        }

        // ------------------------------------------------------------------ FixAudio
        public static void FixAudio()
        {
            AgentJob.Run(() =>
            {
                int smallKb = AgentJob.Int("small_kb", 200), largeKb = AgentJob.Int("large_kb", 400), rate = AgentJob.Int("sfx_rate", 22050);
                var stereoOk = new HashSet<string>(AgentJob.List("stereo_ok").Select(x => x.ToString()));
                var changed = new List<object>();
                AssetDatabase.StartAssetEditing();
                try
                {
                    foreach (var path in ClipPaths(AgentJob.List("folders")))
                    {
                        var ai = (AudioImporter)AssetImporter.GetAtPath(path);
                        var size = Bucket(SourceBytes(path), smallKb, largeKb);
                        ai.defaultSampleSettings = Wanted(ai.defaultSampleSettings, size, rate);
                        foreach (var plat in new[] { "Android", "iOS" })
                            if (ai.ContainsSampleSettingsOverride(plat)) ai.SetOverrideSampleSettings(plat, Wanted(ai.GetOverrideSampleSettings(plat), size, rate));
                        if (size == Size.Small && !stereoOk.Contains(path)) ai.forceToMono = true;
                        ai.SaveAndReimport();
                        changed.Add(new Dictionary<string, object> { { "path", path }, { "bucket", size.ToString().ToLowerInvariant() }, { "load_type", ai.defaultSampleSettings.loadType.ToString() },
                                                                     { "format", ai.defaultSampleSettings.compressionFormat.ToString() }, { "mono", ai.forceToMono } });
                    }
                }
                finally { AssetDatabase.StopAssetEditing(); }
                return new Dictionary<string, object> { { "changed", changed }, { "count", changed.Count } };
            });
        }

        // ------------------------------------------------------------------ ImportedAudio
        public static void ImportedAudio()
        {
            AgentJob.Run(() =>
            {
                // Imported size = what the AudioClip inspector shows as "Imported Size" for the active
                // target (internal AudioImporter.compSize / origSize, read by reflection; -1 if a later
                // Unity renames them). Profiler.GetRuntimeMemorySizeLong(clip) is NOT used: in the Editor it
                // reported about 0.6 KB for every clip whatever the settings (observed).
                var comp = typeof(AudioImporter).GetProperty("compSize", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Public);
                var orig = typeof(AudioImporter).GetProperty("origSize", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Public);
                var list = new List<object>();
                long total = 0, totalOrig = 0;
                foreach (var path in ClipPaths(AgentJob.List("folders")))
                {
                    var clip = AssetDatabase.LoadAssetAtPath<AudioClip>(path);
                    var ai = (AudioImporter)AssetImporter.GetAtPath(path);
                    if (clip == null) continue;
                    long c = comp != null ? Convert.ToInt64(comp.GetValue(ai)) : -1, o = orig != null ? Convert.ToInt64(orig.GetValue(ai)) : -1;
                    if (c > 0) total += c;
                    if (o > 0) totalOrig += o;
                    list.Add(new Dictionary<string, object>
                    {
                        { "path", path }, { "load_type", clip.loadType.ToString() }, { "channels", clip.channels }, { "frequency", clip.frequency },
                        { "length_s", Math.Round(clip.length, 2) }, { "imported_kb", c > 0 ? Math.Round(c / 1024.0, 1) : -1 }, { "original_kb", o > 0 ? Math.Round(o / 1024.0, 1) : -1 },
                    });
                }
                return new Dictionary<string, object> { { "clips", list }, { "total_imported_mb", Math.Round(total / 1048576.0, 3) }, { "total_original_mb", Math.Round(totalOrig / 1048576.0, 3) },
                                                        { "size_api", comp != null }, { "active_target", EditorUserBuildSettings.activeBuildTarget.ToString() } };
            });
        }

        // ------------------------------------------------------------------ AuditMeshes
        public static void AuditMeshes()
        {
            AgentJob.Run(() =>
            {
                var f = new AgentAudit.Findings();
                var fs = AgentJob.List("folders").Select(x => x.ToString()).ToArray();
                if (fs.Length == 0) fs = new[] { "Assets" };
                var whitelist = new HashSet<string>(AgentJob.List("readable_whitelist").Select(x => x.ToString()));
                int n = 0;
                foreach (var path in AssetDatabase.FindAssets("t:Model", fs).Select(AssetDatabase.GUIDToAssetPath).Distinct())
                {
                    if (!(AssetImporter.GetAtPath(path) is ModelImporter mi)) continue;
                    n++;
                    if (mi.isReadable && !whitelist.Contains(path)) f.Add("warn", "mobile.mesh.readable", path, "Read/Write on: a CPU copy of every mesh (double memory)", "off unless scripts read or modify the mesh");
                    if (mi.meshCompression != ModelImporterMeshCompression.Off) f.Add("info", "mobile.mesh.compression", path, "mesh compression " + mi.meshCompression + ": smaller build, same runtime memory", "keep for download size only; never count it as a memory saving");
                    if (mi.importBlendShapes && mi.importAnimation == false && mi.animationType == ModelImporterAnimationType.None)
                        f.Add("info", "mobile.mesh.blendshapes_unused", path, "blend shapes imported on a static model", "Import BlendShapes off when unused");
                }
                return new Dictionary<string, object> { { "models", n }, { "findings", f.items }, { "counts", f.Counts() } };
            });
        }
    }
}
