"""
ut_shaders: the runner-side tools of the scenario-unity-shaders skill (technical artist, shading).
System python3 (3.9+), stdlib only (Pillow optional through ut_review). Imports the shared toolkit of
the scenario-unity-expert skill; never copies it.

    import sys
    sys.path.insert(0, "<skills>/scenario-unity-expert/scripts"); sys.path.insert(0, "<skills>/scenario-unity-shaders/scripts")
    import ut_env, ut_run, ut_review, ut_shaders
    P = ut_env.base_project("3d", "<project>/tests/projects/unity-shaders")
    ut_shaders.install(P)                       # AgentKit/Shaders C# + runtime feature + shader templates
    lint = ut_shaders.lint_shader_file(P + "/Assets/AgentShaders/Shaders/AgentLit.shader")
    r = ut_run.run_method(P, "AgentKit.Shaders.ShaderJobs.ValidateShaders", {"paths": ["Assets/AgentShaders/Shaders"]})

Functions
    install(project)                     copy C# jobs (Assets/Editor/AgentKit/Shaders), the runtime renderer
                                         feature (Assets/AgentShaders/Runtime) and shader templates
                                         (Assets/AgentShaders/Shaders); returns files written
    lint_shader(text, name)              static checks of a hand-written URP .shader (findings list)
    lint_shader_file(path)               same, from a file
    lint_custom_function(text, name)     Shader Graph File-mode Custom Function .hlsl rules
    lint_compute(text, name)             portable compute rules (Metal, GLES, Vulkan)
    variant_estimate(text)               per pass: keyword sets and the full variant space before any stripping
    parse_variant_funnel(log_text)       Unity's "Compiling shader" funnel from an Editor or job log (6.3 format)
    variant_budget_check(totals, budgets, baseline)   CI gate: over budget or growing
    shadergraph_summary(path)            target, properties, keywords, Custom Function nodes, URP Graph Settings
                                         (alpha clip, material override) and findings of a .shadergraph
    shadergraph_repoint_custom_function(path, fn, guid, new_fn)   String-mode node -> File mode on an agent .hlsl
    shadergraph_set_target_settings(path, alpha_clip=, allow_material_override=, ...)   URP Graph Settings by text
    generated_alpha_clip_report(text)    per pass: _ALPHATEST_ON compiled in, keyword-controlled, or absent
    keyword_declarations(shaders, graphs)   keyword -> shader_feature / multi_compile / dynamic_branch, local
    lint_runtime_keyword_toggles(cs, decl)  runtime C# toggling a shader_feature keyword (stripped in players)
    lint_project_keywords(project)       the same over a project (Editor folders skipped)
    pso_collection_name(platform, api)   one .graphicsstate per graphics API and platform
    pso_player_command / run_pso_player  run a development player with AgentPsoProbe (trace, cold, warm)
    count_compiled_shaders(log)          first-use shader uploads logged in gameplay (Log Shader Compilation, 6.3 format)
    pso_gate(trace, cold, warm)          findings for the warm-up proof
    asset_guid(asset_path)               GUID from the .meta
    urp_lit_keywords(editor=None)        the multi_compile lines of the INSTALLED URP Lit.shader forward pass
    sample(png, x, y, r=2)               mean RGB (0-255) of a (2r+1)^2 block of a PNG
    region_stats(png, box)               mean RGB, R==G==B share, luma of a box (x0, y0, x1, y1)
    findings_summary(findings)           counts per severity

Every function is exercised by tests/code/unity-shaders/test_offline.py; the Unity-side jobs by
tests/code/unity-shaders/test_live_*.py (Unity 6000.3.21f1, 2026-09-24).
"""

__version__ = "0.1"  # scenario-unity-shaders v0.1 (2026-09-24, refactor after the Y4 blind grade)

import json
import math
import os
import re
from pathlib import Path

HERE = os.path.dirname(os.path.abspath(__file__))
SKILLS = os.path.dirname(os.path.dirname(HERE))
EXPERT_SCRIPTS = os.path.join(SKILLS, "scenario-unity-expert", "scripts")
import sys  # noqa: E402

if EXPERT_SCRIPTS not in sys.path:
    sys.path.insert(0, EXPERT_SCRIPTS)
import ut_env  # noqa: E402

AGENTKIT_SRC = os.path.join(HERE, "AgentKit")
RUNTIME_SRC = os.path.join(HERE, "Runtime")
SHADERS_SRC = os.path.join(HERE, "Shaders")


# ============================================================================ install
def _copy_if_changed(src, dst, written, root):
    with open(src, "rb") as f:
        data = f.read()
    if os.path.isfile(dst):
        with open(dst, "rb") as f:
            if f.read() == data:
                return
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    with open(dst, "wb") as f:
        f.write(data)
    written.append(os.path.relpath(dst, root))


def install(project):
    """Install the scenario-unity-shaders assets into a project (idempotent, content-compared):
    - scripts/AgentKit/Shaders/*.cs  -> Assets/Editor/AgentKit/Shaders/   (editor jobs; via ut_env.install_agentkit)
    - scripts/Runtime/*.cs           -> Assets/AgentShaders/Runtime/      (renderer feature: runtime assembly,
                                                                           an Editor folder would break players)
    - scripts/Shaders/*              -> Assets/AgentShaders/Shaders/      (.shader, .hlsl, .compute templates)
    The core AgentKit is installed too (ut_env.install_agentkit). Unity compiles and imports on the next
    batch start. Returns the list of project-relative files written."""
    root = ut_env.find_project(project)["root"]
    written = list(ut_env.install_agentkit(root))
    written += ut_env.install_agentkit(root, src=AGENTKIT_SRC)
    for src_dir, rel in ((RUNTIME_SRC, os.path.join("Assets", "AgentShaders", "Runtime")),
                         (SHADERS_SRC, os.path.join("Assets", "AgentShaders", "Shaders"))):
        for fn in sorted(os.listdir(src_dir)):
            if fn.startswith(".") or fn.endswith(".meta"):
                continue
            _copy_if_changed(os.path.join(src_dir, fn), os.path.join(root, rel, fn), written, root)
    return written


# ============================================================================ shader text helpers
_COMMENT_BLOCK = re.compile(r"/\*.*?\*/", re.S)
_COMMENT_LINE = re.compile(r"//[^\n]*")


def strip_comments(text):
    """Remove // and /* */ comments (keeps line count for block comments approximately)."""
    text = _COMMENT_BLOCK.sub(lambda m: "\n" * m.group(0).count("\n"), text)
    return _COMMENT_LINE.sub("", text)


def _blocks(text, keyword):
    """Yield (start, body) of every `keyword { ... }` block with balanced braces."""
    for m in re.finditer(r"\b%s\b\s*\{" % keyword, text):
        depth, i = 1, m.end()
        while i < len(text) and depth:
            if text[i] == "{":
                depth += 1
            elif text[i] == "}":
                depth -= 1
            i += 1
        yield m.start(), text[m.end():i - 1]


def _between(text, start_tok, end_tok):
    out = []
    for m in re.finditer(re.escape(start_tok), text):
        e = text.find(end_tok, m.end())
        if e > 0:
            out.append(text[m.end():e])
    return out


def _properties(text):
    """Properties block entries -> [(name, type)]."""
    props = []
    for _s, body in _blocks(text, "Properties"):
        body = re.sub(r"\[[^\]]*\]", "", body)          # drop [HDR], [Toggle(X)], [MainColor]...
        for m in re.finditer(r"(_\w+)\s*\(\s*\"[^\"]*\"\s*,\s*([A-Za-z0-9]+)", body):
            props.append((m.group(1), m.group(2)))
        break
    return props


def _passes(text):
    """Pass blocks -> list of dicts {name, light_mode, body, state}."""
    res = []
    for _s, body in _blocks(text, "Pass"):
        name = re.search(r"\bName\s+\"([^\"]+)\"", body)
        lm = re.search(r"\"LightMode\"\s*=\s*\"([^\"]+)\"", body)
        res.append({"name": name.group(1) if name else None, "light_mode": lm.group(1) if lm else None, "body": body})
    return res


def _finding(findings, severity, code, message, fix, where=""):
    findings.append({"severity": severity, "code": "shaders." + code, "path": where, "message": message, "fix": fix})


# ============================================================================ lint: URP .shader
def lint_shader(text, name="shader"):
    """Static checks for a hand-written URP 17.3 shader (the rules the experts and the 6.3 docs agree on).
    Returns findings in the AgentKit format {severity, code, path, message, fix}. A clean lint is a
    precondition, not proof: compile with ShaderJobs.ValidateShaders and render the result."""
    f = []
    raw = text
    t = strip_comments(text)
    passes = _passes(t)
    props = _properties(t)
    is_fullscreen = "Blit.hlsl" in t or "_BlitTexture" in t
    tags = " ".join(re.findall(r"Tags\s*\{[^}]*\}", t))
    transparent = bool(re.search(r"\"Queue\"\s*=\s*\"Transparent", tags)) or bool(re.search(r"\"RenderType\"\s*=\s*\"Transparent\"", tags))

    if re.search(r"\bCGPROGRAM\b|\bCGINCLUDE\b", t):
        _finding(f, "error", "cgprogram", "CGPROGRAM/CGINCLUDE pulls Built-in includes that clash with the URP library",
                 "use HLSLPROGRAM/HLSLINCLUDE and Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl", name)
    if "UnityCG.cginc" in t:
        _finding(f, "error", "unitycg", "UnityCG.cginc is Built-in: redefinition errors next to URP includes",
                 "include URP Core.hlsl; map functions with the Built-in to URP table (references/procedures.md)", name)
    if re.search(r"#pragma\s+surface\b", t):
        _finding(f, "error", "surface_shader", "Surface Shaders do not exist in URP", "vertex/fragment + SurfaceData/InputData + UniversalFragmentPBR", name)
    if re.search(r"\bGrabPass\b", t):
        _finding(f, "error", "grabpass", "GrabPass does not exist in URP", "DeclareOpaqueTexture.hlsl + SampleSceneColor (transparent queue only)", name)
    if re.search(r"\bUsePass\b", t):
        _finding(f, "error", "usepass", "UsePass breaks SRP Batcher compatibility (different UnityPerMaterial)",
                 "write the pass with the shared AgentPasses.hlsl or URP's pass includes", name)
    if re.search(r"\bfixed[234]?\b", t):
        _finding(f, "warn", "fixed_type", "`fixed` is not an HLSL type", "use half", name)
    if "RenderPipeline" not in tags or "UniversalPipeline" not in tags:
        _finding(f, "error", "rp_tag", "SubShader lacks \"RenderPipeline\"=\"UniversalPipeline\"",
                 "add the tag (the value is UniversalPipeline, not UniversalRenderPipeline)", name)
    if "Core.hlsl" not in t:
        _finding(f, "error", "no_core", "URP Core.hlsl is not included", "#include \"Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl\"", name)
    if "_FORWARD_PLUS" in t:
        _finding(f, "warn", "forward_plus_keyword", "_FORWARD_PLUS is deprecated since 6.1 (compiles with a warning, slower compiles)",
                 "declare #pragma multi_compile _ _CLUSTER_LIGHT_LOOP", name)
    if "SHADOWS_SCREEN" in re.sub(r"_MAIN_LIGHT_SHADOWS_SCREEN", "", t):
        _finding(f, "warn", "built_in_shadow_keyword", "SHADOWS_SCREEN is a Built-in keyword; URP never defines it (dead branch)",
                 "call TransformWorldToShadowCoord + GetMainLight(shadowCoord) unconditionally", name)
    if "ComputeScreenPos" in t:
        _finding(f, "warn", "compute_screen_pos", "ComputeScreenPos is deprecated in URP", "GetVertexPositionInputs().positionNDC or positionCS.xy / _ScaledScreenParams.xy", name)

    # SRP Batcher: one UnityPerMaterial CBUFFER holding every non-texture property
    cbuffers = _between(t, "CBUFFER_START(UnityPerMaterial)", "CBUFFER_END")
    if props and not cbuffers:
        _finding(f, "error", "no_cbuffer", "properties are not in a UnityPerMaterial CBUFFER: not SRP Batcher compatible",
                 "declare them between CBUFFER_START(UnityPerMaterial) and CBUFFER_END in HLSLINCLUDE", name)
    distinct = {re.sub(r"\s+", " ", c.strip()) for c in cbuffers}
    if len(distinct) > 1:
        _finding(f, "error", "cbuffer_mismatch", "UnityPerMaterial differs between passes: SRP Batcher incompatible",
                 "declare it once in the SubShader HLSLINCLUDE", name)
    if cbuffers:
        cb = cbuffers[0]
        code = "\n".join(_between(t, "HLSLPROGRAM", "ENDHLSL") + _between(t, "HLSLINCLUDE", "ENDHLSL"))
        for pname, ptype in props:
            if ptype.lower() in ("2d", "3d", "cube", "2darray", "cubearray", "any"):
                if re.search(r"TRANSFORM_TEX\s*\([^,]+,\s*%s\s*\)" % re.escape(pname), code) and (pname + "_ST") not in cb:
                    _finding(f, "error", "st_missing", "%s uses TRANSFORM_TEX but %s_ST is not in the CBUFFER" % (pname, pname),
                             "add float4 %s_ST; to UnityPerMaterial" % pname, name)
                continue
            in_cb = re.search(r"\b%s\b" % re.escape(pname), cb)
            used = re.search(r"\b%s\b" % re.escape(pname), code)
            if used and not in_cb:
                _finding(f, "error", "prop_outside_cbuffer", "property %s is used in HLSL but not in UnityPerMaterial" % pname,
                         "declare it inside the CBUFFER (values bleed between batched materials otherwise)", name)

    # passes an opaque lit or unlit object needs
    modes = [p["light_mode"] for p in passes]
    if not is_fullscreen and not transparent:
        if "UniversalForward" not in modes and "UniversalForwardOnly" not in modes and "SRPDefaultUnlit" not in modes and None not in modes:
            _finding(f, "warn", "no_forward", "no UniversalForward pass", "tag the forward pass \"LightMode\"=\"UniversalForward\"", name)
        if "DepthOnly" not in modes:
            _finding(f, "error", "no_depthonly", "opaque shader without a DepthOnly pass renders INVISIBLE with Depth Priming (6.3 Manual)",
                     "add a DepthOnly pass (AgentPasses.hlsl AgentDepthOnlyVertex/Fragment)", name)
        if "DepthNormals" not in modes:
            _finding(f, "warn", "no_depthnormals", "no DepthNormals pass: missing from SSAO and normal-based outlines",
                     "add a DepthNormals pass writing the raw world normal", name)
        if "ShadowCaster" not in modes:
            _finding(f, "warn", "no_shadowcaster", "no ShadowCaster pass: the object casts no shadow", "add a ShadowCaster pass with ApplyShadowBias", name)
    lit = any("Lighting.hlsl" in p["body"] or "GetMainLight" in p["body"] for p in passes) or "UniversalFragmentPBR" in t
    if lit and not transparent and "_CLUSTER_LIGHT_LOOP" not in t:
        _finding(f, "error", "no_cluster_loop", "lit shader without _CLUSTER_LIGHT_LOOP: additional lights missing under Forward+/Deferred+",
                 "#pragma multi_compile _ _CLUSTER_LIGHT_LOOP and loop with LIGHT_LOOP_BEGIN (or UniversalFragmentPBR)", name)
    if lit and "_MAIN_LIGHT_SHADOWS" not in t:
        _finding(f, "warn", "no_shadow_keywords", "lit shader without the main light shadow keywords: shadowAttenuation stays 1",
                 "#pragma multi_compile _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE _MAIN_LIGHT_SHADOWS_SCREEN", name)
    if re.search(r"_SHADOWS_SOFT\b", t) and "_SHADOWS_SOFT_LOW" not in t:
        _finding(f, "warn", "soft_shadow_set", "6.3 soft shadows have quality variants", "#pragma multi_compile_fragment _ _SHADOWS_SOFT _SHADOWS_SOFT_LOW _SHADOWS_SOFT_MEDIUM _SHADOWS_SOFT_HIGH", name)
    if "LIGHT_LOOP_BEGIN" in t:
        if not re.search(r"InputData\s+inputData\b", t):
            _finding(f, "error", "light_loop_inputdata", "LIGHT_LOOP_BEGIN reads a local named exactly `inputData`",
                     "declare InputData inputData with positionWS and normalizedScreenSpaceUV set", name)
        if "URP_FP_DIRECTIONAL_LIGHTS_COUNT" not in t:
            _finding(f, "warn", "no_directional_preloop", "cluster loop without the directional pre-loop: extra directional lights are skipped under Forward+",
                     "loop lightIndex < min(URP_FP_DIRECTIONAL_LIGHTS_COUNT, MAX_VISIBLE_LIGHTS) first, under #if USE_CLUSTER_LIGHT_LOOP", name)

    # pass consistency: displacement or clip in forward must reach depth and shadow passes
    fwd = [p for p in passes if p["light_mode"] in ("UniversalForward", "UniversalForwardOnly")]
    others = [p for p in passes if p["light_mode"] in ("ShadowCaster", "DepthOnly", "DepthNormals")]
    shared = "AGENT_CLIP" in t or "AGENT_DISPLACE" in t
    for p in fwd:
        if re.search(r"\bclip\s*\(", p["body"]) and not shared:
            for o in others:
                if not re.search(r"\bclip\s*\(|Alpha\(", o["body"]) and "AgentPasses.hlsl" not in o["body"]:
                    _finding(f, "error", "clip_not_shared", "forward pass clips but %s does not: shadows and depth keep the clipped parts" % o["light_mode"],
                             "share the clip through AGENT_CLIP (AgentPasses.hlsl) or repeat it", name)
    # transparency hygiene
    for p in passes:
        b = p["body"]
        blend = re.search(r"\bBlend\s+(\w+)\s+(\w+)", b)
        if blend and (blend.group(1), blend.group(2)) != ("One", "Zero") and not re.search(r"\bZWrite\s+Off\b", b) and not is_fullscreen:
            _finding(f, "warn", "blend_zwrite", "pass %s blends but writes depth" % (p["name"] or p["light_mode"]),
                     "ZWrite Off and the Transparent queue (both, Freya Holmer)", name)
        if blend and not transparent and not is_fullscreen and (blend.group(1), blend.group(2)) != ("One", "Zero"):
            _finding(f, "warn", "blend_queue", "blending pass in a non-Transparent queue", "Tags { \"Queue\"=\"Transparent\" }", name)
    # vertex texture fetch without an explicit LOD
    for fn in re.finditer(r"\w+\s+(\w+)\s*\(\s*Attributes[^)]*\)\s*\{", t):
        depth, i = 1, fn.end()
        while i < len(t) and depth:
            depth += {"{": 1, "}": -1}.get(t[i], 0)
            i += 1
        body = t[fn.end():i]
        if re.search(r"SAMPLE_TEXTURE2D(_X)?\s*\(", body):
            _finding(f, "error", "vertex_fetch_lod", "%s samples a texture without LOD in the vertex stage" % fn.group(1),
                     "SAMPLE_TEXTURE2D_LOD(tex, sampler, uv, 0): the vertex stage has no derivatives", name)
    # dynamic_branch keywords must be tested with if, not #if
    for kw_line in re.findall(r"#pragma\s+dynamic_branch\w*\s+([^\n]+)", t):
        for kw in kw_line.split():
            if kw != "_" and re.search(r"#\s*(?:if|ifdef|elif)\b[^\n]*\b%s\b" % re.escape(kw), t):
                _finding(f, "error", "dynamic_branch_preprocessor", "%s is dynamic_branch but tested with #if: always false" % kw,
                         "use if (%s) in HLSL" % kw, name)
    # if (KEYWORD) needs the keyword declared for every stage: a _vertex/_fragment-suffixed declaration makes the
    # other stage fail with "a known keyword but not declared in this pass" (observed on 6000.3.21f1)
    for m in re.finditer(r"#pragma\s+(?:multi_compile|shader_feature|dynamic_branch)(?:_local)?_(vertex|fragment|hull|domain|geometry|raytracing)\s+([^\n]+)", t):
        for kw in m.group(2).split():
            if kw != "_" and re.search(r"\bif\s*\(\s*!?\s*%s\b" % re.escape(kw), t):
                _finding(f, "error", "if_keyword_stage_suffix",
                         "%s is declared for the %s stage only but tested with if(): the other stage does not compile "
                         "(\"a known keyword but not declared in this pass\")" % (kw, m.group(1)),
                         "declare it without the stage suffix (the price of if-style keywords), or test it with #if", name)
    if re.search(r"_Color\b|_MainTex\b", raw) and not is_fullscreen:
        _finding(f, "info", "reserved_names", "_Color/_MainTex are treated as the main color/texture even without attributes", "prefer _BaseColor/_BaseMap with [MainColor]/[MainTexture]", name)
    return f


def lint_shader_file(path):
    with open(path, encoding="utf-8", errors="replace") as fh:
        return lint_shader(fh.read(), os.path.basename(path))


# ============================================================================ lint: Custom Function .hlsl
def lint_custom_function(text, name="custom_function.hlsl", used_function_names=None):
    """Rules for a Shader Graph 17.3 File-mode Custom Function include (Shader Graph manual, Daniel Ilett
    F8bAI6dIrto): unique include guard, every entry function suffixed _float or _half, void return with
    inputs first then `out` parameters, a SHADERGRAPH_PREVIEW branch when scene data (lights, depth) is
    read, no uniforms meant per material, no Built-in shadow keywords."""
    f = []
    t = strip_comments(text)
    g = re.search(r"#ifndef\s+(\w+)\s*\n\s*#define\s+(\w+)", t)
    if not g or g.group(1) != g.group(2):
        _finding(f, "error", "cf_guard", "no include guard: a second node including the file redefines every function",
                 "#ifndef MYFILE_INCLUDED / #define MYFILE_INCLUDED / #endif, unique per file", name)
    funcs = re.findall(r"\bvoid\s+(\w+)\s*\(([^)]*)\)", t)
    if not funcs:
        _finding(f, "error", "cf_no_void", "no void function: Custom Function entry points return through out parameters", "void Name_float(in..., out ...)", name)
    for fn, params in funcs:
        if not re.search(r"_(float|half)$", fn):
            if used_function_names and fn in used_function_names:
                _finding(f, "error", "cf_suffix", "%s has no _float/_half suffix" % fn, "rename to %s_float (the node Name field stays %s)" % (fn, fn), name)
            else:
                _finding(f, "info", "cf_helper", "%s has no precision suffix (fine for a helper, not for a node entry point)" % fn, "", name)
        ps = [p.strip() for p in params.split(",") if p.strip()]
        seen_out = False
        for p in ps:
            is_out = p.startswith("out ") or p.startswith("inout ")
            if seen_out and not is_out:
                _finding(f, "warn", "cf_param_order", "%s: an input follows an out parameter" % fn, "inputs first, then out parameters, matching the node ports", name)
                break
            seen_out = seen_out or is_out
    reads_scene = re.search(r"GetMainLight|GetAdditionalLight|SampleSceneDepth|SampleSceneNormals|_CameraDepthTexture|LIGHT_LOOP_BEGIN", t)
    if reads_scene and "SHADERGRAPH_PREVIEW" not in t:
        _finding(f, "error", "cf_preview", "reads lights or camera textures without a SHADERGRAPH_PREVIEW branch: node previews fail to compile",
                 "#ifdef SHADERGRAPH_PREVIEW constant outputs #else real code #endif", name)
    if "SHADOWS_SCREEN" in re.sub(r"_MAIN_LIGHT_SHADOWS_SCREEN", "", t) or "ComputeScreenPos" in t:
        _finding(f, "warn", "cf_legacy", "SHADOWS_SCREEN / ComputeScreenPos are Built-in era", "TransformWorldToShadowCoord(positionWS) + GetMainLight(shadowCoord)", name)
    if "LIGHT_LOOP_BEGIN" in t and "URP_FP_DIRECTIONAL_LIGHTS_COUNT" not in t:
        _finding(f, "warn", "cf_directional_preloop", "cluster loop without the directional pre-loop: extra directional lights are skipped under Forward+",
                 "loop min(URP_FP_DIRECTIONAL_LIGHTS_COUNT, MAX_VISIBLE_LIGHTS) first", name)
    top = re.sub(r"\{[^{}]*\}", "", t)  # crude: drop innermost bodies
    for m in re.finditer(r"^\s*(?:uniform\s+)?(float[234]?(?:x[234])?|half[234]?|int|uint)\s+(_\w+)\s*;", top, re.M):
        _finding(f, "warn", "cf_uniform", "%s is a file-scope uniform: global only (Shader.SetGlobalX), never per material" % m.group(2),
                 "feed per-material values through a node input from a Blackboard property", name)
    return f


# ============================================================================ lint: compute
def lint_compute(text, name="compute"):
    """Portable compute rules (6.3 Manual, multiple platforms; matters on this Mac's Metal)."""
    f = []
    for i, line in enumerate(text.splitlines(), 1):
        if re.match(r"\s*#pragma\s+kernel\b.*//", line):
            _finding(f, "error", "cs_kernel_comment", "line %d: // comment on a #pragma kernel line is a compile error" % i, "move the comment to its own line", name)
    t = strip_comments(text)
    kernels = re.findall(r"#pragma\s+kernel\s+(\w+)", t)
    if not kernels:
        _finding(f, "error", "cs_no_kernel", "no #pragma kernel", "#pragma kernel Name", name)
    if re.search(r"\.GetDimensions\s*\(", t) and re.search(r"(StructuredBuffer|ByteAddressBuffer|Buffer)<?", t):
        for m in re.finditer(r"(\w+)\.GetDimensions", t):
            decl = re.search(r"(RW)?(Structured|ByteAddress)?Buffer<[^>]*>\s+%s\b|(RW)?ByteAddressBuffer\s+%s\b" % (m.group(1), m.group(1)), t)
            if decl:
                _finding(f, "error", "cs_getdimensions", "%s.GetDimensions on a buffer: unsupported on Metal" % m.group(1), "pass the element count as a constant", name)
    for m in re.finditer(r"Interlocked\w+\s*\(\s*(\w+)", t):
        if re.search(r"RWTexture\w*<[^>]*>\s+%s\b" % re.escape(m.group(1)), t):
            _finding(f, "error", "cs_texture_atomic", "atomic on RWTexture %s: Metal has no texture atomics" % m.group(1), "atomics on a RWStructuredBuffer<uint>", name)
    if re.search(r"\bCGPROGRAM\b|\bGLSLPROGRAM\b", t):
        _finding(f, "warn", "cs_platform_block", "CGPROGRAM/GLSLPROGRAM blocks are skipped or emitted verbatim per platform", "plain HLSL", name)
    for k in kernels:
        m = re.search(r"\bvoid\s+%s\s*\(([^)]*)\)\s*\{" % k, t)
        if not m:
            _finding(f, "error", "cs_kernel_missing", "kernel %s declared but not defined" % k, "", name)
            continue
        body = t[m.end(): m.end() + 3000]
        if "SV_DispatchThreadID" in m.group(1) and not re.search(r"if\s*\([^)]*>=[^)]*\)\s*return", body):
            _finding(f, "warn", "cs_bounds", "kernel %s has no bounds check: out-of-bounds access can hang non-DX GPUs" % k,
                     "if (id.x >= _Count) return; with ceil-divided dispatch", name)
    return f


# ============================================================================ variants
_PRAGMA_KW = re.compile(r"#pragma\s+(multi_compile|shader_feature|dynamic_branch)(_local)?(_vertex|_fragment|_hull|_domain|_geometry|_raytracing)?\s+([^\n]+)")
_PRAGMA_BUILTIN = {
    "multi_compile_instancing": ["_", "INSTANCING_ON"],
    "multi_compile_fog": ["_", "FOG_LINEAR", "FOG_EXP", "FOG_EXP2"],
    "multi_compile_fwdbase": None,
}


def variant_estimate(text):
    """Per pass, the keyword sets and the FULL variant space (product of set sizes; shader_feature sets
    count fully here because the upper bound is what a material combination could reach). Includes
    multi_compile_instancing and, for `#include_with_pragmas ".../Fog.hlsl"`, the fog set (4). Stage
    suffixes are reported but not applied (they are ignored on GL, GLES and Vulkan). This is the
    'Full variant space' before settings filtering and stripping; compare with parse_variant_funnel."""
    t = strip_comments(text)
    shared = "".join(b for b in _between(t, "HLSLINCLUDE", "ENDHLSL"))
    out = []
    for p in _passes(t):
        body = p["body"] + "\n" + shared
        sets = []
        for m in _PRAGMA_KW.finditer(body):
            kws = m.group(4).split()
            n = len(kws) if m.group(1) != "dynamic_branch" else 1
            if m.group(1) == "shader_feature" and len(kws) == 1:
                n = 2   # shader_feature X == shader_feature _ X
            sets.append({"directive": m.group(1) + (m.group(2) or "") + (m.group(3) or ""), "keywords": kws, "variants": n})
        for d, kws in _PRAGMA_BUILTIN.items():
            if kws and re.search(r"#pragma\s+%s\b" % d, body):
                sets.append({"directive": d, "keywords": kws, "variants": len(kws)})
        if re.search(r"#include_with_pragmas\s+\"[^\"]*Fog\.hlsl\"", body):
            sets.append({"directive": "multi_compile_fog (Fog.hlsl)", "keywords": _PRAGMA_BUILTIN["multi_compile_fog"], "variants": 4})
        total = 1
        for s in sets:
            total *= max(1, s["variants"])
        out.append({"pass": p["name"], "light_mode": p["light_mode"], "sets": sets, "full_space": total})
    return {"passes": out, "total_full_space": sum(p["full_space"] for p in out)}


_FUNNEL_SHADER = re.compile(r"^Compiling shader \"(?P<shader>[^\"]+)\"(?: pass \"(?P<pass>[^\"]*)\" \((?P<stage>[^)]+)\))?\s*$", re.M)
_FUNNEL_PASS = re.compile(r"^\s+Pass \"(?P<pass>[^\"]*)\" \((?P<stage>[^)]+)\)\s*$", re.M)
_FUNNEL_NUM = re.compile(r"^\s*(Full variant space|After settings filtering|After built-in stripping|After scriptable stripping)\s*:\s*([\d.,\u00a0\u202f ]+?)\s*$", re.M)
_FUNNEL_API = re.compile(r"^\s*Target graphics API:\s*(\S+)", re.M)


def _count(s):
    """Variant counts are integers printed with the machine's thousands separator ("2.560" = 2560 here)."""
    digits = re.sub(r"[^\d]", "", s)
    return int(digits) if digits else None


def parse_variant_funnel(log_text):
    """Unity's per shader, pass and stage stripping funnel, written to the Editor or job log of a player
    or AssetBundle build (Carotenuto, Unity blog 2024). Unity 6.3 prints (observed 2026-09-24):
        Compiling shader "AgentKit/Dissolve"
          Pass "DissolveForward" (fp)
            Target graphics API: metal
            Full variant space:         2.560      <- thousands separator follows the OS locale
            After settings filtering:   32
            After built-in stripping:   4
            After scriptable stripping: 4
    The older one-line header `Compiling shader "X" pass "Y" (vp)` is parsed too.
    Returns {"rows": [{shader, pass, stage, api, full, settings, builtin, scriptable}], "totals": {shader: {...}}}."""
    rows = []
    marks = []
    for m in _FUNNEL_SHADER.finditer(log_text):
        marks.append((m.start(), "shader", m))
    for m in _FUNNEL_PASS.finditer(log_text):
        marks.append((m.start(), "pass", m))
    marks.sort(key=lambda t: t[0])
    shader = None
    for i, (pos, kind, m) in enumerate(marks):
        if kind == "shader":
            shader = m.group("shader")
            if not m.group("pass"):
                continue
            pass_name, stage = m.group("pass"), m.group("stage")
        else:
            pass_name, stage = m.group("pass"), m.group("stage")
        if shader is None:
            continue
        end = marks[i + 1][0] if i + 1 < len(marks) else min(len(log_text), m.end() + 1500)
        chunk = log_text[m.end():end]
        nums = {k: _count(v) for k, v in _FUNNEL_NUM.findall(chunk)}
        if not nums:
            continue
        api = _FUNNEL_API.search(chunk)
        rows.append({"shader": shader, "pass": pass_name, "stage": stage, "api": api.group(1) if api else None,
                     "full": nums.get("Full variant space"), "settings": nums.get("After settings filtering"),
                     "builtin": nums.get("After built-in stripping"), "scriptable": nums.get("After scriptable stripping")})
    totals = {}
    for r in rows:
        t = totals.setdefault(r["shader"], {"full": 0, "settings": 0, "builtin": 0, "scriptable": 0})
        for k in ("full", "settings", "builtin", "scriptable"):
            t[k] += r[k] or 0
    return {"rows": rows, "totals": totals}


def variant_budget_check(funnel_totals, budgets, baseline=None, growth_limit=0.10):
    """Fail a shader over its budget (post-strip variants) or growing more than growth_limit versus a
    baseline funnel (the CI gate the Unity blog recommends). budgets: {shader: max} or {"*": max}."""
    findings = []
    for shader, t in funnel_totals.items():
        limit = budgets.get(shader, budgets.get("*"))
        after = t.get("scriptable") or 0
        if limit is not None and after > limit:
            findings.append({"severity": "error", "code": "shaders.variant_budget", "path": shader,
                             "message": "%d variants after stripping > budget %d" % (after, limit), "fix": "strip, shader_feature, dynamic_branch"})
        if baseline and shader in baseline:
            before = baseline[shader].get("scriptable") or 0
            if before and after > before * (1 + growth_limit):
                findings.append({"severity": "error", "code": "shaders.variant_growth", "path": shader,
                                 "message": "%d -> %d variants (+%.0f%%)" % (before, after, 100.0 * (after - before) / before),
                                 "fix": "find the new keyword or URP feature that multiplied variants"})
    return findings


# ============================================================================ Shader Graph (offline)
def _sg_objects(text):
    dec = json.JSONDecoder()
    i, objs = 0, []
    while i < len(text):
        while i < len(text) and text[i].isspace():
            i += 1
        if i >= len(text):
            break
        o, i = dec.raw_decode(text, i)
        objs.append(o)
    return objs


def shadergraph_summary(path):
    """Read a .shadergraph or .shadersubgraph (Shader Graph 17 multi-JSON) without Unity: targets and
    material type, exposed properties with reference names, keywords with definition and scope,
    Custom Function nodes (File or String, function name, source GUID) and sub graph references.
    Use it to plan Material.SetX calls and to find the .hlsl an agent may edit."""
    with open(path, encoding="utf-8") as fh:
        objs = _sg_objects(fh.read())
    by_type = {}
    for o in objs:
        by_type.setdefault(o.get("m_Type", "?").split(".")[-1], []).append(o)
    props = []
    for o in objs:
        tp = o.get("m_Type", "")
        if tp.startswith("UnityEditor.ShaderGraph.Internal.") and tp.endswith("ShaderProperty"):
            ref = o.get("m_OverrideReferenceName") or o.get("m_DefaultReferenceName")
            props.append({"name": o.get("m_Name"), "reference": ref, "type": tp.split(".")[-1].replace("ShaderProperty", ""),
                          "exposed": not o.get("m_Hidden", False) and o.get("m_GeneratePropertyBlock", True),
                          "value": o.get("m_Value")})
    keywords = []
    for o in by_type.get("ShaderKeyword", []):
        keywords.append({"name": o.get("m_Name"), "reference": o.get("m_OverrideReferenceName") or o.get("m_DefaultReferenceName"),
                         "definition": {0: "ShaderFeature", 1: "MultiCompile", 2: "Predefined", 3: "DynamicBranch"}.get(o.get("m_KeywordDefinition"), o.get("m_KeywordDefinition")),
                         "scope": {0: "Local", 1: "Global"}.get(o.get("m_KeywordScope"), o.get("m_KeywordScope"))})
    cfs = []
    for o in by_type.get("CustomFunctionNode", []):
        cfs.append({"node": o.get("m_Name"), "mode": {0: "File", 1: "String"}.get(o.get("m_SourceType"), o.get("m_SourceType")),
                    "function": o.get("m_FunctionName"), "source_guid": o.get("m_FunctionSource") or None,
                    "body_chars": len(o.get("m_FunctionBody") or "")})
    subgraphs = []
    for o in by_type.get("SubGraphNode", []):
        sg = o.get("m_SerializedSubGraph")
        if isinstance(sg, str):
            try:
                sg = json.loads(sg)
            except ValueError:
                pass
        guid = sg.get("subGraph", {}).get("guid") if isinstance(sg, dict) else None
        subgraphs.append({"node": o.get("m_Name"), "guid": guid})
    targets = [t for t in by_type if t.endswith("Target") or t.endswith("SubTarget")]
    urp = None
    findings = []
    for o in by_type.get("UniversalTarget", []):
        urp = {k: o.get(v) for k, v in _SG_URP_FIELDS.items()}
        if urp["alpha_clip"] and not urp["allow_material_override"]:
            _finding(findings, "warn", "sg_alpha_clip_always",
                     "Alpha Clipping is ON without Allow Material Override: URP 17.3 writes `#define _ALPHATEST_ON 1` into EVERY "
                     "pass (UniversalTarget.cs AddAlphaClipControlToPass), so no Boolean keyword or material toggle can give a "
                     "non-clipped variant; the whole object pays alpha test (and AlphaToMask with MSAA) all the time",
                     "clip only while dissolving: Allow Material Override ON (then _ALPHATEST_ON is a keyword driven by the "
                     "material's _AlphaClip) or a second opaque material swapped in; check with ShaderGraphJobs.GeneratedCode", path)
    return {"path": path, "objects": len(objs), "targets": targets, "properties": props, "keywords": keywords,
            "custom_functions": cfs, "subgraphs": subgraphs, "urp_target": urp, "findings": findings,
            "node_types": {k: len(v) for k, v in by_type.items() if k.endswith("Node")}}


# friendly name -> field of the UnityEditor.Rendering.Universal.ShaderGraph.UniversalTarget JSON object (Graph Settings)
_SG_URP_FIELDS = {"alpha_clip": "m_AlphaClip", "allow_material_override": "m_AllowMaterialOverride",
                  "surface_type": "m_SurfaceType", "render_face": "m_RenderFace", "cast_shadows": "m_CastShadows",
                  "receive_shadows": "m_ReceiveShadows", "alpha_mode": "m_AlphaMode", "zwrite_control": "m_ZWriteControl"}


def shadergraph_set_target_settings(path, out_path=None, **settings):
    """Set URP Graph Settings in a .shadergraph without the graph editor, e.g.
    shadergraph_set_target_settings(p, alpha_clip=True, allow_material_override=True).
    Keys: alpha_clip, allow_material_override, surface_type (0 Opaque, 1 Transparent), render_face
    (0 Both, 1 Back, 2 Front), cast_shadows, receive_shadows, alpha_mode, zwrite_control.
    Undocumented text edit of the asset's JSON: only while NO editor holds the project, keep a copy of the
    original, then reimport and read the result with ShaderGraphJobs.GeneratedCode. Returns targets changed."""
    unknown = set(settings) - set(_SG_URP_FIELDS)
    if unknown:
        raise ValueError("unknown settings %s (known: %s)" % (sorted(unknown), sorted(_SG_URP_FIELDS)))
    with open(path, encoding="utf-8") as fh:
        objs = _sg_objects(fh.read())
    changed = 0
    for o in objs:
        if o.get("m_Type", "").endswith(".UniversalTarget"):
            for k, v in settings.items():
                o[_SG_URP_FIELDS[k]] = v
            changed += 1
    if changed:
        with open(out_path or path, "w", encoding="utf-8") as fh:
            fh.write("\n\n".join(json.dumps(o, indent=4) for o in objs) + "\n")
    return changed


def generated_alpha_clip_report(shader_text):
    """Per pass of a generated (or hand-written) shader: is alpha test compiled in (`#define _ALPHATEST_ON 1`),
    declared as a keyword (a material can turn it off), or absent. Feed it the text written by
    ShaderGraphJobs.GeneratedCode."""
    t = strip_comments(shader_text)
    rows = []
    for p in _passes(t):
        b = p["body"]
        rows.append({"pass": p["name"], "light_mode": p["light_mode"],
                     "alphatest_defined": bool(re.search(r"#define\s+_ALPHATEST_ON\s+1\b", b)),
                     "alphatest_keyword": bool(re.search(r"#pragma\s+(?:shader_feature|multi_compile)\w*\s+[^\n]*\b_ALPHATEST_ON\b", b))})
    return {"passes": rows, "always_clipped": bool(rows) and all(r["alphatest_defined"] for r in rows),
            "keyword_controlled": bool(rows) and all(r["alphatest_keyword"] and not r["alphatest_defined"] for r in rows)}


def asset_guid(asset_path):
    """GUID of an imported asset, read from its .meta (Unity writes it on import)."""
    with open(asset_path + ".meta", encoding="utf-8") as fh:
        m = re.search(r"^guid:\s*([0-9a-f]{32})", fh.read(), re.M)
    if not m:
        raise ValueError("no guid in %s.meta" % asset_path)
    return m.group(1)


def shadergraph_repoint_custom_function(path, function_name, hlsl_guid, new_function, out_path=None):
    """Switch the Custom Function node named `function_name` in a .shadergraph/.shadersubgraph to File mode,
    reading `new_function` (Name WITHOUT the _float/_half suffix) from the .hlsl with GUID `hlsl_guid`.
    The node's ports stay as they are, so the file's function must take them in the same order.
    Text edit of an asset: only while NO editor holds the project (batch jobs reimport it); keep a copy
    of the original. Returns the number of nodes changed."""
    with open(path, encoding="utf-8") as fh:
        objs = _sg_objects(fh.read())
    changed = 0
    for o in objs:
        if o.get("m_Type", "").endswith("CustomFunctionNode") and o.get("m_FunctionName") == function_name:
            o["m_SourceType"] = 0              # 0 = File, 1 = String
            o["m_FunctionSource"] = hlsl_guid
            o["m_FunctionName"] = new_function
            changed += 1
    if changed:
        with open(out_path or path, "w", encoding="utf-8") as fh:
            fh.write("\n\n".join(json.dumps(o, indent=4) for o in objs) + "\n")
    return changed


# ============================================================================ runtime keyword toggles
_KW_DECL = re.compile(r"#pragma\s+(multi_compile|shader_feature|dynamic_branch)(_local)?(?:_vertex|_fragment|_hull|_domain|_geometry|_raytracing)?\s+([^\n]+)")
_CS_TOGGLE = re.compile(r"(?P<recv>[\w\.\]\)]+)\s*\.\s*(?P<fn>EnableKeyword|DisableKeyword|SetKeyword|EnableShaderKeyword|DisableShaderKeyword)"
                        r"\s*\((?P<args>[^;]*?)\"(?P<kw>[A-Za-z_][A-Za-z0-9_]*)\"")


def keyword_declarations(shader_texts=None, graph_paths=None):
    """keyword -> {"types": {shader_feature|multi_compile|dynamic_branch}, "local": bool, "where": [...]}
    from .shader/.hlsl texts ({name: text}) and .shadergraph Blackboard keywords (ShaderFeature,
    MultiCompile, DynamicBranch definitions; Predefined skipped)."""
    decl = {}

    def add(kw, typ, local, where):
        d = decl.setdefault(kw, {"types": set(), "local": True, "where": []})
        d["types"].add(typ)
        d["local"] = d["local"] and local
        if where not in d["where"]:
            d["where"].append(where)
    for name, text in (shader_texts or {}).items():
        for m in _KW_DECL.finditer(strip_comments(text)):
            for kw in m.group(3).split():
                if kw != "_" and not kw.startswith("__"):
                    add(kw, m.group(1), bool(m.group(2)), name)
    for gp in graph_paths or []:
        for k in shadergraph_summary(gp)["keywords"]:
            typ = {"ShaderFeature": "shader_feature", "MultiCompile": "multi_compile", "DynamicBranch": "dynamic_branch"}.get(k["definition"])
            if typ and k.get("reference"):
                add(k["reference"], typ, k.get("scope") == "Local", os.path.basename(gp))
    return decl


def lint_runtime_keyword_toggles(cs_texts, declarations):
    """Runtime C# (never Editor/ folders: editor code that saves keywords INTO material assets is how a
    shader_feature variant gets kept) that toggles keywords by string. Findings:
      error runtime_toggle_shader_feature: EnableKeyword/SetKeyword on a keyword declared only as
            shader_feature: the variant ships only if a material in the build enables it (6.3 Manual,
            observed here: 0 then 6 _NORMALMAP variants), so the toggle silently falls back in players.
      warn  global_toggle_local_keyword: Shader.EnableKeyword / CommandBuffer.EnableShaderKeyword on a
            keyword declared _local: global state never reaches a local keyword.
    cs_texts: {name: text}; declarations: keyword_declarations(...)."""
    f = []
    for name, text in cs_texts.items():
        t = strip_comments(text)
        # resolve keywords held in string constants: const string k = "_X"; ... mat.EnableKeyword(k)
        consts = dict(re.findall(r"(?:const|static\s+readonly)\s+string\s+(\w+)\s*=\s*\"([A-Za-z_]\w*)\"", t))
        for ident, kw in consts.items():
            t = re.sub(r"(\.\s*(?:EnableKeyword|DisableKeyword|EnableShaderKeyword|DisableShaderKeyword)\s*\(\s*)%s\s*\)" % re.escape(ident),
                       r'\1"%s")' % kw, t)
            t = re.sub(r"(new\s+(?:Local|Global)Keyword\s*\([^;]*?)\b%s\s*\)" % re.escape(ident), r'\1"%s")' % kw, t)
        hits = [(m.start(), m.group("recv"), m.group("fn"), m.group("kw")) for m in _CS_TOGGLE.finditer(t)]
        if re.search(r"\.\s*SetKeyword\s*\(", t):       # LocalKeyword objects built from a string, toggled later
            hits += [(m.start(), "material", "SetKeyword(LocalKeyword)", m.group(1))
                     for m in re.finditer(r"new\s+LocalKeyword\s*\([^;]*?\"([A-Za-z_]\w*)\"\s*\)", t)]
        for pos, recv, fn, kw in hits:
            d = declarations.get(kw)
            if not d:
                continue
            line = t[:pos].count("\n") + 1
            glob = recv.split(".")[-1] == "Shader" or fn in ("EnableShaderKeyword", "DisableShaderKeyword")
            if glob and d["local"]:
                _finding(f, "warn", "global_toggle_local_keyword",
                         "%s:%d %s.%s(\"%s\"): %s is declared _local (%s); global keyword state never reaches it"
                         % (name, line, recv, fn, kw, kw, ", ".join(d["where"])),
                         "set it on the material (Material.EnableKeyword / SetKeyword(LocalKeyword)) or declare it global", name)
            elif d["types"] == {"shader_feature"}:
                _finding(f, "error", "runtime_toggle_shader_feature",
                         "%s:%d %s(\"%s\") at runtime, but %s is shader_feature only (%s): the variant is stripped unless a "
                         "material in the build already enables it; players fall back to the closest variant or pink"
                         % (name, line, fn, kw, kw, ", ".join(d["where"])),
                         "swap to a second material that has the keyword on (both in the build), or declare it "
                         "multi_compile_local (costs variants), or dynamic_branch tested with if()", name)
    return f


def lint_project_keywords(project, roots=("Assets",)):
    """lint_runtime_keyword_toggles over a whole project: every .shader/.hlsl/.cginc and .shadergraph under
    `roots` gives the declarations, every .cs outside an Editor folder is scanned."""
    root = ut_env.find_project(project)["root"]
    shaders, graphs, cs = {}, [], {}
    for r in roots:
        for dp, _dn, files in os.walk(os.path.join(root, r)):
            for fn in files:
                p = os.path.join(dp, fn)
                rel = os.path.relpath(p, root)
                if fn.endswith((".shader", ".hlsl", ".cginc")):
                    shaders[rel] = Path(p).read_text(encoding="utf-8", errors="replace")
                elif fn.endswith(".shadergraph"):
                    graphs.append(p)
                elif fn.endswith(".cs") and "Editor" not in rel.split(os.sep):
                    cs[rel] = Path(p).read_text(encoding="utf-8", errors="replace")
    decl = keyword_declarations(shaders, graphs)
    return lint_runtime_keyword_toggles(cs, decl)


# ============================================================================ PSO warm-up proof
def pso_collection_name(platform, api, quality=None):
    """File name of a traced GraphicsStateCollection: ONE per graphics API and platform (6.3 Manual,
    "Trace a new PSO data collection"), optionally per quality level. platform: Application.platform
    name (OSXPlayer, Android, IPhonePlayer, WindowsPlayer), api: SystemInfo.graphicsDeviceType name
    (Metal, Vulkan, Direct3D12). AgentPsoProbe looks for exactly this name in StreamingAssets/PSO/."""
    name = "%s_%s" % (platform, api)
    if quality:
        name += "_" + re.sub(r"[^A-Za-z0-9]+", "", quality)
    return name + ".graphicsstate"


_UPLOAD_LINE = re.compile(r"(?:Uploaded shader variant to the GPU driver:\s*(?P<new>.+?) \(instance [^)]*\)|Compiled Shader:\s*(?P<old>[^,]+)),"
                          r"(?:.*?time:\s*(?P<ms>[\d.]+)\s*ms)?")


def count_compiled_shaders(log_text, after_marker="AGENT_PSO gameplay_start", before_marker="AGENT_PSO gameplay_end"):
    """Player-log proof independent of profiler markers: with Log Shader Compilation on (development builds)
    every first-use GPU program is logged. Unity 6.3 prints `Uploaded shader variant to the GPU driver: <shader>
    (instance 0x..), pass: P, stage: vertex, keywords K, time: 0.23 ms` (observed); the 2022-era
    `Compiled Shader: <shader>, pass: ..` (Carotenuto's blog) is accepted too. Counts them between the probe's
    gameplay markers (or over the whole log when a marker is missing) and sums their upload time."""
    lines = log_text.splitlines()
    start = next((i for i, ln in enumerate(lines) if after_marker and after_marker in ln), -1)
    end = next((i for i, ln in enumerate(lines) if before_marker and before_marker in ln and i > start), len(lines))
    all_c = [ln.strip() for ln in lines if _UPLOAD_LINE.search(ln)]
    game = [ln.strip() for ln in lines[start + 1:end] if _UPLOAD_LINE.search(ln)]
    shaders, ms = {}, 0.0
    for ln in game:
        m = _UPLOAD_LINE.search(ln)
        name = (m.group("new") or m.group("old")).strip()
        shaders[name] = shaders.get(name, 0) + 1
        ms += float(m.group("ms") or 0)
    return {"total": len(all_c), "gameplay": len(game), "gameplay_by_shader": shaders, "gameplay_upload_ms": round(ms, 3),
            "marker_found": start >= 0, "sample": game[:5]}


def pso_player_command(app, mode, out_json, gsc=None, frames=60, log=None, width=640, height=360, extra=None):
    """argv to run a development player built with AgentPsoProbe in the first scene (macOS .app or a binary).
    mode: trace (BeginTrace, play, EndTrace + SaveToFile gsc), cold (no warm-up), warm (LoadFromFile gsc,
    WarmUp or WarmUpProgressively before gameplay). Windowed on purpose: batch-mode players do not render
    their cameras by themselves."""
    exe = app
    if app.endswith(".app"):
        macos = os.path.join(app, "Contents", "MacOS")
        exe = os.path.join(macos, sorted(os.listdir(macos))[0])
    argv = [exe, "-screen-fullscreen", "0", "-screen-width", str(width), "-screen-height", str(height),
            "-agentPso", mode, "-agentPsoOut", out_json, "-agentPsoFrames", str(frames)]
    if gsc:
        argv += ["-agentPsoFile", gsc]
    if log:
        argv += ["-logFile", log]
    return argv + list(extra or [])


def run_pso_player(app, mode, out_json, gsc=None, frames=60, log=None, timeout=180, extra=None):
    """Run the player once (see pso_player_command) and return {"probe": <json it wrote>, "log": path,
    "compiled": count_compiled_shaders(log), "exit_code", "seconds"}."""
    import subprocess
    import time
    log = log or os.path.splitext(out_json)[0] + ".log"
    for p in (out_json,):
        if os.path.isfile(p):
            os.replace(p, p + ".prev")        # never delete: keep the previous run beside it
    t0 = time.time()
    try:
        code = subprocess.call(pso_player_command(app, mode, out_json, gsc, frames, log, extra=extra), timeout=timeout)
    except subprocess.TimeoutExpired:
        code = "timeout"
    probe = json.loads(Path(out_json).read_text()) if os.path.isfile(out_json) else None
    text = Path(log).read_text(errors="replace") if os.path.isfile(log) else ""
    return {"mode": mode, "probe": probe, "log": log, "compiled": count_compiled_shaders(text), "exit_code": code,
            "seconds": round(time.time() - t0, 1)}


def pso_gate(trace, cold, warm):
    """Findings for the PSO warm-up proof (6.3 Manual, "Warm up PSOs"): the trace saved a collection for the
    running API, the cold run shows first-use compiles in gameplay (else the bench proves nothing), the
    warm run shows none by BOTH channels (profiler marker counts, GPU program and PSO, and player-log upload lines)."""
    f = []
    tp, cp, wp = (trace or {}).get("probe") or {}, (cold or {}).get("probe") or {}, (warm or {}).get("probe") or {}
    if not tp.get("trace", {}).get("saved"):
        _finding(f, "error", "pso_no_trace", "no .graphicsstate saved by the trace run", "development player, BeginTrace at boot, EndTrace + SaveToFile at the end", "")
    if cp.get("gameplay_create_gpu_program", 0) + (cold or {}).get("compiled", {}).get("gameplay", 0) == 0:
        _finding(f, "warn", "pso_cold_clean", "the cold run compiled nothing in gameplay: the bench does not exercise first use", "activate content only after the loading frames", "")
    if wp.get("warmup", {}).get("api_match") is False:
        _finding(f, "error", "pso_api_mismatch", "collection traced on %s used on %s" % (wp["warmup"].get("collection_api"), wp.get("api")),
                 "one collection per graphics API and platform", "")
    if (wp.get("gameplay_create_gpu_program") or 0) > 0 or (wp.get("gameplay_create_pipeline") or 0) > 0 \
            or (warm or {}).get("compiled", {}).get("gameplay", 0) > 0:
        _finding(f, "error", "pso_warm_compiles", "warm run still compiles in gameplay: %s GPU program and %s PSO marker samples, %s log lines"
                 % (wp.get("gameplay_create_gpu_program"), wp.get("gameplay_create_pipeline"), (warm or {}).get("compiled", {}).get("gameplay")),
                 "re-trace the missing content into the same collection (ContainsVariant) and ship it", "")
    return f


# ============================================================================ installed URP facts
def urp_lit_keywords(editor=None):
    """The #pragma multi_compile/shader_feature lines of the INSTALLED URP Lit.shader forward pass:
    the keyword list to copy into a hand-written lit shader (Daniel Ilett: read the pipeline's own
    shader, tutorials lag). editor: ut_env.find_editor() result or None."""
    ed = editor or ut_env.find_editor()
    app = ed["app"] if "app" in ed else os.path.dirname(os.path.dirname(os.path.dirname(ed["binary"])))
    path = os.path.join(app, "Contents", "Resources", "PackageManager", "BuiltInPackages",
                        "com.unity.render-pipelines.universal", "Shaders", "Lit.shader")
    with open(path, encoding="utf-8") as fh:
        text = fh.read()
    fwd = next((p for p in _passes(strip_comments(text)) if p["light_mode"] == "UniversalForward"), None)
    lines = re.findall(r"#pragma\s+(?:multi_compile|shader_feature|dynamic_branch)\w*[^\n]*|#include_with_pragmas[^\n]*", fwd["body"]) if fwd else []
    return {"path": path, "lines": [ln.strip() for ln in lines]}


# ============================================================================ pixels
def _img(png):
    import ut_review
    w, h, rgb, _a, _m = ut_review.load_image(png)
    return w, h, rgb


def sample(png, x, y, r=2):
    """Mean RGB (0-255) of the (2r+1)x(2r+1) block centred on pixel (x, y), PNG rows top to bottom
    (ShaderLab.Shots probes already return (x, (1 - viewport y) * height))."""
    w, h, rgb = _img(png)
    x, y = int(round(x)), int(round(y))
    acc, n = [0, 0, 0], 0
    for yy in range(max(0, y - r), min(h, y + r + 1)):
        for xx in range(max(0, x - r), min(w, x + r + 1)):
            i = 3 * (yy * w + xx)
            acc[0] += rgb[i]
            acc[1] += rgb[i + 1]
            acc[2] += rgb[i + 2]
            n += 1
    return [round(c / max(n, 1), 2) for c in acc]


def luma(rgb):
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]


def region_stats(png, box=None, tol=2):
    """Mean RGB, mean luma and the share of pixels with |R-G| and |G-B| <= tol (grey pixels) in a box
    (x0, y0, x1, y1) or the whole image. A grayscale full-screen pass at strength 1 gives gray_share 1.0."""
    w, h, rgb = _img(png)
    x0, y0, x1, y1 = box or (0, 0, w, h)
    acc, n, grey = [0, 0, 0], 0, 0
    step = max(1, int(math.sqrt(((x1 - x0) * (y1 - y0)) / 40000.0)))
    for yy in range(y0, y1, step):
        for xx in range(x0, x1, step):
            i = 3 * (yy * w + xx)
            r_, g_, b_ = rgb[i], rgb[i + 1], rgb[i + 2]
            acc[0] += r_
            acc[1] += g_
            acc[2] += b_
            n += 1
            if abs(r_ - g_) <= tol and abs(g_ - b_) <= tol:
                grey += 1
    mean = [round(c / max(n, 1), 2) for c in acc]
    return {"mean_rgb": mean, "mean_luma": round(luma(mean), 2), "gray_share": round(grey / float(max(n, 1)), 4), "samples": n}


def findings_summary(findings):
    out = {"error": 0, "warn": 0, "info": 0}
    for f in findings:
        out[f["severity"]] = out.get(f["severity"], 0) + 1
    return out
