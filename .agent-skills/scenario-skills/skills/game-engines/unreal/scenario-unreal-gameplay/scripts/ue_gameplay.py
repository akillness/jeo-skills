"""
ue_gameplay.py: toolkit of the scenario-unreal-gameplay skill (UE 5.8, macOS Apple Silicon).

Two layers in one file.

1. OFFLINE layer (system python3, stdlib only). Architecture decisions with their deciding
   conditions (where data lives, Blueprint vs C++, GAS or not, StateTree vs Behavior Tree vs
   Mass, ASC placement and replication mode), ini and gameplay-tag edits with backups, the
   Enhanced Input plan and its checks, C++ scaffolds (templates in ue_gameplay_cpp.py), the
   Build.cs patch and build command, a C++ lint for the experts' rules, analysis of PIE traces
   (jump apex, dash distance, cooldown, AI phases, state sequences, health bar), dumpticks
   parsing and tick verdicts, hard-reference verdicts, Blueprint snapshot scanning, Python
   automation-test generation, and the handoff contracts for scenario-unreal-vfx and scenario-unreal-performance.
   Tested by tests/code/unreal-gameplay/test_gameplay_offline.py (passed offline).

2. IN-EDITOR layer (Editor Python in UnrealEditor 5.8, `import unreal`). Probe, Blueprint
   children and CDO defaults, component defaults, Enhanced Input assets, gameplay tags and
   Gameplay Effects, ability children, StateTree assets, Widget Blueprint trees, data tables,
   a PIE scenario runner that injects input with Input.+key / Input.-key and samples the
   world every tick, and a gameplay asset audit.
   STATUS: NOT YET RUN IN UNREAL (engine not installed on 2026-09-24). Names marked [verify]
   are tried defensively; a failed attempt is reported, never silently skipped.

Shared toolkit (<skills>/scenario-unreal-expert/scripts, lead agent): ue_run.run_python / result /
args for headless and latent jobs, ue_review.screenshot / image_checks for captures,
ue_env.enable_plugins / find_engine / xcode_status, ue_stat for stat logs. Not reimplemented.

No em dashes in this file (project rule).
"""
from __future__ import annotations

import json
import math
import os
import re
import shutil
import sys
import time

_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

import ue_gameplay_cpp as cpp_templates  # noqa: E402

__version__ = "0.1"  # Unreal Engine Expert Skills v0.1 (2026-09-24)

# =============================================================================================
# 1. OFFLINE: where data lives
# =============================================================================================

DATA_HOMES = {
    "GameMode": {"network": "server only", "lifetime": "map",
                 "use_for": "rules, spawning, win conditions; no transient data clients need",
                 "source": "Forsythe IaU2Hue-ApI [00:13:26]; framework doc (GameMode)"},
    "GameState component (server-only)": {
        "network": "server only", "lifetime": "map",
        "use_for": "GameMode logic in a modular project, so code and data travel together",
        "source": "Noland, Lyra Fj1zCsYydD8 [00:03:22]"},
    "GameState": {"network": "replicated to all", "lifetime": "map",
                  "use_for": "match data every player sees (score, phase, completed objectives)",
                  "source": "framework doc (GameState)"},
    "PlayerState": {"network": "replicated to all", "lifetime": "map, survives pawn death",
                    "use_for": "per-player data others need (name, score, team); ASC when "
                               "attributes must survive respawn",
                    "source": "framework doc (PlayerState); tranek 4.1"},
    "PlayerController": {"network": "owner only", "lifetime": "map, survives pawn death",
                         "use_for": "input, HUD and widgets, choices that persist across "
                                    "respawn but others do not need",
                         "source": "Forsythe IaU2Hue-ApI [00:16:26]; Lyra [00:17:05]"},
    "Pawn or Character (or a component on it)": {
        "network": "replicated, simulated on others", "lifetime": "until death",
        "use_for": "body, movement, per-life state; ASC for AI and non-respawning players",
        "source": "Forsythe IaU2Hue-ApI [00:16:26]"},
    "GameInstance subsystem": {"network": "local", "lifetime": "process (all maps)",
                               "use_for": "cross-map state, the save-game file API",
                               "source": "Forsythe [00:26:05]; Shao KBn62trwkLw [00:05:16]"},
    "World subsystem": {"network": "local", "lifetime": "world",
                        "use_for": "per-world services, recording and restoring world state",
                        "source": "Shao KBn62trwkLw [00:14:34]"},
    "LocalPlayer subsystem": {"network": "local", "lifetime": "local player",
                              "use_for": "per-local-user UI and input settings",
                              "source": "subsystems doc"},
    "Actor (replicated property + RepNotify)": {
        "network": "replicated to relevant clients", "lifetime": "actor",
        "use_for": "world object state (door open); never a multicast RPC",
        "source": "Forsythe JOJP0CvpB8w [00:10:50]; networking doc (Tips)"},
    "SaveGame record": {"network": "local file", "lifetime": "sessions",
                        "use_for": "state that must survive quitting or streaming out; "
                                   "SaveGame properties + your own version header",
                        "source": "Shao KBn62trwkLw [00:10:42], [00:12:58]"},
}


def place_data(item):
    """Where a piece of gameplay data should live.

    item keys (all optional): name, visible_to ('server' | 'owner' | 'all'), per_player,
    survives_respawn, survives_map, survives_session, world_object, streamed, ui, modular,
    per_world_service. Returns {home, also, replication, why, source}."""
    name = item.get("name", "data")
    also = []
    rep = "none"
    if item.get("survives_session"):
        also.append("SaveGame record")
    if item.get("ui"):
        home, why = "PlayerController", "UI belongs to the owning player's controller"
    elif item.get("per_world_service"):
        home, why = "World subsystem", "a per-world service needs no actor subclass"
    elif item.get("survives_map"):
        home, why = "GameInstance subsystem", "only objects created before LoadMap outlive a map"
    elif item.get("world_object"):
        home = "Actor (replicated property + RepNotify)"
        why = "state belongs to the object; replicate the minimal data to rebuild it"
        rep = "Replicated/ReplicatedUsing"
        if item.get("streamed"):
            also.append("SaveGame record")
            why += "; under World Partition the actor can be reloaded fresh, so keep a record"
    elif item.get("per_player"):
        vis = item.get("visible_to", "owner")
        if vis == "all":
            home, why, rep = "PlayerState", "other players must read it", "Replicated"
        elif item.get("survives_respawn"):
            home = "PlayerController"
            why = "owner-only and must outlive the pawn (a dead pawn stays as a corpse)"
            rep = "owner only (COND_OwnerOnly if on a replicated actor)"
        else:
            home, why = "Pawn or Character (or a component on it)", "per-life state"
            rep = "Replicated where others must see it"
    else:
        vis = item.get("visible_to", "all")
        if vis == "server":
            home = ("GameState component (server-only)" if item.get("modular") else "GameMode")
            why = "server-only rules"
        else:
            home, why, rep = "GameState", "every player needs it", "Replicated"
    info = DATA_HOMES[home]
    return {"name": name, "home": home, "also": also, "replication": rep, "why": why,
            "network": info["network"], "lifetime": info["lifetime"], "source": info["source"]}


def decide(spec):
    """Architecture decision record for a gameplay feature set.

    spec keys: multiplayer (bool), abilities (int, active abilities incl. enemy ones),
    statuses (bool: stacking buffs, debuffs, stuns), cooldown_ui (bool), cpp (True, False,
    or None when the Xcode probe has not run), npc_count (int), npc_movable (bool),
    stationary_interactables (int), team_knows_bt (bool), existing_bt_library (bool),
    respawn_keeps_attributes (bool), gamepad_menus (bool), data (list of place_data items).
    Every decision carries 'why' and the 'condition' that would flip it."""
    mp = bool(spec.get("multiplayer"))
    cpp = spec.get("cpp")
    n_ab = int(spec.get("abilities", 0))
    rec = {"spec": spec, "decisions": {}, "open_questions": []}
    d = rec["decisions"]

    if cpp is True:
        d["language"] = {
            "choice": "C++ base classes for systems and logic; data-only Blueprint children "
                      "for assets, tuning and cosmetics",
            "why": "Blueprint may depend on C++, never the reverse; logic as text is what an "
                   "agent can write, diff and review; Blueprint VM cost only matters at scale",
            "condition": "move a Blueprint function to C++ only when Insights shows it hot",
            "source": "Forsythe VMZftEVDuCE [00:24:10], [00:14:35]; Arnbjornsson [00:21:31]"}
    elif cpp is None:
        d["language"] = {
            "choice": "undecided: run the Xcode build probe first (Procedure P3)",
            "why": "Xcode 26.6 is installed; Epic lists 26.0 min, 26.1.1 recommended, 26.4 "
                   "incompatible, 26.6 unlisted",
            "condition": "probe build exit 0 -> C++ path; else Blueprint plus data path",
            "source": "macOS requirements doc; version deltas (This Mac)"}
        rec["open_questions"].append("Does a trivial C++ module build with the installed Xcode?")
    else:
        d["language"] = {
            "choice": "Blueprint logic kept in few small functions, data assets for tuning; "
                      "Epic's MCP Blueprint toolset or BlueprintGraphEditor for graphs",
            "why": "no working C++ toolchain",
            "condition": "a working Xcode moves systems to C++",
            "source": "Deiter k0tgmrBuIJc [00:56:13]"}

    growth = n_ab >= 3 or spec.get("statuses") or mp
    if cpp is False:
        d["gas"] = {"choice": "no GAS; ability components with timers and delegates",
                    "why": "GAS needs C++ for the ASC, attribute sets and initialization",
                    "condition": "C++ available and a growing ability roster -> GAS",
                    "source": "GAS doc; tranek 4.1.2"}
    elif growth or spec.get("cooldown_ui"):
        why = []
        if spec.get("cooldown_ui"):
            why.append("cooldown UI and duration come from GE cooldown tags")
        if spec.get("statuses"):
            why.append("statuses and stacking are GE and tag work")
        if mp:
            why.append("prediction and replication are built in")
        if n_ab >= 3:
            why.append("%d abilities that will interact and grow" % n_ab)
        why.append("tag blocking (no dash while stunned or dead) and damage through GEs")
        d["gas"] = {"choice": "GAS", "why": "; ".join(why),
                    "condition": "two isolated mechanics with no statuses, no cooldown UI, "
                                 "single player and no growth -> plain components are simpler",
                    "source": "Shao 8bi0rnXnRj4 [00:01:11], [00:47:35]; GAS doc"}
    else:
        d["gas"] = {"choice": "plain components (timer + delegate)",
                    "why": "few isolated mechanics, no statuses, no cooldown UI",
                    "condition": "more abilities, statuses, cooldown UI or multiplayer -> GAS",
                    "source": "gameplay digest, Disagreements (GAS or not)"}

    if d["gas"]["choice"] == "GAS":
        if mp and spec.get("respawn_keeps_attributes"):
            d["asc"] = {"choice": "player ASC on the PlayerState (raise its NetUpdateFrequency, "
                                  "adaptive update frequency); AI ASC on the pawn; "
                                  "InitAbilityActorInfo in PossessedBy (server) and "
                                  "OnRep_PlayerState (owning client)",
                        "why": "attributes and effects survive respawn",
                        "condition": "no persistence across respawn -> ASC on the pawn",
                        "source": "tranek 4.1"}
        else:
            d["asc"] = {"choice": "ASC on the pawn (player and AI); InitAbilityActorInfo in "
                                  "PossessedBy (server) and in the PlayerController's "
                                  "AcknowledgePossession (owning client); AI needs the server "
                                  "side only",
                        "why": "simple, uses pawn relevancy; nothing must survive respawn; a "
                               "missing client init shows as \"Can't activate LocalOnly or "
                               "LocalPredicted ability ... when not local\"",
                        "condition": "multiplayer with persistent attributes -> PlayerState",
                        "source": "tranek 4.1; Ratti Q&A item 5"}
        d["replication_mode"] = {
            "choice": "Mixed for player ASCs, Minimal for AI" if mp else
                      "Mixed for player, Minimal for AI (Full is acceptable in pure single "
                      "player; setting Mixed early keeps multiplayer open)",
            "why": "set as early as possible", "condition": "n/a",
            "source": "Ratti via tranek 7.3; tranek 4.1.1"}
        d["prediction"] = {"choice": "predict activation and movement; never predict damage "
                                     "or death; cooldown GEs penalize high latency",
                           "why": "Epic does not predict damage", "condition":
                           "competitive fire rates -> custom cooldown bookkeeping",
                           "source": "tranek 4.10; Ratti Q&A item 7"}

    npc = int(spec.get("npc_count", 0))
    if npc >= 1000 and spec.get("npc_movable", True):
        ai = ("Mass entities with StateTree traits", "thousands of movable agents",
              "hero-level NPCs with rich animation and GAS stay actors")
    elif spec.get("existing_bt_library") and spec.get("team_knows_bt"):
        ai = ("perception StateTree choosing core states, existing Behavior Trees as leaves, "
              "reaction StateTrees as data",
              "a master Behavior Tree becomes a priority juggling game at scale",
              "no Behavior Tree library -> StateTree with C++ tasks")
    elif spec.get("team_knows_bt"):
        ai = ("Behavior Tree + Blackboard (+ EQS), tasks delegating to abilities with timeouts",
              "event-driven, designers fluent in it; equally valid for patrol-chase-attack",
              "explicit states, events, bindings or non-AI logic -> StateTree")
    else:
        ai = ("StateTree (AI component schema) with C++ tasks, explicit success and failure "
              "transitions, perception as events",
              "explicit states and events; data by binding; scheduled ticks (5.6)",
              "team fluent in Behavior Trees with a library -> BT or hybrid")
    if npc:
        d["ai"] = {"choice": ai[0], "why": ai[1], "condition": ai[2],
                   "source": "Mononen YEmq4kcblj4; Bruno XKQfMZOXFv0 [00:24:09], [00:26:54]; "
                             "AI docs"}
    si = int(spec.get("stationary_interactables", 0))
    if si >= 100:
        d["scale"] = {"choice": "Instanced Actors for the stationary interactables "
                                "(Experimental), actors near, ISM far",
                      "why": "about 5x faster streaming of 1000 instances on the speaker's "
                             "machine", "condition": "few unique complex objects -> actors",
                      "source": "Shao KBn62trwkLw [00:36:19]"}

    if d["gas"]["choice"] == "GAS" and n_ab > 4:
        inp = "Enhanced Input with input tags: Input Action -> input tag -> ability (Lyra)"
    else:
        inp = ("Enhanced Input: one Input Action per verb, one mapping context per state, "
               "actions bound in C++ to TryActivateAbilitiesByTag")
    d["input"] = {"choice": inp, "why": "the pawn class holds no ability logic; contexts "
                  "are mutually exclusive per state",
                  "condition": "many abilities remapped by equipment -> input tags",
                  "source": "Noland, Lyra [00:34:33]; framework doc (Input Mapping Contexts)"}
    d["ui"] = {"choice": ("Common UI activatable stacks + C++ widgets with BindWidget"
                          if spec.get("gamepad_menus") else
                          "C++ UUserWidget with BindWidget, updated from attribute or "
                          "component delegates"),
               "why": "no property bindings; Global Invalidation needs event-driven widgets",
               "condition": "gamepad navigation and menu stacks -> Common UI (Production "
                            "Ready in 5.8)", "source": "Albert VxX1aah6TZM [00:24:09]; "
                                                        "5.8 release notes"}
    d["communication"] = {
        "choice": "one-way delegates: actors broadcast (OnDied, OnHealthChanged) and listeners "
                  "(controller, spawner, HUD, score) bind; no cast to the listener's Blueprint",
        "why": "the broadcaster never loads or knows its listeners; new listeners need no edit",
        "condition": "a specialized call on an always-loaded C++ type -> direct call",
        "source": "Forsythe VMZftEVDuCE [00:19:25]; BP docs (Communication); Arnbjornsson "
                  "[00:28:01]"}
    d["movement"] = {"choice": "CharacterMovementComponent, tuned to the feel targets",
                     "why": "Mover is still Experimental in 5.8; default CMC values feel "
                            "like a tutorial project",
                     "condition": "physics-driven movement research -> Mover or ChaosMover",
                     "source": "Forsythe IaU2Hue-ApI [00:23:39]; 5.8 release notes (Mover)"}
    d["save"] = {"choice": "AsyncSaveGameToSlot; SaveGame properties + own version header",
                 "why": "sync saves hitch and risk certification; versions are not in the "
                        "payload", "condition": "menu-time small saves may be synchronous",
                 "source": "framework doc; Shao KBn62trwkLw [00:12:58]"}
    rec["data"] = [place_data(x) for x in spec.get("data", [])]
    return rec


def decision_markdown(rec):
    """Render a decision record as a short Markdown table for the report."""
    lines = ["| Decision | Choice | Why | Flips when | Source |", "|---|---|---|---|---|"]
    for k, v in rec["decisions"].items():
        lines.append("| %s | %s | %s | %s | %s |" % (k, v["choice"], v["why"], v["condition"],
                                                      v["source"]))
    if rec.get("data"):
        lines += ["", "| Data | Home | Replication | Why |", "|---|---|---|---|"]
        for x in rec["data"]:
            home = x["home"] + (" + " + ", ".join(x["also"]) if x["also"] else "")
            lines.append("| %s | %s | %s | %s |" % (x["name"], home, x["replication"], x["why"]))
    if rec.get("open_questions"):
        lines += ["", "Open questions:"] + ["- " + q for q in rec["open_questions"]]
    return "\n".join(lines)


U4_SPEC = {
    "multiplayer": False, "abilities": 3, "statuses": False, "cooldown_ui": True,
    "cpp": None, "npc_count": 1, "team_knows_bt": False,
    "data": [
        {"name": "Health, MaxHealth", "per_player": True, "visible_to": "owner"},
        {"name": "Dash cooldown", "per_player": True, "visible_to": "owner"},
        {"name": "Enemy target and state", "world_object": True},
        {"name": "Input mapping context", "ui": False, "per_player": True,
         "visible_to": "owner", "survives_respawn": True},
        {"name": "HUD health bar", "ui": True},
    ],
}

# =============================================================================================
# 2. OFFLINE: files, backups, ini and tags
# =============================================================================================


def find_project_root(path):
    """Walk up from path to the folder holding a .uproject; None if none."""
    d = os.path.abspath(path if os.path.isdir(path) else os.path.dirname(path))
    while True:
        try:
            if any(f.endswith(".uproject") for f in os.listdir(d)):
                return d
        except OSError:
            return None
        parent = os.path.dirname(d)
        if parent == d:
            return None
        d = parent


def backup_file(path, project_root=None):
    """Copy an existing file before it is overwritten (never delete, project rule).

    Goes to <project>/Saved/AgentBackups/<stamp>/<relative path> when a .uproject is found,
    else to a sibling '.agent_backups' folder. Returns the backup path or None."""
    if not os.path.isfile(path):
        return None
    root = project_root or find_project_root(path)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    if root and os.path.abspath(path).startswith(os.path.abspath(root) + os.sep):
        rel = os.path.relpath(path, root)
        dest = os.path.join(root, "Saved", "AgentBackups", stamp, rel)
    else:
        dest = os.path.join(os.path.dirname(path), ".agent_backups", stamp,
                            os.path.basename(path))
    n = 1
    base = dest
    while os.path.exists(dest):
        dest = "%s.%d" % (base, n)
        n += 1
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    shutil.copy2(path, dest)
    return dest


def write_text(path, text, backup=True):
    """Write a text file, backing up a different existing version first."""
    old = None
    if os.path.isfile(path):
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            old = f.read()
        if old == text:
            return {"path": path, "changed": False, "backup": None}
    bk = backup_file(path) if (backup and old is not None) else None
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    tmp = path + ".agent-tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(text)
    os.replace(tmp, path)
    return {"path": path, "changed": True, "backup": bk}


_SECTION_RE = re.compile(r"^\s*\[(.+?)\]\s*$")


def ini_get(path_or_text, section, key):
    """Values of key in section of an Unreal ini: a list for +Key= arrays (in order, -Key
    lines remove), else the last scalar assignment (or None)."""
    text = path_or_text
    if os.path.isfile(str(path_or_text)):
        with open(path_or_text, "r", encoding="utf-8", errors="replace") as f:
            text = f.read()
    cur = None
    scalar = None
    arr = []
    is_arr = False
    for line in str(text).splitlines():
        m = _SECTION_RE.match(line)
        if m:
            cur = m.group(1).strip()
            continue
        if cur != section or "=" not in line:
            continue
        k, v = line.split("=", 1)
        k = k.strip()
        v = v.strip()
        if k == "+" + key:
            is_arr = True
            arr.append(v)
        elif k == "-" + key:
            is_arr = True
            arr = [x for x in arr if x != v]
        elif k == key:
            scalar = v
    return arr if is_arr else scalar


def ini_set_text(text, section, key, value, array=False):
    """Return new ini text with key=value set in section (created if missing).

    array=True appends '+Key=value' unless that exact line exists. Scalars replace the
    last 'Key=' line in the section. Everything else is preserved."""
    lines = text.splitlines() if text else []
    start = end = None
    for i, line in enumerate(lines):
        m = _SECTION_RE.match(line)
        if m:
            if start is not None and end is None:
                end = i
            if m.group(1).strip() == section:
                start, end = i, None
    new_line = ("+%s=%s" % (key, value)) if array else ("%s=%s" % (key, value))
    if start is None:
        if lines and lines[-1].strip():
            lines.append("")
        lines += ["[%s]" % section, new_line]
        return "\n".join(lines) + "\n"
    if end is None:
        end = len(lines)
    body = lines[start + 1:end]
    if array:
        if any(b.strip() == new_line for b in body):
            return "\n".join(lines) + "\n"
        insert_at = end
        while insert_at > start + 1 and not lines[insert_at - 1].strip():
            insert_at -= 1
        lines.insert(insert_at, new_line)
        return "\n".join(lines) + "\n"
    idx = None
    for i in range(start + 1, end):
        if "=" in lines[i] and lines[i].split("=", 1)[0].strip() == key:
            idx = i
    if idx is not None:
        lines[idx] = new_line
    else:
        insert_at = end
        while insert_at > start + 1 and not lines[insert_at - 1].strip():
            insert_at -= 1
        lines.insert(insert_at, new_line)
    return "\n".join(lines) + "\n"


def ini_set(path, section, key, value, array=False):
    """Set a key in an ini file on disk (backup first). Returns write_text's report."""
    text = ""
    if os.path.isfile(path):
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            text = f.read()
    return write_text(path, ini_set_text(text, section, key, value, array=array))


TAG_SECTION = "/Script/GameplayTags.GameplayTagsSettings"  # [verify] by one GUI edit


def gameplay_tag_line(tag, comment=""):
    if not re.match(r"^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)*$", tag):
        raise ValueError("bad gameplay tag %r" % tag)
    return '(Tag="%s",DevComment="%s")' % (tag, comment.replace('"', "'"))


def add_gameplay_tags_ini(path, tags):
    """Append tags to Config/DefaultGameplayTags.ini (restart or refresh the tag manager)."""
    text = ""
    if os.path.isfile(path):
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            text = f.read()
    for t in tags:
        tag, comment = (t if isinstance(t, (list, tuple)) else (t, ""))
        text = ini_set_text(text, TAG_SECTION, "GameplayTagList", gameplay_tag_line(tag, comment),
                            array=True)
    return write_text(path, text)


def ini_tags(path_or_text):
    vals = ini_get(path_or_text, TAG_SECTION, "GameplayTagList") or []
    out = []
    for v in vals:
        m = re.search(r'Tag="([^"]+)"', v)
        if m:
            out.append(m.group(1))
    return out


def native_tags_in_source(source_dir):
    """Tags defined in C++ with UE_DEFINE_GAMEPLAY_TAG*."""
    found = []
    pat = re.compile(r'UE_DEFINE_GAMEPLAY_TAG(?:_COMMENT|_STATIC)?\s*\(\s*\w+\s*,\s*"([^"]+)"')
    for d, _dirs, files in os.walk(source_dir):
        for f in files:
            if f.endswith((".cpp", ".h")):
                with open(os.path.join(d, f), "r", encoding="utf-8", errors="replace") as fh:
                    found += pat.findall(fh.read())
    return sorted(set(found))


GAS_GLOBALS = "/Script/GameplayAbilities.AbilitySystemGlobals"
REQUIRED_PLUGINS = {
    "gas": ["GameplayAbilities"],
    "statetree": ["StateTree", "GameplayStateTree"],
    "tests": ["PythonAutomationTest"],
    "commonui": ["CommonUI"],
    "mcp": ["ModelContextProtocol", "AllToolsets"],
}


def asset_tag_cvar(path_or_text):
    """(name, value) of the GE asset-tag cvar under [ConsoleVariables] (any key starting with
    AbilitySystem.Fix, exact name [verify] by the probe), or None."""
    text = path_or_text
    if os.path.isfile(str(path_or_text)):
        with open(path_or_text, "r", encoding="utf-8", errors="replace") as f:
            text = f.read()
    cur, found = None, None
    for line in str(text).splitlines():
        m = _SECTION_RE.match(line)
        if m:
            cur = m.group(1).strip()
            continue
        if cur == "ConsoleVariables" and "=" in line:
            k, v = line.split("=", 1)
            if k.strip().startswith("AbilitySystem.Fix"):
                found = (k.strip(), v.strip())
    return found


def config_verdict(project_dir, needs=("gas", "statetree", "tests"), tags=()):
    """Check a project's config for what the gameplay work needs. Lines 'error:', 'warn:',
    'info:'. needs: subset of REQUIRED_PLUGINS keys."""
    out = []
    ups = [f for f in os.listdir(project_dir) if f.endswith(".uproject")]
    if not ups:
        return ["error: no .uproject in %s" % project_dir]
    with open(os.path.join(project_dir, ups[0]), "r", encoding="utf-8") as f:
        up = json.load(f)
    enabled = {p.get("Name") for p in up.get("Plugins", []) if p.get("Enabled")}
    for n in needs:
        for p in REQUIRED_PLUGINS.get(n, []):
            if p not in enabled:
                sev = "warn" if n in ("mcp",) else "error"
                out.append("%s: plugin %s not enabled in %s (needed for %s) [verify id]"
                           % (sev, p, ups[0], n))
    cfg = os.path.join(project_dir, "Config")
    game_ini = os.path.join(cfg, "DefaultGame.ini")
    if "gas" in needs:
        v = ini_get(game_ini, GAS_GLOBALS, "bUseDebugTargetFromHud") if os.path.isfile(game_ini) \
            else None
        if str(v).lower() != "true":
            out.append("warn: DefaultGame.ini [%s] bUseDebugTargetFromHud=True missing "
                       "(showdebug abilitysystem follows the selected target, tranek 6.1)"
                       % GAS_GLOBALS)
        out.append("info: showdebug abilitysystem needs a HUD class on the GameMode (tranek 6.1)")
        eng_ini = os.path.join(cfg, "DefaultEngine.ini")
        fix = asset_tag_cvar(eng_ini) if os.path.isfile(eng_ini) else None
        if fix is None:
            out.append("warn: DefaultEngine.ini [ConsoleVariables] has no AbilitySystem.Fix... "
                       "cvar set to 0: GE tag queries then read granted (target) tags, not asset "
                       "tags; Epic and Fortnite set it to 0 (Shao 8bi0rnXnRj4 [00:21:43]). Take "
                       "the exact name from the probe (P0) [verify]")
        elif fix[1] != "0":
            out.append("warn: %s=%s: set it to 0 so tag queries read GE asset tags (Shao "
                       "[00:22:17])" % fix)
    if "statetree" in needs:
        eng_ini = os.path.join(cfg, "DefaultEngine.ini")
        v = ini_get(eng_ini, "ConsoleVariables", "StateTree.Component.ScheduledTickEnabled") \
            if os.path.isfile(eng_ini) else None
        if v is not None and str(v).strip().lower() in ("0", "false"):
            out.append("warn: StateTree.Component.ScheduledTickEnabled=0: idle trees cannot sleep "
                       "(5.6 scheduled tick)")
    if tags:
        have = set()
        tag_ini = os.path.join(cfg, "DefaultGameplayTags.ini")
        if os.path.isfile(tag_ini):
            have |= set(ini_tags(tag_ini))
        src = os.path.join(project_dir, "Source")
        if os.path.isdir(src):
            have |= set(native_tags_in_source(src))
        for t in tags:
            if t not in have:
                out.append("error: gameplay tag %s neither in DefaultGameplayTags.ini nor "
                           "native in Source/" % t)
    if "commonui" in needs:
        eng = os.path.join(cfg, "DefaultEngine.ini")
        v = ini_get(eng, "/Script/Engine.Engine", "GameViewportClientClassName") \
            if os.path.isfile(eng) else None
        if not v or "CommonGameViewportClient" not in v:
            out.append("error: Common UI needs GameViewportClientClassName="
                       "/Script/CommonUI.CommonGameViewportClient (or a subclass) [verify key]")
    return out

# =============================================================================================
# 3. OFFLINE: Enhanced Input plan
# =============================================================================================

AXIS2D_KEYS = {"Mouse2D", "Gamepad_Left2D", "Gamepad_Right2D"}
AXIS1D_KEYS = {"MouseX", "MouseY", "MouseWheelAxis", "Gamepad_LeftX", "Gamepad_LeftY",
               "Gamepad_RightX", "Gamepad_RightY", "Gamepad_LeftTriggerAxis",
               "Gamepad_RightTriggerAxis"}
GAMEPAD_PREFIX = "Gamepad_"
DEPRECATED_TRIGGERS = {"Combo": "Combo trigger deprecated in 5.8 (unreliable, can corrupt "
                                "mapping contexts)"}


def _m(key, modifiers=(), triggers=()):
    return {"key": key, "modifiers": list(modifiers), "triggers": list(triggers)}


def input_plan(preset="third_person_action"):
    """Enhanced Input plan (data, not assets). WASD on one Axis2D action with Swizzle and
    Negate modifiers (framework doc, Directional Input). Look: Mouse2D with Y negated as in
    the UE5 Third Person template [added, verify]."""
    if preset != "third_person_action":
        raise ValueError("unknown preset %r" % preset)
    actions = [
        {"name": "IA_Move", "value_type": "Axis2D"},
        {"name": "IA_Look", "value_type": "Axis2D"},
        {"name": "IA_Jump", "value_type": "Boolean"},
        {"name": "IA_Dash", "value_type": "Boolean"},
        {"name": "IA_Attack", "value_type": "Boolean"},
    ]
    mappings = [
        ("IA_Move", _m("W", ["SwizzleAxis:YXZ"])),
        ("IA_Move", _m("S", ["Negate", "SwizzleAxis:YXZ"])),
        ("IA_Move", _m("A", ["Negate"])),
        ("IA_Move", _m("D")),
        ("IA_Move", _m("Gamepad_Left2D", ["DeadZone"])),
        ("IA_Look", _m("Mouse2D", ["Negate:Y"])),
        ("IA_Look", _m("Gamepad_Right2D", ["DeadZone"])),
        ("IA_Jump", _m("SpaceBar")),
        ("IA_Jump", _m("Gamepad_FaceButton_Bottom")),
        ("IA_Dash", _m("LeftShift", triggers=["Pressed"])),
        ("IA_Dash", _m("Gamepad_FaceButton_Right", triggers=["Pressed"])),
        ("IA_Attack", _m("LeftMouseButton", triggers=["Pressed"])),
        ("IA_Attack", _m("Gamepad_RightTrigger", triggers=["Pressed"])),
    ]
    ctx = {"name": "IMC_Default", "priority": 0,
           "mappings": [dict(action=a, **m) for a, m in mappings]}
    return {"actions": actions, "contexts": [ctx],
            "notes": ["Add the context at possession through "
                      "UEnhancedInputLocalPlayerSubsystem::AddMappingContext (C++ hero)",
                      "One context per movement state (walk, vehicle), mutually exclusive"]}


def input_verdict(plan):
    """Checks: WASD modifiers, deprecated triggers, key-type mismatches, duplicate keys in a
    context, gamepad parity for Boolean actions, naming prefixes, PMI use."""
    out = []
    types = {a["name"]: a.get("value_type", "Boolean") for a in plan.get("actions", [])}
    for a in plan.get("actions", []):
        if not a["name"].startswith("IA_"):
            out.append("warn: input action %s should start with IA_ (Epic naming)" % a["name"])
    if plan.get("pmi") or plan.get("player_mappable_input_config"):
        out.append("error: UPlayerMappableInputConfig is deprecated (5.4): use Player "
                   "Mappable Key Settings and UEnhancedInputUserSettings")
    expected_wasd = {"W": {"SwizzleAxis:YXZ"}, "S": {"Negate", "SwizzleAxis:YXZ"},
                     "A": {"Negate"}, "D": set()}
    for ctx in plan.get("contexts", []):
        if not ctx["name"].startswith("IMC_"):
            out.append("warn: mapping context %s should start with IMC_" % ctx["name"])
        seen = {}
        gamepad = {}
        for mp in ctx.get("mappings", []):
            act, key = mp["action"], mp["key"]
            vt = types.get(act)
            if vt is None:
                out.append("error: %s maps %s to unknown action %s" % (ctx["name"], key, act))
                continue
            for t in mp.get("triggers", []):
                base = t.split(":")[0]
                if base in DEPRECATED_TRIGGERS:
                    out.append("error: %s %s: %s" % (act, key, DEPRECATED_TRIGGERS[base]))
            if vt == "Axis2D" and key in expected_wasd:
                got = {m for m in mp.get("modifiers", []) if m.split(":")[0] in
                       ("Negate", "SwizzleAxis")}
                got = {("Negate" if g.startswith("Negate") else g) for g in got}
                if got != expected_wasd[key]:
                    out.append("error: %s key %s modifiers %s, expected %s (Swizzle YXZ on W "
                               "and S, Negate on A and S)" % (act, key, sorted(got),
                                                              sorted(expected_wasd[key])))
            if vt == "Boolean" and (key in AXIS2D_KEYS or key in AXIS1D_KEYS):
                out.append("warn: %s is Boolean but %s is an axis key" % (act, key))
            if vt == "Axis2D" and key in AXIS1D_KEYS:
                out.append("info: %s gets a 1D key %s: needs a swizzle for the Y axis" % (act, key))
            sig = (key, tuple(sorted(mp.get("triggers", []))), tuple(sorted(mp.get("modifiers", []))))
            if key in seen and seen[key][0] != act and seen[key][1] == sig[1]:
                out.append("warn: %s maps %s to both %s and %s with the same triggers "
                           "(input collision; use contexts or chords)" % (ctx["name"], key,
                                                                          seen[key][0], act))
            seen.setdefault(key, (act, sig[1]))
            gamepad.setdefault(act, False)
            if key.startswith(GAMEPAD_PREFIX):
                gamepad[act] = True
        for act, has in gamepad.items():
            if types.get(act) == "Boolean" and not has:
                out.append("warn: %s has no gamepad key in %s" % (act, ctx["name"]))
    out += _context_state_checks(plan)
    return out


def _context_state_checks(plan):
    """Mutually exclusive mapping contexts per gameplay state (framework doc, Input Mapping
    Contexts): plan['states'] = {state: [context names live in that state]}. Two live
    contexts mapping one key to different actions at the same priority collide."""
    out = []
    ctxs = {c["name"]: c for c in plan.get("contexts", [])}
    states = plan.get("states")
    if not states:
        if len(ctxs) > 1:
            out.append("info: %d mapping contexts but no plan['states']: list which contexts are "
                       "live per gameplay state (walk, vehicle, menu) and keep them mutually "
                       "exclusive (framework doc)" % len(ctxs))
        return out
    listed = set()
    for st, names in states.items():
        keymap = {}
        for n in names:
            listed.add(n)
            c = ctxs.get(n)
            if c is None:
                out.append("error: state %s lists unknown context %s" % (st, n))
                continue
            for mp in c.get("mappings", []):
                prev = keymap.get(mp["key"])
                if prev and prev[0] != n and prev[1] != mp["action"] and \
                        prev[2] == c.get("priority", 0):
                    out.append("warn: state %s: %s maps %s to %s and %s maps it to %s at the same "
                               "priority: make the contexts mutually exclusive for this state or "
                               "raise one priority (framework doc)" % (st, prev[0], mp["key"],
                                                                       prev[1], n, mp["action"]))
                keymap.setdefault(mp["key"], (n, mp["action"], c.get("priority", 0)))
    for n in ctxs:
        if n not in listed:
            out.append("warn: context %s is live in no gameplay state" % n)
    return out

# =============================================================================================
# 4. OFFLINE: C++ scaffold, Build.cs, build command, Xcode gate
# =============================================================================================


def cpp_scaffold(module, features=cpp_templates.FEATURES, api=None):
    """{relative path under Source/<module>/: text}. Templates: ue_gameplay_cpp.py.
    NOT YET COMPILED (see that module's header)."""
    return cpp_templates.scaffold(module, features=features, api=api)


def write_scaffold(files, module_dir, overwrite=False):
    """Write scaffold files under Source/<module>/. Existing different files are kept unless
    overwrite=True, in which case they are backed up first. Returns a report per file."""
    rep = []
    for rel, text in sorted(files.items()):
        path = os.path.join(module_dir, rel)
        if os.path.isfile(path) and not overwrite:
            with open(path, "r", encoding="utf-8", errors="replace") as f:
                same = f.read() == text
            rep.append({"path": path, "changed": False, "kept_existing": not same})
            continue
        rep.append(write_text(path, text))
    return rep


def patch_build_cs(text, modules):
    """Add modules to PublicDependencyModuleNames in a <Module>.Build.cs text.
    Returns (new_text, added). Adds an AddRange line if none exists."""
    added = []
    m = re.search(r"PublicDependencyModuleNames\s*\.\s*AddRange\s*\(\s*new\s+string\s*\[\s*\]"
                  r"\s*\{([^}]*)\}", text)
    if m:
        existing = re.findall(r'"([^"]+)"', m.group(1))
        missing = [x for x in modules if x not in existing]
        if not missing:
            return text, []
        inner = m.group(1).rstrip()
        sep = ", " if inner.strip() else " "
        new_inner = inner + sep + ", ".join('"%s"' % x for x in missing) + " "
        added = missing
        return text[:m.start(1)] + new_inner + text[m.end(1):], added
    m2 = re.search(r"(PCHUsage\s*=[^;]*;)", text)
    line = '\n\t\tPublicDependencyModuleNames.AddRange(new string[] { %s });' % ", ".join(
        '"%s"' % x for x in modules)
    if m2:
        return text[:m2.end()] + line + text[m2.end():], list(modules)
    m3 = re.search(r"(public\s+\w+\s*\(\s*ReadOnlyTargetRules\s+\w+\s*\)\s*:\s*base\s*\(\s*\w+\s*\)"
                   r"\s*\{)", text)
    if m3:
        return text[:m3.end()] + line + text[m3.end():], list(modules)
    raise ValueError("could not find where to add module dependencies in Build.cs")


def build_command(engine_root, uproject, target=None, config="Development", platform="Mac"):
    """UBT editor build command for a code project on macOS [verify flags on 5.8].
    Build with the editor CLOSED when classes or reflected members change."""
    name = os.path.splitext(os.path.basename(uproject))[0]
    script = os.path.join(engine_root, "Engine", "Build", "BatchFiles", platform, "Build.sh")
    return [script, target or (name + "Editor"), platform, config,
            "-Project=%s" % os.path.abspath(uproject), "-WaitMutex", "-NoHotReloadFromIDE"]


def xcode_gate(version_text):
    """Classify the Xcode version for C++ work (Epic 5.8 macOS page). Uses
    ue_env.xcode_status when importable."""
    try:
        sys.path.insert(0, os.path.join(_HERE, "..", "..", "scenario-unreal-expert", "scripts"))
        import ue_env
        v = ue_env.parse_version(version_text)
        status = ue_env.xcode_status(v)
    except Exception:
        m = re.search(r"(\d+)\.(\d+)(?:\.(\d+))?", str(version_text or ""))
        if not m:
            status = "missing"
        else:
            v = tuple(int(x) for x in m.groups() if x is not None)
            if v < (26, 0):
                status = "too_old"
            elif v[:2] == (26, 4):
                status = "incompatible"
            elif v >= (26, 4):
                status = "unlisted"
            elif v[:3] == (26, 1, 1):
                status = "recommended"
            else:
                status = "supported"
    advice = {
        "missing": "no C++: Blueprint plus data path; packaging a Mac .app also needs Xcode",
        "too_old": "install Xcode 26.1.1 side by side and select it with xcode-select",
        "recommended": "C++ path",
        "supported": "C++ path",
        "incompatible": "Epic: Xcode 26.4 is not compatible; select 26.1.1",
        "unlisted": "not named by Epic: run the probe build (P3) before promising C++",
    }[status]
    return {"status": status, "advice": advice,
            "c++_ok": status in ("recommended", "supported"),
            "needs_probe": status == "unlisted"}

# =============================================================================================
# 5. OFFLINE: C++ lint (the experts' rules as static checks)
# =============================================================================================

_FUNC_RE = re.compile(r"^[ \t]*(?:[\w:<>\*&,\s]+?\s+)?(\w+)::(~?\w+)\s*\(([^;{}]*)\)\s*"
                      r"(?:const\s*)?(?:override\s*)?(?::[^{;]*)?\{", re.M)


def _functions(text):
    """Split C++ text into (class, name, body, start_line) by brace matching."""
    out = []
    for m in _FUNC_RE.finditer(text):
        i = m.end() - 1
        depth = 0
        j = i
        while j < len(text):
            c = text[j]
            if c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    break
            j += 1
        out.append((m.group(1), m.group(2), text[i:j + 1], text.count("\n", 0, m.start()) + 1))
    return out


def _strip_comments(text):
    text = re.sub(r"/\*.*?\*/", lambda m: "\n" * m.group(0).count("\n"), text, flags=re.S)
    return re.sub(r"//[^\n]*", "", text)


LINT_RULES = {
    "HARD_ASSET_PATH": ("error", "ConstructorHelpers finders in gameplay classes load at class "
                        "registration and stay resident; use TSubclassOf / soft pointers set on "
                        "a Blueprint child", "Forsythe VMZftEVDuCE [00:29:33]"),
    "GAME_PATH_STRING": ("warn", "'/Game/' path in C++: C++ must not know Blueprint assets",
                         "Forsythe VMZftEVDuCE [00:24:10]"),
    "CALL_BY_NAME": ("warn", "calling functions by name (FindFunction/ProcessEvent) is 'a "
                     "pretty questionable thing to do': declare the member in C++",
                     "Forsythe VMZftEVDuCE [00:26:19]"),
    "MULTICAST_STATE": ("warn", "a NetMulticast implementation assigns members: persistent "
                        "state must be a replicated property with RepNotify",
                        "Forsythe JOJP0CvpB8w [00:10:50]"),
    "RELIABLE_IN_TICK": ("error", "Reliable RPC called from Tick: queue overflow; use "
                         "Unreliable or throttle", "networking doc (Tips)"),
    "RELIABLE_ON_INPUT": ("warn", "Reliable RPC bound to raw input can overflow the reliable "
                          "queue when players mash: rate-limit", "networking doc (Tips)"),
    "ONREP_NOT_CALLED": ("warn", "C++ RepNotify does not run on the server: call it after the "
                         "server-side set if the server needs the same logic",
                         "Forsythe JOJP0CvpB8w [00:14:48]"),
    "REPLICATED_NO_DOREPLIFETIME": ("info", "Replicated property without DOREPLIFETIME: "
                                    "auto-registered since 5.6, but conditions need the macro",
                                    "5.6 release notes (Networking)"),
    "DEBUG_IN_TICK": ("warn", "Print String or debug draw in Tick: 88.8 to 272.5 us per Print "
                      "String in Development", "Arnbjornsson S2olUc9zcB8 slides 00:20:10"),
    "SCAN_IN_TICK": ("warn", "GetAllActorsWithTag / WithInterface scan every actor: not per "
                     "frame", "Arnbjornsson S2olUc9zcB8 [00:38:56]"),
    "CTOR_GAMEPLAY": ("warn", "gameplay call in a constructor: constructors build the CDO at "
                      "module load, no world exists", "Forsythe IaU2Hue-ApI [00:04:46]"),
    "MONTAGE_PLAY_IN_ABILITY": ("warn", "Montage_Play in an ability: use PlayMontageAndWait "
                                "(replicates, ends with the ability)", "tranek 9.3"),
    "ABILITY_NEVER_ENDS": ("error", "ActivateAbility without EndAbility in the class: it can "
                           "never re-trigger", "Shao 8bi0rnXnRj4 [00:13:02]"),
    "NONINSTANCED": ("error", "NonInstanced abilities are deprecated (5.5)", "5.5 release notes"),
    "DEPRECATED_INPUT": ("error", "deprecated input API (PMI 5.4, Combo trigger 5.8)",
                         "5.4 and 5.8 release notes"),
    "SYNC_SAVE": ("warn", "SaveGameToSlot is synchronous: AsyncSaveGameToSlot during play",
                  "framework doc (Asynchronous Saving)"),
    "DEPRECATED_58": ("error", "removed or replaced in 5.8 (EGenericAICheck, "
                      "STATETREE_POD_INSTANCEDATA, FPostConstructInitializeProperties)",
                      "5.8 release notes; version deltas"),
    "DISPATCH_POSTLOGIN": ("warn", "DispatchPostLogin moved to OnPostLogin (5.6)",
                           "5.6 release notes"),
    "ASC_CLIENT_INIT_MISSING": ("error", "InitAbilityActorInfo runs in PossessedBy (server) but "
                                "never on the owning client: add it in the PlayerController's "
                                "AcknowledgePossession (ASC on the pawn) or in OnRep_PlayerState "
                                "(ASC on the PlayerState); symptom: \"Can't activate LocalOnly "
                                "or LocalPredicted ability ... when not local\"",
                                "tranek 4.1.2, 9.1"),
    "WIDGET_TICK": ("warn", "UUserWidget NativeTick: under Global Invalidation widget Tick is "
                    "called by Paint, so logic that expects every frame freezes; update from "
                    "events", "Albert VxX1aah6TZM [00:10:09]"),
    "COLLAPSED_TOGGLE": ("warn", "Collapsed set in a handler that runs often: Collapsed "
                         "invalidates layout, Hidden only repaints under Global Invalidation",
                         "Albert VxX1aah6TZM [00:12:53]"),
    "BEGINPLAY_REPEAT": ("warn", "BeginPlay can run more than once under World Partition "
                         "streaming: a non-unique AddDynamic, SpawnActor, GiveAbility or effect "
                         "application here repeats; guard it or use a one-time hook",
                         "Shao KBn62trwkLw [00:06:55], [00:07:29]"),
}


def _issue(code, path, line, detail=""):
    sev, msg, src = LINT_RULES[code]
    return {"severity": sev, "code": code, "file": path, "line": line,
            "message": msg + ((" (" + detail + ")") if detail else ""), "source": src}


def rpc_declarations(text):
    """{'multicast': names, 'reliable': names} declared with UFUNCTION specifiers."""
    text = _strip_comments(text)
    multicast = set(re.findall(r"UFUNCTION\s*\([^)]*NetMulticast[^)]*\)\s*[\w\s\*&<>:]*?\b(\w+)\s*\(",
                               text))
    reliable = set(re.findall(r"UFUNCTION\s*\([^)]*\b(?:Server|Client|NetMulticast)\b[^)]*\bReliable"
                              r"\b[^)]*\)\s*[\w\s\*&<>:]*?\b(\w+)\s*\(", text))
    reliable |= set(re.findall(r"UFUNCTION\s*\([^)]*\bReliable\b[^)]*\b(?:Server|Client|NetMulticast)"
                               r"\b[^)]*\)\s*[\w\s\*&<>:]*?\b(\w+)\s*\(", text))
    return {"multicast": multicast, "reliable": reliable}


def cpp_lint_text(text, path="<text>", decls=None):
    """Lint one C++ file's text. decls: rpc_declarations() gathered from the headers (cpp_lint
    passes them); without it only this file's declarations are known. Returns issue dicts."""
    issues = []
    raw = text
    text = _strip_comments(text)
    lines = text.splitlines()
    editor_file = "/Editor/" in path.replace("\\", "/") or path.endswith("Editor.cpp")

    def line_of(pos):
        return text.count("\n", 0, pos) + 1

    if not editor_file:
        for m in re.finditer(r"ConstructorHelpers\s*::\s*F(?:Object|Class)Finder", text):
            issues.append(_issue("HARD_ASSET_PATH", path, line_of(m.start())))
    for m in re.finditer(r'"/Game/[^"]*"', text):
        issues.append(_issue("GAME_PATH_STRING", path, line_of(m.start()), m.group(0)))
    for m in re.finditer(r"\b(FindFunction(?:Checked)?|ProcessEvent)\s*\(", text):
        issues.append(_issue("CALL_BY_NAME", path, line_of(m.start()), m.group(1)))
    for m in re.finditer(r"\b(UPlayerMappableInputConfig|UInputTriggerCombo)\b", text):
        issues.append(_issue("DEPRECATED_INPUT", path, line_of(m.start()), m.group(1)))
    for m in re.finditer(r"EGameplayAbilityInstancingPolicy\s*::\s*NonInstanced", text):
        issues.append(_issue("NONINSTANCED", path, line_of(m.start())))
    for m in re.finditer(r"\b(EGenericAICheck|STATETREE_POD_INSTANCEDATA|"
                         r"FPostConstructInitializeProperties)\b", text):
        issues.append(_issue("DEPRECATED_58", path, line_of(m.start()), m.group(1)))
    for m in re.finditer(r"\bDispatchPostLogin\b", text):
        issues.append(_issue("DISPATCH_POSTLOGIN", path, line_of(m.start())))
    for m in re.finditer(r"\bSaveGameToSlot\s*\(", text):
        issues.append(_issue("SYNC_SAVE", path, line_of(m.start())))

    own = rpc_declarations(text)
    multicast = own["multicast"] | set((decls or {}).get("multicast", ()))
    reliable = own["reliable"] | set((decls or {}).get("reliable", ()))
    bound = set(re.findall(r"BindAction\s*\([^;]*?&\s*\w+::(\w+)", text))

    funcs = _functions(text)
    for cls, name, body, ln in funcs:
        if name.endswith("_Implementation") and name[:-len("_Implementation")] in multicast:
            if re.search(r"^\s*(?:this->)?[A-Za-z_]\w*\s*(?:\[[^\]]*\])?\s*=[^=]", body, re.M):
                issues.append(_issue("MULTICAST_STATE", path, ln, name))
        if name == "Tick" or name.endswith("Tick"):
            for r in reliable:
                if re.search(r"\b%s\s*\(" % re.escape(r), body):
                    issues.append(_issue("RELIABLE_IN_TICK", path, ln, r))
            if re.search(r"\b(PrintString|DrawDebug\w+|UE_VLOG\w*)\s*\(", body):
                issues.append(_issue("DEBUG_IN_TICK", path, ln))
            if re.search(r"\bGetAllActors(?:WithTag|WithInterface|OfClassWithTag)\s*\(", body):
                issues.append(_issue("SCAN_IN_TICK", path, ln))
        if name in bound:
            for r in reliable:
                if re.search(r"\b%s\s*\(" % re.escape(r), body):
                    issues.append(_issue("RELIABLE_ON_INPUT", path, ln, "%s calls %s" % (name, r)))
        if cls == name:  # constructor
            if re.search(r"\b(GetWorld\s*\(\s*\)\s*->|SpawnActor\w*\s*<|SpawnActor\s*\(|"
                         r"GetGameInstance\s*\(|UGameplayStatics\s*::\s*Get\w+)", body):
                issues.append(_issue("CTOR_GAMEPLAY", path, ln))
        if name == "NativeTick":
            issues.append(_issue("WIDGET_TICK", path, ln, cls))
        if re.match(r"(Handle|On|Set|Update|Refresh)", name) and \
                re.search(r"ESlateVisibility\s*::\s*Collapsed", body):
            issues.append(_issue("COLLAPSED_TOGGLE", path, ln, "%s::%s" % (cls, name)))
        if name == "BeginPlay":
            m = re.search(r"\b(AddDynamic|SpawnActor\w*|GiveAbility|ApplyGameplayEffect\w*)\s*[<(]",
                          body)
            if m:
                issues.append(_issue("BEGINPLAY_REPEAT", path, ln, "%s::BeginPlay calls %s"
                                     % (cls, m.group(1))))
    is_ability = re.search(r"public\s+U\w*GameplayAbility\b", text) or re.search(
        r"\bU\w+::ActivateAbility\s*\(", text) or re.search(r"\w+::ActivateAbility\s*\(", text)
    if is_ability:
        if re.search(r"\bMontage_Play\s*\(", text):
            issues.append(_issue("MONTAGE_PLAY_IN_ABILITY", path, 1))
        if path.endswith(".cpp") and re.search(r"::ActivateAbility\s*\(", text) and \
                not re.search(r"\bEndAbility\s*\(", text):
            issues.append(_issue("ABILITY_NEVER_ENDS", path, 1))
    del raw, lines
    return issues


def cpp_lint(paths):
    """Lint .h/.cpp files or folders. Cross-file checks: OnRep functions never called in the
    .cpp files (server-side call), Replicated properties without DOREPLIFETIME."""
    files = []
    for p in ([paths] if isinstance(paths, str) else paths):
        if os.path.isdir(p):
            for d, _dirs, fs in os.walk(p):
                files += [os.path.join(d, f) for f in fs if f.endswith((".h", ".cpp"))]
        elif p.endswith((".h", ".cpp")):
            files.append(p)
    issues = []
    texts = {}
    decls = {"multicast": set(), "reliable": set()}
    for f in sorted(files):
        with open(f, "r", encoding="utf-8", errors="replace") as fh:
            texts[f] = fh.read()
        d = rpc_declarations(texts[f])
        decls["multicast"] |= d["multicast"]
        decls["reliable"] |= d["reliable"]
    for f in sorted(files):
        issues += cpp_lint_text(texts[f], f, decls)
    all_cpp = "\n".join(_strip_comments(t) for f, t in texts.items() if f.endswith(".cpp"))
    issues += asc_init_issues({f: t for f, t in texts.items() if f.endswith(".cpp")})
    for f, t in texts.items():
        if not f.endswith(".h"):
            continue
        s = _strip_comments(t)
        for m in re.finditer(r"ReplicatedUsing\s*=\s*(\w+)\s*\)\s*[\w<>\s\*:]+?\b(\w+)\s*;", s):
            onrep, prop = m.group(1), m.group(2)
            line = s.count("\n", 0, m.start()) + 1
            if "FGameplayAttributeData" in m.group(0):
                continue  # GAS attributes: GAMEPLAYATTRIBUTE_REPNOTIFY handles prediction
            if not re.search(r"(?<!::)\b%s\s*\(\s*[^)]*\)\s*;" % re.escape(onrep), all_cpp):
                issues.append(_issue("ONREP_NOT_CALLED", f, line, "%s for %s" % (onrep, prop)))
        for m in re.finditer(r"UPROPERTY\s*\(([^)]*\bReplicated(?:Using\s*=\s*\w+)?\b[^)]*)\)\s*"
                             r"[\w<>\s\*:]+?\b(\w+)\s*;", s):
            prop = m.group(2)
            if not re.search(r"DOREPLIFETIME\w*\s*\(\s*\w+\s*,\s*%s\b" % re.escape(prop), all_cpp):
                issues.append(_issue("REPLICATED_NO_DOREPLIFETIME", f,
                                     s.count("\n", 0, m.start()) + 1, prop))
    return issues


def asc_init_issues(cpp_texts):
    """Cross-file GAS check: InitAbilityActorInfo reached from PossessedBy (server) must also
    be reached from AcknowledgePossession or OnRep_PlayerState (owning client), directly or
    through one helper function (tranek 4.1.2). cpp_texts: {path: text}."""
    funcs = []
    for f, t in cpp_texts.items():
        for cls, name, body, ln in _functions(_strip_comments(t)):
            funcs.append((f, cls, name, body, ln))
    direct = {name for _f, _c, name, body, _l in funcs if "InitAbilityActorInfo" in body}

    def reaches(body):
        if "InitAbilityActorInfo" in body:
            return True
        return any(re.search(r"\b%s\s*\(" % re.escape(n), body) for n in direct)

    server = [(f, ln) for f, _c, name, body, ln in funcs if name == "PossessedBy" and reaches(body)]
    client = [f for f, _c, name, body, _l in funcs
              if name in ("AcknowledgePossession", "OnRep_PlayerState") and reaches(body)]
    # Only a player-controlled ASC needs the client side (AI runs on the server).
    player = any("SetupPlayerInputComponent" in t for t in cpp_texts.values())
    if server and not client and player:
        return [_issue("ASC_CLIENT_INIT_MISSING", server[0][0], server[0][1])]
    return []


def lint_verdict(issues):
    errs = [i for i in issues if i["severity"] == "error"]
    warns = [i for i in issues if i["severity"] == "warn"]
    return {"ok": not errs, "errors": len(errs), "warnings": len(warns),
            "lines": ["%s: %s:%s %s %s" % (i["severity"], os.path.basename(i["file"]), i["line"],
                                           i["code"], i["message"]) for i in issues]}

# =============================================================================================
# 6. OFFLINE: trace analysis (PIE samples)
# =============================================================================================

GRAVITY_CM_S2 = 980.0  # UE default gravity magnitude (World Settings), cm/s^2 [added]


def jump_apex_cm(jump_z_velocity, gravity_scale=1.0, gravity=GRAVITY_CM_S2):
    """Apex height of one jump from rest: h = v^2 / (2 g) [added, physics]. Ignores
    JumpMaxHoldTime (holding the key extends the jump)."""
    g = gravity * gravity_scale
    return (jump_z_velocity ** 2) / (2.0 * g) if g > 0 else float("inf")


def _z(s):
    return float(s["loc"][2])


def _xy(s):
    return (float(s["loc"][0]), float(s["loc"][1]))


def analyze_jump(samples, presses, jump_z=None, gravity_scale=1.0, tolerance=0.15,
                 expect_double=True):
    """Double jump check from per-tick samples [{t, loc, vel?, jump_count?}] and the press
    times [t1, t2, t3?]. CharacterMovement sets Velocity.Z = max(Velocity.Z, JumpZVelocity)
    on each jump [added, engine behavior], so the expected total rise after the second press
    is (rise at that press) + h. A third press must add nothing when JumpMaxCount = 2."""
    out = {"lines": []}
    if not samples or not presses:
        return {"ok": False, "lines": ["error: no samples or no presses"]}
    t1 = presses[0]
    before = [s for s in samples if s["t"] <= t1] or samples[:1]
    ground = min(_z(s) for s in before[-5:])
    t2 = presses[1] if len(presses) > 1 else None
    t3 = presses[2] if len(presses) > 2 else None
    seg1 = [s for s in samples if t1 <= s["t"] <= (t2 if t2 else samples[-1]["t"])]
    apex1 = max(_z(s) for s in seg1) - ground if seg1 else 0.0
    out["rise_first_cm"] = round(apex1, 2)
    h = jump_apex_cm(jump_z, gravity_scale) if jump_z else None
    if h:
        out["expected_single_cm"] = round(h, 2)
        if t2 is None and abs(apex1 - h) > tolerance * h:
            out["lines"].append("error: single jump rise %.1f cm vs expected %.1f cm "
                                "(tolerance %d%%)" % (apex1, h, tolerance * 100))
    if expect_double:
        if not t2:
            out["lines"].append("error: double jump expected but only one press given")
        else:
            at_press = [s for s in samples if s["t"] <= t2]
            rise_at_press = (_z(at_press[-1]) - ground) if at_press else 0.0
            seg2 = [s for s in samples if s["t"] >= t2]   # a third press is checked separately
            total = max(_z(s) for s in seg2) - ground if seg2 else 0.0
            out["rise_at_second_press_cm"] = round(rise_at_press, 2)
            out["rise_total_cm"] = round(total, 2)
            if h:
                exp_total = rise_at_press + h
                out["expected_total_cm"] = round(exp_total, 2)
                if abs(total - exp_total) > tolerance * exp_total:
                    out["lines"].append("error: double jump total rise %.1f cm vs expected %.1f "
                                        "(rise at press + one jump)" % (total, exp_total))
            if total <= apex1 * 1.05:
                out["lines"].append("error: second press added no height (JumpMaxCount still 1, "
                                    "or the press was not received)")
            counts = [s.get("jump_count") for s in samples if s.get("jump_count") is not None]
            if counts and max(counts) < 2:
                out["lines"].append("error: JumpCurrentCount never reached 2")
    if t3 is not None:
        # Gravity only lowers Velocity.Z in the air, so a rise between two airborne samples
        # after the third press means a jump happened.
        win = [s for s in samples if t3 - 0.02 <= s["t"] <= t3 + 0.3 and s.get("vel") is not None]
        thr = max(50.0, 0.1 * (jump_z or 500.0))
        jumped = any(float(b["vel"][2]) - float(a["vel"][2]) > thr and _z(a) > ground + 1.0
                     for a, b in zip(win, win[1:]))
        counts3 = [s.get("jump_count") for s in samples if s["t"] >= t3 and
                   s.get("jump_count") is not None]
        if jumped or (counts3 and max(counts3) > 2):
            out["lines"].append("error: third press produced a jump (JumpMaxCount above 2)")
        elif win:
            out["third_press_ignored"] = True
    out["ok"] = not any(x.startswith("error") for x in out["lines"])
    return out


# CharacterMovement defaults used when the PIE job could not read them from the CDO
# [added from engine defaults, verify on 5.8 with the probe].
CMC_DEFAULTS = {"braking_deceleration_walking": 2048.0, "ground_friction": 8.0,
                "braking_friction_factor": 2.0, "b_use_separate_braking_friction": False,
                "braking_friction": 0.0}


def coast_distance_cm(v0, props=None):
    """Ground distance CharacterMovement coasts from speed v0 with no input [added, engine
    behavior, verify]: dv/dt = -F v - D, F = friction * BrakingFrictionFactor (friction =
    GroundFriction, or BrakingFriction when bUseSeparateBrakingFriction), D =
    BrakingDecelerationWalking. Airborne there is no braking by default, so no bound."""
    p = dict(CMC_DEFAULTS, **(props or {}))
    fr = p["braking_friction"] if p["b_use_separate_braking_friction"] else p["ground_friction"]
    f = float(fr) * float(p["braking_friction_factor"])
    d = float(p["braking_deceleration_walking"])
    v0 = max(0.0, float(v0))
    if v0 == 0.0:
        return 0.0
    if f <= 0.0:
        return v0 * v0 / (2.0 * d) if d > 0 else float("inf")
    if d <= 0.0:
        return v0 / f
    k = d / f
    t_stop = math.log((v0 + k) / k) / f
    return (v0 + k) * (1.0 - math.exp(-f * t_stop)) / f - k * t_stop


def dash_expected_cm(dash_speed, dash_duration, exit_speed=None, props=None):
    """Expected ground dash displacement DERIVED from the parameters (a threshold must come
    from the movement model, not a guess, U4 grade): constant-force root motion distance
    speed * duration (non-additive, gravity off) plus the coast after the ClampVelocity exit
    at exit_speed [added]. Returns {expected_cm, root_motion_cm, coast_cm, settle_s}."""
    rm = float(dash_speed) * float(dash_duration)
    v_exit = min(float(exit_speed if exit_speed is not None else dash_speed), float(dash_speed))
    coast = coast_distance_cm(v_exit, props)
    p = dict(CMC_DEFAULTS, **(props or {}))
    fr = p["braking_friction"] if p["b_use_separate_braking_friction"] else p["ground_friction"]
    f = float(fr) * float(p["braking_friction_factor"])
    d = float(p["braking_deceleration_walking"])
    if v_exit <= 0:
        t = 0.0
    elif f > 0 and d > 0:
        t = math.log((v_exit + d / f) / (d / f)) / f
    elif d > 0:
        t = v_exit / d
    else:
        t = 1.0
    return {"expected_cm": round(rm + coast, 2), "root_motion_cm": round(rm, 2),
            "coast_cm": round(coast, 2), "settle_s": round(float(dash_duration) + t, 3)}


def analyze_dash(samples, t_press, expected_cm, tolerance=0.1, window_s=None):
    """Horizontal displacement after a dash press (no movement input during the test).
    expected_cm = DashSpeed * DashDuration for a non-additive constant-force root motion
    [added]. window_s defaults to 1.5 x the expected duration if 'duration_s' is unknown."""
    win = window_s if window_s else 0.6
    pre = [s for s in samples if s["t"] <= t_press]
    post = [s for s in samples if t_press <= s["t"] <= t_press + win]
    if not pre or len(post) < 2:
        return {"ok": False, "lines": ["error: not enough samples around the press"]}
    x0, y0 = _xy(pre[-1])
    x1, y1 = _xy(post[-1])
    dist = math.hypot(x1 - x0, y1 - y0)
    peak = 0.0
    for a, b in zip(post, post[1:]):
        dt = b["t"] - a["t"]
        if dt > 0:
            peak = max(peak, math.hypot(b["loc"][0] - a["loc"][0], b["loc"][1] - a["loc"][1]) / dt)
    out = {"distance_cm": round(dist, 2), "peak_speed_cm_s": round(peak, 1),
           "expected_cm": expected_cm, "lines": []}
    if expected_cm and abs(dist - expected_cm) > tolerance * expected_cm:
        out["lines"].append("error: dash moved %.1f cm, expected %.1f +- %d%%"
                            % (dist, expected_cm, tolerance * 100))
    dz = abs(_z(post[-1]) - _z(pre[-1]))
    out["vertical_change_cm"] = round(dz, 2)
    out["ok"] = not out["lines"]
    return out


def analyze_cooldown(attempts, cooldown_s, min_move_cm=50.0):
    """attempts: [{t, moved_cm, cooldown_tag(bool, optional)}] in time order. The first
    attempt must move; attempts within cooldown_s of the last successful one must not move
    (and should show the cooldown tag); attempts after it must move again."""
    out = {"lines": [], "attempts": []}
    last_ok = None
    for a in attempts:
        moved = a.get("moved_cm", 0.0) >= min_move_cm
        within = last_ok is not None and (a["t"] - last_ok) < cooldown_s
        expect = not within
        row = {"t": a["t"], "moved": moved, "expected_move": expect}
        if moved != expect:
            out["lines"].append("error: attempt at %.2fs %s but %s" % (
                a["t"], "moved" if moved else "did not move",
                "cooldown should block it" if within else "cooldown should be over"))
        if within and a.get("cooldown_tag") is False:
            out["lines"].append("warn: attempt at %.2fs blocked without the cooldown tag: "
                                "blocked by something else?" % a["t"])
        if moved:
            last_ok = a["t"]
        out["attempts"].append(row)
    if not attempts:
        out["lines"].append("error: no attempts")
    out["ok"] = not any(x.startswith("error") for x in out["lines"])
    return out


def infer_ai_phases(samples, walk_speed, chase_speed, attack_range_cm, still_speed=20.0):
    """Infer enemy phases from positions when the tree exposes no state:
    samples [{t, enemy:[x,y,z], player:[x,y,z]}]. chase = speed at or above the walk/chase
    midpoint while closing on the player; attack = within range and nearly still; patrol =
    moving otherwise; idle = still. Returns [(t_start, phase)] compressed."""
    mid = (walk_speed + chase_speed) / 2.0
    phases = []
    for a, b in zip(samples, samples[1:]):
        dt = b["t"] - a["t"]
        if dt <= 0:
            continue
        spd = math.hypot(b["enemy"][0] - a["enemy"][0], b["enemy"][1] - a["enemy"][1]) / dt
        da = math.hypot(a["enemy"][0] - a["player"][0], a["enemy"][1] - a["player"][1])
        db = math.hypot(b["enemy"][0] - b["player"][0], b["enemy"][1] - b["player"][1])
        closing = (da - db) / dt
        if db <= attack_range_cm and spd < max(still_speed, walk_speed * 0.5):
            p = "attack"
        elif spd >= mid and closing > 0:
            p = "chase"
        elif spd > still_speed:
            p = "patrol"
        else:
            p = "idle"
        if not phases or phases[-1][1] != p:
            phases.append((round(b["t"], 3), p))
    return phases


def state_sequence_verdict(observed, expected, events=None, max_latency_s=None,
                           root_names=("Root",)):
    """observed [(t, state)], expected ordered states (a subsequence must appear).
    events {name: t}, e.g. {"sighted": 3.2}; with max_latency_s the first state after the
    event named in expected_after (a dict in events: {"sighted": (3.2, "chase")}) must come
    within the latency. Unplanned entries to a root state are errors (Mononen [00:14:13])."""
    out = {"lines": []}
    names = [s for _t, s in observed]
    i = 0
    for s in names:
        if i < len(expected) and s.lower() == expected[i].lower():
            i += 1
    if i < len(expected):
        out["lines"].append("error: expected sequence %s, observed %s (stopped at %s)"
                            % (expected, names, expected[i]))
    for t, s in observed:
        if s in root_names and s not in expected:
            out["lines"].append("error: unplanned root entry at %.2fs (missing completion or "
                                "failure transition)" % t)
    for ev, spec in (events or {}).items():
        if isinstance(spec, (list, tuple)) and max_latency_s is not None:
            t_ev, want = spec
            after = [(t, s) for t, s in observed if t >= t_ev and s.lower() == want.lower()]
            if not after:
                out["lines"].append("error: no %s after %s at %.2fs" % (want, ev, t_ev))
            elif after[0][0] - t_ev > max_latency_s:
                out["lines"].append("error: %s came %.2fs after %s (limit %.2fs)"
                                    % (want, after[0][0] - t_ev, ev, max_latency_s))
    out["ok"] = not any(x.startswith("error") for x in out["lines"])
    return out


def health_bar_verdict(samples, tol=0.01, max_lag_frames=1):
    """samples [{t, health, max, percent}] per tick: the bar must equal health/max within tol,
    at most max_lag_frames after a change (events, not polling)."""
    out = {"lines": [], "mismatches": 0}
    lag = 0
    worst = 0
    for s in samples:
        if not s.get("max"):
            continue
        want = max(0.0, min(1.0, s["health"] / s["max"]))
        if abs(s["percent"] - want) > tol:
            lag += 1
            out["mismatches"] += 1
            worst = max(worst, lag)
        else:
            lag = 0
    out["worst_lag_frames"] = worst
    if worst > max_lag_frames:
        out["lines"].append("error: health bar lagged %d frames behind Health/Max (frozen widget "
                            "under invalidation, or polling)" % worst)
    if not samples:
        out["lines"].append("error: no samples")
    out["ok"] = not out["lines"]
    return out


TRACE_TAG = "GAMEPLAY_TRACE "


def parse_trace_lines(text):
    """GAMEPLAY_TRACE {json} lines from a log (FSTTask_SetDebugState writes them)."""
    out = []
    for line in str(text).splitlines():
        k = line.find(TRACE_TAG)
        if k < 0:
            continue
        try:
            out.append(json.loads(line[k + len(TRACE_TAG):].strip()))
        except ValueError:
            continue
    return out


def trace_states(records, actor=None):
    """[(t, state)] from parsed trace records, optionally for one actor name prefix."""
    return [(float(r.get("t", 0.0)), r.get("state")) for r in records
            if r.get("kind") == "state" and (actor is None or str(r.get("actor", "")).startswith(actor))]


_OBJ_RE = re.compile(r"\b([A-Z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)*?)(?:_C)?_(\d+)\b")


def parse_dumpticks(text):
    """Tolerant parser for `dumpticks` output (format [verify]; the probe saves a real sample).
    Counts tick functions per class-like label (object name with its _<n> / _C_<n> suffix
    stripped) and how many lines say Enabled or Disabled. Returns {class: {total, enabled,
    disabled}}."""
    census = {}
    for line in str(text).splitlines():
        m = _OBJ_RE.search(line)
        if not m:
            continue
        label = m.group(1)
        if label in ("TG", "LogTick", "Log"):
            continue
        row = census.setdefault(label, {"total": 0, "enabled": 0, "disabled": 0})
        row["total"] += 1
        low = line.lower()
        if "disabled" in low:
            row["disabled"] += 1
        elif "enabled" in low:
            row["enabled"] += 1
    return census


def tick_verdict(census, justified=(), max_per_class=200, budget_total=None):
    """Arnbjornsson: judge tick COUNTS and work, not Tick itself. Flags classes with more than
    max_per_class ticking instances (aggregate into a manager or Mass) and ticking classes
    nobody justified. budget_total: optional cap on total ticking functions."""
    out = {"lines": []}
    total = 0
    for cls, row in sorted(census.items(), key=lambda kv: -kv[1]["total"]):
        live = row["enabled"] or (row["total"] - row["disabled"])
        total += live
        if live > max_per_class:
            out["lines"].append("error: %s has %d ticking instances: aggregate (one manager with "
                                "instanced meshes) or Mass (Arnbjornsson [00:11:35])" % (cls, live))
        elif live and cls not in justified:
            out["lines"].append("warn: %s ticks (%d) without a stated per-frame need: disable "
                                "Start With Tick Enabled or set a Tick Interval" % (cls, live))
    out["total_ticking"] = total
    if budget_total is not None and total > budget_total:
        out["lines"].append("error: %d ticking functions over the budget of %d"
                            % (total, budget_total))
    out["ok"] = not any(x.startswith("error") for x in out["lines"])
    return out


def hard_ref_verdict(closures, allow_prefixes=("/Script/", "/Engine/"), heavy_markers=(),
                     max_packages=None):
    """closures: {always_loaded_asset: [hard dependency package paths]}. Flags Blueprint
    packages outside the allow list reachable from always-loaded classes (the 'player casts
    to the final boss' chain, Arnbjornsson [00:28:01]). heavy_markers: substrings that mark
    optional heavy content (Boss, Vehicle, Cinematic)."""
    out = {"lines": [], "flagged": {}}
    for root, deps in closures.items():
        bad = [d for d in deps if not d.startswith(tuple(allow_prefixes))]
        heavy = [d for d in bad if any(h.lower() in d.lower() for h in heavy_markers)]
        if heavy:
            out["lines"].append("error: %s hard-references optional heavy content %s: use a C++ "
                                "base, an interface, IsA (Soft) or soft references" % (root, heavy))
        if max_packages is not None and len(deps) > max_packages:
            out["lines"].append("warn: %s pulls %d packages (limit %d)" % (root, len(deps),
                                                                          max_packages))
        out["flagged"][root] = bad
    out["ok"] = not any(x.startswith("error") for x in out["lines"])
    return out


SNAPSHOT_PATTERNS = {
    "print_string": re.compile(r"PrintString|PrintText", re.I),
    "scan_all_actors": re.compile(r"GetAllActorsWithTag|GetAllActorsWithInterface", re.I),
    "delay_node": re.compile(r"\bDelay\b|K2Node_.*Delay|KismetSystemLibrary:Delay", re.I),
    "property_binding": re.compile(r"\bBindings\b|PropertyBinding|FDelegateEditorBinding", re.I),
    "event_tick": re.compile(r"ReceiveTick|Event Tick", re.I),
    "cast_to_bp": re.compile(r"DynamicCast.*_C\b|Cast To BP_", re.I),
}


def scan_blueprint_snapshot(obj_or_path):
    """Heuristic scan of `snapshotblueprints <label>` JSON (5.5+, format [verify]): for each
    top-level Blueprint entry, which risky patterns its strings contain. A Delay inside a
    GameplayAbility graph and PrintString next to ReceiveTick are the classic findings."""
    if isinstance(obj_or_path, str) and os.path.isdir(obj_or_path):
        res = {}
        for d, _dirs, files in os.walk(obj_or_path):
            for f in files:
                if f.endswith(".json"):
                    with open(os.path.join(d, f), "r", encoding="utf-8", errors="replace") as fh:
                        try:
                            data = json.load(fh)
                        except ValueError:
                            continue
                    for k, v in scan_blueprint_snapshot(data).items():
                        res[os.path.splitext(f)[0] + (":" + k if k != "<root>" else "")] = v
        return res
    data = obj_or_path
    if isinstance(obj_or_path, str) and os.path.isfile(obj_or_path):
        with open(obj_or_path, "r", encoding="utf-8", errors="replace") as fh:
            data = json.load(fh)

    def strings(x):
        if isinstance(x, dict):
            for k, v in x.items():
                yield str(k)
                yield from strings(v)
        elif isinstance(x, list):
            for v in x:
                yield from strings(v)
        elif x is not None:
            yield str(x)

    entries = data.items() if isinstance(data, dict) and all(
        isinstance(v, (dict, list)) for v in data.values()) and len(data) > 0 else [("<root>", data)]
    out = {}
    for name, body in entries:
        blob = "\n".join(strings(body))
        hits = sorted(k for k, p in SNAPSHOT_PATTERNS.items() if p.search(blob))
        findings = []
        if "print_string" in hits and "event_tick" in hits:
            findings.append("warn: Print String in a Blueprint that ticks: strip it before "
                            "profiling (Arnbjornsson)")
        if "delay_node" in hits and re.search(r"GameplayAbility|GA_", blob):
            findings.append("error: Delay node in an ability: use the GAS Wait Delay task "
                            "(Shao [00:43:03])")
        if "scan_all_actors" in hits and "event_tick" in hits:
            findings.append("warn: GetAllActorsWithTag/WithInterface in a ticking Blueprint")
        if "property_binding" in hits and re.search(r"WidgetBlueprint|WBP_", blob):
            findings.append("error: UMG property binding: use events or MVVM (Albert)")
        out[name] = {"patterns": hits, "findings": findings}
    return out

# =============================================================================================
# 7. OFFLINE: scenarios and automation-test generation
# =============================================================================================

KEYS = {"jump": "SpaceBar", "dash": "LeftShift", "attack": "LeftMouseButton",
        "forward": "W"}

U4_SCENARIOS = {
    "double_jump": {
        "map": None, "sample": ["loc", "vel", "jump_count", "falling"],
        "steps": [{"do": "wait", "s": 1.0},
                  {"do": "mark", "name": "press1"}, {"do": "tap", "key": KEYS["jump"], "hold": 0.05},
                  {"do": "wait_until", "cond": "apex", "timeout": 2.0},
                  {"do": "mark", "name": "press2"}, {"do": "tap", "key": KEYS["jump"], "hold": 0.05},
                  {"do": "wait", "s": 0.25},
                  {"do": "mark", "name": "press3"}, {"do": "tap", "key": KEYS["jump"], "hold": 0.05},
                  {"do": "wait_until", "cond": "landed", "timeout": 4.0},
                  {"do": "screenshot", "name": "double_jump_end"}],
        "check": {"fn": "analyze_jump", "presses": ["press1", "press2", "press3"],
                  "jump_z_prop": "jump_z_velocity"},
    },
    "dash_cooldown": {
        "map": None, "sample": ["loc", "vel", "tag:Cooldown.Ability.Dash"],
        "steps": [{"do": "wait", "s": 1.0},
                  {"do": "mark", "name": "dash1"}, {"do": "tap", "key": KEYS["dash"], "hold": 0.05},
                  {"do": "wait", "s": 0.5},
                  {"do": "mark", "name": "dash2"}, {"do": "tap", "key": KEYS["dash"], "hold": 0.05},
                  {"do": "wait", "s": 0.5},
                  {"do": "wait", "s": "cooldown"},
                  {"do": "mark", "name": "dash3"}, {"do": "tap", "key": KEYS["dash"], "hold": 0.05},
                  {"do": "wait", "s": 0.6},
                  {"do": "console", "cmd": "showdebug abilitysystem"},
                  {"do": "screenshot", "name": "dash_showdebug"}],
        "check": {"fn": "analyze_dash_cooldown", "presses": ["dash1", "dash2", "dash3"]},
        "params": {"cooldown_s": 1.2, "dash_speed": 3000.0, "dash_duration": 0.2,
                   "exit_speed": 600.0},
    },
    "enemy_patrol_chase_attack": {
        "map": None, "sample": ["loc", "health", "enemy", "enemy_state"],
        "steps": [{"do": "teleport_player", "to": "far"}, {"do": "wait", "s": 4.0},
                  {"do": "screenshot", "name": "enemy_patrol"},
                  {"do": "mark", "name": "sighted"}, {"do": "teleport_player", "to": "in_sight"},
                  {"do": "wait", "s": 3.0}, {"do": "screenshot", "name": "enemy_chase"},
                  {"do": "wait", "s": 3.0}, {"do": "screenshot", "name": "enemy_attack"},
                  {"do": "console", "cmd": "statetree.startdebuggertraces"}],
        "check": {"fn": "analyze_enemy", "expected": ["patrol", "chase", "attack"],
                  "latency_s": 1.0},
        "params": {"walk_speed": 200.0, "chase_speed": 450.0, "attack_range_cm": 180.0},
    },
    "health_bar": {
        "map": None, "sample": ["health", "widget_percent"],
        "steps": [{"do": "wait", "s": 1.0}, {"do": "screenshot", "name": "hud_full"},
                  # Fixed-magnitude debug twin, never the SetByCaller GE_Damage: the console
                  # sets no SetByCaller value, so GE_Damage would apply 0 [added, verify].
                  {"do": "console", "cmd": "AbilitySystem.Effect.Apply GE_Damage_Debug"},
                  {"do": "wait", "s": 0.5}, {"do": "screenshot", "name": "hud_damaged"}],
        "check": {"fn": "health_bar_verdict"},
    },
}
# Placeholder params in U4_SCENARIOS (cooldown, distances, speeds) must be replaced with the
# values set on the assets; they are the baseline answer's example values, not expert numbers.


def _marks(result):
    return {m["name"]: m["t"] for m in result.get("marks", [])}


def scenario_verdict(name, result, params=None):
    """Judge a pie_scenario result with the analyzer its scenario names."""
    sc = U4_SCENARIOS.get(name, {})
    p = dict(sc.get("params", {}), **(params or {}))
    chk = sc.get("check", {})
    fn = chk.get("fn")
    samples = result.get("samples", [])
    marks = _marks(result)
    if fn == "analyze_jump":
        presses = [marks[k] for k in chk["presses"] if k in marks]
        return analyze_jump([s for s in samples if "loc" in s], presses,
                            jump_z=result.get("props", {}).get(chk.get("jump_z_prop")))
    if fn == "analyze_dash_cooldown":
        t = [marks.get(k) for k in chk["presses"]]
        rows = []
        exp_cm, win = p.get("expected_cm"), 0.45
        if p.get("dash_speed") and p.get("dash_duration"):
            de = dash_expected_cm(p["dash_speed"], p["dash_duration"], p.get("exit_speed"),
                                  {k: v for k, v in result.get("props", {}).items()
                                   if k in CMC_DEFAULTS})
            exp_cm, win = de["expected_cm"], max(0.45, de["settle_s"] + 0.1)
        for tp in t:
            if tp is None:
                continue
            d = analyze_dash(samples, tp, exp_cm, window_s=win)
            tag = None
            for s in samples:
                if s["t"] >= tp:
                    tag = s.get("tag:Cooldown.Ability.Dash")
                    break
            rows.append({"t": tp, "moved_cm": d.get("distance_cm", 0.0), "cooldown_tag": tag,
                         "dash": d})
        cd = analyze_cooldown(rows, p.get("cooldown_s", 1.0))
        first = rows[0]["dash"] if rows else {"ok": False, "lines": ["error: no dash"]}
        lines = list(first.get("lines", [])) + cd["lines"]
        return {"ok": first.get("ok", False) and cd["ok"], "lines": lines, "dash": first,
                "cooldown": cd}
    if fn == "analyze_enemy":
        states = [(s["t"], s["enemy_state"]) for s in samples if s.get("enemy_state")]
        if states:
            comp = []
            for t, st in states:
                if not comp or comp[-1][1] != st:
                    comp.append((t, st))
            observed, how = comp, "DebugStateName"
        else:
            rows = [{"t": s["t"], "enemy": s["enemy"], "player": s["loc"]} for s in samples
                    if s.get("enemy") and s.get("loc")]
            observed = infer_ai_phases(rows, p["walk_speed"], p["chase_speed"],
                                       p["attack_range_cm"])
            how = "inferred from motion"
        v = state_sequence_verdict([(t, st.lower()) for t, st in observed], chk["expected"],
                                   events={"sighted": (marks.get("sighted", 0.0), "chase")},
                                   max_latency_s=chk.get("latency_s"))
        v["observed"] = observed
        v["method"] = how
        hp = [s.get("health") for s in samples if s.get("health") is not None]
        if hp and min(hp) >= max(hp):
            v["lines"].append("error: player health never dropped: the attack did not land")
            v["ok"] = False
        return v
    if fn == "health_bar_verdict":
        rows = [{"t": s["t"], "health": s["health"], "max": s.get("max_health", 0.0),
                 "percent": s["widget_percent"]} for s in samples
                if s.get("widget_percent") is not None and s.get("health") is not None]
        return health_bar_verdict(rows)
    return {"ok": False, "lines": ["error: no analyzer for scenario %s" % name]}


_TEST_TEMPLATE = '''"""
Generated by ue_gameplay.write_python_automation_test on {date}. NOT YET RUN IN UNREAL.
PythonAutomationTest discovers test_*.py under Content/Python (Automation test framework doc).
Run headless:  UnrealEditor-Cmd <Project>.uproject -ExecCmds="Automation RunTest Editor.Python;Quit"
               -ReportExportPath=<abs dir> -unattended   [verify the test path prefix]
Each scenario starts PIE, injects keys with Input.+key / Input.-key, samples every tick and is
judged by ue_gameplay.scenario_verdict. Failures raise, which the framework reports.
"""
import json
import os
import sys

import unreal

sys.path.insert(0, {scripts_dir!r})
import ue_gameplay as G  # noqa: E402

SCENARIOS = {scenarios}
PARAMS = {params}
OUT_DIR = {out_dir!r}
RESULTS = {{}}


def _run(name):
    gen = G.pie_scenario(dict(G.U4_SCENARIOS[name], **SCENARIOS.get(name, {{}})),
                         out_dir=os.path.join(OUT_DIR, name))
    res = yield from G.as_automation_latent(gen)
    verdict = G.scenario_verdict(name, res, PARAMS.get(name))
    RESULTS[name] = {{"verdict": verdict, "marks": res.get("marks"),
                     "screenshots": res.get("screenshots")}}
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(os.path.join(OUT_DIR, name + ".json"), "w") as fh:
        json.dump({{"result": res, "verdict": verdict}}, fh, indent=1, default=str)
    for line in verdict.get("lines", []):
        (unreal.log_error if line.startswith("error") else unreal.log_warning)(name + ": " + line)
    assert verdict.get("ok"), "%s failed: %s" % (name, verdict.get("lines"))

{commands}
'''

_CMD_TEMPLATE = '''
@unreal.AutomationScheduler.add_latent_command
def scenario_{name}():
    yield from _run({name!r})
'''


def write_python_automation_test(out_path, scenarios=("double_jump", "dash_cooldown",
                                                      "enemy_patrol_chase_attack", "health_bar"),
                                 overrides=None, params=None, out_dir=None, scripts_dir=None):
    """Write a PythonAutomationTest file (Content/Python/Tests/test_<feature>.py) that runs
    the named scenarios. overrides: per-scenario dict merged into U4_SCENARIOS entries (map,
    steps); params: per-scenario analyzer params (cooldown_s, expected_cm, speeds)."""
    for s in scenarios:
        if s not in U4_SCENARIOS:
            raise ValueError("unknown scenario %s" % s)
    text = _TEST_TEMPLATE.format(
        date=time.strftime("%Y-%m-%d"), scripts_dir=scripts_dir or _HERE,
        scenarios=repr(overrides or {}), params=repr(params or {}),
        out_dir=out_dir or os.path.join("Saved", "Automation", "Gameplay"),
        commands="".join(_CMD_TEMPLATE.format(name=s) for s in scenarios))
    compile(text, out_path, "exec")  # fail here, not in the editor
    return write_text(out_path, text)

# =============================================================================================
# 8. OFFLINE: handoff contracts
# =============================================================================================

VFX_SPAWN_PATHS = ("pool", "data_channel", "gameplay_cue", "attached")


def vfx_event_contract(events):
    """Normalize gameplay events for scenario-unreal-vfx. Each event: tag, trigger, payload (list of
    fields), radius_source (gameplay property the effect must read), gameplay_window_s,
    max_rate_hz, critical, gameplay_relevant, spawn (pool | data_channel | gameplay_cue |
    attached)."""
    out = []
    for e in events:
        out.append({
            "tag": e["tag"], "trigger": e.get("trigger", ""),
            "payload": list(e.get("payload", ["location", "normal", "instigator"])),
            "radius_source": e.get("radius_source"),
            "gameplay_window_s": e.get("gameplay_window_s"),
            "max_rate_hz": e.get("max_rate_hz"), "critical": bool(e.get("critical")),
            "gameplay_relevant": bool(e.get("gameplay_relevant")),
            "spawn": e.get("spawn", "pool"),
        })
    return {"to": "scenario-unreal-vfx", "events": out}


def vfx_contract_verdict(contract):
    """Checks: tags present, location in payload, radius from gameplay data, gameplay window,
    spawn path known, gameplay state never waits on a Gameplay Cue (cues are unreliable and
    cosmetic only, GAS doc), spam events on Data Channels, critical one-shots not on
    Data Channels without a reason."""
    out = []
    for e in contract.get("events", []):
        t = e.get("tag") or "?"
        if not re.match(r"^(GameplayCue|Event|FX)\.", t):
            out.append("warn: %s: use a GameplayCue.* or Event.* tag" % t)
        if "location" not in e.get("payload", []):
            out.append("error: %s: payload needs a location" % t)
        if e.get("spawn") not in VFX_SPAWN_PATHS:
            out.append("error: %s: spawn must be one of %s" % (t, ", ".join(VFX_SPAWN_PATHS)))
        if e.get("gameplay_relevant") and e.get("spawn") == "gameplay_cue":
            out.append("error: %s: gameplay-relevant state must not depend on a Gameplay Cue "
                       "(unreliable, cosmetic only)" % t)
        if e.get("radius_source") in (None, "", "hand-set"):
            out.append("warn: %s: no radius_source: the effect must read the gameplay radius, "
                       "never a hand-matched constant (scenario-unreal-vfx)" % t)
        if not e.get("gameplay_window_s"):
            out.append("warn: %s: no gameplay_window_s (the effect must be gone inside it)" % t)
        rate = e.get("max_rate_hz") or 0
        if rate >= 10 and e.get("spawn") == "pool":
            out.append("info: %s at %s Hz: a Data Channel listener suits spam better than a pool"
                       % (t, rate))
    return out


PERF_FIELDS = ("build", "config", "platform", "scenario_test", "insights_trace", "tick_census",
               "ai_count", "asc_count", "spawns_and_pools", "overlaps_per_frame", "umg_bindings",
               "statetree_scheduled_tick", "notes")


def perf_handoff(**kw):
    """Package for scenario-unreal-performance: Development build path, the automation test that
    reproduces the worst case, tick census, counts. Missing fields are listed."""
    rec = {k: kw.get(k) for k in PERF_FIELDS}
    rec["config"] = rec["config"] or "Development"
    rec["platform"] = rec["platform"] or "Mac"
    rec["missing"] = [k for k in PERF_FIELDS if rec.get(k) in (None, "", [], {}) and k != "notes"]
    rec["to"] = "scenario-unreal-performance"
    return rec

# =============================================================================================
# 8b. OFFLINE: GAS asset plans, GAS log triage, StateTree specs, AI wiring, rewrite gate
# =============================================================================================

# GE plans are data an agent writes before creating assets. magnitude: "set_by_caller" |
# "scalable_float". applied_from: "code" | "console" | "debug_key".
U4_GE_PLANS = [
    {"name": "GE_Cooldown_Dash", "role": "cooldown", "duration": "has_duration",
     "duration_s": 1.2, "granted_tags": ["Cooldown.Ability.Dash"], "applied_from": "code"},
    {"name": "GE_Damage", "role": "damage", "duration": "instant", "applied_from": "code",
     "asset_tags": ["Effect.Type.Damage"],
     "modifiers": [{"attribute": "GameplayHealthSet.Damage", "op": "Add",
                    "magnitude": "set_by_caller", "tag": "Data.Damage"}]},
    # Isolation twin for console tests: same attribute path, FIXED magnitude (the talk's
    # console test ran on a fixed GE, Shao 8bi0rnXnRj4 [00:21:12]).
    {"name": "GE_Damage_Debug", "role": "debug", "duration": "instant", "applied_from": "console",
     "asset_tags": ["Effect.Type.Damage"],
     "modifiers": [{"attribute": "GameplayHealthSet.Damage", "op": "Add",
                    "magnitude": "scalable_float", "value": 10.0}]},
]

META_ATTRIBUTES = ("Damage", "Healing", "AbilityDamage")


def ge_plan_verdict(plans):
    """Checks on Gameplay Effect plans before any asset exists. Lines 'error:'/'warn:'.
    - SetByCaller magnitudes exist only when code sets them on the spec: a GE applied from the
      console or a debug key with a SetByCaller modifier applies 0 and logs a missing
      SetByCaller magnitude [added, engine behavior, verify]; give it a fixed twin.
    - Cooldown GEs have a duration and grant a Cooldown.* tag (5.7 validation).
    - Tags from GEs need a duration; instant cases add a loose tag (Shao [00:33:04]).
    - Damage goes through one GE: SetByCaller keyed by a Data.* tag on a meta attribute, with
      a type in the ASSET tags, which reactions query (Shao [00:07:40], [00:49:12], [00:21:43]).
    """
    out = []
    names = {pl.get("name") for pl in plans}
    for pl in plans:
        n = pl.get("name", "?")
        mods = pl.get("modifiers", [])
        sbc = [m for m in mods if m.get("magnitude") == "set_by_caller"]
        if pl.get("applied_from") in ("console", "debug_key") and sbc:
            twin = n + "_Debug"
            out.append("error: %s is applied from the %s but uses SetByCaller (%s): nothing sets "
                       "the value there, so it applies 0 and logs a missing SetByCaller magnitude "
                       "[added, verify]; test with a fixed Scalable Float twin %s%s"
                       % (n, pl["applied_from"], ", ".join(m.get("tag", "?") for m in sbc), twin,
                          "" if twin in names else " (not in the plan yet)"))
        for m in sbc:
            if not str(m.get("tag", "")).startswith("Data."):
                out.append("warn: %s SetByCaller keyed by %r: use a Data.* tag the code sets"
                           % (n, m.get("tag")))
        if pl.get("granted_tags") and pl.get("duration") == "instant":
            out.append("error: %s is instant but grants tags: tags from GEs need a duration; "
                       "add a loose tag for instant cases (Shao [00:33:04])" % n)
        role = pl.get("role")
        if role == "cooldown":
            if pl.get("duration") != "has_duration":
                out.append("error: cooldown %s needs duration has_duration" % n)
            if not any(str(t).startswith("Cooldown.") for t in pl.get("granted_tags", [])):
                out.append("error: cooldown %s grants no Cooldown.* tag (5.7 validation warns; "
                           "the UI and blocking read that tag)" % n)
        if role in ("damage", "debug"):
            if not pl.get("asset_tags"):
                out.append("warn: %s has no asset tags: reactions query asset tags (what it is), "
                           "not granted tags (Shao [00:17:49])" % n)
            for m in mods:
                attr = str(m.get("attribute", ""))
                if attr and not attr.split(".")[-1] in META_ATTRIBUTES:
                    out.append("warn: %s modifies %s directly: route damage through a meta "
                               "attribute (Damage) the attribute set turns into Health loss "
                               "(Shao [00:07:40])" % (n, attr))
        if role == "damage" and mods and not sbc:
            out.append("warn: %s has fixed magnitudes: one damage GE with SetByCaller serves every "
                       "damage value (Shao [00:49:12])" % n)
    return out


# Log lines -> cause and fix. Engine message texts marked [verify] are from memory.
GAS_LOG_PATTERNS = [
    (re.compile(r"Can't activate LocalOnly or LocalPredicted ability", re.I),
     "ASC not initialized on the owning client",
     "InitAbilityActorInfo in AcknowledgePossession (ASC on pawn) or OnRep_PlayerState",
     "tranek 9.1, 4.1.2"),
    (re.compile(r"(set\s*by\s*caller|SetByCaller).*(not (yet )?(been )?set|missing|not found)|"
                r"magnitude had not yet been set by caller", re.I),
     "a SetByCaller GE was applied without its value (console test or a code path that skips "
     "SetSetByCallerMagnitude) [added, verify message]",
     "use the fixed-magnitude debug twin for console tests; set the magnitude in code",
     "engine behavior; Shao 8bi0rnXnRj4 [00:49:12]"),
    (re.compile(r"ScriptStructCache", re.I), "GAS global data not initialized",
     "call UAbilitySystemGlobals::InitGlobalData()", "tranek 9.2"),
    (re.compile(r"MarkPropertyDirty", re.I), "push-model link error",
     "add NetCore to PublicDependencyModuleNames", "tranek 9.5"),
]


def gas_log_triage(text):
    """Scan a log (after `log LogAbilitySystem VeryVerbose`) for known GAS failures.
    Returns [{line, cause, fix, source}] (first 3 hits per pattern)."""
    out = []
    counts = {}
    for line in str(text).splitlines():
        for i, (pat, cause, fix, src) in enumerate(GAS_LOG_PATTERNS):
            if pat.search(line) and counts.get(i, 0) < 3:
                counts[i] = counts.get(i, 0) + 1
                out.append({"line": line.strip()[:240], "cause": cause, "fix": fix,
                            "source": src})
    return out


def _st_task(task, completes, **kw):
    d = {"task": task, "completes_state": completes}
    d.update(kw)
    return d


# The U4 enemy as data: the spec for the GUI pass, an MCP StateTree toolset or a C++ builder.
# Tuning numbers are TREE PARAMETERS set per enemy on the component's State Tree Reference.
U4_ENEMY_TREE = {
    "name": "ST_Enemy", "schema": "ai",
    "parameters": {"AttackRange": 180.0, "ChaseAcceptance": 120.0, "PatrolWait": 1.5,
                   "AttackTimeout": 3.0},
    "events": {"AI.Event.TargetSeen": "EnemyAIController perception",
               "AI.Event.TargetLost": "EnemyAIController perception"},
    "states": [{
        "name": "Root", "children": [
            {"name": "Combat",
             "enter": [{"cond": "ObjectIsValid", "inputs": {"Object": "Controller.TargetActor"},
                        "dynamic": True}],
             "tasks": [_st_task("SetDebugState", False, params={"StateName": "Combat"})],
             "transitions": [{"on": "event", "event": "AI.Event.TargetLost", "to": "Patrol"}],
             "children": [
                 {"name": "Attack",
                  "enter": [{"cond": "DistanceCompare", "dynamic": True,
                             "inputs": {"Source": "Pawn.Location",
                                        "Target": "Controller.TargetActor.Location",
                                        "Distance": "Params.AttackRange"}}],
                  "tasks": [_st_task("SetDebugState", False, params={"StateName": "Attack"}),
                            _st_task("ActivateAbilityByTag", True,
                                     params={"AbilityTag": "Ability.Attack.Melee"},
                                     inputs={"TimeoutSeconds": "Params.AttackTimeout"})],
                  "transitions": [{"on": "succeeded", "to": "Combat"},
                                  {"on": "failed", "to": "Combat"}]},
                 {"name": "Chase",
                  "tasks": [_st_task("SetDebugState", False, params={"StateName": "Chase"}),
                            _st_task("MoveTo", True,
                                     inputs={"Target": "Controller.TargetActor",
                                             "AcceptanceRadius": "Params.ChaseAcceptance"})],
                  # Attack's enter condition is only evaluated when a transition asks for
                  # selection (Mononen [00:11:22]): Chase itself must request it.
                  "transitions": [{"on": "tick", "cond": "Distance <= Params.AttackRange",
                                   "to": "Combat"},
                                  {"on": "succeeded", "to": "Combat"},
                                  {"on": "failed", "to": "Patrol"}]}]},
            {"name": "Patrol",
             "tasks": [_st_task("SetDebugState", False, params={"StateName": "Patrol"})],
             "transitions": [{"on": "event", "event": "AI.Event.TargetSeen", "to": "Combat"}],
             "children": [
                 # Tasks in one state run together: a Delay beside MoveTo does not wait AFTER
                 # arriving, so the wait is its own state.
                 {"name": "Walk",
                  "tasks": [_st_task("FindPatrolPoint", False, outputs=["PatrolLocation"]),
                            _st_task("MoveTo", True,
                                     inputs={"Target": "FindPatrolPoint.PatrolLocation"})],
                  "transitions": [{"on": "succeeded", "to": "Wait"},
                                  {"on": "failed", "to": "Wait"}]},
                 {"name": "Wait",
                  "tasks": [_st_task("Delay", True, inputs={"Duration": "Params.PatrolWait"})],
                  "transitions": [{"on": "succeeded", "to": "Walk"},
                                  {"on": "failed", "to": "Walk"}]}]}]}],
}

_TUNING_KEY = re.compile(r"(Range|Radius|Wait|Speed|Distance|Acceptance|Duration|Timeout)$", re.I)
_RESELECT = ("tick", "event")


def _st_walk(states, parent=None, depth=0):
    for st in states:
        yield st, parent, depth
        yield from _st_walk(st.get("children", []), st, depth + 1)


def statetree_spec_verdict(tree):
    """Check a StateTree spec (U4_ENEMY_TREE format) against Mononen's execution model and the
    5.6 completion rules. Lines 'error:'/'warn:'/'info:'.
    - One root; every leaf (and every parent with a completing task) handles success AND
      failure, else it falls back to the parent and the root (Mononen [00:13:39], [00:14:13]).
    - Enter conditions are evaluated only when a transition requests selection
      ([00:11:22]): a sibling that can run while a 'dynamic' condition changes needs an event
      or On Tick transition that asks for re-selection.
    - Every Input bound (compile error otherwise, [00:18:19]); Params.* references exist.
    - Task Control Flow (5.6): a leaf needs a completing task; with several tasks each states
      whether it completes the state.
    - Tuning numbers (range, radius, wait, speed) come from tree parameters ([00:16:40]).
    - Events used by transitions have a sender."""
    out = []
    roots = tree.get("states", [])
    if len(roots) != 1:
        out.append("error: %d root states: the tree starts in the first (top-left) root "
                   "(Mononen [00:14:13])" % len(roots))
    params = tree.get("parameters", {})
    events = tree.get("events", {})
    names = {}
    for st, parent, _d in _st_walk(roots):
        if st["name"] in names:
            out.append("warn: state name %s used twice (transitions become ambiguous)" % st["name"])
        names[st["name"]] = (st, parent)

    def refs(d):
        for k, v in (d or {}).items():
            yield k, v

    for st, parent, depth in _st_walk(roots):
        n = st["name"]
        kids = st.get("children", [])
        tasks = st.get("tasks", [])
        trans = st.get("transitions", [])
        ons = {t.get("on") for t in trans}
        for t in trans:
            if t.get("to") and t["to"] not in names:
                out.append("error: %s transitions to unknown state %s" % (n, t["to"]))
            if t.get("on") == "event":
                if not t.get("event"):
                    out.append("error: %s has an event transition without a tag" % n)
                elif events and t["event"] not in events:
                    out.append("warn: %s waits for %s but nothing sends it" % (n, t["event"]))
        completing = [tk for tk in tasks if tk.get("completes_state")]
        handles = ("completed" in ons) or ({"succeeded", "failed"} <= ons)
        if depth > 0 and not kids and not handles:
            out.append("error: leaf %s lacks %s transitions: it falls back to its parent and the "
                       "root (Mononen [00:14:13])" % (n, " and ".join(
                           sorted({"succeeded", "failed"} - ons)) or "completion"))
        if depth > 0 and kids and completing and not handles:
            out.append("error: %s has a completing task but no success and failure transitions: "
                       "a failing task there starts completion at %s (Mononen [00:07:18])"
                       % (n, n))
        if depth > 0 and not kids:
            if not completing and not ({"tick", "event"} & ons):
                out.append("error: leaf %s has no task that completes it and no event or tick "
                           "transition: it never ends (5.6 Task Control Flow)" % n)
        if len(tasks) > 1 and any("completes_state" not in tk for tk in tasks):
            out.append("error: %s has %d tasks: state for each whether it completes the state "
                       "(5.6 Task Control Flow; pre-5.6 the first finished task ended it)"
                       % (n, len(tasks)))
        for node in tasks + st.get("enter", []):
            label = node.get("task") or node.get("cond")
            for k, v in refs(node.get("inputs")):
                if v in (None, ""):
                    out.append("error: %s.%s in %s is an unbound Input (compile error, Mononen "
                               "[00:18:19])" % (label, k, n))
                elif isinstance(v, str) and v.startswith("Params."):
                    if v[7:] not in params:
                        out.append("error: %s.%s in %s binds %s, not a tree parameter"
                                   % (label, k, n, v))
                elif isinstance(v, (int, float)) and _TUNING_KEY.search(k):
                    out.append("warn: %s.%s in %s is a literal %s: make it a tree parameter set "
                               "per enemy on the component's State Tree Reference (Mononen "
                               "[00:16:40])" % (label, k, n, v))
            for k, v in refs(node.get("params")):
                if isinstance(v, (int, float)) and _TUNING_KEY.search(k):
                    out.append("warn: %s.%s in %s is a literal %s: use a tree parameter"
                               % (label, k, n, v))
        # re-selection: dynamic enter conditions need a trigger on each sibling
        if parent is not None and any(c.get("dynamic") for c in st.get("enter", [])):
            for sib in parent.get("children", []):
                if sib is st:
                    continue
                own = {t.get("on") for t in sib.get("transitions", [])} & set(_RESELECT)
                leaves = [x for x, _p, _dd in _st_walk(sib.get("children", []))
                          if not x.get("children")]
                all_leaves = leaves and all({t.get("on") for t in x.get("transitions", [])}
                                            & set(_RESELECT) for x in leaves)
                if not own and not all_leaves:
                    out.append("warn: while %s runs, %s's enter condition is never re-checked: "
                               "StateTree evaluates enter conditions only when a transition "
                               "requests selection (Mononen [00:11:22]); add an event or an On "
                               "Tick transition on %s" % (sib["name"], n, sib["name"]))
    ticking = [st["name"] for st, _p, _d in _st_walk(roots)
               if any(t.get("on") == "tick" for t in st.get("transitions", []))]
    if ticking:
        out.append("info: On Tick transitions on %s keep the tree ticking while those states run; "
                   "prefer events where a sender exists (Mononen [00:15:01]) [added]"
                   % ", ".join(ticking))
    return out


def statetree_outline(tree):
    """Indented text of a spec for a GUI pass or an MCP prompt."""
    lines = ["%s (schema %s) parameters: %s" % (tree.get("name"), tree.get("schema"),
                                                 json.dumps(tree.get("parameters", {})))]
    for st, _p, depth in _st_walk(tree.get("states", [])):
        pad = "  " * (depth + 1)
        bits = [st["name"]]
        if st.get("enter"):
            bits.append("enter: " + "; ".join("%s %s" % (c["cond"], json.dumps(c.get("inputs", {})))
                                               for c in st["enter"]))
        lines.append(pad + " | ".join(bits))
        for tk in st.get("tasks", []):
            lines.append(pad + "  task %s%s %s" % (tk["task"], "" if tk.get("completes_state")
                                                   else " (does not complete the state)",
                                                   json.dumps({k: v for k, v in tk.items()
                                                               if k in ("inputs", "params")})))
        for t in st.get("transitions", []):
            what = t.get("event") or t.get("cond") or ""
            lines.append(pad + "  on %s %s -> %s" % (t["on"], what, t.get("to")))
    return "\n".join(lines)


def ai_setup_verdict(facts):
    """facts (from ai_setup_facts in the editor, or written by hand): pawn, ai_controller_class,
    controller_state_tree (asset path or None), auto_possess_ai, nav_bounds (bool),
    tree_parameters (names set on the reference), tree_spec (optional spec).
    Placed AND spawned enemies must get the controller that holds the tree."""
    out = []
    ctrl = str(facts.get("ai_controller_class") or "")
    who = facts.get("pawn", "pawn")
    if not ctrl:
        out.append("error: %s has no ai_controller_class (AI docs, Agent translation)" % who)
    elif ctrl.startswith("/Script/"):
        out.append("warn: %s ai_controller_class is the C++ class %s: C++ holds no asset "
                   "references, so the StateTree lives on a controller Blueprint child; point "
                   "ai_controller_class at it" % (who, ctrl))
    if not facts.get("controller_state_tree"):
        out.append("error: the controller's StateTree component references no tree: the AI "
                   "starts and does nothing")
    ap = str(facts.get("auto_possess_ai", "")).upper()
    if "DISABLED" in ap or not ap:
        out.append("error: auto_possess_ai is %r: nothing possesses the enemy" % (ap or None))
    elif "SPAWNED" not in ap:
        out.append("warn: auto_possess_ai %s: enemies from a spawner get no controller; use "
                   "PLACED_IN_WORLD_OR_SPAWNED" % ap)
    if facts.get("nav_bounds") is False:
        out.append("error: no NavMeshBoundsVolume: bots idle (Lombardo, Lyra [00:31:36])")
    spec = facts.get("tree_spec")
    if spec:
        missing = sorted(set(spec.get("parameters", {})) - set(facts.get("tree_parameters", [])))
        if missing:
            out.append("info: parameters left at the tree defaults for this enemy: %s"
                       % ", ".join(missing))
    return out


def rewrite_gate(totals, candidates, hot_share=0.8):
    """Decide Blueprint-to-C++ rewrites from an Unreal Insights trace, not from intuition
    (Forsythe VMZftEVDuCE [00:16:33], [00:17:06]: 80 percent of the time sits in 20 percent of
    the code). totals: ue_stat.timer_totals(...) output or {name: ms}. The hot set is the
    smallest set of timers holding hot_share of the summed time. Returns per candidate
    {share, hot, verdict} plus 'lines'."""
    tm = totals.get("total_ms", totals) if isinstance(totals, dict) else {}
    out = {"lines": [], "candidates": {}}
    if not tm:
        out["lines"].append("error: no Insights timers: record the scenario in a Development build "
                            "(-trace=default) before deciding any rewrite")
        out["ok"] = False
        return out
    total = sum(tm.values()) or 1.0
    hot, acc = set(), 0.0
    for name, ms in sorted(tm.items(), key=lambda kv: -kv[1]):
        if acc >= hot_share * total:
            break
        hot.add(name)
        acc += ms
    for c in candidates:
        ms = sum(v for k, v in tm.items() if c.lower() in k.lower())
        share = ms / total
        is_hot = any(c.lower() in k.lower() for k in hot)
        verdict = ("rewrite justified: in the hot set" if is_hot else
                   "leave it: not in the hot set (a rewrite would save at most %.1f%%)" % (share * 100))
        out["candidates"][c] = {"ms": round(ms, 3), "share": round(share, 4), "hot": is_hot,
                                "verdict": verdict}
        if not ms:
            out["lines"].append("warn: %s not found in the trace (named events on? "
                                "-statnamedevents costs about 20 percent, scenario-unreal-performance)" % c)
    out["ok"] = True
    return out

# =============================================================================================
# 9. IN-EDITOR layer (import unreal). NOT YET RUN IN UNREAL.
# =============================================================================================


def _u():
    import unreal
    return unreal


def _try(fn, *a, **k):
    try:
        return True, fn(*a, **k)
    except Exception as exc:  # noqa: BLE001
        return False, "%s: %s" % (type(exc).__name__, exc)


PROBE_CLASSES = [
    "InputAction", "InputMappingContext", "InputAction_Factory", "InputMappingContext_Factory",
    "InputModifierSwizzleAxis", "InputModifierNegate", "InputModifierDeadZone",
    "InputTriggerPressed", "InputTriggerHold", "InputActionValueType", "InputAxisSwizzle",
    "Key", "BlueprintFactory", "BlueprintEditorLibrary", "BlueprintGraphEditor",
    "SubobjectDataSubsystem", "GameplayEffect", "GameplayAbility", "GameplayEffectDurationType",
    "TargetTagsGameplayEffectComponent", "AssetTagsGameplayEffectComponent",
    "GameplayEffectModifierMagnitude", "ScalableFloat", "GameplayModifierInfo",
    "AbilitySystemBlueprintLibrary", "GameplayTag", "GameplayTagContainer",
    "BlueprintGameplayTagLibrary", "StateTree", "StateTreeFactory", "StateTreeAIComponentSchema",
    "StateTreeComponentSchema", "StateTreeEditorData", "InstancedStruct", "WidgetBlueprint",
    "WidgetBlueprintFactory", "EditorUtilityLibrary", "DataTableFunctionLibrary",
    "JsonObjectGraphFunctionLibrary", "AutomationLibrary", "AutomationScheduler",
    "LevelEditorPlaySettings", "WidgetBlueprintLibrary", "ProgressBar", "CanvasPanel",
    "TextBlock", "SizeBox", "Character", "CharacterMovementComponent", "AIController",
    "StateTreeAIComponent", "StateTreeReference", "InstancedPropertyBag", "NavMeshBoundsVolume",
    "EAutoPossessAI", "AutoPossessAI", "GameplayEffectMagnitudeCalculation",
]
PROBE_PROPS = {
    "Character": ["jump_max_count", "jump_max_hold_time", "character_movement"],
    "CharacterMovementComponent": ["jump_z_velocity", "air_control", "max_walk_speed",
                                   "gravity_scale", "braking_deceleration_walking"],
    "GameplayEffect": ["duration_policy", "duration_magnitude", "modifiers", "ge_components",
                       "g_e_components", "stacking_type"],
    "GameplayAbility": ["cooldown_gameplay_effect_class", "cost_gameplay_effect_class",
                        "instancing_policy", "net_execution_policy", "ability_tags",
                        "asset_tags", "activation_blocked_tags"],
    "GameModeBase": ["default_pawn_class", "player_controller_class", "hud_class",
                     "game_state_class", "player_state_class"],
    "Pawn": ["ai_controller_class", "auto_possess_ai"],
    "InputMappingContext": ["mappings", "default_key_mappings"],
    "StateTreeAIComponent": ["state_tree_ref", "state_tree", "start_logic_automatically"],
    "GameplayModifierInfo": ["attribute", "modifier_op", "modifier_magnitude"],
    "GameplayEffectModifierMagnitude": ["magnitude_calculation_type", "scalable_float_magnitude",
                                        "set_by_caller_magnitude"],
}


def probe():
    """Record which [verify] names exist in this engine: classes, CDO properties, methods of
    BlueprintEditorLibrary / BlueprintGraphEditor / EditorUtilityLibrary / LevelEditorSubsystem.
    Run first (job_00_gameplay_probe.py)."""
    unreal = _u()
    rep = {"engine": unreal.SystemLibrary.get_engine_version(), "classes": {}, "props": {},
           "methods": {}}
    for n in PROBE_CLASSES:
        rep["classes"][n] = hasattr(unreal, n)
    for cls, props in PROBE_PROPS.items():
        c = getattr(unreal, cls, None)
        rep["props"][cls] = {}
        if c is None:
            continue
        ok, cdo = _try(unreal.get_default_object, c)
        for p in props:
            if not ok:
                rep["props"][cls][p] = "no CDO: %s" % cdo
                continue
            got, val = _try(cdo.get_editor_property, p)
            rep["props"][cls][p] = ("ok " + type(val).__name__) if got else val
    for cls in ("BlueprintEditorLibrary", "BlueprintGraphEditor", "EditorUtilityLibrary",
                "LevelEditorSubsystem", "AbilitySystemBlueprintLibrary", "StateTreeEditorData",
                "InputMappingContext", "AutomationLibrary"):
        c = getattr(unreal, cls, None)
        rep["methods"][cls] = sorted(m for m in dir(c) if not m.startswith("_")) if c else None
    return rep


def asset_lib():
    unreal = _u()
    return unreal.EditorAssetLibrary


def load_class(path_or_class):
    """'/Script/MyGame.HeroCharacter', '/Game/X/BP_Y' (Blueprint) or an unreal class."""
    unreal = _u()
    if not isinstance(path_or_class, str):
        return path_or_class
    if path_or_class.startswith("/Script/"):
        return unreal.load_class(None, path_or_class)
    return unreal.EditorAssetLibrary.load_blueprint_class(path_or_class)


def create_blueprint(folder, name, parent):
    """Blueprint child of a C++ or Blueprint parent. Tries 5.5 CreateBlueprintAssetWithParent
    on BlueprintEditorLibrary [verify name], then AssetTools + BlueprintFactory."""
    unreal = _u()
    parent_cls = load_class(parent)
    if parent_cls is None:
        raise RuntimeError("parent class not found: %s" % parent)
    path = "%s/%s" % (folder.rstrip("/"), name)
    if unreal.EditorAssetLibrary.does_asset_exist(path):
        return unreal.EditorAssetLibrary.load_asset(path)
    bel = getattr(unreal, "BlueprintEditorLibrary", None)
    if bel is not None and hasattr(bel, "create_blueprint_asset_with_parent"):
        ok, bp = _try(bel.create_blueprint_asset_with_parent, path, parent_cls)
        if ok and bp:
            return bp
    factory = unreal.BlueprintFactory()
    factory.set_editor_property("parent_class", parent_cls)
    bp = unreal.AssetToolsHelpers.get_asset_tools().create_asset(name, folder, unreal.Blueprint,
                                                                 factory)
    if bp is None:
        raise RuntimeError("could not create %s" % path)
    return bp


def compile_and_save(bp):
    unreal = _u()
    bel = getattr(unreal, "BlueprintEditorLibrary", None)
    compiled = False
    if bel is not None and hasattr(bel, "compile_blueprint"):
        compiled, _ = _try(bel.compile_blueprint, bp)
    saved = unreal.EditorAssetLibrary.save_loaded_asset(bp)
    return {"compiled": bool(compiled), "saved": bool(saved)}


def set_defaults(bp_path, props, save=True):
    """Set CDO properties on a Blueprint's generated class. props: {name: value}. Wrap paths:
    {"class": "/Script/M.Cls" or "/Game/BP"} for class slots, {"asset": "/Game/IA_Jump"} for
    object slots, {"soft": "/Game/IMC_Default.IMC_Default"} for soft pointers; plain values are
    set as given. Returns applied/failed per property plus compile and save flags."""
    unreal = _u()
    cls = unreal.EditorAssetLibrary.load_blueprint_class(bp_path)
    cdo = unreal.get_default_object(cls)
    rep = {"applied": [], "failed": {}}
    for k, v in props.items():
        if isinstance(v, dict) and "class" in v:
            v = load_class(v["class"])          # TSubclassOf slots
        elif isinstance(v, dict) and "asset" in v:
            v = unreal.load_asset(v["asset"])   # object slots (input actions, montages)
        elif isinstance(v, dict) and "soft" in v:
            v = unreal.SoftObjectPath(v["soft"])  # soft pointer slots [verify conversion]
        ok, err = _try(cdo.set_editor_property, k, v)
        (rep["applied"].append(k) if ok else rep["failed"].__setitem__(k, err))
    if save:
        rep.update(compile_and_save(unreal.EditorAssetLibrary.load_asset(bp_path)))
    return rep


def set_component_defaults(bp_path, component_prop, props, save=True):
    """Defaults of a C++-declared component on a Blueprint CDO (for example
    'character_movement': max_walk_speed, jump_z_velocity, air_control). Components added in
    the Blueprint itself need SubobjectDataSubsystem [verify]."""
    unreal = _u()
    cls = unreal.EditorAssetLibrary.load_blueprint_class(bp_path)
    cdo = unreal.get_default_object(cls)
    comp = cdo.get_editor_property(component_prop)
    rep = {"applied": [], "failed": {}}
    for k, v in props.items():
        ok, err = _try(comp.set_editor_property, k, v)
        (rep["applied"].append(k) if ok else rep["failed"].__setitem__(k, err))
    if save:
        rep.update(compile_and_save(unreal.EditorAssetLibrary.load_asset(bp_path)))
    return rep


def make_key(name):
    """unreal.Key from an FKey name ('SpaceBar', 'Gamepad_Left2D') [verify constructor]."""
    unreal = _u()
    for attempt in (lambda: unreal.Key(key_name=name),
                    lambda: _key_import(unreal, name)):
        ok, k = _try(attempt)
        if ok and k is not None:
            return k
    raise RuntimeError("cannot build unreal.Key for %s" % name)


def _key_import(unreal, name):
    k = unreal.Key()
    k.import_text(name)
    return k


def _new_asset(folder, name, cls_name, factory_name):
    unreal = _u()
    path = "%s/%s" % (folder.rstrip("/"), name)
    if unreal.EditorAssetLibrary.does_asset_exist(path):
        return unreal.EditorAssetLibrary.load_asset(path)
    at = unreal.AssetToolsHelpers.get_asset_tools()
    fac_cls = getattr(unreal, factory_name, None)
    cls = getattr(unreal, cls_name)
    if fac_cls is not None:
        ok, a = _try(at.create_asset, name, folder, cls, fac_cls())
        if ok and a:
            return a
    fac = unreal.DataAssetFactory()           # fallback [verify]
    fac.set_editor_property("data_asset_class", cls)
    return at.create_asset(name, folder, cls, fac)


_MODIFIERS = {"Negate": "InputModifierNegate", "SwizzleAxis": "InputModifierSwizzleAxis",
              "DeadZone": "InputModifierDeadZone"}
_TRIGGERS = {"Pressed": "InputTriggerPressed", "Released": "InputTriggerReleased",
             "Hold": "InputTriggerHold", "Tap": "InputTriggerTap", "Down": "InputTriggerDown"}


def _make_modifier(unreal, outer, spec):
    base, _, arg = spec.partition(":")
    obj = unreal.new_object(getattr(unreal, _MODIFIERS[base]), outer)
    if base == "SwizzleAxis" and arg:
        obj.set_editor_property("order", getattr(unreal.InputAxisSwizzle, arg))
    if base == "Negate" and arg:
        obj.set_editor_property("x", "X" in arg)
        obj.set_editor_property("y", "Y" in arg)
        obj.set_editor_property("z", "Z" in arg)
    return obj


def apply_input_plan(plan, folder="/Game/Input"):
    """Create Input Actions and Mapping Contexts from input_plan(). Modifiers and triggers are
    instanced objects: the mapping array is read, edited and written back because Python holds
    struct copies [verify]. Re-running rebuilds each context's mappings from the plan (unmap_all
    first), so hand edits made in the GUI are replaced. Returns a report with per-mapping
    failures (fallback: duplicate the template project's IMC and only add keys with map_key)."""
    unreal = _u()
    rep = {"actions": {}, "contexts": {}, "failed": []}
    vt = {"Boolean": "BOOLEAN", "Axis1D": "AXIS1D", "Axis2D": "AXIS2D", "Axis3D": "AXIS3D"}
    actions = {}
    for a in plan["actions"]:
        ia = _new_asset(folder, a["name"], "InputAction", "InputAction_Factory")
        ok, err = _try(ia.set_editor_property, "value_type",
                       getattr(unreal.InputActionValueType, vt[a["value_type"]]))
        if not ok:
            rep["failed"].append(("value_type", a["name"], err))
        unreal.EditorAssetLibrary.save_loaded_asset(ia)
        actions[a["name"]] = ia
        rep["actions"][a["name"]] = ia.get_path_name()
    for ctx in plan["contexts"]:
        imc = _new_asset(folder, ctx["name"], "InputMappingContext", "InputMappingContext_Factory")
        _try(imc.unmap_all)
        for mp in ctx["mappings"]:
            ok, err = _try(imc.map_key, actions[mp["action"]], make_key(mp["key"]))
            if not ok:
                rep["failed"].append(("map_key", mp["key"], err))
        prop = "mappings"
        ok, arr = _try(imc.get_editor_property, prop)
        if not ok:
            prop = "default_key_mappings"   # 5.x rename [verify]
            ok, arr = _try(imc.get_editor_property, prop)
        if ok and isinstance(arr, (list, unreal.Array)):
            new = []
            for m, mp in zip(list(arr), ctx["mappings"]):
                ok1, e1 = _try(m.set_editor_property, "modifiers",
                               [_make_modifier(unreal, imc, s) for s in mp["modifiers"]])
                ok2, e2 = _try(m.set_editor_property, "triggers",
                               [unreal.new_object(getattr(unreal, _TRIGGERS[t]), imc)
                                for t in mp["triggers"]])
                if not (ok1 and ok2):
                    rep["failed"].append(("instanced", mp["key"], e1 if not ok1 else e2))
                new.append(m)
            ok3, e3 = _try(imc.set_editor_property, prop, new)
            if not ok3:
                rep["failed"].append(("write_back", ctx["name"], e3))
        else:
            rep["failed"].append(("read_mappings", ctx["name"], arr))
        unreal.EditorAssetLibrary.save_loaded_asset(imc)
        rep["contexts"][ctx["name"]] = imc.get_path_name()
    return rep


def make_tag(name):
    """unreal.GameplayTag for a registered tag name [verify: import_text route]."""
    unreal = _u()
    lib = getattr(unreal, "BlueprintGameplayTagLibrary", None)
    for attempt in (
            lambda: lib.make_literal_gameplay_tag(name) if lib and hasattr(
                lib, "make_literal_gameplay_tag") else None,
            lambda: _tag_import(unreal, name)):
        ok, t = _try(attempt)
        if ok and t is not None:
            return t
    raise RuntimeError("cannot build GameplayTag %s (registered? restart after ini edits)" % name)


def _tag_import(unreal, name):
    t = unreal.GameplayTag()
    t.import_text('(TagName="%s")' % name)
    return t


def make_tag_container(names):
    unreal = _u()
    c = unreal.GameplayTagContainer()
    ok, _ = _try(c.import_text, "(GameplayTags=(%s))" % ",".join('(TagName="%s")' % n for n in names))
    if ok:
        return c
    lib = unreal.BlueprintGameplayTagLibrary
    return lib.make_gameplay_tag_container_from_array([make_tag(n) for n in names])


def create_gameplay_effect(folder, name, duration_policy="INSTANT", duration_s=None,
                           granted_tags=(), asset_tags=(), template=None):
    """Gameplay Effect Blueprint. template: duplicate a hand-made GE of the same shape (the
    robust path while Python instancing of GE components is [verify]). Otherwise sets the
    duration on the CDO and adds Target Tags / Asset Tags components as instanced objects.
    Cooldown GEs MUST grant a tag (5.7 validation). Returns a report with 'needs_gui'."""
    unreal = _u()
    path = "%s/%s" % (folder.rstrip("/"), name)
    rep = {"path": path, "applied": [], "needs_gui": []}
    if template:
        if not unreal.EditorAssetLibrary.does_asset_exist(path):
            unreal.EditorAssetLibrary.duplicate_asset(template, path)
        rep["applied"].append("duplicated from %s" % template)
    else:
        create_blueprint(folder, name, unreal.GameplayEffect.static_class())
    cls = unreal.EditorAssetLibrary.load_blueprint_class(path)
    cdo = unreal.get_default_object(cls)
    ok, err = _try(cdo.set_editor_property, "duration_policy",
                   getattr(unreal.GameplayEffectDurationType, duration_policy))
    (rep["applied"].append("duration_policy") if ok else rep["needs_gui"].append(("duration_policy", err)))
    if duration_s is not None:
        def _dur():
            mag = cdo.get_editor_property("duration_magnitude")
            mag.set_editor_property("scalable_float_magnitude", unreal.ScalableFloat(value=float(duration_s)))
            cdo.set_editor_property("duration_magnitude", mag)
        ok, err = _try(_dur)
        (rep["applied"].append("duration %.3fs" % duration_s) if ok else
         rep["needs_gui"].append(("duration_magnitude", err)))
    comps_prop = None
    for p in ("ge_components", "g_e_components"):
        if _try(cdo.get_editor_property, p)[0]:
            comps_prop = p
            break
    if (granted_tags or asset_tags) and comps_prop:
        def _comps():
            comps = list(cdo.get_editor_property(comps_prop))
            if granted_tags:
                c = unreal.new_object(unreal.TargetTagsGameplayEffectComponent, cdo)
                inh = c.get_editor_property("inheritable_granted_tags_container")
                inh.set_editor_property("added", make_tag_container(granted_tags))
                c.set_editor_property("inheritable_granted_tags_container", inh)
                comps.append(c)
            if asset_tags:
                c = unreal.new_object(unreal.AssetTagsGameplayEffectComponent, cdo)
                inh = c.get_editor_property("inheritable_asset_tags")
                inh.set_editor_property("added", make_tag_container(asset_tags))
                c.set_editor_property("inheritable_asset_tags", inh)
                comps.append(c)
            cdo.set_editor_property(comps_prop, comps)
        ok, err = _try(_comps)
        (rep["applied"].append("components") if ok else rep["needs_gui"].append(("components", err)))
    elif granted_tags or asset_tags:
        rep["needs_gui"].append(("components", "no GEComponents property found"))
    rep.update(compile_and_save(unreal.EditorAssetLibrary.load_asset(path)))
    return rep


def create_state_tree(folder, name, schema="ai"):
    """StateTree asset with the AI component schema (5.4) or the component schema. States,
    transitions and bindings stay editor work (no documented Python API)."""
    unreal = _u()
    path = "%s/%s" % (folder.rstrip("/"), name)
    if unreal.EditorAssetLibrary.does_asset_exist(path):
        return unreal.EditorAssetLibrary.load_asset(path)
    fac = unreal.StateTreeFactory()
    sch = unreal.StateTreeAIComponentSchema if schema == "ai" else unreal.StateTreeComponentSchema
    _try(fac.set_editor_property, "state_tree_schema_class", sch)   # [verify]
    st = unreal.AssetToolsHelpers.get_asset_tools().create_asset(name, folder, unreal.StateTree, fac)
    unreal.EditorAssetLibrary.save_loaded_asset(st)
    return st


def create_widget_blueprint(folder, name, parent_class):
    unreal = _u()
    path = "%s/%s" % (folder.rstrip("/"), name)
    if unreal.EditorAssetLibrary.does_asset_exist(path):
        return unreal.EditorAssetLibrary.load_asset(path)
    fac = unreal.WidgetBlueprintFactory()
    fac.set_editor_property("parent_class", load_class(parent_class))
    return unreal.AssetToolsHelpers.get_asset_tools().create_asset(name, folder,
                                                                   unreal.WidgetBlueprint, fac)


def build_widget_tree(wbp, tree):
    """tree: [(widget_class_name, name, parent_name or None)], root first. Names must match
    the C++ BindWidget members (HealthBar, HealthText). EditorUtilityLibrary.add_source_widget
    is in the 5.8 Python reference; widget_parent_name for the root [verify: 'None' or '']."""
    unreal = _u()
    rep = {"added": [], "failed": []}
    for cls_name, wname, parent in tree:
        existing = None
        if hasattr(unreal.EditorUtilityLibrary, "find_source_widget_by_name"):
            _ok, existing = _try(unreal.EditorUtilityLibrary.find_source_widget_by_name, wbp, wname)
        if existing and not isinstance(existing, str):
            rep["added"].append(wname + " (exists)")
            continue
        ok, w = _try(unreal.EditorUtilityLibrary.add_source_widget, wbp,
                     getattr(unreal, cls_name), wname, parent or "None")
        (rep["added"].append(wname) if ok else rep["failed"].append((wname, w)))
    rep.update(compile_and_save(wbp))
    return rep


HEALTH_BAR_TREE_HUD = [("CanvasPanel", "Root", None), ("ProgressBar", "HealthBar", "Root"),
                       ("TextBlock", "HealthText", "Root")]
HEALTH_BAR_TREE_OVERHEAD = [("SizeBox", "Root", None), ("ProgressBar", "HealthBar", "Root")]


def fill_data_table_from_csv(table_path, csv_path):
    unreal = _u()
    table = unreal.EditorAssetLibrary.load_asset(table_path)
    ok = unreal.DataTableFunctionLibrary.fill_data_table_from_csv_file(table, csv_path)
    unreal.EditorAssetLibrary.save_loaded_asset(table)
    return bool(ok)


def console(cmd, world=None):
    unreal = _u()
    unreal.SystemLibrary.execute_console_command(world, cmd)


def game_world():
    unreal = _u()
    return unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_game_world()


def configure_play(num_players=None, net_mode=None, new_window=None):
    """Level Editor Play Settings CDO [verify property names]."""
    unreal = _u()
    s = unreal.get_default_object(unreal.LevelEditorPlaySettings)
    rep = {}
    if num_players is not None:
        rep["play_number_of_clients"] = _try(s.set_editor_property, "play_number_of_clients",
                                             int(num_players))[0]
    if net_mode is not None:
        rep["play_net_mode"] = _try(s.set_editor_property, "play_net_mode",
                                    getattr(unreal.PlayNetMode, net_mode))[0]
    if new_window is not None:
        rep["new_window"] = _try(s.set_editor_property, "last_executed_play_mode_type",
                                 getattr(unreal.PlayModeType, "PLAY_MODE_IN_EDITOR_FLOATING"
                                         if new_window else "PLAY_MODE_IN_VIEWPORT"))[0]
    return rep


def _vec(v):
    return [round(float(v.x), 3), round(float(v.y), 3), round(float(v.z), 3)]


def _sample(world, pawn, spec, t, extra_actors):
    _u()
    s = {"t": round(t, 4)}
    for item in spec:
        if item == "loc":
            s["loc"] = _vec(pawn.get_actor_location())
        elif item == "vel":
            s["vel"] = _vec(pawn.get_velocity())
        elif item == "jump_count":
            ok, v = _try(pawn.get_editor_property, "jump_current_count")
            s["jump_count"] = v if ok else None
        elif item == "falling":
            ok, v = _try(lambda: pawn.get_editor_property("character_movement").is_falling())
            s["falling"] = v if ok else None
        elif item == "health":
            ok, v = _try(pawn.get_health)
            s["health"] = v if ok else None
            ok, v = _try(pawn.get_max_health)
            s["max_health"] = v if ok else None
        elif item.startswith("tag:"):
            ok, v = _try(pawn.has_gameplay_tag_by_name, item[4:])
            s[item] = v if ok else None
        elif item == "enemy" and extra_actors.get("enemy") is not None:
            s["enemy"] = _vec(extra_actors["enemy"].get_actor_location())
        elif item == "enemy_state" and extra_actors.get("enemy") is not None:
            ctrl = extra_actors["enemy"].get_controller()
            ok, v = _try(ctrl.get_editor_property, "debug_state_name") if ctrl else (False, None)
            s["enemy_state"] = str(v) if ok and str(v) not in ("None", "") else None
        elif item == "widget_percent":
            w = extra_actors.get("widget")
            ok, v = _try(w.get_displayed_percent) if w is not None else (False, None)
            s["widget_percent"] = v if ok else None
    return s


def as_automation_latent(gen):
    """Adapt a pie_scenario generator (yields seconds or None) to AutomationScheduler latent
    commands, which only understand bare `yield`. Returns the generator's return value."""
    try:
        step = next(gen)
        while True:
            if isinstance(step, (int, float)) and step > 0:
                wake = time.time() + float(step)
                while time.time() < wake:
                    yield
            else:
                yield
            step = next(gen)
    except StopIteration as stop:
        return stop.value


def pie_scenario(scenario, out_dir=None, settle_s=1.0, timeout_s=30.0):
    """Generator for latent jobs (ue_run mode='latent') or, through as_automation_latent, for
    PythonAutomationTest. Starts PIE, finds the player pawn, runs steps, samples every tick,
    stops PIE and RETURNS {samples, marks, screenshots, props, errors}.

    Steps: tap / press / release {key, hold}, wait {s | 'cooldown'}, wait_until {cond: apex |
    landed, timeout}, mark {name}, console {cmd}, screenshot {name}, teleport_player {to:
    [x,y,z] | 'far' | 'in_sight'} (far and in_sight read scenario['places']).
    Input injection: 'Input.+key <Key>' / 'Input.-key <Key>' (framework doc, Injecting Input)."""
    unreal = _u()
    les = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    res = {"samples": [], "marks": [], "screenshots": [], "props": {}, "errors": []}
    if scenario.get("map"):
        les.load_level(scenario["map"])
    les.editor_request_begin_play()
    t_start = time.time()
    world = pawn = None
    while time.time() - t_start < timeout_s:
        world = game_world()
        if world is not None:
            pawn = unreal.GameplayStatics.get_player_pawn(world, 0)
            if pawn is not None:
                break
        yield 0.1
    if pawn is None:
        les.editor_request_end_play()
        res["errors"].append("PIE did not start or no player pawn within %ss" % timeout_s)
        return res
    yield settle_s
    extra = {}
    enemy_cls = scenario.get("enemy_class")
    if enemy_cls:
        found = unreal.GameplayStatics.get_all_actors_of_class(world, load_class(enemy_cls))
        extra["enemy"] = found[0] if found else None
    widget_cls = scenario.get("widget_class")
    if widget_cls:
        ok, ws = _try(unreal.WidgetBlueprintLibrary.get_all_widgets_of_class, world,
                      load_class(widget_cls), True)
        extra["widget"] = ws[0] if ok and ws else None
    ok, cm = _try(pawn.get_editor_property, "character_movement")
    if ok:
        for p in ("jump_z_velocity", "gravity_scale", "max_walk_speed") + tuple(CMC_DEFAULTS):
            got, v = _try(cm.get_editor_property, p)
            if got:
                res["props"][p] = v
    t0 = time.time()
    spec = scenario.get("sample", ["loc"])

    def now():
        return time.time() - t0

    def sample():
        res["samples"].append(_sample(world, pawn, spec, now(), extra))

    places = scenario.get("places", {})
    cooldown = scenario.get("params", {}).get("cooldown_s", 1.0)
    for step in scenario["steps"]:
        kind = step["do"]
        if kind in ("tap", "press"):
            console("Input.+key %s" % step["key"], world)
            if kind == "tap":
                end = time.time() + float(step.get("hold", 0.05))
                while time.time() < end:
                    sample()
                    yield
                console("Input.-key %s" % step["key"], world)
        elif kind == "release":
            console("Input.-key %s" % step["key"], world)
        elif kind == "wait":
            dur = cooldown if step["s"] == "cooldown" else float(step["s"])
            end = time.time() + dur
            while time.time() < end:
                sample()
                yield
        elif kind == "wait_until":
            end = time.time() + float(step.get("timeout", 3.0))
            while time.time() < end:
                sample()
                vz = pawn.get_velocity().z
                if step["cond"] == "apex" and vz <= 0.0 and len(res["samples"]) > 2:
                    break
                if step["cond"] == "landed":
                    ok, falling = _try(lambda: pawn.get_editor_property("character_movement")
                                       .is_falling())
                    if ok and not falling and abs(vz) < 1.0:
                        break
                yield
        elif kind == "mark":
            res["marks"].append({"name": step["name"], "t": round(now(), 4)})
        elif kind == "console":
            console(step["cmd"], world)
            yield
        elif kind == "teleport_player":
            to = step["to"]
            loc = places.get(to, to) if isinstance(to, str) else to
            if isinstance(loc, (list, tuple)):
                pawn.set_actor_location(unreal.Vector(*[float(x) for x in loc]), False, True)
            else:
                res["errors"].append("teleport target %r unknown (set scenario['places'])" % to)
            yield
        elif kind == "screenshot":
            if out_dir:
                try:
                    sys.path.insert(0, os.path.join(_HERE, "..", "..", "scenario-unreal-expert", "scripts"))
                    import ue_review
                    req = ue_review.screenshot(os.path.join(out_dir, step["name"] + ".png"),
                                               1280, 720)
                    path = yield from ue_review.wait_screenshot(req, timeout=30)
                    res["screenshots"].append(path)
                except Exception as exc:  # noqa: BLE001
                    res["errors"].append("screenshot %s: %s" % (step["name"], exc))
        else:
            res["errors"].append("unknown step %r" % kind)
    les.editor_request_end_play()
    yield 0.5
    return res


def gameplay_asset_facts(paths):
    """Facts per Blueprint for the audit: parent class, tick settings, ability cooldown class,
    GE duration policy, widget bindings count [verify property names]."""
    unreal = _u()
    ar = unreal.AssetRegistryHelpers.get_asset_registry()
    facts = []
    for root in paths:
        for p in unreal.EditorAssetLibrary.list_assets(root, recursive=True, include_folder=False):
            asset = unreal.EditorAssetLibrary.load_asset(p)
            if not isinstance(asset, unreal.Blueprint):
                continue
            f = {"path": p.split(".")[0], "class": type(asset).__name__}
            ok, cls = _try(unreal.EditorAssetLibrary.load_blueprint_class, f["path"])
            if not ok or cls is None:
                facts.append(f)
                continue
            cdo = unreal.get_default_object(cls)
            f["parent"] = str(cls.get_super_class().get_name()) if hasattr(cls, "get_super_class") else "?"
            ok, tick = _try(cdo.get_editor_property, "primary_actor_tick")
            if ok:
                for k in ("can_ever_tick", "start_with_tick_enabled", "tick_interval"):
                    f["tick_" + k] = _try(tick.get_editor_property, k)[1]
            if isinstance(cdo, getattr(unreal, "GameplayAbility", ())):
                f["cooldown_ge"] = str(_try(cdo.get_editor_property,
                                            "cooldown_gameplay_effect_class")[1])
            if isinstance(asset, getattr(unreal, "WidgetBlueprint", ())):
                ok, b = _try(asset.get_editor_property, "bindings")
                f["widget_bindings"] = len(b) if ok and b is not None else None
            ok, deps = _try(ar.get_dependencies, f["path"],
                            unreal.AssetRegistryDependencyOptions(
                                include_soft_package_references=False,
                                include_hard_package_references=True,
                                include_searchable_names=False,
                                include_soft_management_references=False,
                                include_hard_management_references=False))
            f["hard_deps"] = [str(d) for d in deps] if ok and deps else []
            facts.append(f)
    return facts


def audit_gameplay(paths, always_loaded=(), heavy_markers=("Boss", "Vehicle", "Cinematic")):
    """Gameplay audit: unjustified ticking Blueprints, abilities without cooldown class when
    named like a cooldown ability, widget property bindings, hard-reference closure of
    always-loaded classes. Pure verdicts come from the offline layer."""
    facts = gameplay_asset_facts(paths)
    lines = []
    census = {}
    for f in facts:
        if f.get("tick_start_with_tick_enabled") is True and f.get("tick_can_ever_tick") is True:
            census[f["path"].split("/")[-1]] = {"total": 1, "enabled": 1, "disabled": 0}
        if f.get("widget_bindings"):
            lines.append("error: %s has %d property bindings: events or MVVM (Albert)"
                         % (f["path"], f["widget_bindings"]))
    tv = tick_verdict(census, justified=())
    lines += tv["lines"]
    closures = {f["path"]: f.get("hard_deps", []) for f in facts if f["path"] in always_loaded}
    hv = hard_ref_verdict(closures, heavy_markers=heavy_markers)
    lines += hv["lines"]
    return {"facts": facts, "lines": lines,
            "ok": not any(x.startswith("error") for x in lines)}


def ai_setup_facts(enemy_bp, controller_component_prop="state_tree_component",
                   tree_spec=None):
    """In-editor facts for ai_setup_verdict [verify property names with the probe]: the enemy
    CDO's ai_controller_class and auto_possess_ai, the controller CDO's StateTree reference,
    a NavMeshBoundsVolume in the loaded level."""
    unreal = _u()
    cdo = unreal.get_default_object(unreal.EditorAssetLibrary.load_blueprint_class(enemy_bp))
    facts = {"pawn": enemy_bp, "tree_spec": tree_spec}
    ok, ctrl = _try(cdo.get_editor_property, "ai_controller_class")
    facts["ai_controller_class"] = ctrl.get_path_name() if ok and ctrl else None
    ok, ap = _try(cdo.get_editor_property, "auto_possess_ai")
    facts["auto_possess_ai"] = str(ap) if ok else None
    facts["controller_state_tree"] = None
    if ok and ctrl:
        ccdo = unreal.get_default_object(ctrl)
        for prop in (controller_component_prop, "state_tree_component", "brain_component"):
            got, comp = _try(ccdo.get_editor_property, prop)
            if not got or comp is None:
                continue
            for tp in ("state_tree_ref", "state_tree"):
                g2, ref = _try(comp.get_editor_property, tp)
                if g2 and ref is not None:
                    g3, st = _try(ref.get_editor_property, "state_tree") if tp == "state_tree_ref" \
                        else (True, ref)
                    if g3 and st:
                        facts["controller_state_tree"] = st.get_path_name()
                    break
            break
    eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    facts["nav_bounds"] = any(isinstance(a, unreal.NavMeshBoundsVolume)
                              for a in eas.get_all_level_actors())
    return facts


def set_state_tree_parameters(controller_bp, params, component_prop="state_tree_component"):
    """Per-enemy tuning as StateTree PARAMETERS on the component's State Tree Reference
    (Mononen YEmq4kcblj4 [00:16:40]; BAU digest P4 step 3). Property bags from Python are
    [verify]: every failure is reported with the GUI path (gui-paths.md, StateTree)."""
    unreal = _u()
    cdo = unreal.get_default_object(unreal.EditorAssetLibrary.load_blueprint_class(controller_bp))
    rep = {"applied": [], "needs_gui": []}
    ok, comp = _try(cdo.get_editor_property, component_prop)
    if not ok or comp is None:
        return {"applied": [], "needs_gui": [("component", comp)]}
    ok, ref = _try(comp.get_editor_property, "state_tree_ref")
    if not ok:
        return {"applied": [], "needs_gui": [("state_tree_ref", ref)]}
    ok, bag = _try(ref.get_editor_property, "parameters")
    for name, value in params.items():
        done = False
        if ok and bag is not None:
            for setter in ("set_value_float", "set_value_double", "set_value"):
                fn = getattr(bag, setter, None)
                if fn is None:
                    continue
                good, _err = _try(fn, name, value)
                if good:
                    done = True
                    break
        (rep["applied"].append(name) if done else rep["needs_gui"].append((name, value)))
    if rep["applied"]:
        _try(ref.set_editor_property, "parameters", bag)
        _try(comp.set_editor_property, "state_tree_ref", ref)
        rep.update(compile_and_save(unreal.EditorAssetLibrary.load_asset(controller_bp)))
    return rep


def make_fixed_magnitude_variant(src_path, dst_path, value):
    """Duplicate a GE whose modifiers use SetByCaller and switch every modifier to a fixed
    Scalable Float magnitude (the console isolation twin, ge_plan_verdict). Struct access to
    FGameplayEffectModifierMagnitude is [verify]; on failure build the twin once in the GUI
    (gui-paths.md, GAS assets)."""
    unreal = _u()
    rep = {"path": dst_path, "applied": [], "needs_gui": []}
    if not unreal.EditorAssetLibrary.does_asset_exist(dst_path):
        unreal.EditorAssetLibrary.duplicate_asset(src_path, dst_path)
    cdo = unreal.get_default_object(unreal.EditorAssetLibrary.load_blueprint_class(dst_path))

    def _switch():
        mods = list(cdo.get_editor_property("modifiers"))
        for m in mods:
            mag = m.get_editor_property("modifier_magnitude")
            mag.set_editor_property("magnitude_calculation_type",
                                    unreal.GameplayEffectMagnitudeCalculation.SCALABLE_FLOAT)
            mag.set_editor_property("scalable_float_magnitude",
                                    unreal.ScalableFloat(value=float(value)))
            m.set_editor_property("modifier_magnitude", mag)
        cdo.set_editor_property("modifiers", mods)
        return len(mods)
    ok, n = _try(_switch)
    (rep["applied"].append("%s modifiers fixed at %s" % (n, value)) if ok else
     rep["needs_gui"].append(("modifiers", n)))
    rep.update(compile_and_save(unreal.EditorAssetLibrary.load_asset(dst_path)))
    return rep
