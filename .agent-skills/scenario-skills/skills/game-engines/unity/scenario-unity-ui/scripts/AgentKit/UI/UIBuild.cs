// scenario-unity-ui AgentKit (Unity Expert Skills v0.1, 2026-09-24). uGUI screens built from code, headless.
// There is no text format for uGUI (scenes and prefabs are YAML with fileIDs): an agent builds it
// through the editor API, saves explicitly, then audits and captures it.
//
// Jobs:
//   AgentKit.UI.UIBuild.BuildMenuScene   args: scene ("Assets/AgentUI/Scenes/UI_Menu.unity"),
//       reference [1920,1080], match (0.5), handheld_multiplier (1.35), mixer (asset path, optional),
//       with_camera (false: an additive UI scene must not bring a camera)
//     Builds: EventSystem + InputSystemUIInputModule (the only one: UI lives in its own scene),
//     "Canvas - Menu" (Screen Space Overlay, sort order 10, CanvasScaler Scale With Screen Size,
//     reference 1920 x 1080, Match 0.5 because the project allows both orientations, a
//     CanvasDeviceScale for handhelds, MenuRouter, no raycaster on the root), and three sub-canvases
//     grouped by change timing and input: "Decoration" (no GraphicRaycaster), "Screen - Main" and
//     "Screen - Settings" (each Canvas + GraphicRaycaster + CanvasGroup + MenuScreen). Settings has
//     resolution and quality TMP_Dropdowns, master/music/SFX Sliders with value labels, three rebind
//     rows (RebindRow on project-wide actions) and Back, inside a ScrollRect for short screens.
//     Buttons get persistent listeners (MenuRouter.ShowScreen, RebindRow.StartRebind) so the wiring
//     shows in the Inspector. Every label has raycastTarget off; no Animator; scale 1; z 0.
//   Helpers (public, reused by tests and other jobs): NewUI, Stretch, Place, Label, Panel, MakeButton,
//     MakeSlider, MakeDropdown, Row, BuiltinSprite.
using System;
using System.Collections.Generic;
using System.IO;
using AgentUI;
using TMPro;
using UnityEditor;
using UnityEditor.Events;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Audio;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.UI;
using UnityEngine.UI;

namespace AgentKit.UI
{
    public static class UIBuild
    {
        public const int UILayer = 5;

        // ------------------------------------------------------------------ job
        public static void BuildMenuScene()
        {
            AgentJob.Run(() =>
            {
                string path = AgentJob.Str("scene", "Assets/AgentUI/Scenes/UI_Menu.unity");
                var refList = AgentJob.List("reference");
                var reference = refList != null && refList.Count == 2
                    ? new Vector2((float)AgentJson.ToDouble(refList[0]), (float)AgentJson.ToDouble(refList[1]))
                    : new Vector2(1920, 1080);
                float match = AgentJob.Float("match", 0.5f);
                var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

                // no camera by default: Overlay UI needs none, and a camera inside a UI scene loaded additively
                // would clear the level's image [added]; the full-screen decoration background covers the screen
                if (AgentJob.Bool("with_camera", false))
                {
                    var cam = new GameObject("Main Camera").AddComponent<Camera>();
                    cam.tag = "MainCamera";
                    cam.clearFlags = CameraClearFlags.SolidColor;
                    cam.backgroundColor = UiTheme.Background;
                    cam.cullingMask = 0; // the menu scene draws nothing in 3D; Overlay UI needs no camera
                }

                var es = new GameObject("EventSystem", typeof(EventSystem), typeof(InputSystemUIInputModule));
                // AddComponent gives the module the package's DefaultInputActions (observed 2026-09-24), not the
                // project-wide actions: point it at InputSystem.actions so the UI map (and its rebinds) drive navigation
                var module = es.GetComponent<InputSystemUIInputModule>();
                if (InputSystem.actions != null && InputSystem.actions.FindActionMap("UI") != null) module.actionsAsset = InputSystem.actions;

                var root = NewUI("Canvas - Menu", null, typeof(Canvas), typeof(CanvasScaler), typeof(CanvasDeviceScale), typeof(MenuRouter));
                var canvas = root.GetComponent<Canvas>();
                canvas.renderMode = RenderMode.ScreenSpaceOverlay;
                canvas.sortingOrder = 10;               // explicit sort order, never Hierarchy order (Christina, 1OwQflHq5kg [00:05:39])
                canvas.pixelPerfect = false;            // Pixel Perfect re-snaps moving content every frame (Andy Touch, eH-PdFKgctE [00:52:32])
                canvas.additionalShaderChannels = AdditionalCanvasShaderChannels.TexCoord1; // TMP needs TexCoord1; no Normal/Tangent on Overlay
                var scaler = root.GetComponent<CanvasScaler>();
                scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
                scaler.screenMatchMode = CanvasScaler.ScreenMatchMode.MatchWidthOrHeight;
                scaler.matchWidthOrHeight = match;
                scaler.referenceResolution = reference;
                var dev = root.GetComponent<CanvasDeviceScale>();
                dev.ReferenceResolution = reference;
                dev.HandheldMultiplier = AgentJob.Float("handheld_multiplier", 1.35f);

                // decoration: its own canvas, no raycaster, so it never eats clicks (1OwQflHq5kg [00:03:38])
                var deco = SubCanvas(root.transform, "Decoration", 0, false);
                Stretch(Panel(deco.transform, "Menu Background", UiTheme.Background).rectTransform);
                var stripe = Panel(deco.transform, "Accent Stripe", UiTheme.Accent);
                Place(stripe.rectTransform, new Vector2(0, 1), new Vector2(1, 1), new Vector2(0.5f, 1), Vector2.zero, new Vector2(0, 12));

                var main = BuildMain(root.transform);
                var settings = BuildSettings(root.transform, AgentJob.Str("mixer", null));

                var router = root.GetComponent<MenuRouter>();
                router.Screens.Add(main);
                router.Screens.Add(settings);
                main.ShownAtStart = true;
                settings.ShownAtStart = false;
                main.CoversScene = true;      // the decoration background is opaque: stop the game cameras behind it
                settings.CoversScene = true;
                settings.GetComponent<Canvas>().enabled = false;

                // wiring through persistent listeners (visible in the Inspector)
                Wire(main.transform.Find("Column/Button Settings").GetComponent<Button>(), router, "Settings");
                Wire(settings.transform.Find("Panel/Footer/Button Back").GetComponent<Button>(), router, "Main");
                UnityEventTools.AddVoidPersistentListener(main.transform.Find("Column/Button Quit").GetComponent<Button>().onClick, router.Quit);

                Directory.CreateDirectory(Path.GetDirectoryName(AgentJob.ResolvePath(path)));
                EditorSceneManager.SaveScene(scene, path);
                return Summary(path, root);
            });
        }

        static void Wire(Button b, MenuRouter router, string screen)
        {
            UnityEventTools.AddStringPersistentListener(b.onClick, router.ShowScreen, screen);
        }

        static MenuScreen BuildMain(Transform root)
        {
            var screen = SubCanvas(root, "Screen - Main", 1, true);
            var col = NewUI("Column", screen.transform, typeof(VerticalLayoutGroup), typeof(ContentSizeFitter), typeof(ClampedWidth));
            var colRt = (RectTransform)col.transform;
            Place(colRt, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(800, 600));
            var vlg = col.GetComponent<VerticalLayoutGroup>();
            vlg.childControlWidth = true; vlg.childControlHeight = true;
            vlg.childForceExpandWidth = true; vlg.childForceExpandHeight = false; // force expand off on the stacking axis (HTQV4mukZ2M [00:09:59])
            vlg.spacing = UiTheme.S3;
            vlg.childAlignment = TextAnchor.MiddleCenter;
            // the fitter sits at the TOP of this layout hierarchy (never on a child of a group)
            col.GetComponent<ContentSizeFitter>().verticalFit = ContentSizeFitter.FitMode.PreferredSize;
            var cw = col.GetComponent<ClampedWidth>();
            cw.MaxWidth = 800; cw.Margin = UiTheme.S6;

            var title = Label(col.transform, "Title", "IRON MERIDIAN", UiTheme.Title, UiTheme.Text, TextAlignmentOptions.Center, FontStyles.Bold);
            var sub = Label(col.transform, "Subtitle", "A prototype menu built from code", UiTheme.Caption, UiTheme.TextMuted, TextAlignmentOptions.Center);
            Spacer(col.transform, UiTheme.S4);
            var play = MakeButton(col.transform, "Button Play", "PLAY");
            // one accent surface for the primary action (Game Dev Guide, HwdweCX5aMI [frame 00:04:48])
            var pc = play.colors; pc.normalColor = UiTheme.Accent; pc.highlightedColor = UiTheme.AccentPressed; pc.selectedColor = UiTheme.AccentPressed; play.colors = pc;
            MakeButton(col.transform, "Button Settings", "SETTINGS");
            MakeButton(col.transform, "Button Quit", "QUIT");
            var ms = screen.GetComponent<MenuScreen>();
            ms.FirstSelected = play;
            return ms;
        }

        static MenuScreen BuildSettings(Transform root, string mixerPath)
        {
            var screen = SubCanvas(root, "Screen - Settings", 2, true);
            var panelImg = Panel(screen.transform, "Panel", UiTheme.Surface);
            var panel = panelImg.gameObject;
            panel.AddComponent<ClampedWidth>().MaxWidth = 1200;
            panel.GetComponent<ClampedWidth>().Margin = UiTheme.S4;
            var prt = (RectTransform)panel.transform;
            prt.anchorMin = new Vector2(0.5f, 0); prt.anchorMax = new Vector2(0.5f, 1); prt.pivot = new Vector2(0.5f, 0.5f);
            prt.offsetMin = new Vector2(-600, UiTheme.S6); prt.offsetMax = new Vector2(600, -UiTheme.S6);

            var header = Label(panel.transform, "Header", "SETTINGS", UiTheme.Heading, UiTheme.Text, TextAlignmentOptions.Left, FontStyles.Bold);
            Place(header.rectTransform, new Vector2(0, 1), new Vector2(1, 1), new Vector2(0.5f, 1), new Vector2(0, -UiTheme.S4), new Vector2(-2 * UiTheme.S6, 72));

            // scroll area between header and footer (a Scroll Rect counts as a layout group: fine here, it rebuilds rarely)
            var scroll = NewUI("Scroll", panel.transform, typeof(ScrollRect));
            var srt = (RectTransform)scroll.transform;
            srt.anchorMin = new Vector2(0, 0); srt.anchorMax = new Vector2(1, 1); srt.pivot = new Vector2(0.5f, 0.5f);
            srt.offsetMin = new Vector2(UiTheme.S6, 104 + 2 * UiTheme.S4); srt.offsetMax = new Vector2(-UiTheme.S6, -(72 + 2 * UiTheme.S4));
            var viewport = NewUI("Viewport", scroll.transform, typeof(RectMask2D)); // RectMask2D: no stencil, no extra batch per mask
            Stretch((RectTransform)viewport.transform);
            var content = NewUI("Content", viewport.transform, typeof(VerticalLayoutGroup), typeof(ContentSizeFitter));
            var crt = (RectTransform)content.transform;
            crt.anchorMin = new Vector2(0, 1); crt.anchorMax = new Vector2(1, 1); crt.pivot = new Vector2(0.5f, 1); // grows downward from a fixed top (HTQV4mukZ2M [00:23:55])
            crt.offsetMin = Vector2.zero; crt.offsetMax = Vector2.zero;
            var cv = content.GetComponent<VerticalLayoutGroup>();
            cv.childControlWidth = true; cv.childControlHeight = true; cv.childForceExpandWidth = true; cv.childForceExpandHeight = false;
            cv.spacing = UiTheme.S2;
            content.GetComponent<ContentSizeFitter>().verticalFit = ContentSizeFitter.FitMode.PreferredSize;
            var sr = scroll.GetComponent<ScrollRect>();
            sr.viewport = (RectTransform)viewport.transform; sr.content = crt; sr.horizontal = false;
            sr.movementType = ScrollRect.MovementType.Clamped;
            sr.scrollSensitivity = 40;
            scroll.AddComponent<ScrollToSelection>(); // keyboard/gamepad selection below the viewport scrolls into view [added]

            var ss = screen.AddComponent<SettingsScreen>();
            Section(content.transform, "DISPLAY");
            ss.resolution = MakeDropdown(Row(content.transform, "Row Resolution", "Resolution"), "Dropdown", new[] { "1920 x 1080", "2560 x 1440", "3840 x 2160" });
            ss.quality = MakeDropdown(Row(content.transform, "Row Quality", "Quality"), "Dropdown", new[] { "Mobile", "PC" });
            Section(content.transform, "AUDIO");
            ss.master = MakeSlider(Row(content.transform, "Row Master", "Master volume"), "Slider", 1f, out ss.masterValue);
            ss.music = MakeSlider(Row(content.transform, "Row Music", "Music"), "Slider", 0.8f, out ss.musicValue);
            ss.sfx = MakeSlider(Row(content.transform, "Row SFX", "Effects"), "Slider", 0.8f, out ss.sfxValue);
            Section(content.transform, "CONTROLS");
            ss.rebindRows.Add(MakeRebind(Row(content.transform, "Row Jump", "Jump"), "Player/Jump", 0, "Space"));
            ss.rebindRows.Add(MakeRebind(Row(content.transform, "Row Attack", "Attack"), "Player/Attack", 0, "Left Button"));
            ss.rebindRows.Add(MakeRebind(Row(content.transform, "Row Interact", "Interact"), "Player/Interact", 0, "E"));
            if (!string.IsNullOrEmpty(mixerPath)) ss.mixer = AssetDatabase.LoadAssetAtPath<AudioMixer>(mixerPath);
            AlignRowLabels(content.transform);

            var footer = NewUI("Footer", panel.transform, typeof(HorizontalLayoutGroup));
            Place((RectTransform)footer.transform, new Vector2(0, 0), new Vector2(1, 0), new Vector2(0.5f, 0), new Vector2(0, UiTheme.S4), new Vector2(-2 * UiTheme.S6, UiTheme.ControlHeight));
            var fh = footer.GetComponent<HorizontalLayoutGroup>();
            fh.childControlWidth = true; fh.childControlHeight = true; fh.childForceExpandWidth = false; fh.childForceExpandHeight = true;
            fh.childAlignment = TextAnchor.MiddleRight; fh.spacing = UiTheme.S2;
            var back = MakeButton(footer.transform, "Button Back", "BACK");
            back.GetComponent<LayoutElement>().preferredWidth = 320;

            var ms = screen.GetComponent<MenuScreen>();
            ms.FirstSelected = ss.resolution;
            // explicit Down from the last rebind row to Back, Up from Back to it (the ScrollRect breaks automatic geometry near the edge)
            var lastRow = ss.rebindRows[ss.rebindRows.Count - 1].GetComponentInChildren<Button>();
            var nav = lastRow.navigation; nav.mode = Navigation.Mode.Explicit;
            nav.selectOnUp = ss.rebindRows[ss.rebindRows.Count - 2].GetComponentInChildren<Button>(); nav.selectOnDown = back;
            lastRow.navigation = nav;
            return ms;
        }

        // ------------------------------------------------------------------ helpers
        public static GameObject NewUI(string name, Transform parent, params Type[] components)
        {
            var types = new List<Type> { typeof(RectTransform) };
            types.AddRange(components);
            var go = new GameObject(name, types.ToArray()) { layer = UILayer };
            if (parent != null) go.transform.SetParent(parent, false);
            return go;
        }

        public static GameObject SubCanvas(Transform parent, string name, int order, bool interactive)
        {
            var comps = new List<Type> { typeof(Canvas) };
            if (interactive) { comps.Add(typeof(GraphicRaycaster)); comps.Add(typeof(CanvasGroup)); comps.Add(typeof(MenuScreen)); }
            var go = NewUI(name, parent, comps.ToArray());
            Stretch((RectTransform)go.transform);
            var c = go.GetComponent<Canvas>();
            c.overrideSorting = true;
            c.sortingOrder = 10 + order;
            c.additionalShaderChannels = AdditionalCanvasShaderChannels.TexCoord1;
            return go;
        }

        public static RectTransform Stretch(RectTransform rt, float left = 0, float bottom = 0, float right = 0, float top = 0)
        {
            rt.anchorMin = Vector2.zero; rt.anchorMax = Vector2.one; rt.pivot = new Vector2(0.5f, 0.5f);
            rt.offsetMin = new Vector2(left, bottom); rt.offsetMax = new Vector2(-right, -top);
            return rt;
        }

        public static RectTransform Place(RectTransform rt, Vector2 anchorMin, Vector2 anchorMax, Vector2 pivot, Vector2 pos, Vector2 size)
        {
            rt.anchorMin = anchorMin; rt.anchorMax = anchorMax; rt.pivot = pivot;
            rt.anchoredPosition = pos; rt.sizeDelta = size;
            return rt;
        }

        public static TextMeshProUGUI Label(Transform parent, string name, string text, float size, Color color,
                                            TextAlignmentOptions align, FontStyles style = FontStyles.Normal)
        {
            var go = NewUI(name, parent, typeof(TextMeshProUGUI));
            var t = go.GetComponent<TextMeshProUGUI>();
            t.text = text; t.fontSize = size; t.color = color; t.alignment = align; t.fontStyle = style;
            t.raycastTarget = false;           // labels never take input (uGUI optimization tips, Limit Graphic Raycasters)
            t.textWrappingMode = TextWrappingModes.Normal;
            t.overflowMode = TextOverflowModes.Overflow; // overflow stays visible, so the layout check can see it
            return t;
        }

        public static Image Panel(Transform parent, string name, Color color, bool raycast = false)
        {
            var go = NewUI(name, parent, typeof(Image));
            var img = go.GetComponent<Image>();
            img.color = color; img.raycastTarget = raycast;
            return img;
        }

        public static void Spacer(Transform parent, float height)
        {
            var go = NewUI("Spacer", parent, typeof(LayoutElement));
            var le = go.GetComponent<LayoutElement>();
            le.minHeight = height; le.preferredHeight = height;
        }

        public static void Section(Transform parent, string title)
        {
            var t = Label(parent, "Section " + title, title, UiTheme.Caption, UiTheme.TextMuted, TextAlignmentOptions.BottomLeft, FontStyles.Bold);
            t.characterSpacing = 8;
            var le = t.gameObject.AddComponent<LayoutElement>();
            le.minHeight = 48; le.preferredHeight = 48;
        }

        public static Sprite BuiltinSprite(string name)
        {
            return AssetDatabase.GetBuiltinExtraResource<Sprite>("UI/Skin/" + name);
        }

        static ColorBlock Colors()
        {
            var cb = ColorBlock.defaultColorBlock;
            // Color Tint (the commercial default: u3YdlUW1nx0 [00:02:02]); hover selects, so Highlighted = Selected
            cb.normalColor = UiTheme.Surface;
            cb.highlightedColor = UiTheme.Accent;
            cb.selectedColor = UiTheme.Accent;
            cb.pressedColor = UiTheme.AccentPressed;
            cb.disabledColor = UiTheme.WithAlpha(UiTheme.Surface, 0.5f);
            cb.colorMultiplier = 1f;
            cb.fadeDuration = 0.08f;
            return cb;
        }

        public static Button MakeButton(Transform parent, string name, string text)
        {
            var go = NewUI(name, parent, typeof(Image), typeof(Button), typeof(LayoutElement), typeof(SelectableFeedback));
            var img = go.GetComponent<Image>();
            img.sprite = BuiltinSprite("UISprite.psd"); img.type = Image.Type.Sliced;
            img.color = Color.white; img.raycastTarget = true;
            var b = go.GetComponent<Button>();
            b.transition = Selectable.Transition.ColorTint; // never Transition.Animation (Animator overhead)
            b.targetGraphic = img;
            b.colors = Colors();
            var le = go.GetComponent<LayoutElement>();
            le.minHeight = UiTheme.ControlHeight; le.preferredHeight = UiTheme.ControlHeight;
            var label = Label(go.transform, "Label", text, UiTheme.Body, UiTheme.Text, TextAlignmentOptions.Center, FontStyles.Bold);
            label.characterSpacing = 4;
            Stretch(label.rectTransform, UiTheme.S2, 0, UiTheme.S2, 0);
            return b;
        }

        /// <summary>A settings row: label (flexible width) + a control slot (fixed preferred width).
        /// Returns the control slot.</summary>
        public static Transform Row(Transform parent, string name, string label)
        {
            var row = NewUI(name, parent, typeof(HorizontalLayoutGroup), typeof(LayoutElement));
            var h = row.GetComponent<HorizontalLayoutGroup>();
            h.childControlWidth = true; h.childControlHeight = true; h.childForceExpandWidth = false; h.childForceExpandHeight = true;
            h.spacing = UiTheme.S3; h.childAlignment = TextAnchor.MiddleLeft;
            var rle = row.GetComponent<LayoutElement>();
            rle.minHeight = UiTheme.ControlHeight; rle.preferredHeight = UiTheme.ControlHeight;
            // the label may wrap to two lines on narrow screens (the row is tall enough); it never overflows
            var l = Label(row.transform, "Label", label, UiTheme.Body, UiTheme.Text, TextAlignmentOptions.Left);
            l.textWrappingMode = TextWrappingModes.Normal;
            var lle = l.gameObject.AddComponent<LayoutElement>();
            // the label column may shrink, but never below its longest word (else TMP breaks inside the word:
            // "Resolutio/n" at 1170 x 2532, observed)
            float longest = 0;
            foreach (var word in label.Split(' ')) longest = Mathf.Max(longest, l.GetPreferredValues(word).x);
            lle.flexibleWidth = 1; lle.minWidth = Mathf.Ceil(Mathf.Max(120, longest + 4));
            var slot = NewUI("Control", row.transform, typeof(LayoutElement));
            var sle = slot.GetComponent<LayoutElement>();
            sle.preferredWidth = 440; sle.minWidth = 240; sle.flexibleWidth = 0;
            return slot.transform;
        }

        /// <summary>One label column for every row: all labels get the widest row's minimum, so the controls
        /// start on the same x at every screen width (seen ragged on the 1170 x 2532 capture).</summary>
        public static void AlignRowLabels(Transform content)
        {
            var labels = new List<LayoutElement>();
            foreach (Transform row in content)
                if (row.name.StartsWith("Row ") && row.Find("Label") is Transform l && l.GetComponent<LayoutElement>() is LayoutElement le) labels.Add(le);
            float w = 0;
            foreach (var le in labels) w = Mathf.Max(w, le.minWidth);
            foreach (var le in labels) { le.minWidth = w; le.preferredWidth = w; } // same min AND preferred: same share of the row
        }

        public static TMP_Dropdown MakeDropdown(Transform slot, string name, string[] options)
        {
            var res = new TMP_DefaultControls.Resources
            {
                standard = BuiltinSprite("UISprite.psd"), background = BuiltinSprite("Background.psd"),
                inputField = BuiltinSprite("InputFieldBackground.psd"), knob = BuiltinSprite("Knob.psd"),
                checkmark = BuiltinSprite("Checkmark.psd"), dropdown = BuiltinSprite("DropdownArrow.psd"),
                mask = BuiltinSprite("UIMask.psd"),
            };
            var go = TMP_DefaultControls.CreateDropdown(res);
            go.name = name;
            SetLayerRecursive(go, UILayer);
            go.transform.SetParent(slot, false);
            Stretch((RectTransform)go.transform);
            var dd = go.GetComponent<TMP_Dropdown>();
            dd.ClearOptions();
            dd.AddOptions(new List<string>(options));
            dd.colors = Colors();
            dd.captionText.fontSize = UiTheme.Body; dd.captionText.color = UiTheme.Text; dd.captionText.raycastTarget = false;
            dd.itemText.fontSize = UiTheme.Body; dd.itemText.color = UiTheme.Text;
            var arrow = go.transform.Find("Arrow");
            if (arrow != null) { var a = arrow.GetComponent<Image>(); a.color = UiTheme.Text; a.raycastTarget = false; ((RectTransform)arrow).sizeDelta = new Vector2(40, 40); ((RectTransform)arrow).anchoredPosition = new Vector2(-32, 0); }
            ((RectTransform)dd.captionText.transform).offsetMin = new Vector2(UiTheme.S3, 0);
            // the popup list: a readable item height and theme colours
            var template = (RectTransform)dd.template;
            template.sizeDelta = new Vector2(0, 360);
            var item = template.Find("Viewport/Content/Item") as RectTransform;
            if (item != null) item.sizeDelta = new Vector2(item.sizeDelta.x, 72);
            var content = template.Find("Viewport/Content") as RectTransform;
            if (content != null) content.sizeDelta = new Vector2(content.sizeDelta.x, 76);
            var tImg = template.GetComponent<Image>(); if (tImg != null) tImg.color = UiTheme.SurfaceSunken;
            var itemBg = template.Find("Viewport/Content/Item/Item Background");
            if (itemBg != null) itemBg.GetComponent<Image>().color = UiTheme.Surface;
            go.AddComponent<SelectableFeedback>();
            return dd;
        }

        public static Slider MakeSlider(Transform slot, string name, float value, out TMP_Text valueLabel)
        {
            var h = slot.gameObject.AddComponent<HorizontalLayoutGroup>();
            h.childControlWidth = true; h.childControlHeight = true; h.childForceExpandWidth = false; h.childForceExpandHeight = true;
            h.spacing = UiTheme.S2; h.childAlignment = TextAnchor.MiddleLeft;
            var res = new DefaultControls.Resources
            {
                standard = BuiltinSprite("UISprite.psd"), background = BuiltinSprite("Background.psd"), knob = BuiltinSprite("Knob.psd"),
            };
            var go = DefaultControls.CreateSlider(res);
            go.name = name;
            SetLayerRecursive(go, UILayer);
            go.transform.SetParent(slot, false);
            var le = go.AddComponent<LayoutElement>();
            le.flexibleWidth = 1; le.minWidth = 160;
            var s = go.GetComponent<Slider>();
            s.minValue = 0; s.maxValue = 1; s.wholeNumbers = false; s.value = value;
            s.colors = Colors();
            foreach (var img in go.GetComponentsInChildren<Image>(true))
            {
                img.raycastTarget = img.gameObject == s.handleRect?.gameObject || img.name == "Background";
                if (img.name == "Background") img.color = UiTheme.SurfaceSunken;
                else if (img.name == "Fill") img.color = UiTheme.Accent;
                else if (img.name == "Handle") img.color = UiTheme.Text;
            }
            ((RectTransform)s.handleRect).sizeDelta = new Vector2(44, 0);
            var bg = go.transform.Find("Background") as RectTransform;
            if (bg != null) { bg.anchorMin = new Vector2(0, 0.35f); bg.anchorMax = new Vector2(1, 0.65f); }
            var fillArea = go.transform.Find("Fill Area") as RectTransform;
            if (fillArea != null) { fillArea.anchorMin = new Vector2(0, 0.35f); fillArea.anchorMax = new Vector2(1, 0.65f); }
            go.AddComponent<SelectableFeedback>();
            valueLabel = Label(slot, "Value", Mathf.RoundToInt(value * 100) + "%", UiTheme.Body, UiTheme.TextMuted, TextAlignmentOptions.Right);
            valueLabel.textWrappingMode = TextWrappingModes.NoWrap;
            var vle = valueLabel.gameObject.AddComponent<LayoutElement>();
            vle.preferredWidth = 110; vle.minWidth = 110;
            return s;
        }

        public static RebindRow MakeRebind(Transform slot, string actionPath, int bindingIndex, string placeholder)
        {
            var b = MakeButton(slot, "Button Rebind", placeholder);
            Stretch((RectTransform)b.transform);
            UnityEngine.Object.DestroyImmediate(b.GetComponent<LayoutElement>());
            var row = slot.parent.gameObject.AddComponent<RebindRow>();
            row.ActionPath = actionPath;
            row.BindingIndex = bindingIndex;
            row.BindingLabel = b.GetComponentInChildren<TMP_Text>();
            UnityEventTools.AddVoidPersistentListener(b.onClick, row.StartRebind);
            return row;
        }

        public static void SetLayerRecursive(GameObject go, int layer)
        {
            go.layer = layer;
            foreach (Transform c in go.transform) SetLayerRecursive(c.gameObject, layer);
        }

        public static Dictionary<string, object> Summary(string path, GameObject root)
        {
            var graphics = root.GetComponentsInChildren<Graphic>(true);
            int raycast = 0;
            foreach (var g in graphics) if (g.raycastTarget) raycast++;
            return new Dictionary<string, object>
            {
                { "scene", path },
                { "canvases", root.GetComponentsInChildren<Canvas>(true).Length },
                { "raycasters", root.GetComponentsInChildren<GraphicRaycaster>(true).Length },
                { "graphics", graphics.Length },
                { "raycast_targets", raycast },
                { "selectables", root.GetComponentsInChildren<Selectable>(true).Length },
                { "tmp_texts", root.GetComponentsInChildren<TMP_Text>(true).Length },
                { "layout_groups", root.GetComponentsInChildren<LayoutGroup>(true).Length },
                { "event_systems", UnityEngine.Object.FindObjectsByType<EventSystem>(FindObjectsInactive.Include, FindObjectsSortMode.None).Length },
            };
        }
    }
}
