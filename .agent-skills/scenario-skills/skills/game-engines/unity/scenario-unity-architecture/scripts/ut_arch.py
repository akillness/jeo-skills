"""scenario-unity-architecture runner-side helpers (system python3, no dependencies).

Imports the shared toolkit (ut_env, ut_run); never reimplements it.
    import sys; sys.path[:0] = ["<skills>/scenario-unity-expert/scripts", "<skills>/scenario-unity-architecture/scripts"]
    import ut_env, ut_run, ut_arch
    P = ut_env.base_project("3d", "<project>/tests/projects/<skill>")
    ut_arch.install(P)                       # AgentKit core + AgentKit/Architecture
    ut_arch.scaffold(P)                      # Game.Core / Game.Runtime / Game.Editor / tests

Functions
- install(project): AgentKit (lead) + this skill's AgentKit/Architecture jobs.
- scaffold(project, root="Assets/Game", ns="Game", tests=True): copy the runtime templates and
  their asmdefs. No "testables" entry: with Input System 1.20 on 6000.3.21f1 the test asmdefs reach
  Unity.InputSystem.TestFramework (InputTestFixture) without it (observed), and "testables" would add
  the package's own IntegrationTests to every PlayMode run.
- item_specs(...): CreateAssets job specs for item definitions, a database and a health config.
- write_vcs_files(dest): .gitignore and .gitattributes (Git LFS by EXTENSION, Unity YAML merge driver).
- git_setup_unity_merge(repo): merge driver + mergetool config pointing at this Mac's UnityYAMLMerge,
  headless (-h, --fallback none), so no GUI window ever opens.
- yaml_merge(base, theirs, mine, out): one headless UnityYAMLMerge run, exit code and conflict report.
- meta_audit(project): missing and orphan .meta files, duplicate GUIDs, spaces in asset paths.
- code_lint(paths): static checks for the traps this skill covers (async lifetimes and threads, events,
  input, statics, serialization, 6.3 APIs). Rules and codes: LINT_RULES and the extra checks below it.
- input_lint(inputactions, code_paths): FindAction strings exist; each gameplay action covers the
  required control schemes.
- rebind_audit(paths): which of the rebinding rules a script set implements (disable, re-enable, dispose,
  Escape cancel, mouse exclusions, effectivePath duplicate check, reset clearing persistence). Run it on the
  Input System "Rebinding UI" sample (rebinding_sample_dir(project)) before patching it.
- player_executable(app), run_player(app, args): run a built macOS player headless.
All ran on this Mac on 2026-09-24 (tests/code/unity-architecture/, procedures.md).
"""

__version__ = "0.1"  # Unity Expert Skills v0.1 (2026-09-24)

import glob
import json
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

HERE = os.path.dirname(os.path.abspath(__file__))
SKILL = os.path.dirname(HERE)
SKILLS = os.path.dirname(SKILL)
LEAD_SCRIPTS = os.path.join(SKILLS, "scenario-unity-expert", "scripts")
if LEAD_SCRIPTS not in sys.path:
    sys.path.insert(0, LEAD_SCRIPTS)

import ut_env  # noqa: E402

TEMPLATES = os.path.join(HERE, "templates")
AGENTKIT = os.path.join(HERE, "AgentKit")

# template folder -> destination under the project's root folder
LAYOUT = [
    ("Core", "Scripts/Core"),
    ("Runtime", "Scripts/Runtime"),
    ("Editor", "Scripts/Editor"),
    ("Tests/EditMode", "Tests/EditMode"),
    ("Tests/PlayMode", "Tests/PlayMode"),
]


# ============================================================================ install and scaffold
def install(project):
    """AgentKit core (scenario-unity-expert) and this skill's jobs into Assets/Editor/AgentKit/."""
    written = ut_env.install_agentkit(project)
    written += ut_env.install_agentkit(project, src=AGENTKIT)
    return written


def _rename_ns(text, ns):
    if ns == "Game":
        return text
    text = re.sub(r"\bGame\.(Core|Runtime|Editor|EditorTools|Tests)\b", ns + r".\1", text)
    return text


def scaffold(project, root="Assets/Game", ns="Game", tests=True, testables=False):
    """Copy the architecture templates into the project (idempotent: a file is written only when
    its content differs). Returns the list of written paths relative to the project."""
    proj = ut_env.find_project(project)["root"]
    written = []
    for src_rel, dst_rel in LAYOUT:
        if not tests and src_rel.startswith("Tests"):
            continue
        src_dir = os.path.join(TEMPLATES, src_rel)
        for dirpath, _dirs, files in os.walk(src_dir):
            for fn in files:
                if not (fn.endswith(".cs") or fn.endswith(".asmdef")):
                    continue
                s = os.path.join(dirpath, fn)
                rel = os.path.relpath(s, src_dir)
                out_name = rel.replace("Game.", ns + ".") if fn.endswith(".asmdef") else rel
                d = os.path.join(proj, root, dst_rel, out_name)
                with open(s, encoding="utf-8") as f:
                    text = _rename_ns(f.read(), ns)
                if os.path.isfile(d):
                    with open(d, encoding="utf-8") as f:
                        if f.read() == text:
                            continue
                os.makedirs(os.path.dirname(d), exist_ok=True)
                with open(d, "w", encoding="utf-8") as f:
                    f.write(text)
                written.append(os.path.relpath(d, proj))
    if tests and testables:
        if add_testables(proj, ["com.unity.inputsystem"]):
            written.append("Packages/manifest.json")
    return written


def add_testables(project, packages):
    """Add packages to "testables" in Packages/manifest.json: their own test assemblies then compile
    and RUN with yours (Input System: IntegrationTests appear in the PlayMode results). Not needed for
    InputTestFixture on 6000.3.21f1 + Input System 1.20 (observed). Returns True when the file changed."""
    path = os.path.join(ut_env.find_project(project)["root"], "Packages", "manifest.json")
    with open(path) as f:
        data = json.load(f)
    cur = data.get("testables", [])
    new = cur + [p for p in packages if p not in cur]
    if new == cur:
        return False
    data["testables"] = new
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")
    return True


def item_specs(root="Assets/Game/Data", ns="Game", items=None, max_health=100.0, multipliers=(1.0, 1.5, 0.5)):
    """Specs for AgentKit.Architecture.ArchJobs.CreateAssets: one ItemDefinition asset per item (stable
    string ids), an ItemDatabase referencing them, a HealthConfig and two event channels."""
    items = items or [
        {"id": "potion_small", "name": "Small Potion", "max": 5},
        {"id": "arrow", "name": "Arrow", "max": 99},
        {"id": "sword_iron", "name": "Iron Sword", "max": 1},
    ]
    specs, paths = [], []
    for it in items:
        p = "%s/Items/Item_%s.asset" % (root, it["id"])
        paths.append(p)
        specs.append({"type": ns + ".Runtime.ItemDefinition", "path": p,
                      "fields": {"id": it["id"], "displayName": it["name"], "maxStack": it["max"]}})
    specs.append({"type": ns + ".Runtime.ItemDatabase", "path": root + "/ItemDatabase.asset", "ref_lists": {"items": paths}})
    specs.append({"type": ns + ".Runtime.HealthConfig", "path": root + "/HealthConfig_Player.asset",
                  "fields": {"maxHealth": max_health, "invulnerableSeconds": 0.5, "multipliers": list(multipliers)}})
    specs.append({"type": ns + ".Runtime.FloatEventChannel", "path": root + "/Events/EVT_PlayerHealthChanged.asset"})
    specs.append({"type": ns + ".Runtime.VoidEventChannel", "path": root + "/Events/EVT_PlayerDied.asset"})
    return specs


# ============================================================================ version control
GITIGNORE = """# Unity (generated, per machine)
/[Ll]ibrary/
/[Tt]emp/
/[Oo]bj/
/[Bb]uild/
/[Bb]uilds/
/[Ll]ogs/
/[Uu]ser[Ss]ettings/
/[Mm]emoryCaptures/
/[Rr]ecordings/
# UnityYAMLMerge conflict reports written by the merge driver (ut_arch.git_setup_unity_merge)
*.conflicts.txt
# macOS player builds write this next to the .app: never ship or commit it
*_BurstDebugInformation_DoNotShip/
# IDE and generated project files
.vs/
.vscode/
.idea/
*.csproj
*.sln
*.suo
*.user
*.userprefs
*.pidb
*.booproj
*.pdb
*.mdb
*.opendb
*.VC.db
sysinfo.txt
# build artifacts
*.apk
*.aab
*.unitypackage
*.app
crashlytics-build.properties
.DS_Store
"""

LFS_EXTENSIONS = [
    # images
    "png", "jpg", "jpeg", "gif", "psd", "tga", "tif", "tiff", "exr", "hdr", "bmp", "ai", "cubemap",
    # audio and video
    "wav", "mp3", "ogg", "aif", "aiff", "flac", "mp4", "mov", "webm",
    # 3D and scans
    "fbx", "FBX", "obj", "blend", "ma", "mb", "max", "glb", "gltf", "abc", "usd", "usdz",
    # fonts, archives, binaries
    "ttf", "otf", "zip", "7z", "rar", "pdf", "dll", "so", "a", "dylib", "bundle",
    # large Unity binaries
    "asset.bin",
]


def gitattributes(lfs=True, yaml_driver=True):
    lines = ["# Unity text assets: Force Text serialization. Scenes and prefabs merged by UnityYAMLMerge",
             "# (driver defined by ut_arch.git_setup_unity_merge). No *.asset line: some .asset files are",
             "# binary even in Force Text (git-amend correction, F0Qk-Cyw6PA description) [added reason].",
             "*.cs diff=csharp text", "*.meta text", "*.mat text", "*.anim text", "*.controller text",
             "*.inputactions text", "*.asmdef text", "*.json text"]
    if yaml_driver:
        lines += ["*.unity merge=unityyamlmerge eol=lf", "*.prefab merge=unityyamlmerge eol=lf"]
    else:
        lines += ["*.unity text eol=lf", "*.prefab text eol=lf"]
    if lfs:
        lines += ["", "# Git LFS by EXTENSION, never by folder: a folder rule drags the text .meta files into LFS",
                  "# (Tim Pettersen, 'The complete guide to Unity & Git'). Binaries over ~500 KB belong here."]
        lines += ["*.%s filter=lfs diff=lfs merge=lfs -text" % e for e in LFS_EXTENSIONS]
    return "\n".join(lines) + "\n"


def write_vcs_files(dest, lfs=True, yaml_driver=True, overwrite=False):
    """Write .gitignore and .gitattributes in dest (the folder that holds Assets/ and ProjectSettings/).
    Existing files are kept unless overwrite=True (then the old one is moved to archive/)."""
    out = {}
    for name, text in ((".gitignore", GITIGNORE), (".gitattributes", gitattributes(lfs, yaml_driver))):
        p = os.path.join(dest, name)
        if os.path.exists(p) and not overwrite:
            out[name] = "kept"
            continue
        if os.path.exists(p):
            arch = os.path.join(dest, "archive")
            os.makedirs(arch, exist_ok=True)
            shutil.move(p, os.path.join(arch, name + "." + time.strftime("%Y%m%d-%H%M%S")))
        with open(p, "w") as f:
            f.write(text)
        out[name] = "written"
    return out


def yaml_merge_path(version=ut_env.DEFAULT_VERSION):
    return ut_env.find_editor(version)["yaml_merge"]


def git_setup_unity_merge(repo, version=ut_env.DEFAULT_VERSION, scope="--local"):
    """Configure Git to merge .unity/.prefab with UnityYAMLMerge, headless (no GUI window ever):
    - a merge DRIVER, run inside `git merge` itself:
        merge -h --force --fallback none -o '%P.conflicts.txt' %O %B %A %A
      (%O base, %B theirs = left, %A ours = right and output, %P the path in the tree). Exit 0: merged.
      Exit 2: Git marks the file conflicted; the file holds the BASE value for each conflicted field
      (observed) and <path>.conflicts.txt lists them; resolve with yaml_merge(..., resolve="mine"|"theirs").
    - a mergetool entry for `git mergetool -y --tool=unityyamlmerge`, trustExitCode true.
    .gitattributes must route the extensions to the driver (write_vcs_files does). Returns the config."""
    tool = yaml_merge_path(version)
    q = "'%s'" % tool
    cfg = {
        "merge.unityyamlmerge.name": "Unity SmartMerge (UnityYAMLMerge, headless)",
        "merge.unityyamlmerge.driver": q + " merge -h --force --fallback none -o '%P.conflicts.txt' %O %B %A %A",
        "merge.unityyamlmerge.recursive": "binary",
        "merge.tool": "unityyamlmerge",
        "mergetool.unityyamlmerge.cmd": q + ' merge -h -p --fallback none "$BASE" "$REMOTE" "$LOCAL" "$MERGED"',
        "mergetool.unityyamlmerge.trustExitCode": "true",
        "mergetool.keepBackup": "false",
    }
    for k, v in cfg.items():
        subprocess.run(["git", "-C", repo, "config", scope, k, v], check=True)
    return cfg


def parse_merge_report(text):
    """The -o report always has 'Conflicts:' and 'Conflict handling:' headers, even for a clean merge
    (observed): conflicts are the lines between them."""
    lines = text.splitlines()
    out, inside = [], False
    for l in lines:
        if l.startswith("Conflicts:"):
            inside = True
            continue
        if l.startswith("Conflict handling:"):
            break
        if inside and l.strip():
            out.append(l.rstrip())
    return out


def yaml_merge(base, theirs, mine, out, report=None, resolve=None, premerge=False, version=ut_env.DEFAULT_VERSION, timeout=120):
    """One headless UnityYAMLMerge run: merge -h [-p] [-l|-r] --fallback none -o <report> base theirs mine out.
    Observed on 6000.3.21f1 (tool 1.0.1): exit 0 = clean; exit 2 whenever a field conflicts, EVEN with -l/-r;
    the output file is always written: conflicted fields take the BASE value by default (both edits lost),
    the THEIRS value with -p or -l, the MINE value with -r. Never trust the file without the exit code.
    resolve: None, "theirs" (-l) or "mine" (-r).
    Returns {"exit_code", "clean", "out_exists", "report", "conflicts", "conflict_fields", "stdout", "cmd"}."""
    report = report or out + ".conflicts.txt"
    cmd = [yaml_merge_path(version), "merge", "-h"]
    if premerge:
        cmd.append("-p")
    if resolve == "theirs":
        cmd.append("-l")
    elif resolve == "mine":
        cmd.append("-r")
    cmd += ["--fallback", "none", "-o", report, base, theirs, mine, out]
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    text = Path(report).read_text() if os.path.isfile(report) else ""
    conflicts = parse_merge_report(text)
    fields = sorted({l.split()[1] for l in conflicts if l.startswith(("Left ", "Right ")) and len(l.split()) > 1})
    return {"exit_code": p.returncode, "clean": p.returncode == 0, "out_exists": os.path.isfile(out), "report": report,
            "conflicts": conflicts, "conflict_fields": fields, "stdout": (p.stdout + p.stderr)[-2000:], "cmd": cmd}


# ============================================================================ audits
def meta_audit(project, folder="Assets"):
    """Pair every file and folder under Assets/ with its .meta. Returns {"missing_meta", "orphan_meta",
    "duplicate_guids", "paths_with_spaces", "files", "ok"}. Hidden files and ~-suffixed folders are
    ignored by Unity and skipped here."""
    root = os.path.join(ut_env.find_project(project)["root"], folder)
    missing, orphans, spaces = [], [], []
    guids = {}
    nfiles = 0
    for dirpath, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if not d.startswith(".") and not d.endswith("~")]
        names = set(files) | set(dirs)
        for n in list(dirs) + [f for f in files if not f.endswith(".meta")]:
            if n.startswith("."):
                continue
            nfiles += 1
            rel = os.path.relpath(os.path.join(dirpath, n), os.path.dirname(root))
            if " " in n:
                spaces.append(rel)
            if n + ".meta" not in names:
                missing.append(rel)
        for f in files:
            if not f.endswith(".meta") or f.startswith("."):
                continue
            target = f[:-5]
            rel = os.path.relpath(os.path.join(dirpath, f), os.path.dirname(root))
            if target not in names:
                orphans.append(rel)
                continue
            try:
                with open(os.path.join(dirpath, f), errors="replace") as fh:
                    m = re.search(r"^guid:\s*([0-9a-f]{32})", fh.read(), re.M)
                if m:
                    guids.setdefault(m.group(1), []).append(rel)
            except OSError:
                pass
    dups = {g: p for g, p in guids.items() if len(p) > 1}
    return {"files": nfiles, "missing_meta": missing, "orphan_meta": orphans, "duplicate_guids": dups,
            "paths_with_spaces": spaces, "ok": not missing and not orphans and not dups}


LINT_RULES = [
    # (code, severity, regex, message)
    ("async.double_await_risk", "info", r"\bAwaitable(?:<[^>]+>)?\s+\w+\s*=", "an Awaitable stored in a variable: never await it twice (pooled); AsTask() for several awaits"),
    ("async.token_none", "warn", r"CancellationToken\.None", "CancellationToken.None in runtime code: pass destroyCancellationToken or Application.exitCancellationToken"),
    ("async.blocking_wait", "error", r"\.(?:Result\b|Wait\(\)|GetAwaiter\(\)\.GetResult\(\))", "blocking on a Task on the main thread can deadlock (continuations run on the next Update)"),
    ("async.async_void", "warn", r"\basync\s+void\s+(?!On[A-Z])\w+", "async void outside an event handler: exceptions are lost; return Awaitable"),
    ("async.task_delay", "warn", r"\bTask\.Delay\(", "Task.Delay: no managed threads or timers on the Web platform; Awaitable.WaitForSecondsAsync"),
    ("input.findaction_per_frame", "warn", None, "FindAction inside Update/FixedUpdate/LateUpdate: string lookup per frame, cache it once"),
    ("input.legacy_input", "error", r"\bInput\.(?:GetAxis|GetAxisRaw|GetKey|GetKeyDown|GetKeyUp|GetButton|GetButtonDown|GetMouseButton|GetMouseButtonDown|mousePosition|anyKeyDown)\b", "legacy UnityEngine.Input: 6.3 templates run the Input System only (throws at runtime)"),
    ("input.playerinput_with_global_actions", "warn", None, "PlayerInput and InputSystem.actions in the same file: read playerInput.actions (per-player copy)"),
    ("input.rebind_without_dispose", "warn", None, "PerformInteractiveRebinding without Dispose(): unmanaged memory leak"),
    ("api.find_object_of_type", "warn", r"\bFindObjectsOfType\b|\bFindObjectOfType\b", "obsolete in 6.x: FindFirstObjectByType / FindAnyObjectByType / FindObjectsByType(FindObjectsSortMode.None)"),
    ("api.serializefield_on_property", "error", r"\[SerializeField\]\s*(?:public|private|protected|internal)?\s*[\w<>\[\],]+\s+\w+\s*\{\s*get", "[SerializeField] on a property is a compile error in 6.3: [field: SerializeField]"),
    ("editor.setdirty_in_runtime", "warn", None, "EditorUtility.SetDirty outside #if UNITY_EDITOR in a runtime file"),
    ("statics.static_event", "info", r"\bstatic\s+event\b", "static event: needs a reset or unsubscription when domain reload is disabled"),
    ("so.runtime_write_hint", "info", r"\bScriptableObject\b.*\bSave\b|\bSaveFile\w*\s*:\s*ScriptableObject", "a ScriptableObject used as a save: writes persist in the Editor and vanish in builds"),
]


# Unity APIs that must not run between BackgroundThreadAsync() and MainThreadAsync(). Calibrated on a
# development player (procedures.md A12): these threw UnityException off the main thread there.
OFF_MAIN_THREAD_API = r"\btransform\b|\bgameObject\b|GetComponent|Instantiate\s*\(|new\s+GameObject|Destroy\s*\(|\bTime\.|Application\.persistentDataPath|PlayerPrefs\.|Resources\.|SceneManager\.|Physics\.|Camera\."


def _blocks(text, header_rx):
    """(match, body, line) for every brace block whose header matches header_rx (crude brace matching)."""
    for m in re.finditer(header_rx, text):
        i, depth = m.end(), 1
        while i < len(text) and depth:
            depth += {"{": 1, "}": -1}.get(text[i], 0)
            i += 1
        yield m, text[m.end():i], text[:m.start()].count("\n") + 1


def _class_table(texts):
    """{class name: (has [Serializable], [base names])} over several source texts."""
    table = {}
    for text in texts:
        for m in re.finditer(r"\bclass\s+(\w+)(?:<[^>{]*>)?\s*(?::\s*([^{]+))?\{", text):
            start = max(text.rfind(";", 0, m.start()), text.rfind("}", 0, m.start()), text.rfind("{", 0, m.start()))
            attrs = text[start + 1:m.start()]
            bases = [b.strip().split("<")[0].split(".")[-1] for b in (m.group(2) or "").split(",") if b.strip()]
            table[m.group(1)] = ("Serializable" in attrs, bases)
    return table


def _extra_checks(fp, code, all_texts_table):
    """Checks that need more than one regex: returns findings for one file."""
    out = []
    add = lambda sev, rule, line, msg: out.append({"severity": sev, "code": rule, "path": fp, "line": line, "message": msg})
    # async.double_await: the same Awaitable local awaited twice (pooled: exception or hang)
    for m in re.finditer(r"\b(?:Awaitable(?:<[^>]+>)?|var)\s+(\w+)\s*=\s*([^;]*);", code):
        rhs = m.group(2)
        if "AsTask(" in rhs or not ("Async(" in rhs or "Awaitable" in rhs or m.group(0).startswith("Awaitable")):
            continue
        name = m.group(1)
        n = len(re.findall(r"\bawait\s+" + re.escape(name) + r"\b(?!\s*\.)", code[m.end():]))
        if n >= 2:
            add("error", "async.double_await", code[:m.start()].count("\n") + 1,
                "Awaitable '%s' awaited %d times: instances are pooled (exception or hang); await once, or AsTask() for several awaits" % (name, n))
    # async.loop_without_token: an awaiting loop that observes no cancellation token
    for m, body, line in _blocks(code, r"\bwhile\s*\([^)]*\)\s*\{"):
        if "await " in body and not re.search(r"[Tt]oken|\bct\b|IsCancellationRequested", body):
            add("warn", "async.loop_without_token", line,
                "awaiting loop without a cancellation token: awaits outlive Destroy and Play-mode exit (destroyCancellationToken, Lifetime.Linked, Application.exitCancellationToken)")
    # async.unity_api_off_main_thread: Unity API between BackgroundThreadAsync() and the next MainThreadAsync()
    for m in re.finditer(r"BackgroundThreadAsync\s*\(\s*\)", code):
        end = code.find("MainThreadAsync", m.end())
        seg = code[m.end(): end if end >= 0 else m.end() + 1500]
        hit = re.search(OFF_MAIN_THREAD_API, seg)
        if hit:
            add("error", "async.unity_api_off_main_thread", code[:m.end() + hit.start()].count("\n") + 1,
                "Unity API '%s' after BackgroundThreadAsync(): main thread only; a development build throws, a release build does not check (A12)" % hit.group(0))
    # events.forward_listener_iteration: Raise loops forward over its listeners
    for m, body, line in _blocks(code, r"\bvoid\s+(?:Raise|Fire|Broadcast|Notify)\w*\s*\([^)]*\)\s*\{"):
        if re.search(r"foreach\s*\([^)]*[Ll]isteners|for\s*\(\s*int\s+\w+\s*=\s*0\s*;[^;]*[Ll]isteners", body):
            add("warn", "events.forward_listener_iteration", line,
                "listeners iterated forward: a response that unregisters itself skips the next one or throws; iterate backwards (Hipple [00:33:23])")
    # events.unityevent_per_frame: a UnityEvent invoked from Update/FixedUpdate/LateUpdate
    names = set(re.findall(r"\bUnityEvent(?:<[^>]*>)?\s+(\w+)\s*[;=]", code))
    if names:
        for name, body, line in _method_blocks(code):
            for n in names:
                if re.search(r"\b" + re.escape(n) + r"\s*\??\.Invoke\s*\(", body):
                    add("warn", "events.unityevent_per_frame", line,
                        "UnityEvent '%s' invoked in %s: a serialized function call, meant for rare designer-wired responses (Hipple [00:29:26], [00:32:15]); use a C# event or a channel" % (n, name))
    # input.stored_callback_context: CallbackContext kept in a field
    for m in re.finditer(r"(?m)^\s*(?:(?:private|public|protected|internal|static|readonly)\s+)*(?:InputAction\.)?CallbackContext\s+\w+\s*;", code):
        add("warn", "input.stored_callback_context", code[:m.start()].count("\n") + 1,
            "InputAction.CallbackContext stored in a field: only valid inside the callback; copy the value out (1.20 manual)")
    # input.load_overrides_wipes: several loads, none layered
    loads = re.findall(r"LoadBindingOverridesFromJson\s*\(([^;]*)\)\s*;", code)
    if len(loads) >= 2 and not any(re.search(r",\s*(?:false|removeExisting\s*:\s*false)", a) for a in loads):
        add("info", "input.load_overrides_wipes", 1,
            "LoadBindingOverridesFromJson called %d times: each call first removes every existing override unless passed false" % len(loads))
    # serialization.serializereference_without_serializable (required from 6.4 [unverified in the version notes])
    for m in re.finditer(r"\[SerializeReference\][^;{]*?\b(?:List<(\w+)>|(\w+)\[\]|(\w+))\s+\w+\s*[;=]", code):
        base = m.group(1) or m.group(2) or m.group(3)
        family, frontier = {base}, [base]
        while frontier:
            b = frontier.pop()
            for cname, (_ser, bases) in all_texts_table.items():
                if b in bases and cname not in family:
                    family.add(cname)
                    frontier.append(cname)
        missing = sorted(c for c in family if c in all_texts_table and not all_texts_table[c][0])
        if missing:
            add("warn", "serialization.serializereference_without_serializable", code[:m.start()].count("\n") + 1,
                "[SerializeReference] type(s) without [Serializable]: %s (required from 6.4 per the version notes; mark them now)" % ", ".join(missing))
    # serialization.enum_implicit_values: serialized enums are stored as numbers
    for m in re.finditer(r"\benum\s+(\w+)\s*(?::\s*\w+)?\s*\{([^}]*)\}", code):
        members = [x.strip() for x in m.group(2).split(",") if x.strip()]
        if members and any("=" not in x for x in members):
            add("info", "serialization.enum_implicit_values", code[:m.start()].count("\n") + 1,
                "enum %s has implicit values: if it is serialized, inserting or reordering members changes saved data; give explicit values or use ScriptableObject 'enums' for open sets (Hipple [00:46:39])" % m.group(1))
    return out


def _method_blocks(text):
    """(name, body) for Update/FixedUpdate/LateUpdate methods, crude brace matching."""
    for m in re.finditer(r"\bvoid\s+(Update|FixedUpdate|LateUpdate)\s*\(\s*\)\s*\{", text):
        i, depth = m.end(), 1
        while i < len(text) and depth:
            depth += {"{": 1, "}": -1}.get(text[i], 0)
            i += 1
        yield m.group(1), text[m.end():i], text[:m.start()].count("\n") + 1


def code_lint(paths, exclude_editor=True):
    """Regex lint over .cs files (files or folders). Returns a list of findings in the AgentKit format
    {severity, code, path, line, message}. Cheap first pass; the tests are the proof."""
    files = []
    for p in ([paths] if isinstance(paths, str) else paths):
        if os.path.isdir(p):
            files += glob.glob(os.path.join(p, "**", "*.cs"), recursive=True)
        elif p.endswith(".cs"):
            files.append(p)
    out = []
    texts = {}
    for fp in sorted(set(files)):
        with open(fp, encoding="utf-8", errors="replace") as f:
            texts[fp] = re.sub(r"//[^\n]*", "", f.read())   # drop line comments
    table = _class_table(texts.values())
    for fp in sorted(set(files)):
        is_editor = "/Editor/" in fp.replace("\\", "/")
        code = texts[fp]
        out += _extra_checks(fp, code, table)
        for rule, sev, rx, msg in LINT_RULES:
            if rx is None:
                continue
            if rule.startswith("async.token_none") and "/Tests/" in fp:
                continue
            for m in re.finditer(rx, code):
                out.append({"severity": sev, "code": rule, "path": fp, "line": code[:m.start()].count("\n") + 1, "message": msg})
        for name, body, line in _method_blocks(code):
            if "FindAction(" in body:
                out.append({"severity": "warn", "code": "input.findaction_per_frame", "path": fp, "line": line, "message": LINT_RULES[5][3] + " (" + name + ")"})
        if "PlayerInput" in code and "InputSystem.actions" in code:
            out.append({"severity": "warn", "code": "input.playerinput_with_global_actions", "path": fp, "line": 1, "message": LINT_RULES[7][3]})
        if "PerformInteractiveRebinding" in code and "Dispose(" not in code:
            out.append({"severity": "warn", "code": "input.rebind_without_dispose", "path": fp, "line": 1, "message": LINT_RULES[8][3]})
        if not is_editor and "EditorUtility.SetDirty" in code:
            stripped = re.sub(r"#if\s+UNITY_EDITOR.*?#endif", "", code, flags=re.S)
            if "EditorUtility.SetDirty" in stripped:
                out.append({"severity": "warn", "code": "editor.setdirty_in_runtime", "path": fp, "line": 1, "message": LINT_RULES[11][3]})
    return out


def input_lint(inputactions, code_paths=(), maps=("Player",), groups=("Keyboard&Mouse", "Gamepad")):
    """Offline check of an .inputactions JSON: every "Map/Action" or "Action" string passed to
    FindAction(...) in code exists; each action of the gameplay maps has a binding per control scheme;
    duplicate action names across maps are looked up with a map prefix. Returns findings."""
    with open(inputactions, encoding="utf-8") as f:
        data = json.load(f)
    actions = {}
    for m in data.get("maps", []):
        for a in m.get("actions", []):
            actions.setdefault(a["name"], []).append(m["name"])
    qualified = {"%s/%s" % (m["name"], a["name"]) for m in data.get("maps", []) for a in m.get("actions", [])}
    out = []
    for m in data.get("maps", []):
        if maps and m["name"] not in maps:
            continue
        for a in m.get("actions", []):
            have = set()
            for b in m.get("bindings", []):
                if b.get("action") == a["name"] and not b.get("isComposite"):
                    have |= {g for g in b.get("groups", "").split(";") if g}
            for g in groups:
                if g not in have:
                    out.append({"severity": "warn", "code": "input.missing_scheme", "path": inputactions,
                                "message": "%s/%s has no %s binding" % (m["name"], a["name"], g)})
    files = []
    for p in code_paths:
        files += glob.glob(os.path.join(p, "**", "*.cs"), recursive=True) if os.path.isdir(p) else [p]
    for fp in files:
        with open(fp, encoding="utf-8", errors="replace") as f:
            text = f.read()
        for mm in re.finditer(r'(?:FindAction|Require)\(\s*(?:\w+\s*,\s*)?"([^"]+)"', text):
            name = mm.group(1)
            line = text[:mm.start()].count("\n") + 1
            if "/" in name:
                if name not in qualified:
                    out.append({"severity": "error", "code": "input.unknown_action", "path": fp, "line": line, "message": name + " not in " + os.path.basename(inputactions)})
            elif name not in actions:
                out.append({"severity": "error", "code": "input.unknown_action", "path": fp, "line": line, "message": name + " not in " + os.path.basename(inputactions)})
            elif len(actions[name]) > 1:
                out.append({"severity": "warn", "code": "input.ambiguous_action", "path": fp, "line": line, "message": name + " exists in maps " + ", ".join(actions[name]) + ": use Map/Action"})
    return out


# ============================================================================ rebinding audit
REBIND_RULES = [
    # (rule, why)
    ("disables_before_rebind", "WithAction throws on an enabled action (Input System 1.20 source; samyam [00:12:51])"),
    ("reenables_after", "the action or map is enabled again on complete and cancel ([00:20:21])"),
    ("disposes_operation", "RebindingOperation leaks unmanaged memory unless disposed (1.20 manual)"),
    ("cancel_through_escape", "Button rows bind Escape itself unless WithCancelingThrough is set (package source, observed)"),
    ("excludes_mouse", "a stray click becomes the binding on a keyboard row ([00:20:53])"),
    ("duplicate_check_effective_path", "duplicates judged on effectivePath, composite parts against earlier parts ([00:27:44], [00:28:53])"),
    ("persists_overrides", "SaveBindingOverridesAsJson / LoadBindingOverridesFromJson"),
    ("reset_clears_persistence", "Reset All must delete the persisted overrides or they return next launch ([00:33:22])"),
]


def rebind_audit(paths):
    """Static audit of a rebinding implementation (files or folders of .cs). Returns
    {"rules": {rule: bool}, "missing": [rule...], "why": {rule: reason}, "files": [...]}. Heuristic: read the
    code for each missing rule before patching."""
    files = []
    for p in ([paths] if isinstance(paths, str) else paths):
        files += glob.glob(os.path.join(p, "**", "*.cs"), recursive=True) if os.path.isdir(p) else [p]
    code = ""
    for fp in files:
        with open(fp, encoding="utf-8", errors="replace") as f:
            code += re.sub(r"//[^\n]*", "", f.read()) + "\n"
    rules = {
        "disables_before_rebind": bool(re.search(r"\.Disable\s*\(\s*\)", code)) and "PerformInteractiveRebinding" in code,
        "reenables_after": bool(re.search(r"\.Enable\s*\(\s*\)", code)),
        "disposes_operation": bool(re.search(r"\bDispose\s*\(\s*\)", code)),
        "cancel_through_escape": "WithCancelingThrough" in code,
        "excludes_mouse": bool(re.search(r"WithControlsExcluding\s*\(\s*\"<(?:Mouse|Pointer)>", code)),
        "duplicate_check_effective_path": bool(re.search(r"effectivePath\s*[!=]=|Equals\s*\([^)]*effectivePath", code)),
        "persists_overrides": "SaveBindingOverridesAsJson" in code and "LoadBindingOverridesFromJson" in code,
        "reset_clears_persistence": bool(re.search(r"RemoveAllBindingOverrides|RemoveBindingOverride", code))
                                     and bool(re.search(r"DeleteKey\s*\(|File\.Delete\s*\(", code)),
    }
    return {"rules": rules, "missing": [r for r, _ in REBIND_RULES if not rules[r]], "why": dict(REBIND_RULES), "files": files}


def rebinding_sample_dir(project):
    """The Input System 'Rebinding UI' sample inside the project's package cache (read-only source)."""
    root = ut_env.find_project(project)["root"]
    hits = glob.glob(os.path.join(root, "Library", "PackageCache", "com.unity.inputsystem@*", "Samples~", "RebindingUI"))
    return hits[0] if hits else None


# ============================================================================ players
def player_executable(app):
    macos = os.path.join(app, "Contents", "MacOS")
    exes = [os.path.join(macos, f) for f in os.listdir(macos)] if os.path.isdir(macos) else []
    exes = [e for e in exes if os.access(e, os.X_OK) and os.path.isfile(e)]
    if not exes:
        raise FileNotFoundError("no executable in " + macos)
    return exes[0]


def run_player(app, args=(), log=None, timeout=120, headless=True):
    """Run a built macOS player: <app>/Contents/MacOS/<exe> [-batchmode -nographics] -logFile <log> args.
    Returns {"exit_code", "seconds", "log", "timed_out"}."""
    exe = player_executable(app)
    log = log or os.path.join(os.path.dirname(app), "player.log")
    cmd = [exe] + (["-batchmode", "-nographics"] if headless else []) + ["-logFile", log] + list(args)
    t0 = time.time()
    try:
        p = subprocess.run(cmd, timeout=timeout, capture_output=True, text=True)
        code, timed_out = p.returncode, False
    except subprocess.TimeoutExpired:
        code, timed_out = None, True
    return {"exit_code": code, "seconds": round(time.time() - t0, 2), "log": log, "timed_out": timed_out, "cmd": cmd}
