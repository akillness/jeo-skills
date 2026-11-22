// scenario-unity-ui runtime (Unity Expert Skills v0.1, 2026-09-24). Settings data, persistence and apply,
// separate from the screen so the game applies them at boot even if the screen never opens.
// Volumes: slider 0..1 -> dB = 20*log10(v) with a 0.0001 floor (-80 dB); the player's slider must own
// an exposed mixer parameter that no snapshot drives (scenario-unity-gameplay owns the mixer and that trap).
// Resolution: distinct width x height from Screen.resolutions, applied with Screen.SetResolution;
// hidden on mobile (a render-scale option belongs to scenario-unity-rendering-lighting there).
// Key bindings: InputActionAsset.SaveBindingOverridesAsJson / LoadBindingOverridesFromJson.
using System;
using System.Collections.Generic;
using System.IO;
using UnityEngine;
using UnityEngine.Audio;
using UnityEngine.InputSystem;

namespace AgentUI
{
    [Serializable]
    public class SettingsData
    {
        public int width, height;               // 0 = keep the current resolution
        public int quality = -1;                // -1 = keep the current quality level
        public float master = 1f, music = 0.8f, sfx = 0.8f;
        public string bindings = "";            // InputActionAsset overrides JSON
    }

    public static class SettingsService
    {
        public const float MinLinear = 0.0001f;
        public static string MasterParam = "MasterVol", MusicParam = "MusicVol", SfxParam = "SFXVol";

        public static SettingsData Current { get; private set; } = new SettingsData();
        public static string DefaultPath => Path.Combine(Application.persistentDataPath, "settings.json");

        public static float LinearToDb(float v) => 20f * Mathf.Log10(Mathf.Clamp(v, MinLinear, 1f));

        public static SettingsData Load(string path = null)
        {
            path = path ?? DefaultPath;
            Current = File.Exists(path) ? JsonUtility.FromJson<SettingsData>(File.ReadAllText(path)) ?? new SettingsData() : new SettingsData();
            return Current;
        }

        public static void Save(SettingsData d = null, string path = null)
        {
            d = d ?? Current;
            path = path ?? DefaultPath;
            Directory.CreateDirectory(Path.GetDirectoryName(path));
            File.WriteAllText(path, JsonUtility.ToJson(d, true));
        }

        /// <summary>Distinct resolutions (refresh rates collapsed), largest last.</summary>
        public static List<Vector2Int> Resolutions()
        {
            var set = new SortedSet<long>();
            var list = new List<Vector2Int>();
            foreach (var r in Screen.resolutions)
            {
                long key = (long)r.width * 100000 + r.height;
                if (set.Add(key)) list.Add(new Vector2Int(r.width, r.height));
            }
            if (list.Count == 0) list.Add(new Vector2Int(Screen.width, Screen.height));
            list.Sort((a, b) => (a.x * a.y).CompareTo(b.x * b.y));
            return list;
        }

        public static void ApplyVolumes(SettingsData d, AudioMixer mixer)
        {
            if (mixer != null)
            {
                mixer.SetFloat(MasterParam, LinearToDb(d.master));
                mixer.SetFloat(MusicParam, LinearToDb(d.music));
                mixer.SetFloat(SfxParam, LinearToDb(d.sfx));
            }
            else AudioListener.volume = Mathf.Clamp01(d.master); // no mixer yet: master only
        }

        public static void Apply(SettingsData d, AudioMixer mixer, InputActionAsset actions)
        {
            Current = d;
            if (d.quality >= 0 && d.quality < QualitySettings.names.Length && d.quality != QualitySettings.GetQualityLevel())
                QualitySettings.SetQualityLevel(d.quality, true);
            if (d.width > 0 && d.height > 0 && !Application.isMobilePlatform && !Application.isEditor)
                Screen.SetResolution(d.width, d.height, Screen.fullScreenMode);
            ApplyVolumes(d, mixer);
            if (actions != null && !string.IsNullOrEmpty(d.bindings)) actions.LoadBindingOverridesFromJson(d.bindings);
        }

        public static void CaptureBindings(SettingsData d, InputActionAsset actions)
        {
            if (actions != null) d.bindings = actions.SaveBindingOverridesAsJson();
        }
    }
}
