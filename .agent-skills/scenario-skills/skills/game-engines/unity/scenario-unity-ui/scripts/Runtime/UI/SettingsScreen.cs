// scenario-unity-ui runtime (Unity Expert Skills v0.2, 2026-09-24). Settings screen controller (uGUI + TMP):
// resolution, quality, three volumes and the rebind rows. It only maps widgets to SettingsData and
// calls SettingsService; the service applies and saves. Listeners are added in OnEnable and removed
// in OnDisable (every += has its -=: Jason Weimann, 6ztY9-IX3Qg [00:34:15]).
// Localisation: the resolution and quality options are filled in code, so a Localize component on the
// dropdown never reaches them; call OnLocaleChanged from the locale event (Localization package:
// LocalizationSettings.SelectedLocaleChanged) and they are refilled through `localize`, keeping the
// selection (Imphenzia, NFn74l2WA_8 [00:12:56]).
using System;
using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.Audio;
using UnityEngine.UI;

namespace AgentUI
{
    public class SettingsScreen : MonoBehaviour
    {
        public TMP_Dropdown resolution;
        public TMP_Dropdown quality;
        public Slider master, music, sfx;
        public TMP_Text masterValue, musicValue, sfxValue;
        public List<RebindRow> rebindRows = new List<RebindRow>();
        public AudioMixer mixer;
        public bool saveOnChange = true;
        public string savePath;                 // empty = SettingsService.DefaultPath
        /// <summary>Key or English text -> current locale text, for code-filled option labels
        /// (quality level names, the "{0} x {1}" resolution format). null = unchanged.</summary>
        public Func<string, string> localize;

        List<Vector2Int> m_Resolutions = new List<Vector2Int>();
        public IReadOnlyList<Vector2Int> ResolutionOptions => m_Resolutions;
        SettingsData D => SettingsService.Current;

        void OnEnable()
        {
            Populate();
            if (resolution != null) resolution.onValueChanged.AddListener(OnResolution);
            if (quality != null) quality.onValueChanged.AddListener(OnQuality);
            if (master != null) master.onValueChanged.AddListener(OnMaster);
            if (music != null) music.onValueChanged.AddListener(OnMusic);
            if (sfx != null) sfx.onValueChanged.AddListener(OnSfx);
            RebindRow.Rebound += OnRebound;
        }

        void OnDisable()
        {
            if (resolution != null) resolution.onValueChanged.RemoveListener(OnResolution);
            if (quality != null) quality.onValueChanged.RemoveListener(OnQuality);
            if (master != null) master.onValueChanged.RemoveListener(OnMaster);
            if (music != null) music.onValueChanged.RemoveListener(OnMusic);
            if (sfx != null) sfx.onValueChanged.RemoveListener(OnSfx);
            RebindRow.Rebound -= OnRebound;
        }

        /// <summary>Fill the widgets from the platform and the current settings without firing callbacks.</summary>
        public void Populate()
        {
            m_Resolutions = SettingsService.Resolutions();
            if (resolution != null)
            {
                bool mobile = Application.isMobilePlatform;
                RowOf(resolution).SetActive(!mobile); // the whole row: no resolution list on phones
                var opts = new List<string>();
                int cur = m_Resolutions.Count - 1;
                for (int i = 0; i < m_Resolutions.Count; i++)
                {
                    opts.Add(string.Format(L("{0} x {1}"), m_Resolutions[i].x, m_Resolutions[i].y));
                    if (m_Resolutions[i].x == (D.width > 0 ? D.width : Screen.width) && m_Resolutions[i].y == (D.height > 0 ? D.height : Screen.height)) cur = i;
                }
                resolution.ClearOptions();
                resolution.AddOptions(opts);
                resolution.SetValueWithoutNotify(cur);
            }
            if (quality != null)
            {
                // runtime names = levels not excluded for this platform; one level = nothing to choose
                var names = QualitySettings.names;
                quality.ClearOptions();
                var labels = new List<string>(names.Length);
                foreach (var n in names) labels.Add(L(n));
                quality.AddOptions(labels);
                quality.SetValueWithoutNotify(D.quality >= 0 && D.quality < names.Length ? D.quality : QualitySettings.GetQualityLevel());
                RowOf(quality).SetActive(names.Length >= 2);
            }
            SetSlider(master, masterValue, D.master);
            SetSlider(music, musicValue, D.music);
            SetSlider(sfx, sfxValue, D.sfx);
            foreach (var r in rebindRows) if (r != null) r.Refresh();
        }

        string L(string key) => localize != null ? localize(key) : key;

        /// <summary>Refill the code-generated option labels in the new locale; values and selection stay.
        /// Subscribe it to the locale-changed event in OnEnable and unsubscribe in OnDisable.</summary>
        public void OnLocaleChanged() => Populate();

        /// <summary>The settings row that holds a control (the ancestor named "Row ..."), or the control's parent.</summary>
        static GameObject RowOf(Component c)
        {
            for (var t = c.transform.parent; t != null; t = t.parent)
                if (t.name.StartsWith("Row ")) return t.gameObject;
            return c.transform.parent.gameObject;
        }

        static void SetSlider(Slider s, TMP_Text label, float v)
        {
            if (s != null) s.SetValueWithoutNotify(v);
            if (label != null) label.text = Mathf.RoundToInt(v * 100f) + "%";
        }

        public void OnResolution(int i)
        {
            if (i < 0 || i >= m_Resolutions.Count) return;
            D.width = m_Resolutions[i].x; D.height = m_Resolutions[i].y;
            Commit();
        }

        public void OnQuality(int i) { D.quality = i; Commit(); }
        public void OnMaster(float v) { D.master = v; SetSlider(null, masterValue, v); Commit(); }
        public void OnMusic(float v) { D.music = v; SetSlider(null, musicValue, v); Commit(); }
        public void OnSfx(float v) { D.sfx = v; SetSlider(null, sfxValue, v); Commit(); }

        void OnRebound(RebindRow row)
        {
            SettingsService.CaptureBindings(D, row.Asset);
            Commit();
        }

        void Commit()
        {
            var actions = rebindRows.Count > 0 && rebindRows[0] != null ? rebindRows[0].Asset : null;
            SettingsService.Apply(D, mixer, actions);
            if (saveOnChange) SettingsService.Save(D, string.IsNullOrEmpty(savePath) ? null : savePath);
        }
    }
}
