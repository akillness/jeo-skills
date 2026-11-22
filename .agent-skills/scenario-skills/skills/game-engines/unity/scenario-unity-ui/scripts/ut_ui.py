"""
ut_ui: runner-side helpers of the scenario-unity-ui skill (UI developer persona).

Imports the shared toolkit of scenario-unity-expert (ut_env, ut_run, ut_review); never copies it.
System python3 (3.9+), no third-party module required (Pillow optional for labelled sheets).

    import sys; sys.path.insert(0, "<skills>/scenario-unity-ui/scripts")
    import ut_ui
    P = ut_ui.project("<repo>/tests/projects/unity-ui")    # APFS clone of Base3D_URP + AgentKit + UI kit + runtime
    ut_ui.choose_system({"keyframed_animation"}, ui_heavy=False)   -> {"system": "uGUI", ...}
    ut_ui.canvas_scale(1080, 1920, (1920, 1080), 0.5)              -> 1.0   (uGUI, log-space Match)
    ut_ui.panel_scale(1080, 1920, (1920, 1080), 0.5)               -> 1.1701 (UI Toolkit, linear Match, measured)
    ut_ui.contrast_ratio("#f5f6fa", "#40739e")                      -> 4.67
    ut_ui.lint_uss(text), ut_ui.lint_uxml(text)                     -> findings
    ut_ui.lint_cs_events(cs), ut_ui.lint_cs_queries(cs, uxml_names) -> findings (event hygiene, lost names)
    ut_ui.uitk_hide_method(hidden_seconds=600, toggles_per_minute=0.5) -> which UI Toolkit hiding method, why
    ut_ui.add_ui_test_framework(P)                                   -> com.unity.ui.test-framework in the manifest
    ut_ui.layout_verdict(capture_envelope)                          -> error lines (empty = pass)
    ut_ui.review(capture_envelope, sheet)                           -> image checks + contact sheet to LOOK at

Run in Unity 6000.3.21f1 on 2026-09-24 through tests/code/unity-ui/ (see references/procedures.md).
"""

__version__ = "0.1"

import json

import math
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SKILL = os.path.dirname(HERE)
SKILLS = os.path.dirname(SKILL)
EXPERT_SCRIPTS = os.path.join(SKILLS, "scenario-unity-expert", "scripts")
if EXPERT_SCRIPTS not in sys.path:
    sys.path.insert(0, EXPERT_SCRIPTS)

import ut_env  # noqa: E402
import ut_run  # noqa: E402
import ut_review  # noqa: E402

AGENTKIT_UI = os.path.join(HERE, "AgentKit")                 # editor jobs -> Assets/Editor/AgentKit/UI/
RUNTIME_UI = os.path.join(HERE, "Runtime")                   # runtime components -> Assets/AgentUI/Runtime/
TEMPLATES_UITK = os.path.join(HERE, "templates", "uitk")     # UXML/USS/TSS text -> Assets/AgentUI/HUD/

# Device matrix (pixels). "min_target_px" = a 7 mm touch target at the assumed density [added:
# Apple HIG 44 pt and Material 48 dp are both about 7 mm]; 0 = no touch check (mouse, TV).
DEVICES = {
    "phone_portrait": {"width": 1080, "height": 1920, "handheld": True, "dpi": 420, "min_target_px": 116},
    "phone_tall_portrait": {"width": 1170, "height": 2532, "handheld": True, "dpi": 460, "min_target_px": 127},
    "tablet_landscape": {"width": 2048, "height": 1536, "handheld": True, "dpi": 264, "min_target_px": 73},
    "laptop_16x9": {"width": 1920, "height": 1080, "handheld": False, "dpi": 0, "min_target_px": 0},
    "qhd": {"width": 2560, "height": 1440, "handheld": False, "dpi": 0, "min_target_px": 0},
    "ultrawide_21x9": {"width": 3440, "height": 1440, "handheld": False, "dpi": 0, "min_target_px": 0},
    "uhd_4k": {"width": 3840, "height": 2160, "handheld": False, "dpi": 0, "min_target_px": 0},
}
REQUIRED_MATRIX = ["phone_portrait", "laptop_16x9", "uhd_4k"]

# One sort-order table for BOTH systems (Canvas.sortingOrder and PanelSettings.sortingOrder are compared
# with each other for drawing since 2021.2 and by the EventSystem for input; measured for input in P13).
# Distinct values per layer: a tie leaves the top layer to Hierarchy or load order. [added] table.
UI_LAYERS = {"world_markers": -10, "hud": 0, "menu": 10, "modal": 20, "toast": 30, "debug": 100}


# ============================================================================ project setup
def _copy_tree(src, dst, exts):
    written = []
    for dirpath, _dirs, files in os.walk(src):
        rel = os.path.relpath(dirpath, src)
        for fn in files:
            if not fn.endswith(exts):
                continue
            s = os.path.join(dirpath, fn)
            d = os.path.normpath(os.path.join(dst, rel, fn))
            with open(s, "rb") as f:
                data = f.read()
            if os.path.isfile(d):
                with open(d, "rb") as f:
                    if f.read() == data:
                        continue
            os.makedirs(os.path.dirname(d), exist_ok=True)
            with open(d, "wb") as f:
                f.write(data)
            written.append(d)
    return written


def install(project):
    """Core AgentKit (scenario-unity-expert) + this skill's editor jobs (Assets/Editor/AgentKit/UI) + the runtime
    components (Assets/AgentUI/Runtime, asmdef AgentUI.Runtime referencing Unity.TextMeshPro,
    UnityEngine.UI and Unity.InputSystem, so Play Mode test assemblies can reference it; editor jobs
    see it through autoReferenced). Returns the written files (relative)."""
    root = ut_env.find_project(project)["root"]
    written = list(ut_env.install_agentkit(root))
    written += ut_env.install_agentkit(root, src=AGENTKIT_UI)
    written += [os.path.relpath(p, root) for p in _copy_tree(RUNTIME_UI, os.path.join(root, "Assets", "AgentUI", "Runtime"), (".cs", ".asmdef"))]
    return written


def write_uitk_templates(project, folder="Assets/AgentUI/HUD", overrides=None):
    """Write the HUD's UXML, USS and TSS as text files (no UI Builder). overrides: {filename: text}
    replaces a template. Unity imports them on the next job; read UIToolkitBuild.ImportReport."""
    root = ut_env.find_project(project)["root"]
    dst = os.path.join(root, *folder.split("/"))
    written = _copy_tree(TEMPLATES_UITK, dst, (".uxml", ".uss", ".tss"))
    for name, text in (overrides or {}).items():
        p = os.path.join(dst, name)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "w") as f:
            f.write(text)
        written.append(p)
    return [os.path.relpath(p, root) for p in written]


def project(dest):
    """ut_env.base_project("3d", dest) (APFS clone of tests/projects/Base3D_URP) + install()."""
    p = ut_env.base_project("3d", dest)
    install(p)
    return p


def run(project, method, args=None, **kw):
    """ut_run.run_method with a readable failure: raises RuntimeError when the envelope is not ok."""
    r = ut_run.run_method(project, method, args or {}, **kw)
    if not r.get("ok"):
        raise RuntimeError("%s failed: %s | compile: %s | exc: %s | log: %s" % (
            method, r.get("error"), r.get("compile_errors", [])[:3], r.get("exceptions", [])[:3], r.get("log")))
    return r


def shots(names=None, screen=None, prefix=""):
    """Capture specs for UICapture jobs from DEVICES: [{name, width, height, handheld, min_target_px, screen}]."""
    out = []
    for n in names or REQUIRED_MATRIX:
        d = dict(DEVICES[n])
        spec = {"name": prefix + n, "width": d["width"], "height": d["height"],
                "handheld": d["handheld"], "min_target_px": d["min_target_px"]}
        if screen:
            spec["screen"] = screen
        out.append(spec)
    return out


# ============================================================================ system choice
# Unity 6.3 Manual, "Comparison of UI systems": runtime recommendation uGUI, alternative UI Toolkit.
UGUI_ONLY = {"keyframed_animation", "timeline", "serialized_events", "in_scene_authoring"}
UITK_ONLY = {"data_binding", "transitions", "textureless", "flexible_layout", "global_styles",
             "dynamic_atlas", "ui_antialiasing", "rtl_or_emoji", "svg"}
# Rows both systems support in the 6.3 matrix: never a reason to pick one (tutorials from before 6.2/6.3
# route custom shaders and world-space UI to uGUI; 6.3 has UI Shader Graph and world-space UI Toolkit).
SHARED = {"custom_shaders", "world_space", "font_fallbacks", "input_system", "sprite_atlas", "masks",
          "rich_text", "adaptive_layout", "screen_space"}


def choose_system(needs, ui_heavy=False, existing=None, editor_tool=False, team=None):
    """Route a UI brief to uGUI, UI Toolkit or a split, quoting the 6.3 matrix rows that decide.
    needs: set of feature keys (UGUI_ONLY | UITK_ONLY); existing: "ugui" | "uitk" | None (keep what
    the project uses unless blocked); team: "tech_artists" | "ui_designers" | None."""
    needs = set(needs or ())
    shared = sorted(needs & SHARED)
    unknown = needs - UGUI_ONLY - UITK_ONLY - SHARED
    a, b = sorted(needs & UGUI_ONLY), sorted(needs & UITK_ONLY)
    r = _choose(a, b, existing, editor_tool, ui_heavy, team)
    r["unknown"] = sorted(unknown)
    if shared:
        r["shared_not_deciding"] = shared
        r["why"].append("%s: supported by both systems in 6.3 (UI Shader Graph, world-space UI Toolkit since 6.2), not a deciding row" % shared)
    return r


def _choose(a, b, existing, editor_tool, ui_heavy, team):
    unknown = ()
    if editor_tool:
        return {"system": "UI Toolkit", "why": ["Editor UI: UI Toolkit is the 6.3 recommendation (IMGUI alternative)"], "unknown": sorted(unknown)}
    if a and b:
        return {"system": "split", "ugui_for": a, "uitk_for": b,
                "why": ["needs uGUI-only rows %s and UI Toolkit-only rows %s: split by screen" % (a, b)], "unknown": sorted(unknown)}
    if a:
        return {"system": "uGUI", "why": ["uGUI-only rows: %s" % a], "unknown": sorted(unknown)}
    if b:
        return {"system": "UI Toolkit", "why": ["UI Toolkit-only rows: %s" % b], "unknown": sorted(unknown)}
    if existing in ("ugui", "uitk"):
        return {"system": "uGUI" if existing == "ugui" else "UI Toolkit", "why": ["no blocker: keep the system the project already uses"], "unknown": sorted(unknown)}
    if ui_heavy or team == "ui_designers":
        return {"system": "UI Toolkit", "why": ["UI-heavy project or designer-led team: 'often used' case in the 6.3 matrix"], "unknown": sorted(unknown)}
    return {"system": "uGUI", "why": ["6.3 runtime recommendation (uGUI), nothing in the brief needs UI Toolkit"], "unknown": sorted(unknown)}


# ============================================================================ scaling math
def canvas_scale(w, h, reference=(1920, 1080), match=0.5, handheld_multiplier=1.0):
    """uGUI CanvasScaler, Scale With Screen Size + Match Width Or Height: log-space blend
    (CanvasScaler.HandleScaleWithScreenSize). handheld_multiplier divides the reference (CanvasDeviceScale)."""
    rx, ry = reference[0] / handheld_multiplier, reference[1] / handheld_multiplier
    lw, lh = math.log2(w / rx), math.log2(h / ry)
    return round(2 ** (lw + (lh - lw) * match), 4)


def panel_scale(w, h, reference=(1920, 1080), match=0.5):
    """UI Toolkit PanelSettings, Scale With Screen Size + Match Width Or Height. Measured 2026-09-24 in
    6000.3.21f1: a LINEAR blend of the width and height ratios (1080 x 1920 at a 1920 x 1080 reference,
    Match 0.5 -> 1.1701, not 1.0 as in uGUI). Same Match value, different result in portrait."""
    return round((w / reference[0]) * (1 - match) + (h / reference[1]) * match, 4)


def reference_size(w, h, scale):
    """Screen size in reference units (the space the layout is authored in)."""
    return (round(w / scale, 1), round(h / scale, 1))


# ============================================================================ colour and design
def _lin(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_rgb(hexs):
    h = hexs.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def luminance(hexs):
    r, g, b = hex_rgb(hexs)
    return 0.2126 * _lin(r) + 0.7152 * _lin(g) + 0.0722 * _lin(b)


def contrast_ratio(fg, bg):
    """WCAG 2.x contrast ratio [added]: 4.5:1 body text, 3:1 large text (>= 24 px regular or 18.66 px bold)."""
    a, b = luminance(fg), luminance(bg)
    hi, lo = max(a, b), min(a, b)
    return round((hi + 0.05) / (lo + 0.05), 2)


def blend(fg, bg, alpha):
    """fg over bg at alpha (sRGB bytes, as uGUI and UI Toolkit blend by default)."""
    f, b = hex_rgb(fg), hex_rgb(bg)
    return "#%02x%02x%02x" % tuple(int(round(f[i] * alpha + b[i] * (1 - alpha))) for i in range(3))


def color_distance(a, b):
    ra, rb = hex_rgb(a), hex_rgb(b)
    return max(abs(ra[i] - rb[i]) for i in range(3))


# Default token pairs of UiTheme (text colour, background colour, large text?)
THEME_PAIRS = [
    ("#f5f6fa", "#2f3640", False, "body text on background"),
    ("#f5f6fa", "#353b48", False, "body text on surface"),
    ("#dcdde1", "#353b48", False, "muted text on surface"),
    ("#f5f6fa", "#40739e", True, "button label on selected accent"),
    ("#f5f6fa", "#487eb0", True, "button label on pressed accent"),
]


def check_pairs(pairs=THEME_PAIRS):
    """-> list of {pair, ratio, need, ok}."""
    out = []
    for fg, bg, large, what in pairs:
        r = contrast_ratio(fg, bg)
        need = 3.0 if large else 4.5
        out.append({"pair": what, "fg": fg, "bg": bg, "ratio": r, "need": need, "ok": r >= need})
    return out


# ============================================================================ UI Toolkit hiding choice
def uitk_hide_method(hidden_seconds, toggles_per_minute=0.0, gpu_bound=False, layout_may_shift=True,
                     memory_bound=False):
    """Pick a UI Toolkit hiding method from how long and how often an element is hidden (Nicolas Borromeo,
    bECmaYIvZJg [00:38:08] and [frame 00:36:49]; UI Toolkit manual "Best practices for managing elements").
    Returns {method, code, why}. Measured costs per method: references/procedures.md P16."""
    if toggles_per_minute >= 6 and hidden_seconds <= 10:
        if gpu_bound:
            return {"method": "display", "code": "style.display = DisplayStyle.None / Flex",
                    "why": "frequent short toggles on a GPU-bound project: no GPU cost while hidden, cheap to toggle; "
                           "opacity and off-screen keep shading every vertex"}
        return {"method": "opacity_or_offscreen", "code": "style.opacity = 0, or style.translate = new Translate(-5000, -5000) with UsageHints.DynamicTransform set before it joins the panel",
                "why": "frequent short toggles (blinking, a popup every few seconds): lowest toggle cost, full render cost kept"}
    if hidden_seconds >= 60 or memory_bound:
        return {"method": "remove", "code": "element.RemoveFromHierarchy(); parent.Add(element) to show",
                "why": "hidden for long periods (settings behind Escape, a mobile menu): zero CPU, GPU and binding cost "
                       "while hidden, styles and meshes freed; re-adding is the costliest toggle, paid rarely"}
    if not layout_may_shift:
        return {"method": "visibility", "code": "style.visibility = Visibility.Hidden",
                "why": "layout must not move: keeps its space; a child with visibility: visible still shows"}
    return {"method": "display", "code": "style.display = DisplayStyle.None / Flex",
            "why": "in between: no GPU cost, siblings reflow, bindings keep updating while hidden"}


# ============================================================================ project packages
def add_ui_test_framework(project, version="6.3.0"):
    """Add com.unity.ui.test-framework (built into 6000.3.21f1, new in 6.3: simulated clicks, keys and frame
    updates on a UI Toolkit panel) to Packages/manifest.json. Returns True when the manifest changed."""
    root = ut_env.find_project(project)["root"]
    path = os.path.join(root, "Packages", "manifest.json")
    with open(path) as f:
        data = json.load(f)
    new, changed = with_package(data, "com.unity.ui.test-framework", version)
    if changed:
        with open(path, "w") as f:
            json.dump(new, f, indent=2)
            f.write("\n")
    return changed


def with_package(manifest, name, version):
    """(manifest with dependencies[name] = version, changed?) without touching other entries."""
    data = json.loads(json.dumps(manifest))
    deps = data.setdefault("dependencies", {})
    if deps.get(name) == version:
        return data, False
    deps[name] = version
    return data, True


# ============================================================================ C# lint (runtime UI scripts)
_EVENT_SUB = re.compile(r"([A-Za-z_][\w.]*(?:\.\w+)?)\s*\+=\s*([^;]+);")


def lint_cs_events(text, path="<cs>"):
    """Event hygiene (Jason Weimann, 6ztY9-IX3Qg [00:34:15], [00:35:20]; Tarodev I1JcytXwXM4 [00:24:09]):
    every `X += H` needs a matching `X -= H`; a lambda subscribed to an event can never be removed.
    Heuristic text lint: assignments to numbers (`n += 1`) are skipped."""
    f = []
    body = re.sub(r"//.*", "", re.sub(r"/\*.*?\*/", "", text, flags=re.S))
    subs = _EVENT_SUB.findall(body)
    unsubs = set((a.strip(), b.strip()) for a, b in re.findall(r"([A-Za-z_][\w.]*)\s*-=\s*([^;]+);", body))
    for target, handler in subs:
        h = handler.strip()
        is_lambda = "=>" in h or h.startswith("delegate")
        last = h.split(".")[-1]
        # a handler is a method group (Upper-case name by C# convention) or a lambda; `n += 1`,
        # `t += Time.deltaTime`, `s += "x"` are arithmetic or strings, not subscriptions
        if not is_lambda and not re.fullmatch(r"[A-Za-z_][\w.]*", h) or (not is_lambda and not last[:1].isupper()):
            continue
        if is_lambda:
            f.append(_finding("warn", "cs.lambda_subscription", path, "%s += lambda: it can never be unsubscribed" % target,
                              "subscribe a named method (or keep the delegate in a field) and -= it in OnDisable/OnDestroy"))
        elif (target.strip(), h) not in unsubs:
            f.append(_finding("warn", "cs.event_no_unsubscribe", path, "%s += %s has no matching -=" % (target.strip(), h),
                              "unsubscribe in OnDisable (if subscribed in OnEnable) or OnDestroy (Awake/Start); register, then initialise"))
    return f


def lint_cs_queries(text, uxml_names, path="<cs>"):
    """Names queried from C# (Q<T>("name"), Q("name"), Query("name")) that the UXML no longer has: the lookup
    returns null at runtime, silently (Game Dev Guide, 6DcwHPxCE54 [00:10:35])."""
    names = set(uxml_names)
    f = []
    for m in re.finditer(r"\.Q(?:uery)?(?:<[\w.]+>)?\(\s*\"([^\"]+)\"", text):
        if m.group(1) not in names:
            f.append(_finding("error", "cs.query_missing_name", path, "queries \"%s\", absent from the UXML" % m.group(1),
                              "rename in both places, or build the tree in C# (no string lookups)"))
    return f


# ============================================================================ text lint (UXML / USS)
LAYOUT_PROPS = ("width", "height", "left", "top", "right", "bottom", "margin", "padding", "flex", "min-", "max-")


def lint_uss(text, path="<uss>"):
    """Findings in the AgentKit format. Rules: no transition on layout properties (Borromeo:
    animate translate/scale/rotate); opacity:0 as a resting state is a GPU cost in UI Toolkit;
    border-radius + overflow:hidden in one rule = stencil mask (batch break per mask container)."""
    f = []
    body = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    for m in re.finditer(r"([^{}]+)\{([^}]*)\}", body):
        sel, decl = m.group(1).strip(), m.group(2)
        props = dict((k.strip(), v.strip()) for k, v in (d.split(":", 1) for d in decl.split(";") if ":" in d))
        tp = props.get("transition-property", props.get("transition", ""))
        for tok in re.split(r"[\s,]+", tp):
            if tok and tok != "all" and tok.startswith(LAYOUT_PROPS):
                f.append(_finding("error", "uitk.transition_layout", path, "%s transitions a layout property (%s)" % (sel, tok),
                                  "animate translate, scale or rotate instead (no relayout)"))
        if tp.strip().startswith("all") or tp.strip() == "all":
            f.append(_finding("warn", "uitk.transition_all", path, "%s transitions 'all'" % sel, "name the transform or colour properties"))
        if props.get("opacity") in ("0", "0.0"):
            f.append(_finding("warn", "uitk.opacity_zero", path, "%s rests at opacity 0" % sel,
                              "opacity 0 keeps full vertex/GPU cost: display:none or RemoveFromHierarchy for long-hidden UI"))
        if "border-radius" in props and props.get("overflow") == "hidden":
            f.append(_finding("info", "uitk.stencil_mask", path, "%s is a rounded mask (stencil)" % sel,
                              "one batch break per mask container; nest at most 7; Mask Container hint on the root of nested ones; "
                              "for a round minimap or avatar, pre-cut art or a UI Shader Graph clip"))
    refs = re.findall(r"(?:url|resource)\(\s*[\"']?([^\"')]+)", body)
    if refs:
        f.append(_finding("info", "uitk.hard_refs", path, "%d asset reference(s) load with this sheet: %s" % (len(refs), ", ".join(sorted(set(refs))[:6])),
                          "keep screen-specific art in that screen's USS or UIDocument, not in a global theme (Borromeo [00:41:31])"))
    return f


def lint_uxml(text, path="<uxml>"):
    """Inline style attributes (they override USS: Tarodev, I1JcytXwXM4 [00:04:07]); bindings without an
    explicit binding-mode; the data-source-paths and names used (for a C#/model cross-check)."""
    f = []
    for m in re.finditer(r"<([\w:.]+)[^>]*\sstyle=\"([^\"]+)\"", text):
        f.append(_finding("warn", "uitk.inline_style", path, "<%s style=\"%s\">" % (m.group(1), m.group(2)), "move it to a USS class"))
    for m in re.finditer(r"<[\w:]*DataBinding\b([^>]*)/?>", text):
        attrs = m.group(1)
        if "binding-mode" not in attrs:
            f.append(_finding("warn", "uitk.binding_mode", path, "DataBinding without binding-mode: %s" % attrs.strip(), "set ToTarget for display-only UI"))
        if "property=" not in attrs:
            f.append(_finding("error", "uitk.binding_property", path, "DataBinding without property", "property = the element's target property ('text', 'value')"))
    paths = re.findall(r"data-source-path=\"([^\"]+)\"", text)
    names = re.findall(r"\sname=\"([^\"]+)\"", text)
    return {"findings": f, "data_source_paths": paths, "names": names}


def _finding(sev, code, path, msg, fix):
    return {"severity": sev, "code": code, "path": path, "message": msg, "fix": fix}


# ============================================================================ capture verdicts
def layout_verdict(envelope, expect_scale=True, scale_tol=0.002):
    """Error lines from a UICapture job envelope; empty list = every shot passed its layout assertion."""
    lines = []
    res = envelope.get("result") or {}
    for s in res.get("shots", []):
        n = s.get("name")
        for key in ("out_of_bounds", "text_overflow", "overlaps", "small_targets", "word_breaks"):
            for item in s.get(key, []):
                lines.append("error: %s %s %s" % (n, key, item))
        if s.get("checked", 0) == 0:
            lines.append("error: %s checked 0 elements" % n)
        if expect_scale and "expected_scale" in s and abs(s["expected_scale"] - s["scale_factor"]) > scale_tol:
            lines.append("error: %s scale %.4f, CanvasScaler formula %.4f" % (n, s["scale_factor"], s["expected_scale"]))
        b = s.get("binding")
        if b is not None and not b.get("matches_model"):
            lines.append("error: %s binding did not reach the view: %s" % (n, b))
    return lines


def review(envelope, sheet, labels=True):
    """ut_review.review_images on every PNG of a UICapture envelope + a contact sheet to LOOK at."""
    res = envelope.get("result") or {}
    paths = [s["png"] for s in res.get("shots", [])]
    names = [s.get("name", os.path.basename(p)) for s, p in zip(res.get("shots", []), paths)]
    return ut_review.review_images(paths, sheet=sheet, labels=names if labels else None)


def downscale_for_viewing(png, out, max_side=960):
    """sips copy of a big capture (4K) for a quick look (macOS). Returns out."""
    import subprocess
    subprocess.run(["sips", "-Z", str(max_side), png, "--out", out], check=True, capture_output=True)
    return out
