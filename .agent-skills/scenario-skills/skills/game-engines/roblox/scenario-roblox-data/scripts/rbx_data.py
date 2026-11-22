#!/usr/bin/env python3
"""Data-layer helpers for scenario-roblox-data, on top of the scenario-roblox-expert toolkit.

    budget(players, ccu, kb, saves_per_min=1) -> dict        DataStore limits for a save plan
    fetch_profilestore(dest) -> Path                          ProfileStore at the pinned commit
    build_place(dir, name=None, profilestore=None) -> Path    test place: DataKit + ProfileStore + src/
    data_kit(names) -> str                                    data modules as Luau locals (for rbx_run)
    run(studio, code, dm="Edit", data=(), kit=(), timeout=None) -> dict   rbx_run.run with data modules
    probe_services(studio, dm="Edit") -> dict                 what DataStore, MemoryStore, Messaging do here
    audit_place(place) -> dict                                DataAudit over a .rbxl, offline (Lune)
    rtbf_config(templates) -> (dict, list)                    RTBF deletion templates as the Open Cloud config
    rtbf_uncovered(templates, keys) -> list                   keys the templates would not delete
    offline(tests_dir) -> int                                 run the Lune suites (exit code)

The data modules (agentkit/data/*.luau) have no requires: inline them with data_kit() in any data
model, or build them into a place as ServerStorage.DataKit with build_place().

CLI:
  rbx_data.py budget --players 20 --ccu 2000 --kb 40 [--saves 2]
  rbx_data.py fetch-profilestore DEST_DIR
  rbx_data.py build-place DIR [--name N]
  rbx_data.py audit PLACE.rbxl
  rbx_data.py rtbf TEMPLATES.json        (prints the user_data_templates config and its problems)
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1].parent / "scenario-roblox-expert" / "scripts"))
import rbx_env  # noqa: E402
import rbx_run  # noqa: E402

__version__ = "0.1.0"

DATA_DIR = Path(__file__).resolve().parent / "agentkit" / "data"
# Modules built into a place (the lune_* entry points are Lune-only).
STUDIO_MODULES = ("MockDataStore", "ServerSim", "DataCheck", "Migrate", "KeyQueue", "Receipts", "Trade",
                  "PlayerData", "SafeTeleport", "DataAudit")
PROFILESTORE_REPO = "MadStudioRoblox/ProfileStore"
PROFILESTORE_COMMIT = "45c9847cbcf1fc260369c50eb335aba7c35aecdd"
PROFILESTORE_SHA256 = "ad43737203688b8e88cab34ebe8c483000c157e53bfb41e35f1b49ee89d0c95f"

# Roblox docs, data-stores/error-codes-and-limits (2026): per minute.
SERVER = {"read": (60, 40), "write": (60, 40), "list": (5, 2), "remove": (60, 40)}
EXPERIENCE = {"read": (300, 40), "write": (300, 20), "list": (300, 2), "remove": (300, 40)}
KEY_WRITE_KB_PER_MIN = 4 * 1024
KEY_READ_KB_PER_MIN = 25 * 1024
MAX_VALUE_CHARS = 4_194_304


def budget(players: int, ccu: int, kb: float, saves_per_min: float = 1.0, servers: int | None = None) -> dict:
    """Requests per minute a save plan needs against the per-server, experience and per-key limits.

    One ProfileStore save is one UpdateAsync, which spends one read and one write."""
    kb_req = max(1, math.ceil(kb))
    server_write = SERVER["write"][0] + SERVER["write"][1] * players
    exp_write = EXPERIENCE["write"][0] + EXPERIENCE["write"][1] * ccu
    need_server = players * saves_per_min
    need_exp = ccu * saves_per_min
    return {
        "server_write_limit": server_write,
        "server_write_needed": need_server,
        "server_share": round(need_server / server_write, 3),
        "experience_write_limit": exp_write,
        "experience_write_needed": need_exp,
        "experience_share": round(need_exp / exp_write, 3),
        "key_kb_per_write": kb_req,
        "key_max_writes_per_min": KEY_WRITE_KB_PER_MIN // kb_req,
        "value_share_of_limit": round(kb * 1024 / MAX_VALUE_CHARS, 4),
        "ok": need_server <= server_write and need_exp <= exp_write and saves_per_min <= KEY_WRITE_KB_PER_MIN // kb_req,
    }


def fetch_profilestore(dest: str | Path) -> Path:
    """Download ProfileStore.luau at the pinned commit and check its hash. Apache-2.0 (loleris)."""
    d = Path(dest)
    d.mkdir(parents=True, exist_ok=True)
    out = d / "ProfileStore.luau"
    url = f"https://raw.githubusercontent.com/{PROFILESTORE_REPO}/{PROFILESTORE_COMMIT}/ProfileStore.luau"
    data = urllib.request.urlopen(url, timeout=60).read()
    digest = hashlib.sha256(data).hexdigest()
    if digest != PROFILESTORE_SHA256:
        raise RuntimeError(f"ProfileStore hash mismatch: {digest}")
    out.write_bytes(data)
    (d / "PROFILESTORE_COMMIT").write_text(PROFILESTORE_COMMIT + "\n")
    return out


def build_place(dir: str | Path, name: str | None = None, profilestore: str | Path | None = None) -> Path:
    """Build a local test place: ServerStorage.DataKit (these modules), ServerStorage.Packages.ProfileStore,
    ServerScriptService.DataService from <dir>/src/DataService.server.luau when present, and
    ServerStorage.Fixtures from <dir>/src/fixtures when present. Nothing is published."""
    d = Path(dir).resolve()
    ps = Path(profilestore) if profilestore else d / "vendor" / "ProfileStore.luau"
    if not ps.exists():
        ps = fetch_profilestore(ps.parent)
    kit: dict = {"$className": "Folder"}
    for n in STUDIO_MODULES:
        kit[n] = {"$path": os.path.relpath(DATA_DIR / f"{n}.luau", d)}
    tree: dict = {"ServerStorage": {
        "DataKit": kit,
        "Packages": {"$className": "Folder", "ProfileStore": {"$path": os.path.relpath(ps, d)}},
    }}
    if (d / "src" / "DataService.server.luau").exists():
        tree["ServerScriptService"] = {"DataService": {"$path": "src/DataService.server.luau"}}
    if (d / "src" / "fixtures").is_dir():
        tree["ServerStorage"]["Fixtures"] = {"$path": "src/fixtures"}
    return rbx_env.new_place(d, name=name, src=tree)


def data_kit(names: list[str] | tuple[str, ...]) -> str:
    """Luau that defines each data module (MockDataStore, KeyQueue, ...) as a local of the same name."""
    parts = []
    for n in names:
        src = (DATA_DIR / f"{n}.luau").read_text()
        src = re.sub(r"^--!\w+\n", "", src)
        parts.append(f"local {n} = (function()\n{src}\nend)()")
    return "\n".join(parts) + "\n" if parts else ""


def run(studio, code: str, dm: str = "Edit", data: list[str] | tuple[str, ...] = (),
        kit: list[str] | tuple[str, ...] = (), timeout: float | None = None) -> dict:
    """rbx_run.run with data modules inlined before `code`; error line numbers point into `code`."""
    head = data_kit(data)
    r = rbx_run.run(studio, head + code, dm=dm, timeout=timeout, kit=kit)
    shift = head.count("\n")
    if shift and r.get("error"):
        r["error"] = re.sub(r":(\d+)(?=[:\s]|$)", lambda m: f":{max(1, int(m[1]) - shift)}", r["error"])
    return r


PROBE = r'''
local out = {}
-- Each call runs in its own thread with a 10 s deadline: some calls never return (MessagingService
-- in an unpublished playtest), and one hung call must not hide the others.
local function try(name, fn)
	local done = false
	task.spawn(function()
		local ok, res = pcall(fn)
		out[name] = { ok = ok, value = if ok then (if type(res) == "table" then res else tostring(res)) else tostring(res) }
		done = true
	end)
	local t0 = os.clock()
	while not done and os.clock() - t0 < 10 do
		task.wait(0.05)
	end
	if not done then
		out[name] = { ok = false, value = "no answer within 10 s" }
	end
end
local DSS = game:GetService("DataStoreService")
try("GetDataStore", function() return DSS:GetDataStore("ProbeStore") ~= nil end)
try("GetAsync", function() return DSS:GetDataStore("ProbeStore"):GetAsync("probe") end)
try("SetAsync", function() return DSS:GetDataStore("ProbeStore"):SetAsync("probe", 1) end)
try("UpdateAsync", function() return DSS:GetDataStore("ProbeStore"):UpdateAsync("probe", function(v) return (v or 0) + 1 end) end)
try("OrderedGetSorted", function() return DSS:GetOrderedDataStore("ProbeBoard"):GetSortedAsync(false, 10) ~= nil end)
try("budgets", function()
	local b = {}
	for _, item in ipairs(Enum.DataStoreRequestType:GetEnumItems()) do
		local ok, v = pcall(DSS.GetRequestBudgetForRequestType, DSS, item)
		b[item.Name] = if ok then v else "error: " .. tostring(v)
	end
	return b
end)
try("MemoryStoreSortedMap", function() return game:GetService("MemoryStoreService"):GetSortedMap("ProbeMap"):SetAsync("k", 1, 30) end)
try("MemoryStoreQueue", function() return game:GetService("MemoryStoreService"):GetQueue("ProbeQueue"):AddAsync("v", 30) end)
try("MessagingPublish", function() return game:GetService("MessagingService"):PublishAsync("ProbeTopic", "hi") end)
try("MessagingSubscribe", function() return game:GetService("MessagingService"):SubscribeAsync("ProbeTopic", function() end) ~= nil end)
try("GetOptions", function() local o = Instance.new("DataStoreGetOptions") o.UseCache = false return o.UseCache end)
try("JSONEncodeNaN", function() return game:GetService("HttpService"):JSONEncode({ x = 0 / 0, y = math.huge }) end)
try("JSONEncodeSparse", function() return game:GetService("HttpService"):JSONEncode({ [1] = "a", [3] = "c" }) end)
try("JSONEncodeMixed", function() return game:GetService("HttpService"):JSONEncode({ "a", b = 1 }) end)
out.context = { gameId = game.GameId, placeId = game.PlaceId, jobId = game.JobId, isStudio = game:GetService("RunService"):IsStudio() }
return out
'''


def probe_services(studio, dm: str = "Edit") -> dict:
    """What the data services answer in this data model (an unpublished place: errors, with their text).

    The probe writes nothing to Roblox in an unpublished place: every call is rejected first.
    In a published place with Studio API access on, SetAsync and UpdateAsync write to key "probe"."""
    return rbx_run.run(studio, PROBE, dm=dm, timeout=120)


def audit_place(place: str | Path) -> dict:
    """DataAudit over a place file, offline with Lune (@lune/roblox)."""
    script = DATA_DIR / "lune_data_audit.luau"
    r = subprocess.run(["lune", "run", str(script), str(Path(place).resolve())], capture_output=True, text=True,
                       timeout=300)
    if r.returncode != 0:
        raise RuntimeError(r.stderr or r.stdout)
    return json.loads(r.stdout)


RTBF_TOKEN = "{UserId}"  # case-sensitive: "{userId}" or "{USERID}" never match
RTBF_MAX_TEMPLATES = 100


def rtbf_config(templates: list[dict]) -> tuple[dict, list[str]]:
    """Right-to-be-forgotten deletion templates as the Open Cloud `user_data_templates` config.

    Each template is {"store": NAME, "key": PATTERN, "scope": PATTERN?, "ordered": bool?} for keys,
    or {"store_pattern": PATTERN} for a whole standard data store. The user id must sit in a static
    pattern of the name, key or scope. Returns (config, problems); publish only with no problems."""
    problems: list[str] = []
    out: list[dict] = []
    if len(templates) > RTBF_MAX_TEMPLATES:
        problems.append(f"{len(templates)} templates: the limit is {RTBF_MAX_TEMPLATES}")
    for t in templates:
        if "store_pattern" in t:
            fields = [t["store_pattern"]]
            out.append({"data_store_template": {"data_store_type": "STANDARD", "data_store_pattern": t["store_pattern"]}})
        else:
            scope = t.get("scope") or "global"  # a blank scope means "global"
            fields = [t["store"], t["key"], scope]
            out.append({"key_template": {"data_store_type": "ORDERED" if t.get("ordered") else "STANDARD",
                                         "data_store_name": t["store"], "key_pattern": t["key"],
                                         "scope_pattern": scope}})
        joined = " ".join(fields)
        if RTBF_TOKEN not in joined:
            wrong = re.search(r"\{userid\}", joined, re.I)
            problems.append(f"{joined!r}: " + (f"token {wrong.group(0)} must be spelled {RTBF_TOKEN} (case-sensitive)"
                                                if wrong else f"no {RTBF_TOKEN} token: nothing would be deleted"))
    return {"user_data_templates": out}, problems


def _rtbf_regex(pattern: str) -> re.Pattern:
    return re.compile("^" + re.escape(pattern).replace(re.escape(RTBF_TOKEN), r"\d+") + "$")


def rtbf_uncovered(templates: list[dict], keys: list[dict]) -> list[dict]:
    """Keys ({"store", "key", "scope"?}) that no template matches, so an erasure request leaves them.

    An uncovered key is fine only when its value holds no personal data (a trade-log record that
    stores just the outcome); otherwise key it by user id or delete it from the erasure webhook."""
    left = []
    for k in keys:
        scope = k.get("scope") or "global"
        hit = False
        for t in templates:
            if "store_pattern" in t:
                hit = bool(_rtbf_regex(t["store_pattern"]).match(k["store"]))
            else:
                hit = (t["store"] == k["store"] and bool(_rtbf_regex(t["key"]).match(k["key"]))
                       and bool(_rtbf_regex(t.get("scope") or "global").match(scope)))
            if hit:
                break
        if not hit:
            left.append(k)
    return left


def offline(tests_dir: str | Path) -> int:
    """Run every Lune suite in <tests_dir>/lune (files not starting with '_'). Returns the exit code."""
    d = Path(tests_dir).resolve() / "lune"
    failed = 0
    for f in sorted(d.glob("*.luau")):
        if f.name.startswith(("_", "smoke")):
            continue
        r = subprocess.run(["lune", "run", f.name], cwd=d, capture_output=True, text=True, timeout=900)
        print(r.stdout.strip().splitlines()[-1] if r.stdout.strip() else f"{f.name}: no output")
        if r.returncode != 0:
            failed += 1
            print(r.stdout[-3000:], r.stderr[-3000:])
    return 1 if failed else 0


def _main(argv: list[str]) -> int:
    import argparse
    p = argparse.ArgumentParser(prog="rbx_data.py")
    sub = p.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("budget")
    b.add_argument("--players", type=int, required=True)
    b.add_argument("--ccu", type=int, required=True)
    b.add_argument("--kb", type=float, required=True)
    b.add_argument("--saves", type=float, default=1.0)
    f = sub.add_parser("fetch-profilestore")
    f.add_argument("dest")
    bp = sub.add_parser("build-place")
    bp.add_argument("dir")
    bp.add_argument("--name")
    a = sub.add_parser("audit")
    a.add_argument("place")
    r = sub.add_parser("rtbf")
    r.add_argument("templates")
    args = p.parse_args(argv)
    if args.cmd == "budget":
        print(json.dumps(budget(args.players, args.ccu, args.kb, args.saves), indent=1))
    elif args.cmd == "fetch-profilestore":
        print(fetch_profilestore(args.dest))
    elif args.cmd == "build-place":
        print(build_place(args.dir, args.name))
    elif args.cmd == "audit":
        r = audit_place(args.place)
        print(json.dumps(r, indent=1))
        return 1 if any(x["severity"] == "error" for x in r["findings"]) else 0
    elif args.cmd == "rtbf":
        config, problems = rtbf_config(json.loads(Path(args.templates).read_text()))
        print(json.dumps({"config": config, "problems": problems}, indent=1))
        return 1 if problems else 0
    return 0


if __name__ == "__main__":
    sys.exit(_main(sys.argv[1:]))
