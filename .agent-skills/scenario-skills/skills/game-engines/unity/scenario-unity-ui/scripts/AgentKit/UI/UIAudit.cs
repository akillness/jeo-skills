// scenario-unity-ui AgentKit (Unity Expert Skills v0.2, 2026-09-24). Static uGUI + TMP audit of scenes and
// prefabs, findings in the AgentKit format {severity, code, path, message, fix}.
//
// Job: AgentKit.UI.UIAudit.Audit   args: scenes [paths], prefabs [paths] (optional), portrait (bool,
//      default: read PlayerSettings orientations), max_static_graphics (200), text ([strings] for the
//      glyph gate), max_world_canvases (8), atlases ([paths]; default: the Sprite Atlases that pack a
//      sprite used by an audited Image), out (json path, optional)
//      -> also "stack": every screen-space layer of BOTH systems (root Overlay canvases and UI Toolkit
//         panels) sorted by sort order, the order input follows too (EventSystem.RaycastComparer).
// Job: AgentKit.UI.UIAudit.ExplainLayout   args: scene, path ("Canvas/Group"), depth (1)
//      -> the Inspector's "Layout Properties" pane as data: min/preferred/flexible width and height of
//         the element and its children after a layout pass, the parent group's control/expand flags,
//         and why a child got its size (Christina Creates Games, HTQV4mukZ2M [00:43:22]).
// Rules (source in brackets):
//  canvas.scaler_mode      root screen canvas not on Scale With Screen Size [uGUI multi-resolution manual]
//  canvas.match            Match 0 or 1 while the Player allows both orientations; 0.5 is the doc fix
//  canvas.raycaster_idle   GraphicRaycaster on a canvas without interactive descendants [optimization tips; 1OwQflHq5kg]
//  canvas.pixel_perfect    Pixel Perfect on a canvas holding a ScrollRect, Animator or Slider [Andy Touch, eH-PdFKgctE]
//  canvas.mixed_timing     one canvas holds many static graphics AND per-frame content [optimization tips]
//  canvas.overlay_channels Normal/Tangent shader channels on an Overlay canvas [1OwQflHq5kg frame 00:06:51]
//  canvas.world_camera     interactive World Space canvas without an event camera
//  graphic.raycast_target  raycastTarget on a Graphic with no interactive owner (labels first) [optimization tips]
//  graphic.z_or_rotation   non-zero local z or off-plane rotation under a canvas: batch break [eH-PdFKgctE]
//  graphic.scale           localScale != 1 (scale is outside layout) [Christina, HTQV4mukZ2M]
//  text.legacy             UnityEngine.UI.Text [every source: TMP]
//  text.mesh_effect        Shadow/Outline on text: 2-5x the vertices [eH-PdFKgctE 4.1k vs 1.8k tris]
//  layout.fitter_in_group  ContentSizeFitter on a child whose parent group controls that axis [HTQV4mukZ2M 00:36:30]
//  layout.zero_child       child of a size-controlling group with min = preferred = 0: collapses [HTQV4mukZ2M 00:13:08]
//  layout.nested           layout group depth >= 3 (each adds a GetComponent walk per dirty) [optimization tips]
//  layout.fitter_pivot     self-sizing box with a centre pivot on the fitted axis [HTQV4mukZ2M 00:23:55]
//  anim.animator           Animator under a canvas (dirties every frame) [optimization tips; u3YdlUW1nx0]
//  anim.button_animation   Selectable with Transition.Animation [u3YdlUW1nx0 00:01:31]
//  input.event_systems     not exactly one EventSystem across the audited scene set [6ztY9-IX3Qg]
//  input.first_selected    MenuScreen without a first selection (keyboard/gamepad dead) [u3YdlUW1nx0 00:07:06]
//  input.navigation_none   interactive Selectable with Navigation None on a menu screen
//  tmp.settings / tmp.missing_glyphs   TMP essentials missing; characters that fall to the Missing glyph
//  stack.sort_tie          two screen-space layers (uGUI Overlay canvas or UI Toolkit panel, either system)
//                          share a sort order: which one draws and takes input on top is left to Hierarchy
//                          or load order [1OwQflHq5kg 00:05:39; cross-system sort since 2021.2, Unity forum]
//  canvas.world_many       more than max_world_canvases World Space canvases: canvases never batch with
//                          each other, so N name plates = at least N batches [eH-PdFKgctE 00:09:36]
//  mask.static_stencil     a stencil Mask outside a scroll view: batch breaks for art that could be
//                          pre-cut or clipped in a shader [eH-PdFKgctE 00:30:19, 00:30:55]
//  anchor.center_edge      an element placed toward a screen edge but anchored to the centre: it drifts
//                          or leaves the screen at other aspect ratios [uGUI multi-resolution manual]
//  atlas.rotation / atlas.tight_packing   a UI Sprite Atlas with Allow Rotation or Tight Packing: rotated
//                          or bleeding icons in Images [eH-PdFKgctE 00:24:43]
//  atlas.uncompressed      a UI Sprite Atlas with no compression on the default platform [eH-PdFKgctE 00:25:50]
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using AgentUI;
using TMPro;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEditor.U2D;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.U2D;
using UnityEngine.UI;
using UnityEngine.UIElements;
using Image = UnityEngine.UI.Image;
using Slider = UnityEngine.UI.Slider;

namespace AgentKit.UI
{
    public static class UIAudit
    {
        public static void Audit()
        {
            AgentJob.Run(() =>
            {
                var f = new AgentAudit.Findings();
                bool portrait = PlayerSettings.defaultInterfaceOrientation == UIOrientation.AutoRotation
                    ? (PlayerSettings.allowedAutorotateToPortrait || PlayerSettings.allowedAutorotateToPortraitUpsideDown)
                    : (PlayerSettings.defaultInterfaceOrientation == UIOrientation.Portrait || PlayerSettings.defaultInterfaceOrientation == UIOrientation.PortraitUpsideDown);
                bool landscape = PlayerSettings.defaultInterfaceOrientation == UIOrientation.AutoRotation
                    ? (PlayerSettings.allowedAutorotateToLandscapeLeft || PlayerSettings.allowedAutorotateToLandscapeRight)
                    : !portrait;
                if (AgentJob.Has("portrait")) portrait = AgentJob.Bool("portrait");
                int maxStatic = AgentJob.Int("max_static_graphics", 200);
                var scenes = (AgentJob.List("scenes") ?? new List<object>()).Select(o => o.ToString()).ToList();
                var prefabs = (AgentJob.List("prefabs") ?? new List<object>()).Select(o => o.ToString()).ToList();
                int eventSystems = 0;
                var stats = new Dictionary<string, object>();
                var layers = new List<Dictionary<string, object>>();
                var worldCanvases = new List<string>();
                var uiSprites = new HashSet<string>();
                bool first = true;
                foreach (var sp in scenes)
                {
                    var scene = EditorSceneManager.OpenScene(sp, first ? OpenSceneMode.Single : OpenSceneMode.Additive);
                    first = false;
                    foreach (var root in scene.GetRootGameObjects())
                    {
                        eventSystems += root.GetComponentsInChildren<EventSystem>(true).Length;
                        AuditHierarchy(root, sp + ":", f, portrait, landscape, maxStatic, stats);
                        CollectLayers(root, sp + ":", layers, worldCanvases, uiSprites);
                    }
                }
                foreach (var pp in prefabs)
                {
                    var root = PrefabUtility.LoadPrefabContents(pp);
                    try { AuditHierarchy(root, pp + ":", f, portrait, landscape, maxStatic, stats); CollectLayers(root, pp + ":", layers, worldCanvases, uiSprites); }
                    finally { PrefabUtility.UnloadPrefabContents(root); }
                }
                if (scenes.Count > 0 && eventSystems != 1)
                    f.Add(eventSystems == 0 ? "warn" : "error", "input.event_systems", string.Join(",", scenes),
                          eventSystems + " EventSystems across the loaded scene set", "keep exactly one, in the UI (or bootstrap) scene");
                StackChecks(f, layers);
                int maxWorld = AgentJob.Int("max_world_canvases", 8);
                if (worldCanvases.Count > maxWorld)
                    f.Add("warn", "canvas.world_many", worldCanvases[0] + " (+" + (worldCanvases.Count - 1) + ")",
                          worldCanvases.Count + " World Space canvases: canvases never batch with each other (at least one batch each)",
                          "one shared world canvas, UI Toolkit world space (6.2+), or SpriteRenderer/TextMeshPro 3D bars; pool them");
                var atlasPaths = AgentJob.Has("atlases") ? AgentJob.List("atlases").Select(o => o.ToString()).ToList() : null;
                var atlases = AtlasChecks(f, atlasPaths, uiSprites);
                var tmp = TmpChecks(f, (AgentJob.List("text") ?? new List<object>()).Select(o => o.ToString()).ToList(),
                                    AgentJob.Bool("try_add", true), AgentJob.Str("candidate_fallback_font", null));
                var res = new Dictionary<string, object>
                {
                    { "counts", f.Counts() }, { "findings", f.items }, { "stats", stats }, { "tmp", tmp },
                    { "stack", layers.OrderBy(l => Convert.ToSingle(l["sort"])).Cast<object>().ToList() },
                    { "world_canvases", worldCanvases.Count }, { "atlases", atlases },
                    { "sprite_packer_mode", EditorSettings.spritePackerMode.ToString() },
                    { "orientations", new Dictionary<string, object> { { "portrait", portrait }, { "landscape", landscape } } },
                    { "event_systems", eventSystems },
                };
                if (AgentJob.Has("out")) File.WriteAllText(AgentJob.ResolvePath(AgentJob.Str("out")), AgentJson.Serialize(res));
                return res;
            });
        }

        /// <summary>The Layout Properties pane as data. Christina Creates Games (HTQV4mukZ2M [00:43:22]): "always have
        /// a look at the Layout Properties box of the parent, but also of the children"; sizes resolve preferred,
        /// else min, else 0 under Control Child Size ([00:13:08], [00:16:31]).</summary>
        public static void ExplainLayout()
        {
            AgentJob.Run(() =>
            {
                var scenePath = AgentJob.Str("scene");
                var target = AgentJob.Str("path");
                int depth = AgentJob.Int("depth", 1);
                EditorSceneManager.OpenScene(scenePath, OpenSceneMode.Single);
                var rt = FindByPath(target) ?? throw new InvalidOperationException("no RectTransform at " + target);
                var canvas = rt.GetComponentInParent<Canvas>(true);
                if (canvas != null) LayoutRebuilder.ForceRebuildLayoutImmediate((RectTransform)canvas.rootCanvas.transform);
                LayoutRebuilder.ForceRebuildLayoutImmediate(rt);
                var rows = new List<object>();
                void Walk(RectTransform r, int d)
                {
                    rows.Add(Row(r));
                    if (d >= depth) return;
                    foreach (Transform c in r) if (c is RectTransform crt) Walk(crt, d + 1);
                }
                Walk(rt, 0);
                return new Dictionary<string, object> { { "scene", scenePath }, { "path", target }, { "rows", rows } };
            });
        }

        static RectTransform FindByPath(string path)
        {
            var parts = path.Split('/');
            foreach (var root in UnityEngine.SceneManagement.SceneManager.GetActiveScene().GetRootGameObjects())
            {
                if (root.name != parts[0]) continue;
                var t = parts.Length == 1 ? root.transform : root.transform.Find(string.Join("/", parts.Skip(1)));
                if (t is RectTransform r) return r;
            }
            return null;
        }

        static Dictionary<string, object> Row(RectTransform r)
        {
            double R(float v) => Math.Round((double)v, 1);
            var row = new Dictionary<string, object>
            {
                { "name", r.name }, { "size", new List<object> { R(r.rect.width), R(r.rect.height) } },
                { "min", new List<object> { R(LayoutUtility.GetMinWidth(r)), R(LayoutUtility.GetMinHeight(r)) } },
                { "preferred", new List<object> { R(LayoutUtility.GetPreferredWidth(r)), R(LayoutUtility.GetPreferredHeight(r)) } },
                { "flexible", new List<object> { R(LayoutUtility.GetFlexibleWidth(r)), R(LayoutUtility.GetFlexibleHeight(r)) } },
                { "scale", r.localScale == Vector3.one ? 1f : (object)r.localScale.ToString() },
            };
            var le = r.GetComponent<LayoutElement>();
            if (le != null) row["layout_element"] = new Dictionary<string, object> { { "ignore", le.ignoreLayout }, { "min", new List<object> { le.minWidth, le.minHeight } }, { "preferred", new List<object> { le.preferredWidth, le.preferredHeight } }, { "flexible", new List<object> { le.flexibleWidth, le.flexibleHeight } } };
            if (r.GetComponent<ContentSizeFitter>() is ContentSizeFitter csf) row["fitter"] = csf.horizontalFit + "/" + csf.verticalFit;
            var g = r.GetComponent<LayoutGroup>();
            if (g is HorizontalOrVerticalLayoutGroup hv)
                row["group"] = new Dictionary<string, object> { { "type", g.GetType().Name }, { "control", new List<object> { hv.childControlWidth, hv.childControlHeight } }, { "force_expand", new List<object> { hv.childForceExpandWidth, hv.childForceExpandHeight } }, { "spacing", hv.spacing }, { "padding", g.padding.ToString() } };
            else if (g != null) row["group"] = new Dictionary<string, object> { { "type", g.GetType().Name } };
            // why this size, from the parent group's rules
            if (r.parent != null && r.parent.GetComponent<HorizontalOrVerticalLayoutGroup>() is HorizontalOrVerticalLayoutGroup pg && !(le != null && le.ignoreLayout))
            {
                var why = new List<object>();
                void Axis(string axis, bool control, bool expand, float pref, float min, float flex, float size)
                {
                    if (!control) { why.Add(axis + ": not controlled by the group (RectTransform size " + R(size) + ")"); return; }
                    if (pref <= 0 && min <= 0 && flex <= 0 && !expand) why.Add(axis + ": COLLAPSED, preferred = min = flexible = 0 under Control Child Size, force expand off: add a LayoutElement min/preferred or content");
                    else if (flex > 0 || expand) why.Add(axis + ": preferred " + R(pref) + " (min " + R(min) + ") plus a share of spare space (flexible " + R(flex) + (expand ? ", force expand" : "") + ") = " + R(size));
                    else why.Add(axis + ": preferred " + R(pref) + ", else min " + R(min) + " = " + R(size));
                }
                Axis("width", pg.childControlWidth, pg.childForceExpandWidth, LayoutUtility.GetPreferredWidth(r), LayoutUtility.GetMinWidth(r), LayoutUtility.GetFlexibleWidth(r), r.rect.width);
                Axis("height", pg.childControlHeight, pg.childForceExpandHeight, LayoutUtility.GetPreferredHeight(r), LayoutUtility.GetMinHeight(r), LayoutUtility.GetFlexibleHeight(r), r.rect.height);
                row["why"] = why;
            }
            return row;
        }

        static string P(Transform t, string prefix)
        {
            var parts = new List<string>();
            for (var p = t; p != null; p = p.parent) parts.Insert(0, p.name);
            return prefix + string.Join("/", parts);
        }

        static bool IsInteractive(Component c) =>
            c is Selectable || c is ScrollRect || c is IPointerClickHandler || c is IPointerDownHandler || c is IDragHandler
            || c is IPointerEnterHandler || c is IScrollHandler;

        static bool HasInteractiveOwner(Transform t, Canvas canvas)
        {
            for (var p = t; p != null; p = p.parent)
            {
                foreach (var c in p.GetComponents<Component>()) if (c != null && IsInteractive(c)) return true;
                if (p == canvas.transform) break;
            }
            return false;
        }

        /// <summary>Root by hierarchy: Canvas.isRootCanvas and renderMode are unreliable on a DISABLED nested
        /// canvas (observed 2026-09-24: a hidden sub-canvas reported WorldSpace and root).</summary>
        static bool IsRoot(Canvas c) => c.transform.parent == null || c.transform.parent.GetComponentInParent<Canvas>(true) == null;

        static void AuditHierarchy(GameObject root, string prefix, AgentAudit.Findings f, bool portrait, bool landscape, int maxStatic, Dictionary<string, object> stats)
        {
            // layout groups only know their sizes after a layout pass
            foreach (var c in root.GetComponentsInChildren<Canvas>(true))
                if (IsRoot(c)) LayoutRebuilder.ForceRebuildLayoutImmediate((RectTransform)c.transform);
            foreach (var canvas in root.GetComponentsInChildren<Canvas>(true))
            {
                var path = P(canvas.transform, prefix);
                var own = OwnedBy(canvas);
                bool interactive = own.Any(t => t.GetComponents<Component>().Any(c => c != null && IsInteractive(c)));
                var rc = canvas.GetComponent<GraphicRaycaster>();
                if (rc != null && rc.enabled && !interactive)
                    f.Add("warn", "canvas.raycaster_idle", path, "GraphicRaycaster on a canvas with no interactive element", "remove it (display-only canvases never need one)");
                bool isRoot = IsRoot(canvas);
                if (isRoot && canvas.renderMode != RenderMode.WorldSpace)
                {
                    var sc = canvas.GetComponent<CanvasScaler>();
                    if (sc == null || sc.uiScaleMode != CanvasScaler.ScaleMode.ScaleWithScreenSize)
                        f.Add("error", "canvas.scaler_mode", path, "root canvas not on Scale With Screen Size", "CanvasScaler Scale With Screen Size, reference = design resolution");
                    else if (sc.screenMatchMode == CanvasScaler.ScreenMatchMode.MatchWidthOrHeight && portrait && landscape && (sc.matchWidthOrHeight < 0.25f || sc.matchWidthOrHeight > 0.75f))
                        f.Add("warn", "canvas.match", path, "Match " + sc.matchWidthOrHeight + " while both orientations are allowed", "Match 0.5 (log blend: 1.0 for a swapped aspect), or one canvas per orientation");
                    if (canvas.renderMode == RenderMode.ScreenSpaceOverlay &&
                        (canvas.additionalShaderChannels & (AdditionalCanvasShaderChannels.Normal | AdditionalCanvasShaderChannels.Tangent)) != 0)
                        f.Add("info", "canvas.overlay_channels", path, "Normal/Tangent channels on an Overlay canvas", "remove them: Overlay UI is not lit");
                }
                if (isRoot && canvas.renderMode == RenderMode.WorldSpace && interactive && canvas.worldCamera == null)
                    f.Add("warn", "canvas.world_camera", path, "interactive World Space canvas without an event camera", "assign Canvas.worldCamera");
                if (canvas.pixelPerfect && own.Any(t => t.GetComponent<ScrollRect>() || t.GetComponent<Animator>() || t.GetComponent<Slider>()))
                    f.Add("warn", "canvas.pixel_perfect", path, "Pixel Perfect on a canvas with moving content", "Pixel Perfect off, or move the moving part to a sub-canvas with it off");
                int graphics = own.Count(t => t.GetComponent<Graphic>() != null);
                bool dynamicContent = own.Any(t => t.GetComponent<Animator>() || t.GetComponent<UiPerfDriver>() || (t.GetComponent<Image>() is Image im && im.type == Image.Type.Filled));
                if (graphics > maxStatic && dynamicContent)
                    f.Add("warn", "canvas.mixed_timing", path, graphics + " graphics share a canvas with per-frame content", "split: static canvas + dynamic sub-canvas (measure BuildBatch before/after)");
                stats[path] = new Dictionary<string, object> { { "graphics", graphics }, { "interactive", interactive }, { "render_mode", canvas.renderMode.ToString() }, { "enabled", canvas.enabled } };
            }

            foreach (var g in root.GetComponentsInChildren<Graphic>(true))
            {
                var canvas = g.canvas != null ? g.canvas : g.GetComponentInParent<Canvas>(true);
                if (canvas == null) continue;
                var path = P(g.transform, prefix);
                if (g.raycastTarget && !HasInteractiveOwner(g.transform, canvas) && !(g.GetComponentInParent<TMP_Dropdown>(true) != null))
                    f.Add("warn", "graphic.raycast_target", path, "raycastTarget on a non-interactive " + g.GetType().Name, "untick Raycast Target");
                if (g is Text) f.Add("warn", "text.legacy", path, "legacy UnityEngine.UI.Text", "TextMeshProUGUI (TMP ships inside uGUI 2.0)");
                if ((g is Text || g is TMP_Text) && g.GetComponent<BaseMeshEffect>() != null)
                    f.Add("warn", "text.mesh_effect", path, "Shadow/Outline mesh effect on text", "TMP material outline/underlay (shader side, no extra vertices)");
            }
            foreach (var rt in root.GetComponentsInChildren<RectTransform>(true))
            {
                if (rt.GetComponent<Canvas>() != null && IsRoot(rt.GetComponent<Canvas>())) continue;
                if (rt.GetComponentInParent<Canvas>(true) == null) continue;
                var path = P(rt, prefix);
                if (Mathf.Abs(rt.localPosition.z) > 0.001f || Mathf.Abs(rt.localEulerAngles.x) > 0.01f || Mathf.Abs(rt.localEulerAngles.y) > 0.01f)
                    f.Add("warn", "graphic.z_or_rotation", path, "non-zero z or off-plane rotation (z " + rt.localPosition.z + ")", "zero it: non-coplanar elements break batches");
                if ((rt.localScale - Vector3.one).sqrMagnitude > 1e-6f)
                    f.Add("info", "graphic.scale", path, "localScale " + rt.localScale, "keep UI at scale 1; size with the RectTransform");
                var fitter = rt.GetComponent<ContentSizeFitter>();
                var parentGroup = rt.parent != null ? rt.parent.GetComponent<LayoutGroup>() : null;
                if (fitter != null && parentGroup != null)
                {
                    bool ctrlW = parentGroup is GridLayoutGroup || (parentGroup is HorizontalOrVerticalLayoutGroup hv && hv.childControlWidth);
                    bool ctrlH = parentGroup is GridLayoutGroup || (parentGroup is HorizontalOrVerticalLayoutGroup hv2 && hv2.childControlHeight);
                    if ((ctrlW && fitter.horizontalFit != ContentSizeFitter.FitMode.Unconstrained) || (ctrlH && fitter.verticalFit != ContentSizeFitter.FitMode.Unconstrained))
                        f.Add("error", "layout.fitter_in_group", path, "ContentSizeFitter fights its parent " + parentGroup.GetType().Name, "remove it; drive the size with LayoutElement values, fit only at the top of the hierarchy");
                }
                if (fitter != null && ((fitter.verticalFit != ContentSizeFitter.FitMode.Unconstrained && Mathf.Approximately(rt.pivot.y, 0.5f) && rt.GetComponentInParent<ScrollRect>(true) != null)))
                    f.Add("warn", "layout.fitter_pivot", path, "self-sizing content with a centre pivot", "pivot at the edge that must stay fixed (y = 1 grows down)");
                if (parentGroup is HorizontalOrVerticalLayoutGroup g2 && (g2.childControlHeight || g2.childControlWidth))
                {
                    var le = rt.GetComponent<LayoutElement>();
                    if (le == null || !le.ignoreLayout)
                    {
                        // collapses only when the group controls the axis, does not force-expand it, and the child
                        // reports nothing: preferred, else min, else 0 (Christina, HTQV4mukZ2M [00:16:31])
                        bool zeroH = g2.childControlHeight && !g2.childForceExpandHeight && LayoutUtility.GetPreferredHeight(rt) <= 0 && LayoutUtility.GetMinHeight(rt) <= 0 && LayoutUtility.GetFlexibleHeight(rt) <= 0;
                        bool zeroW = g2.childControlWidth && !g2.childForceExpandWidth && LayoutUtility.GetPreferredWidth(rt) <= 0 && LayoutUtility.GetMinWidth(rt) <= 0 && LayoutUtility.GetFlexibleWidth(rt) <= 0;
                        if (zeroH || zeroW)
                            f.Add("error", "layout.zero_child", path, "reports min = preferred = 0 under Control Child Size: it collapses", "LayoutElement min/preferred size, or a real sprite");
                    }
                }
                if (rt.GetComponent<LayoutGroup>() != null)
                {
                    int depth = 0;
                    for (var p = rt.parent; p != null; p = p.parent) if (p.GetComponent<LayoutGroup>() != null || p.GetComponent<ScrollRect>() != null) depth++;
                    if (depth >= 2) f.Add("info", "layout.nested", path, "layout group nested " + depth + " deep (Scroll Rect counts)", "fine for screens that rebuild on open; for per-frame UI use anchors or on-demand layout");
                }
                if (rt.GetComponent<Animator>() != null)
                    f.Add("warn", "anim.animator", path, "Animator under a canvas dirties it every frame", "code or tween for event-driven motion; Animator only if it changes every frame anyway");
                var sel = rt.GetComponent<Selectable>();
                if (sel != null && sel.transition == Selectable.Transition.Animation)
                    f.Add("warn", "anim.button_animation", path, "Selectable uses the Animation transition", "Color Tint (or Sprite Swap) plus a code tween");
                if (sel != null && sel.interactable && sel.navigation.mode == Navigation.Mode.None && sel.GetComponentInParent<MenuScreen>(true) != null && !(sel is Scrollbar))
                    f.Add("warn", "input.navigation_none", path, "interactive control unreachable by keyboard/gamepad", "Navigation Automatic or Explicit");
                var ms = rt.GetComponent<MenuScreen>();
                if (ms != null && ms.FirstSelected == null)
                    f.Add("error", "input.first_selected", path, "MenuScreen without a first selection", "assign FirstSelected (selected one frame after the screen shows)");
                var mask = rt.GetComponent<Mask>();
                if (mask != null && mask.enabled && !IsScrollViewport(rt))
                    f.Add("warn", "mask.static_stencil", path, "stencil Mask on static content (no scroll view uses it)",
                          "pre-cut the art (a round sprite, a frame over the content) or clip in the material/UI Shader Graph; RectMask2D for rectangles");
                if (CenterAnchoredNearEdge(rt, out var offset))
                    f.Add("warn", "anchor.center_edge", path, "anchored to the centre but placed toward an edge (offset " + offset + " reference px)",
                          "anchor to the nearest corner or edge while the Game view shows the design resolution, keep the on-screen position");
            }
        }

        static bool IsScrollViewport(RectTransform rt)
        {
            if (rt.GetComponent<ScrollRect>() != null || (rt.parent != null && rt.parent.GetComponent<ScrollRect>() != null)) return true;
            foreach (var sr in rt.GetComponentsInParent<ScrollRect>(true)) if (sr.viewport == rt) return true;
            return false;
        }

        static bool FullStretch(RectTransform r) =>
            r.anchorMin == Vector2.zero && r.anchorMax == Vector2.one && r.offsetMin.sqrMagnitude < 1f && r.offsetMax.sqrMagnitude < 1f;

        /// <summary>Centre anchors on an element whose parent spans the screen (a root canvas, or full-stretch
        /// panels up to it), not driven by a layout group, and whose centre sits more than a quarter of the
        /// reference size away from the middle: the default anchor the manual warns about.</summary>
        static bool CenterAnchoredNearEdge(RectTransform rt, out Vector2 offset)
        {
            offset = Vector2.zero;
            var half = new Vector2(0.5f, 0.5f);
            if (rt.anchorMin != half || rt.anchorMax != half || rt.GetComponent<Canvas>() != null) return false;
            var parent = rt.parent as RectTransform;
            if (parent == null || parent.GetComponent<LayoutGroup>() != null) return false;
            Canvas rootCanvas = null;
            for (var p = parent; p != null; p = p.parent as RectTransform)
            {
                var c = p.GetComponent<Canvas>();
                if (c != null && IsRoot(c)) { rootCanvas = c; break; }
                if (!FullStretch(p)) return false;
            }
            if (rootCanvas == null || rootCanvas.renderMode == RenderMode.WorldSpace) return false;
            var sc = rootCanvas.GetComponent<CanvasScaler>();
            var reference = sc != null && sc.uiScaleMode == CanvasScaler.ScaleMode.ScaleWithScreenSize ? sc.referenceResolution : ((RectTransform)rootCanvas.transform).rect.size;
            if (reference.x <= 0 || reference.y <= 0) return false;
            var size = rt.sizeDelta;
            if (size.x >= 0.9f * reference.x || size.y >= 0.9f * reference.y) return false;   // backgrounds and full panels
            offset = rt.anchoredPosition + Vector2.Scale(half - rt.pivot, size);
            return Mathf.Abs(offset.x) > 0.25f * reference.x || Mathf.Abs(offset.y) > 0.25f * reference.y;
        }

        /// <summary>Screen-space layers of both systems, world canvases and the sprites UI Images use.</summary>
        static void CollectLayers(GameObject root, string prefix, List<Dictionary<string, object>> layers, List<string> world, HashSet<string> sprites)
        {
            foreach (var c in root.GetComponentsInChildren<Canvas>(true))
            {
                if (!IsRoot(c)) continue;
                if (c.renderMode == RenderMode.WorldSpace) { if (c.GetComponentInChildren<Graphic>(true) != null) world.Add(P(c.transform, prefix)); continue; }
                if (c.renderMode != RenderMode.ScreenSpaceOverlay) continue;   // camera canvases sort by camera and plane distance
                layers.Add(new Dictionary<string, object> { { "system", "uGUI" }, { "path", P(c.transform, prefix) }, { "sort", (float)c.sortingOrder }, { "key", "canvas:" + c.GetInstanceID() } });
            }
            foreach (var d in root.GetComponentsInChildren<UIDocument>(true))
            {
                if (d.panelSettings == null || d.transform.parent != null && d.transform.parent.GetComponentInParent<UIDocument>(true) != null) continue;
                if (IsWorldPanel(d.panelSettings)) continue;
                layers.Add(new Dictionary<string, object>
                {
                    { "system", "UI Toolkit" }, { "path", P(d.transform, prefix) }, { "sort", d.panelSettings.sortingOrder },
                    { "panel_settings", AssetDatabase.GetAssetPath(d.panelSettings) }, { "document_sort", d.sortingOrder },
                    { "key", "panel:" + d.panelSettings.GetInstanceID() },
                });
            }
            foreach (var im in root.GetComponentsInChildren<Image>(true))
                if (im.sprite != null) { var sp = AssetDatabase.GetAssetPath(im.sprite); if (!string.IsNullOrEmpty(sp)) sprites.Add(sp); }
        }

        /// <summary>World-space panels (6.2+) sort by camera distance, not sort order.</summary>
        static bool IsWorldPanel(PanelSettings ps) => ps.renderMode == PanelRenderMode.WorldSpace;

        /// <summary>Two layers with the same sort order: documents on ONE PanelSettings are one panel (ordered by
        /// UIDocument sort order), so only distinct canvases and distinct panels can tie.</summary>
        static void StackChecks(AgentAudit.Findings f, List<Dictionary<string, object>> layers)
        {
            foreach (var g in layers.GroupBy(l => Convert.ToSingle(l["sort"])))
            {
                var distinct = g.GroupBy(l => (string)l["key"]).Select(x => x.First()).ToList();
                if (distinct.Count < 2) continue;
                bool cross = distinct.Select(l => (string)l["system"]).Distinct().Count() > 1;
                f.Add("warn", "stack.sort_tie", string.Join(" | ", distinct.Select(l => (string)l["path"])),
                      distinct.Count + (cross ? " layers of BOTH systems" : " layers") + " share sort order " + g.Key + ": top layer (drawing and input) left to Hierarchy or load order",
                      "give every layer its own sort order from one table shared by Canvas.sortingOrder and PanelSettings.sortingOrder (for example HUD 0, menus 10, modal 20, toasts 30)");
            }
        }

        /// <summary>Sprite Atlas settings for UI: rotation and tight packing off, compression on.</summary>
        static List<object> AtlasChecks(AgentAudit.Findings f, List<string> explicitPaths, HashSet<string> uiSprites)
        {
            var outList = new List<object>();
            var paths = explicitPaths ?? AssetDatabase.FindAssets("t:SpriteAtlas", new[] { "Assets" }).Select(AssetDatabase.GUIDToAssetPath).ToList();
            foreach (var path in paths.Distinct())
            {
                var atlas = AssetDatabase.LoadAssetAtPath<SpriteAtlas>(path);
                if (atlas == null) continue;
                var packables = new List<string>();
                try { packables = atlas.GetPackables().Where(o => o != null).Select(AssetDatabase.GetAssetPath).ToList(); } catch (Exception) { }
                bool usedByUi = explicitPaths != null || uiSprites.Any(s => packables.Any(p => s == p || s.StartsWith(p.TrimEnd('/') + "/")));
                if (!usedByUi) continue;
                SpriteAtlasPackingSettings packing;
                TextureImporterPlatformSettings plat;
                bool v2 = path.EndsWith(".spriteatlasv2", StringComparison.OrdinalIgnoreCase);
                if (v2)
                {
                    var imp = (SpriteAtlasImporter)AssetImporter.GetAtPath(path);
                    packing = imp.packingSettings;
                    plat = imp.GetPlatformSettings("DefaultTexturePlatform");
                }
                else
                {
                    packing = atlas.GetPackingSettings();
                    plat = atlas.GetPlatformSettings("DefaultTexturePlatform");
                }
                var row = new Dictionary<string, object>
                {
                    { "path", path }, { "v2", v2 }, { "rotation", packing.enableRotation }, { "tight_packing", packing.enableTightPacking },
                    { "compression", plat != null ? plat.textureCompression.ToString() : null }, { "packables", packables },
                };
                outList.Add(row);
                if (packing.enableRotation)
                    f.Add("error", "atlas.rotation", path, "UI Sprite Atlas allows rotation: Images show rotated sprites", "untick Allow Rotation (packingSettings.enableRotation = false)");
                if (packing.enableTightPacking)
                    f.Add("error", "atlas.tight_packing", path, "UI Sprite Atlas uses tight packing: Images are quads, neighbours bleed in", "untick Tight Packing (packingSettings.enableTightPacking = false)");
                if (plat != null && plat.textureCompression == TextureImporterCompression.Uncompressed)
                    f.Add("info", "atlas.uncompressed", path, "UI Sprite Atlas uncompressed on the default platform", "set compression per platform (Andy Touch: 8 MB to 244 KB), check the icons at 100 %");
            }
            return outList;
        }

        /// <summary>Transforms drawn by this canvas (children, excluding nested canvases' subtrees).</summary>
        static List<Transform> OwnedBy(Canvas canvas)
        {
            var list = new List<Transform>();
            void Walk(Transform t)
            {
                foreach (Transform c in t)
                {
                    if (c.GetComponent<Canvas>() != null) continue;
                    list.Add(c);
                    Walk(c);
                }
            }
            Walk(canvas.transform);
            return list;
        }

        /// <summary>Glyph gate. try_add = true lets DYNAMIC font assets (TMP's LiberationSans SDF - Fallback is
        /// one) pull glyphs from their source font before answering; with false a dynamic fallback reports
        /// characters it could render as missing. candidate_fallback_font = a font file (for example a Noto
        /// .otf in the project, or an OS font path) tried as a TEMPORARY extra local fallback: "would this
        /// font cover the gap?" before anyone generates and commits a font asset.</summary>
        static Dictionary<string, object> TmpChecks(AgentAudit.Findings f, List<string> texts, bool tryAdd, string candidate)
        {
            var s = TMP_Settings.LoadDefaultSettings();
            var r = new Dictionary<string, object> { { "settings", s != null } };
            if (s == null)
            {
                f.Add("error", "tmp.settings", "TMP Settings", "TMP Essential Resources not imported", "run AgentKit.UI.UISetup.ImportTmpEssentials");
                return r;
            }
            var font = TMP_Settings.defaultFontAsset;
            r["default_font"] = font != null ? font.name : null;
            r["general_fallbacks"] = TMP_Settings.fallbackFontAssets != null ? TMP_Settings.fallbackFontAssets.Count : 0;
            var missing = new List<object>();
            TMP_FontAsset cand = null;
            if (!string.IsNullOrEmpty(candidate) && font != null)
            {
                var file = candidate.StartsWith("Assets/") ? Path.GetFullPath(candidate) : candidate;
                cand = TMP_FontAsset.CreateFontAsset(file, 0, 90, 9, UnityEngine.TextCore.LowLevel.GlyphRenderMode.SDFAA, 1024, 1024);
                if (cand == null) throw new InvalidOperationException("could not load candidate font " + candidate);
                font.fallbackFontAssetTable.Add(cand);
                r["candidate_fallback_font"] = candidate;
            }
            try
            {
            foreach (var t in texts)
            {
                if (font == null || string.IsNullOrEmpty(t)) continue;
                // searchFallbacks: true walks the font's local fallbacks, then TMP Settings' general list
                if (!font.HasCharacters(t, out uint[] miss, true, tryAdd) && miss != null && miss.Length > 0)
                {
                    var cps = miss.Distinct().Take(12).Select(u => (object)("U+" + u.ToString("X4"))).ToList();
                    missing.Add(new Dictionary<string, object> { { "text", t.Length > 40 ? t.Substring(0, 40) : t }, { "missing", cps }, { "count", miss.Distinct().Count() } });
                    f.Add("error", "tmp.missing_glyphs", font.name, miss.Distinct().Count() + " characters fall to the Missing glyph in \"" + (t.Length > 24 ? t.Substring(0, 24) + "..." : t) + "\"",
                          "add a fallback font asset covering them (local fallback list of the primary font, or TMP Settings)");
                }
            }
            }
            finally
            {
                if (cand != null) { font.fallbackFontAssetTable.Remove(cand); UnityEngine.Object.DestroyImmediate(cand); }
            }
            r["missing"] = missing;
            r["try_add"] = tryAdd;
            return r;
        }
    }
}
