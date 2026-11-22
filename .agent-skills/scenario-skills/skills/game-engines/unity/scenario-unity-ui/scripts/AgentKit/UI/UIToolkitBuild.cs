// scenario-unity-ui AgentKit (Unity Expert Skills v0.2, 2026-09-24). UI Toolkit assets and scenes from text.
// UXML, USS and TSS are written as files by the runner (ut_ui.write_uitk_templates); these jobs
// import them, check the USS parser verdict, create the PanelSettings asset (there is no text format
// for it) and the scene. 6.3's upgraded USS parser (upgrade guide, "USS parser library upgrade": "it will
// block the file from importing"). Measured 2026-09-24: ANY error, an invalid value as much as a missing
// brace, leaves the asset as an EMPTY StyleSheet (importedWithErrors, 0 rules, the valid rules lost too);
// the scene still loads and the UI renders unstyled. ImportReport returns the rules kept per file.
//
// Jobs:
//   AgentKit.UI.UIToolkitBuild.BuildHud   args: folder ("Assets/AgentUI/HUD"), uxml ("Hud.uxml"),
//       theme ("AgentRuntimeTheme.tss"), scene ("Assets/AgentUI/Scenes/UI_HUD.unity"),
//       reference [1920,1080], match (0.5), vertex_budget (0 = automatic), sort_order (0),
//       driver_changes (false: a UiPerfDriver that changes HudModel.Ammo every frame when true)
//     -> PanelSettings asset "HudPanelSettings.asset" (Scale With Screen Size, Match, theme assigned),
//        a scene with a UIDocument (HudView + UiPerfDriver), and the import report of every
//        UXML/USS/TSS in the folder: {path, type, errors, warnings}.
//   AgentKit.UI.UIToolkitBuild.ImportReport   args: folder -> the same report only, plus per USS/TSS the
//       rules kept after import and its hard dependencies (textures, fonts, imported sheets) with their
//       in-memory size: loading a stylesheet loads everything it references (Borromeo, bECmaYIvZJg [00:41:31]).
//   AgentKit.UI.UIToolkitBuild.UitkGlyphs   async (graphics=True, quit=False), args: scene, text [..],
//       candidate_fallback_font (font file path, optional). Resolves the font a UI Toolkit Label really
//       uses in that panel, checks every string against it and the panel's Text Settings fallbacks, and
//       compares with the TMP chain: TMP fallbacks never reach UI Toolkit text.
//   AgentKit.UI.UIToolkitBuild.BindingSources   args: types [full names] -> per type: property bag class
//       (generated or reflected), [CreateProperty] members, change-tracking interfaces, attributes.
// USS/UXML import errors do not stop compilation: they surface as null or error-flagged assets and
// console lines, so every job that writes USS must read this report.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using AgentUI;
using TMPro;
using Unity.Properties;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Profiling;
using UnityEngine.TextCore.LowLevel;
using UnityEngine.TextCore.Text;
using UnityEngine.UIElements;
using FontAsset = UnityEngine.TextCore.Text.FontAsset;

namespace AgentKit.UI
{
    public static class UIToolkitBuild
    {
        public static void BuildHud()
        {
            AgentJob.Run(() =>
            {
                string folder = AgentJob.Str("folder", "Assets/AgentUI/HUD");
                string uxmlPath = folder + "/" + AgentJob.Str("uxml", "Hud.uxml");
                string tssPath = folder + "/" + AgentJob.Str("theme", "AgentRuntimeTheme.tss");
                string scenePath = AgentJob.Str("scene", "Assets/AgentUI/Scenes/UI_HUD.unity");
                // NewScene(Single) unloads unreferenced assets: create it BEFORE loading the UXML, or the
                // loaded VisualTreeAsset is destroyed under the job (observed 2026-09-24, MissingReferenceException)
                var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
                AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);
                var report = Report(folder);
                var uxml = AssetDatabase.LoadAssetAtPath<VisualTreeAsset>(uxmlPath);
                if (uxml == null) throw new InvalidOperationException("UXML did not import: " + uxmlPath);
                var theme = AssetDatabase.LoadAssetAtPath<ThemeStyleSheet>(tssPath);
                if (theme == null) throw new InvalidOperationException("theme did not import as ThemeStyleSheet: " + tssPath);

                var psPath = folder + "/HudPanelSettings.asset";
                var ps = AssetDatabase.LoadAssetAtPath<PanelSettings>(psPath);
                if (ps == null)
                {
                    ps = ScriptableObject.CreateInstance<PanelSettings>();
                    AssetDatabase.CreateAsset(ps, psPath);
                }
                ConfigurePanel(ps, theme, AgentJob.List("reference"), AgentJob.Float("match", 0.5f),
                               AgentJob.Int("vertex_budget", 0), AgentJob.Int("sort_order", 0));
                EditorUtility.SetDirty(ps);
                AssetDatabase.SaveAssets();

                var go = new GameObject("HUD");
                var doc = go.AddComponent<UIDocument>();
                doc.panelSettings = ps;
                doc.visualTreeAsset = uxml;
                go.AddComponent<HudView>();
                var drv = go.AddComponent<UiPerfDriver>();
                drv.hud = go.GetComponent<HudView>();
                drv.changeEveryFrame = AgentJob.Bool("driver_changes", false); // true: Ammo changes every frame (GC and binding cost runs)
                Directory.CreateDirectory(Path.GetDirectoryName(AgentJob.ResolvePath(scenePath)));
                EditorSceneManager.SaveScene(scene, scenePath);

                var names = new List<string>();
                var tree = uxml.CloneTree();
                tree.Query<VisualElement>().ForEach(e => { if (!string.IsNullOrEmpty(e.name)) names.Add(e.name); });
                return new Dictionary<string, object>
                {
                    { "scene", scenePath }, { "panel_settings", psPath }, { "theme", tssPath },
                    { "scale_mode", ps.scaleMode.ToString() }, { "reference", ps.referenceResolution },
                    { "match", ps.match }, { "screen_match_mode", ps.screenMatchMode.ToString() },
                    { "vertex_budget", (int)ps.vertexBudget }, { "texture_slot_count", ps.textureSlotCount.ToString() },
                    { "dynamic_atlas_max_subtexture", ps.dynamicAtlasSettings.maxSubTextureSize },
                    { "dynamic_atlas_filters", ps.dynamicAtlasSettings.activeFilters.ToString() },
                    { "sorting_order", ps.sortingOrder }, { "text_settings", ps.textSettings != null ? AssetDatabase.GetAssetPath(ps.textSettings) : null },
                    { "import", report }, { "named_elements", names },
                    { "import_errors", CountErrors(report) },
                };
            });
        }

        public static void ImportReport()
        {
            AgentJob.Run(() =>
            {
                AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);
                var r = Report(AgentJob.Str("folder", "Assets/AgentUI/HUD"));
                return new Dictionary<string, object> { { "import", r }, { "import_errors", CountErrors(r) } };
            });
        }

        public static void ConfigurePanel(PanelSettings ps, ThemeStyleSheet theme, List<object> reference, float match, int vertexBudget, int sortOrder)
        {
            ps.themeStyleSheet = theme;
            ps.scaleMode = PanelScaleMode.ScaleWithScreenSize;
            ps.screenMatchMode = PanelScreenMatchMode.MatchWidthOrHeight;
            ps.referenceResolution = reference != null && reference.Count == 2
                ? new Vector2Int((int)AgentJson.ToDouble(reference[0]), (int)AgentJson.ToDouble(reference[1]))
                : new Vector2Int(1920, 1080);
            ps.match = match;
            ps.sortingOrder = sortOrder;
            if (vertexBudget > 0) ps.vertexBudget = (uint)vertexBudget;   // public in 6.3 (Buffer Management > Vertex Budget)
        }

        // 6.3 PanelSettings members used here (API probe, 2026-09-24): vertexBudget (uint, 0 = automatic),
        // textureSlotCount (One/Two/Four/Eight), dynamicAtlasSettings (maxSubTextureSize, activeFilters),
        // sortingOrder (float), textSettings (PanelTextSettings), renderMode (ScreenSpace/WorldSpace),
        // SetPanelChangeReceiver(IDebugPanelChangeReceiver).

        /// <summary>Import verdict of every UXML/USS/TSS under a folder. StyleSheet exposes
        /// importedWithErrors/importedWithWarnings (read through reflection: internal on some versions).</summary>
        public static List<Dictionary<string, object>> Report(string folder)
        {
            var list = new List<Dictionary<string, object>>();
            foreach (var guid in AssetDatabase.FindAssets("", new[] { folder }))
            {
                var path = AssetDatabase.GUIDToAssetPath(guid);
                var ext = Path.GetExtension(path).ToLowerInvariant();
                if (ext != ".uss" && ext != ".tss" && ext != ".uxml") continue;
                var asset = AssetDatabase.LoadMainAssetAtPath(path);
                var row = new Dictionary<string, object> { { "path", path }, { "type", asset != null ? asset.GetType().Name : null } };
                if (asset is StyleSheet ss)
                {
                    row["errors"] = Flag(ss, "importedWithErrors");
                    row["warnings"] = Flag(ss, "importedWithWarnings");
                    row["rules"] = Flag(ss, "rules") is Array rules ? rules.Length : -1;   // rules that survived the parser
                    var deps = new List<object>();
                    long bytes = 0;
                    foreach (var d in AssetDatabase.GetDependencies(path, false))
                    {
                        if (d == path) continue;
                        var a = AssetDatabase.LoadMainAssetAtPath(d);
                        long b = a != null ? Profiler.GetRuntimeMemorySizeLong(a) : 0;
                        bytes += b;
                        deps.Add(new Dictionary<string, object> { { "path", d }, { "type", a != null ? a.GetType().Name : null }, { "bytes", b } });
                    }
                    row["dependencies"] = deps;
                    row["dependency_bytes"] = bytes;
                }
                else row["errors"] = asset == null;
                list.Add(row);
            }
            return list;
        }

        static object Flag(object o, string name)
        {
            var t = o.GetType();
            var p = t.GetProperty(name, BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance);
            if (p != null) return p.GetValue(o);
            var f = t.GetField(name, BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance);
            return f != null ? f.GetValue(o) : null;
        }

        static int CountErrors(List<Dictionary<string, object>> r)
        {
            int n = 0;
            foreach (var row in r) if (row.TryGetValue("errors", out var e) && e is bool b && b) n++;
            return n;
        }

        // ------------------------------------------------------------------ binding sources
        /// <summary>Is the binding source served by a generated property bag or by reflection? Borromeo
        /// (bECmaYIvZJg [00:33:15], [00:33:47]): bindings use reflection unless property bags are generated
        /// (class attribute AND the assembly marked for generation).</summary>
        public static void BindingSources()
        {
            AgentJob.Run(() =>
            {
                var rows = new List<object>();
                var asms = AppDomain.CurrentDomain.GetAssemblies();
                foreach (var o in AgentJob.List("types") ?? new List<object>())
                {
                    var name = o.ToString();
                    Type t = null;
                    foreach (var a in asms) { t = a.GetType(name, false); if (t != null) break; }
                    if (t == null) { rows.Add(new Dictionary<string, object> { { "type", name }, { "found", false } }); continue; }
                    var bag = PropertyBag.GetPropertyBag(t);
                    var bagType = bag != null ? bag.GetType().FullName : null;
                    int props = t.GetMembers(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance)
                        .Count(m => m.GetCustomAttributes(typeof(CreatePropertyAttribute), true).Length > 0);
                    rows.Add(new Dictionary<string, object>
                    {
                        { "type", name }, { "found", true }, { "assembly", t.Assembly.GetName().Name },
                        { "property_bag", bagType }, { "generated", bagType != null && bagType.IndexOf("Reflected", StringComparison.Ordinal) < 0 },
                        { "create_properties", props },
                        { "class_attribute", t.GetCustomAttributes(typeof(GeneratePropertyBagAttribute), false).Length > 0 },
                        { "assembly_attribute", t.Assembly.GetCustomAttributes(typeof(GeneratePropertyBagsForAssemblyAttribute), false).Length > 0 },
                        { "notifies", typeof(INotifyBindablePropertyChanged).IsAssignableFrom(t) },
                        { "view_hash", typeof(IDataSourceViewHashProvider).IsAssignableFrom(t) },
                    });
                }
                return new Dictionary<string, object> { { "types", rows } };
            });
        }

        // ------------------------------------------------------------------ UI Toolkit glyph gate
        static Dictionary<string, object> s_GlyphState;
        static List<(UIDocument doc, Label probe)> s_GlyphProbes;
        static int s_GlyphTick;

        public static void UitkGlyphs()
        {
            AgentJob.Run(() =>
            {
                AgentCapture.RequireGraphics();
                AgentJob.BeginAsync();
                var scenePath = AgentJob.Str("scene");
                if (!string.IsNullOrEmpty(scenePath)) EditorSceneManager.OpenScene(scenePath, OpenSceneMode.Single);
                s_GlyphState = new Dictionary<string, object>
                {
                    { "text", (AgentJob.List("text") ?? new List<object>()).Select(x => x.ToString()).ToList() },
                    { "candidate", AgentJob.Str("candidate_fallback_font", null) }, { "ticks", AgentJob.Int("ticks", 8) },
                };
                s_GlyphProbes = new List<(UIDocument, Label)>();
                foreach (var doc in UnityEngine.Object.FindObjectsByType<UIDocument>(FindObjectsSortMode.None))
                {
                    if (doc.panelSettings == null || doc.rootVisualElement == null) continue;
                    var clone = UnityEngine.Object.Instantiate(doc.panelSettings);   // never edit the asset
                    clone.targetTexture = new RenderTexture(640, 360, 24);
                    doc.panelSettings = clone;
                    var probe = new Label("Settings") { name = "__glyph_probe" };
                    doc.rootVisualElement.Add(probe);
                    s_GlyphProbes.Add((doc, probe));
                }
                if (s_GlyphProbes.Count == 0) throw new InvalidOperationException("no UIDocument with PanelSettings in the scene");
                s_GlyphTick = 0;
                EditorApplication.update += TickGlyphs;
                return null;
            });
        }

        static void TickGlyphs()
        {
            try
            {
                EditorApplication.QueuePlayerLoopUpdate();
                if (++s_GlyphTick < (int)s_GlyphState["ticks"]) return;
                EditorApplication.update -= TickGlyphs;
                var texts = (List<string>)s_GlyphState["text"];
                var candidatePath = (string)s_GlyphState["candidate"];
                FontAsset uitkCandidate = null;
                TMP_FontAsset tmpCandidate = null;
                if (!string.IsNullOrEmpty(candidatePath))
                {
                    var file = candidatePath.StartsWith("Assets/") ? Path.GetFullPath(candidatePath) : candidatePath;
                    uitkCandidate = FontAsset.CreateFontAsset(file, 0, 90, 9, GlyphRenderMode.SDFAA, 1024, 1024);
                    tmpCandidate = TMP_FontAsset.CreateFontAsset(file, 0, 90, 9, GlyphRenderMode.SDFAA, 1024, 1024);
                }
                var panels = new List<object>();
                foreach (var (doc, probe) in s_GlyphProbes)
                {
                    var fd = probe.resolvedStyle.unityFontDefinition;
                    FontAsset primary = fd.fontAsset;
                    string primaryName = primary != null ? primary.name : null;
                    Font legacy = fd.font != null ? fd.font : probe.resolvedStyle.unityFont;
                    if (primary == null && legacy != null) { primary = FontAsset.CreateFontAsset(legacy); primaryName = "dynamic from " + legacy.name; }
                    var ts = doc.panelSettings.textSettings;
                    var globals = ts != null && ts.fallbackFontAssets != null ? ts.fallbackFontAssets.Where(x => x != null).ToList() : new List<FontAsset>();
                    List<object> Check(FontAsset extra)
                    {
                        var missing = new List<object>();
                        foreach (var t in texts)
                        {
                            if (string.IsNullOrEmpty(t) || primary == null) continue;
                            primary.HasCharacters(t, out uint[] miss, true, true);
                            var left = (miss ?? new uint[0]).Distinct().Where(u => !globals.Any(g => g.HasCharacter(u, true, true))).ToList();
                            if (extra != null) left = left.Where(u => !extra.HasCharacter(u, true, true)).ToList();
                            if (left.Count > 0) missing.Add(new Dictionary<string, object> { { "text", t }, { "missing", left.Select(u => (object)("U+" + u.ToString("X4"))).ToList() }, { "count", left.Count } });
                        }
                        return missing;
                    }
                    var row = new Dictionary<string, object>
                    {
                        { "document", doc.name }, { "resolved_font", primaryName },
                        { "text_settings", ts != null ? ts.name : "none (a default PanelTextSettings is created at runtime)" },
                        { "text_settings_fallbacks", globals.Count }, { "missing", Check(null) },
                    };
                    if (uitkCandidate != null) row["missing_with_candidate_as_uitk_fallback"] = Check(uitkCandidate);
                    panels.Add(row);
                }
                // the same strings through the TMP chain, with the candidate added to TMP Settings (in memory only)
                var tmpRes = new Dictionary<string, object>();
                var tmpFont = TMP_Settings.defaultFontAsset;
                if (tmpFont != null)
                {
                    if (tmpCandidate != null) TMP_Settings.fallbackFontAssets.Add(tmpCandidate);
                    try
                    {
                        var miss = new List<object>();
                        foreach (var t in texts)
                            if (!tmpFont.HasCharacters(t, out uint[] m, true, true) && m != null && m.Length > 0)
                                miss.Add(new Dictionary<string, object> { { "text", t }, { "count", m.Distinct().Count() } });
                        tmpRes["default_font"] = tmpFont.name;
                        tmpRes["candidate_in_tmp_settings"] = tmpCandidate != null;
                        tmpRes["missing"] = miss;
                    }
                    finally { if (tmpCandidate != null) TMP_Settings.fallbackFontAssets.Remove(tmpCandidate); }
                }
                foreach (var (doc, probe) in s_GlyphProbes)
                {
                    probe.RemoveFromHierarchy();
                    if (doc.panelSettings.targetTexture != null) doc.panelSettings.targetTexture.Release();
                }
                AgentJob.Succeed(new Dictionary<string, object> { { "panels", panels }, { "tmp", tmpRes } });
            }
            catch (Exception e)
            {
                EditorApplication.update -= TickGlyphs;
                AgentJob.Fail("UitkGlyphs: " + e.Message, null, e);
            }
        }
    }
}
