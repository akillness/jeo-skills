"""
ut_mobile: the scenario-unity-mobile skill's runner-side helpers. System python3 3.9+, stdlib only.
Imports the shared toolkit (ut_env, ut_run, ut_stat) from the scenario-unity-expert skill; never copies it.

    import sys; sys.path.insert(0, "<skills>/scenario-unity-mobile/scripts")
    import ut_mobile                      # also puts <skills>/scenario-unity-expert/scripts on sys.path
    P = ut_mobile.install("tests/projects/unity-mobile")          # AgentKit core + Mobile jobs + runtime
    r = ut_mobile.ut_run.run_method(P, "AgentKit.Mobile.MobileTextures.AuditTextures", {}, build_target="Android")
    ks = ut_mobile.make_keystore("Keystores/upload.keystore", "upload", storepass, keypass)
    b = ut_mobile.ut_run.run_method(P, "AgentKit.Mobile.MobileBuild.BuildAndroid", {...}, build_target="Android",
                                    env=ut_mobile.keystore_env(ks))           # passwords via env, never args.json
    ut_mobile.aab_facts(".../Game.aab"); ut_mobile.bundletool_sizes(".../Game.aab", out_dir)
    ut_mobile.xcode_facts(".../Builds/iOS"); ut_mobile.code_scan(P); ut_mobile.budget_verdict(csv, fps=60)
    ut_mobile.aab_findings(facts, ads=True); ut_mobile.xcode_findings(x, ads=True); ut_mobile.package_check(P)
    ut_mobile.ios_archive_plan(".../Builds/iOS", team_id=...)   # commands for the human's Apple account
    ut_mobile.soak_verdict(device_csv, fps=30)                    # DeviceSoakLogger CSV pulled from a phone

Run on real outputs of Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-mobile/ (see run_all.sh).
"""

__version__ = "0.1"  # Unity Expert Skills v0.1 (2026-09-24, refactor after the Y11 blind grade)

import glob
import json
import os
import plistlib
import re
import shutil
import struct
import subprocess
import sys
import wave
import zipfile
import zlib
from pathlib import Path

HERE = os.path.dirname(os.path.abspath(__file__))
SKILL_DIR = os.path.dirname(HERE)
SKILLS = os.path.dirname(SKILL_DIR)
EXPERT_SCRIPTS = os.path.join(SKILLS, "scenario-unity-expert", "scripts")
if EXPERT_SCRIPTS not in sys.path:
    sys.path.insert(0, EXPERT_SCRIPTS)

import ut_env   # noqa: E402
import ut_run   # noqa: E402, F401  re-exported: references/procedures.md imports it from here
import ut_stat  # noqa: E402

AGENTKIT_SRC = os.path.join(HERE, "AgentKit")      # -> Assets/Editor/AgentKit/Mobile/
RUNTIME_SRC = os.path.join(HERE, "Runtime")        # -> Assets/AgentMobile/Runtime/ (player code, own asmdef)
RUNTIME_DST = os.path.join("Assets", "AgentMobile", "Runtime")

MOBILE_HEADROOM = 0.65   # Unity mobile e-book: use about 65% of the frame for sustained (thermal) play
PLAY_TARGET_API = 36     # Google Play: new apps and updates since 2026-08-31
AAB_BASE_LIMIT_MB = 200  # Google Play base module (6.3 Manual)
APK_LIMIT_MB = 100
IOS_OTA_LIMIT_MB = 200   # App Store cellular download limit quoted by the 6.3 Manual
PAGE_16KB = 0x4000       # Android 15+ 16 KB pages: every LOAD segment of every .so aligned to 16 KB (deltas § 12)
AD_ID_PERMISSION = "com.google.android.gms.permission.AD_ID"


# ============================================================================ install
def install(project, runtime=True):
    """AgentKit core + Mobile editor jobs (Assets/Editor/AgentKit/Mobile) + runtime components
    (Assets/AgentMobile/Runtime, asmdef AgentKit.Mobile.Runtime). Returns the project root."""
    root = ut_env.find_project(project)["root"]
    ut_env.install_agentkit(root)
    ut_env.install_agentkit(root, src=AGENTKIT_SRC)
    if runtime:
        # Runtime/ (AgentKit.Mobile.Runtime) plus Iap5/ and LevelPlay9/ adapters, each its own asmdef
        # gated by versionDefines: they compile only when IAP >= 5 / LevelPlay >= 9 are installed.
        dst_root = os.path.join(root, RUNTIME_DST)
        for dp, _dn, fns in os.walk(RUNTIME_SRC):
            for fn in fns:
                if not fn.endswith((".cs", ".asmdef")):
                    continue
                s = os.path.join(dp, fn)
                d = os.path.join(dst_root, os.path.relpath(s, RUNTIME_SRC))
                os.makedirs(os.path.dirname(d), exist_ok=True)
                if not os.path.isfile(d) or Path(s).read_bytes() != Path(d).read_bytes():
                    shutil.copyfile(s, d)
    return root


# ============================================================================ budgets
def budgets(fps, headroom=MOBILE_HEADROOM):
    """Raw and sustained frame budgets in ms: 60 fps -> 16.67 / 10.83; 30 fps -> 33.33 / 21.67."""
    raw = 1000.0 / float(fps)
    return {"fps": fps, "raw_ms": round(raw, 3), "sustained_ms": round(raw * headroom, 3), "headroom": headroom}


def budget_verdict(csv_path, fps, column=None, skip=0, editor=True):
    """Frame CSV (AgentKit.AgentProfile) against the raw and the 65% sustained budget.
    Picks cpu_frame_ms, else main_thread_ms. Editor Play mode is for relative iteration only:
    the verdict for a device comes from a development player on the lowest target phone."""
    fr = ut_stat.read_frame_csv(csv_path)
    col = column or ("cpu_frame_ms" if "cpu_frame_ms" in fr else "main_thread_ms")
    b = budgets(fps)
    raw = ut_stat.budget_check(fr[col], b["raw_ms"], skip=skip)
    sus = ut_stat.budget_check(fr[col], b["sustained_ms"], skip=skip)
    gc = ut_stat.gc_check(fr["gc_alloc_bytes"]) if "gc_alloc_bytes" in fr else None
    out = {"column": col, "budgets": b, "raw": raw, "sustained": sus, "gc": gc,
           "verdict": sus["verdict"], "frames": raw.get("n")}
    if editor:
        out["caveat"] = ("Editor Play mode on the Mac: relative numbers only; the device verdict needs a development "
                         "player on the lowest target phone, 10 to 15 min cooldown between captures (e-book)")
    return out


# ============================================================================ Android signing
def java_home(version=ut_env.DEFAULT_VERSION):
    return os.path.join(ut_env.HUB_EDITORS, version, "PlaybackEngines", "AndroidPlayer", "OpenJDK")


def bundletool_jar(version=ut_env.DEFAULT_VERSION):
    hits = sorted(glob.glob(os.path.join(ut_env.HUB_EDITORS, version, "PlaybackEngines", "AndroidPlayer", "Tools", "bundletool-all-*.jar")))
    return hits[-1] if hits else None


def make_keystore(path, alias, storepass, keypass=None, dname="CN=Agent Test, OU=Dev, O=Test, L=Test, C=FR",
                  validity_days=10000, version=ut_env.DEFAULT_VERSION):
    """Create a keystore with the OpenJDK Unity's Android module installs (the Keystore Manager
    window is GUI-only). Idempotent: an existing file is kept. Never writes the passwords anywhere:
    keep them in memory and pass them with keystore_env() to the build process."""
    path = os.path.abspath(path)
    keypass = keypass or storepass
    created = False
    if not os.path.isfile(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        cmd = [os.path.join(java_home(version), "bin", "keytool"), "-genkeypair", "-v", "-keystore", path,
               "-alias", alias, "-keyalg", "RSA", "-keysize", "2048", "-validity", str(validity_days),
               "-storepass", storepass, "-keypass", keypass, "-dname", dname, "-storetype", "PKCS12"]
        p = subprocess.run(cmd, capture_output=True, text=True)
        if p.returncode != 0:
            raise RuntimeError("keytool failed: " + (p.stderr or p.stdout)[-800:])
        created = True
    return {"path": path, "alias": alias, "storepass": storepass, "keypass": keypass, "created": created}


def keystore_env(ks):
    """Environment for ut_run.run_method(..., env=...): MobileBuild.BuildAndroid reads the keystore
    from AGENT_KEYSTORE, AGENT_KEYSTORE_PASS, AGENT_KEY_ALIAS, AGENT_KEY_PASS."""
    env = dict(os.environ)
    env.update({"AGENT_KEYSTORE": ks["path"], "AGENT_KEYSTORE_PASS": ks["storepass"],
                "AGENT_KEY_ALIAS": ks["alias"], "AGENT_KEY_PASS": ks["keypass"]})
    return env


def keystore_info(ks):
    """keytool -list: alias and certificate fingerprint (proves which key signed the bundle)."""
    cmd = [os.path.join(java_home(), "bin", "keytool"), "-list", "-v", "-keystore", ks["path"], "-storepass", ks["storepass"]]
    p = subprocess.run(cmd, capture_output=True, text=True)
    m = re.search(r"SHA256:\s*([0-9A-F:]+)", p.stdout)
    return {"ok": p.returncode == 0, "sha256": m.group(1) if m else None}


def signer_of(archive):
    """jarsigner -verify on an .aab or .apk: which certificate signed it (CN and SHA-256)."""
    cmd = [os.path.join(java_home(), "bin", "jarsigner"), "-verify", "-verbose:summary", "-certs", archive]
    p = subprocess.run(cmd, capture_output=True, text=True)
    txt = p.stdout + p.stderr
    cn = re.findall(r'CN="?([^,"\n]+)', txt)
    return {"verified": "jar verified" in txt, "cn": sorted(set(cn))[:3], "unsigned": "unsigned" in txt.lower() and "jar verified" not in txt}


# ============================================================================ AAB / APK
def elf_load_alignment(data):
    """Smallest p_align over the PT_LOAD segments of an ELF shared object (32 or 64 bit, little
    endian), or None if the bytes are not ELF. 16 KB page support needs >= 0x4000."""
    if len(data) < 64 or data[:4] != b"\x7fELF":
        return None
    is64 = data[4] == 2
    if is64:
        phoff = struct.unpack_from("<Q", data, 0x20)[0]
        phentsize, phnum = struct.unpack_from("<HH", data, 0x36)
    else:
        phoff = struct.unpack_from("<I", data, 0x1C)[0]
        phentsize, phnum = struct.unpack_from("<HH", data, 0x2A)
    aligns = []
    for i in range(phnum):
        off = phoff + i * phentsize
        if off + phentsize > len(data):
            break
        if struct.unpack_from("<I", data, off)[0] == 1:          # PT_LOAD
            aligns.append(struct.unpack_from("<Q", data, off + 48)[0] if is64 else struct.unpack_from("<I", data, off + 28)[0])
    return min(aligns) if aligns else None


_PERM_RX = re.compile(rb"(?:android\.permission|com\.google\.android\.gms\.permission|com\.android\.vending)\.[A-Z0-9_.]+")


def aab_facts(path):
    """Read an .aab (a zip): modules, base module size (compressed in the zip, the number Play's
    200 MB rule is closest to) and uncompressed, native ABIs, asset packs and their delivery mode,
    embedded symbols, permissions and debuggable flag of the base manifest (proto XML, read as
    bytes), and the 16 KB page alignment of every native library (ELF PT_LOAD p_align)."""
    z = zipfile.ZipFile(path)
    mods = {}
    abis, symbols, largest = set(), [], []
    for i in z.infolist():
        top = i.filename.split("/")[0]
        m = mods.setdefault(top, {"files": 0, "compressed": 0, "uncompressed": 0})
        m["files"] += 1
        m["compressed"] += i.compress_size
        m["uncompressed"] += i.file_size
        mm = re.match(r"[^/]+/lib/([^/]+)/", i.filename)
        if mm:
            abis.add(mm.group(1))
        if i.filename.startswith("BUNDLE-METADATA/") and ("debugsymbols" in i.filename.lower() or "nativedebug" in i.filename.lower()):
            symbols.append(i.filename)
        largest.append((i.compress_size, i.filename))
    largest.sort(reverse=True)
    mb = lambda b: round(b / 1048576.0, 3)
    base = mods.get("base", {"compressed": 0, "uncompressed": 0, "files": 0})
    packs = [k for k in mods if k not in ("base", "BUNDLE-METADATA", "META-INF", "BundleConfig.pb")]
    libs = []
    for n in z.namelist():
        if re.match(r"[^/]+/lib/[^/]+/[^/]+\.so$", n):
            al = elf_load_alignment(z.read(n))
            libs.append({"path": n, "min_align": al, "ok_16kb": al is not None and al >= PAGE_16KB})
    manifest = z.read("base/manifest/AndroidManifest.xml") if "base/manifest/AndroidManifest.xml" in z.namelist() else b""
    delivery = {}
    for pk in packs:
        mp = pk + "/manifest/AndroidManifest.xml"
        if mp in z.namelist():
            mt = z.read(mp)
            delivery[pk] = next((d for d in ("install-time", "fast-follow", "on-demand") if d.encode() in mt), None)
    return {
        "path": path, "file_mb": mb(os.path.getsize(path)),
        "base_compressed_mb": mb(base["compressed"]), "base_uncompressed_mb": mb(base["uncompressed"]),
        "base_under_200mb": base["compressed"] < AAB_BASE_LIMIT_MB * 1048576,
        "modules": {k: {"files": v["files"], "compressed_mb": mb(v["compressed"]), "uncompressed_mb": mb(v["uncompressed"])} for k, v in mods.items()},
        "asset_packs": packs, "abis": sorted(abis), "embedded_symbols": symbols[:10],
        "signed": any(n.startswith("META-INF/") and n.upper().endswith((".RSA", ".EC", ".DSA")) for n in z.namelist()),
        "largest": [{"path": n, "compressed_mb": mb(s)} for s, n in largest[:12]],
        "native_libs": libs, "page_16kb_ok": bool(libs) and all(l["ok_16kb"] for l in libs),
        "permissions": sorted({m.decode() for m in _PERM_RX.findall(manifest)}),
        "debuggable": b"debuggable" in manifest,
        "game_activity": b"GameActivity" in manifest,
        "asset_pack_delivery": delivery,
    }


def aab_findings(facts, ads=False, download_budget_mb=None, download_mb=None):
    """Store gates on aab_facts, in the AgentAudit findings format. ads=True when an ads SDK reads the
    advertising ID (AD_ID permission needed on API 33+: LevelPlay docs, Step 4)."""
    f = []
    add = lambda sev, code, msg, fix: f.append({"severity": sev, "code": code, "path": facts.get("path"), "message": msg, "fix": fix})
    if facts.get("debuggable"):
        add("error", "mobile.aab.debuggable", "debuggable manifest: a Development Build (the upload may fail)", "Development Build off for store bundles (6.3 Manual, Android App Bundle)")
    if not facts.get("base_under_200mb", True):
        add("error", "mobile.aab.base_over_200mb", "base module %.1f MB over Play's 200 MB" % facts.get("base_compressed_mb", 0),
            "texture compression targeting, then Play Asset Delivery packs (fast-follow or on-demand; install-time still counts toward the install)")
    if facts.get("native_libs") and not facts.get("page_16kb_ok"):
        bad = [l["path"] for l in facts["native_libs"] if not l["ok_16kb"]]
        add("error", "mobile.aab.page_4kb", "%d native libraries not 16 KB aligned: %s" % (len(bad), ", ".join(bad[:4])),
            "rebuild or update those plug-ins (Android 15+ 16 KB pages; Unity 6.3 patches ship 16 KB aligned engine libraries)")
    abis = facts.get("abis") or []
    if abis and abis != ["arm64-v8a"]:
        add("warn", "mobile.aab.abis", "ABIs %s" % abis, "ARM64 only unless a store needs armv7")
    if not facts.get("embedded_symbols"):
        add("warn", "mobile.aab.no_symbols", "no debug symbols in the bundle", "Debug Symbols Public (symbol table) in the bundle, or upload the zip BEFORE release: Play never symbolicates crashes received earlier")
    if ads and AD_ID_PERMISSION not in (facts.get("permissions") or []):
        add("warn", "mobile.aab.no_ad_id", "ads SDK but no AD_ID permission in the built manifest", "LevelPlay Developer Settings > Declare AD_ID Permission (then a clean build), or MobileAndroidManifest config")
    if download_budget_mb and download_mb and download_mb > download_budget_mb:
        add("error", "mobile.aab.download_over_budget", "download %.1f MB over the %.0f MB budget" % (download_mb, download_budget_mb), "Build Report sorted by size, textures first; then PAD fast-follow/on-demand")
    return {"findings": f, "counts": {s: sum(1 for x in f if x["severity"] == s) for s in ("error", "warn", "info")}}


def bundletool_sizes(aab, out_dir, device_spec=None, timeout=900):
    """Estimated download size of the AAB as Play would serve it: bundletool build-apks then
    get-size total (MIN and MAX bytes over device configurations). Uses the bundletool and the
    OpenJDK shipped with Unity's Android module. Unsigned APK set (--mode default, no --ks)."""
    jar = bundletool_jar()
    if not jar:
        return {"ok": False, "error": "bundletool jar not found in the Android module"}
    java = os.path.join(java_home(), "bin", "java")
    os.makedirs(out_dir, exist_ok=True)
    apks = os.path.join(out_dir, os.path.splitext(os.path.basename(aab))[0] + ".apks")
    if os.path.exists(apks):
        os.rename(apks, apks + ".old-%d" % int(os.path.getmtime(apks)))
    p = subprocess.run([java, "-jar", jar, "build-apks", "--bundle=" + aab, "--output=" + apks], capture_output=True, text=True, timeout=timeout)
    if p.returncode != 0:
        return {"ok": False, "error": (p.stderr or p.stdout)[-1200:], "bundletool": os.path.basename(jar)}
    cmd = [java, "-jar", jar, "get-size", "total", "--apks=" + apks]
    if device_spec:
        cmd.append("--device-spec=" + device_spec)
    q = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if q.returncode != 0:
        return {"ok": False, "error": (q.stderr or q.stdout)[-1200:]}
    lines = [l for l in q.stdout.strip().splitlines() if l.strip()]
    vals = lines[-1].split(",")
    out = {"ok": True, "bundletool": os.path.basename(jar), "apks": apks, "raw": q.stdout.strip()}
    try:
        out["download_min_mb"] = round(int(vals[0]) / 1048576.0, 3)
        out["download_max_mb"] = round(int(vals[1]) / 1048576.0, 3)
    except (ValueError, IndexError):
        pass
    v = subprocess.run([java, "-jar", jar, "validate", "--bundle=" + aab], capture_output=True, text=True, timeout=timeout)
    out["validate_ok"] = v.returncode == 0
    return out


# ============================================================================ Xcode project
def _dir_mb(path):
    total = 0
    for dp, _dn, fns in os.walk(path):
        for fn in fns:
            fp = os.path.join(dp, fn)
            if not os.path.islink(fp):
                total += os.path.getsize(fp)
    return round(total / 1048576.0, 3)


def _privacy_reasons(path):
    try:
        with open(path, "rb") as f:
            d = plistlib.load(f)
    except Exception as e:  # noqa: BLE001
        return {"error": str(e)}
    out = {}
    for item in d.get("NSPrivacyAccessedAPITypes", []) or []:
        out[item.get("NSPrivacyAccessedAPIType", "?")] = item.get("NSPrivacyAccessedAPITypeReasons", [])
    return {"api_reasons": out, "tracking": d.get("NSPrivacyTracking"), "collected": len(d.get("NSPrivacyCollectedDataTypes", []) or [])}


def xcode_facts(folder):
    """Facts about a Unity-generated Xcode project folder: size (total and per part), targets,
    Info.plist keys, every PrivacyInfo.xcprivacy with its declared reasons, the post-process report."""
    folder = os.path.abspath(folder)
    proj = os.path.join(folder, "Unity-iPhone.xcodeproj", "project.pbxproj")
    out = {"folder": folder, "exists": os.path.isdir(folder), "xcodeproj": os.path.isfile(proj), "total_mb": _dir_mb(folder) if os.path.isdir(folder) else 0}
    parts = {}
    for sub in ("Data", "Libraries", "Classes", "Il2CppOutputProject", "MainApp", "UnityFramework", "Unity-iPhone"):
        p = os.path.join(folder, sub)
        if os.path.isdir(p):
            parts[sub] = _dir_mb(p)
    out["parts_mb"] = parts
    if os.path.isfile(proj):
        txt = Path(proj).read_text(errors="replace")
        out["targets"] = sorted(set(re.findall(r"/\* (Unity-iPhone|UnityFramework|GameAssembly|Unity-iPhone Tests) \*/ = \{\s*isa = PBXNativeTarget", txt)))
        out["pbx_mentions_privacy"] = "PrivacyInfo.xcprivacy" in txt
        m = re.findall(r"IPHONEOS_DEPLOYMENT_TARGET = ([0-9.]+);", txt)
        out["deployment_targets"] = sorted(set(m))
    ip = os.path.join(folder, "Info.plist")
    if os.path.isfile(ip):
        with open(ip, "rb") as f:
            info = plistlib.load(f)
        out["info_plist"] = {k: info.get(k) for k in ("CFBundleIdentifier", "CFBundleShortVersionString", "CFBundleVersion",
                                                       "MinimumOSVersion", "UIRequiresFullScreen", "NSUserTrackingUsageDescription")}
        out["info_plist_keys"] = len(info)
        out["skadnetwork_items"] = len(info.get("SKAdNetworkItems") or [])
        ats = info.get("NSAppTransportSecurity") or {}
        out["ats"] = {"present": bool(ats), "arbitrary_loads": bool(ats.get("NSAllowsArbitraryLoads"))}
        out["att_usage_description"] = bool(info.get("NSUserTrackingUsageDescription"))
    priv = {}
    for p in glob.glob(os.path.join(folder, "**", "PrivacyInfo.xcprivacy"), recursive=True):
        priv[os.path.relpath(p, folder)] = _privacy_reasons(p)
    out["privacy_manifests"] = priv
    out["sdk_privacy_manifests"] = sorted(k for k in priv if not k.startswith("UnityFramework/") and "agent_DerivedData" not in k)
    rep = os.path.join(folder, "agent_xcode_postprocess.json")
    if os.path.isfile(rep):
        out["postprocess"] = json.loads(Path(rep).read_text())
    return out


def xcode_findings(facts, ads=False, tracking=False):
    """Store gates on xcode_facts. ads: an ad network is integrated (SKAdNetworkItems needed: automatic
    on fresh LevelPlay 9.1.0+ installs, else manual; NSAppTransportSecurity with arbitrary loads per the
    LevelPlay docs, Step 4 iOS). tracking: the app asks for ATT (usage description needed) [added]."""
    f = []
    add = lambda sev, code, msg, fix: f.append({"severity": sev, "code": code, "path": facts.get("folder"), "message": msg, "fix": fix})
    if not any(k.startswith("UnityFramework/") for k in facts.get("privacy_manifests", {})):
        add("error", "mobile.ios.no_privacy_manifest", "no consolidated UnityFramework/PrivacyInfo.xcprivacy", "Unity 2021.3.35f1+ writes it; check the export")
    if ads and facts.get("skadnetwork_items", 0) == 0:
        add("warn", "mobile.ios.no_skadnetwork", "ads SDK but no SKAdNetworkItems in Info.plist", "LevelPlay Network Manager SKAdNetwork IDs (automatic from 9.1.0 fresh installs) or a PlistDocument post-process")
    if ads and not (facts.get("ats") or {}).get("arbitrary_loads"):
        add("info", "mobile.ios.ats", "ads SDK without NSAllowsArbitraryLoads", "LevelPlay docs: NSAppTransportSecurity > NSAllowsArbitraryLoads YES, no other exceptions")
    if ads and not facts.get("sdk_privacy_manifests"):
        add("info", "mobile.ios.sdk_privacy", "no third-party PrivacyInfo.xcprivacy found in the export", "every ad, IAP and analytics SDK must ship its own manifest (6.3 Manual)")
    if tracking and not facts.get("att_usage_description"):
        add("error", "mobile.ios.att_text", "tracking without NSUserTrackingUsageDescription", "add the ATT prompt text through MobileXcodePostprocess (ios_postprocess.json)")
    return {"findings": f, "counts": {s: sum(1 for x in f if x["severity"] == s) for s in ("error", "warn", "info")}}


def ios_export_options(path, method="app-store-connect", team_id=None, thinning=None, destination="export", signing_style="automatic"):
    """Write ExportOptions.plist for xcodebuild -exportArchive. method (Xcode 26 names, checked with
    `xcodebuild -help` on this Mac): app-store-connect, release-testing, debugging, enterprise
    (app-store, ad-hoc and development are the deprecated aliases). thinning "<thin-for-all-variants>"
    applies to non-App Store exports and produces "App Thinning Size Report.txt"."""
    d = {"method": method, "destination": destination, "signingStyle": signing_style}
    if team_id:
        d["teamID"] = team_id
    if thinning:
        d["thinning"] = thinning
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "wb") as f:
        plistlib.dump(d, f)
    return path


def ios_archive_plan(folder, team_id=None, out_dir=None, scheme="Unity-iPhone"):
    """The commands that turn the exported Xcode project into an archive, an App Store IPA and the
    per-device size report. NOT run by the agent: signing needs the user's Apple account, so show
    them and run only with the user's approval (6.3 Manual: archive in Xcode for the release
    configuration and stripped symbols; command line [added], flags checked with xcodebuild -help)."""
    folder = os.path.abspath(folder)
    out = os.path.abspath(out_dir or os.path.join(folder, "agent_archive"))
    archive = os.path.join(out, scheme + ".xcarchive")
    store_opts = ios_export_options(os.path.join(out, "ExportOptions-appstore.plist"), "app-store-connect", team_id)
    size_opts = ios_export_options(os.path.join(out, "ExportOptions-thinning.plist"), "release-testing", team_id, thinning="<thin-for-all-variants>")
    proj = os.path.join(folder, "Unity-iPhone.xcodeproj")
    archive_cmd = ["xcodebuild", "-project", proj, "-scheme", scheme, "-configuration", "Release", "-destination", "generic/platform=iOS",
                   "-archivePath", archive, "-allowProvisioningUpdates"]
    if team_id:
        archive_cmd.append("DEVELOPMENT_TEAM=" + team_id)
    archive_cmd.append("archive")
    return {
        "archive": archive_cmd,
        "export_app_store": ["xcodebuild", "-exportArchive", "-archivePath", archive, "-exportPath", os.path.join(out, "appstore"),
                             "-exportOptionsPlist", store_opts, "-allowProvisioningUpdates"],
        "export_size_report": ["xcodebuild", "-exportArchive", "-archivePath", archive, "-exportPath", os.path.join(out, "thinning"),
                               "-exportOptionsPlist", size_opts, "-allowProvisioningUpdates"],
        "size_report": os.path.join(out, "thinning", "App Thinning Size Report.txt"),
        "needs": "the user's Apple team, signing certificate and App Store Connect record: show these commands, run only with approval",
    }


def _size_mb(txt):
    txt = txt.strip()
    if txt.lower().startswith("zero"):
        return 0.0
    m = re.match(r"([0-9.,]+)\s*(KB|MB|GB)", txt, re.I)
    if not m:
        return None
    v = float(m.group(1).replace(",", ""))
    return round(v / 1024.0 if m.group(2).upper() == "KB" else v * 1024.0 if m.group(2).upper() == "GB" else v, 3)


def app_thinning_report(path):
    """Parse Xcode's "App Thinning Size Report.txt" (layout per Apple's report [added]; not yet run on
    a real report: it needs a signed archive): per variant the compressed (download) and uncompressed
    (install) app size, and the largest download against the 200 MB cellular limit."""
    variants, cur = [], None
    with open(path, errors="replace") as fh:
        lines = fh.readlines()
    for line in lines:
        if line.startswith("Variant:"):
            cur = {"variant": line.split(":", 1)[1].strip()}
            variants.append(cur)
        elif cur is not None and line.strip().startswith("App size:"):
            parts = line.split(":", 1)[1].split(",")
            cur["compressed_mb"] = _size_mb(parts[0])
            cur["uncompressed_mb"] = _size_mb(parts[1]) if len(parts) > 1 else None
    sized = [v for v in variants if v.get("compressed_mb") is not None]
    worst = max(sized, key=lambda v: v["compressed_mb"]) if sized else None
    return {"variants": variants, "max_download_mb": worst["compressed_mb"] if worst else None,
            "max_variant": worst["variant"] if worst else None,
            "under_ota_limit": (worst["compressed_mb"] < IOS_OTA_LIMIT_MB) if worst else None}


def xcode_compile_unsigned(folder, scheme="Unity-iPhone", timeout=3600, log=None):
    """OPTIONAL proof that Xcode compiles the exported project, with signing disabled (no upload,
    no identity): xcodebuild -project Unity-iPhone.xcodeproj -scheme Unity-iPhone -configuration Release
    -destination generic/platform=iOS CODE_SIGNING_ALLOWED=NO build. Minutes of CPU (IL2CPP C++)."""
    proj = os.path.join(folder, "Unity-iPhone.xcodeproj")
    log = log or os.path.join(folder, "agent_xcodebuild.log")
    cmd = ["xcodebuild", "-project", proj, "-scheme", scheme, "-configuration", "Release",
           "-destination", "generic/platform=iOS", "-derivedDataPath", os.path.join(folder, "agent_DerivedData"),
           "CODE_SIGNING_ALLOWED=NO", "CODE_SIGNING_REQUIRED=NO", "CODE_SIGN_IDENTITY=", "build"]
    with open(log, "w") as f:
        p = subprocess.run(cmd, stdout=f, stderr=subprocess.STDOUT, timeout=timeout)
    full = Path(log).read_text(errors="replace")
    tail = full[-3000:]
    apps = glob.glob(os.path.join(folder, "agent_DerivedData", "Build", "Products", "Release-iphoneos", "*.app"))
    ok = p.returncode == 0 and "BUILD SUCCEEDED" in tail
    status = "compiled" if ok else "failed"
    m = re.search(r"error:(iOS [0-9.]+ is not installed[^}]*)", full)
    if not ok and (m or "Found no destinations" in full or "Unable to find a destination" in full):
        # observed 2026-09-24 with Xcode 26.6: the iOS SDK is listed but the iOS platform component is not
        # installed, so xcodebuild finds no destination ("iOS 26.5 is not installed. Please download and
        # install the platform from Xcode > Settings > Components.")
        status = "not_run_platform_missing"
    return {"compiled": ok, "status": status, "exit_code": p.returncode, "log": log,
            "reason": m.group(1).strip() if m else None,
            "app": apps[0] if apps else None, "app_mb": _dir_mb(apps[0]) if apps else None,
            "errors": re.findall(r"error: .*", tail)[:10]}


# ============================================================================ code scan
_SKIP_DIRS = ("/Library/", "/Packages/", "/PackageCache/", "/Temp/", "/Builds/", "/Logs/", "/obj/")
TIMESTAMP_APIS = re.compile(r"\b(File|Directory)\.(GetCreationTime|GetLastAccessTime|GetLastWriteTime)(Utc)?\s*\(|"
                            r"\.(CreationTime|LastAccessTime|LastWriteTime)(Utc)?\b")
FILE_TIMESTAMP_REASONS = {"DDA9.1", "C617.1", "3B52.1", "0A2A.1"}


def _cs_files(root):
    for dp, _dn, fns in os.walk(root):
        rel = dp.replace("\\", "/") + "/"
        if any(s in rel for s in _SKIP_DIRS):
            continue
        for fn in fns:
            if fn.endswith(".cs"):
                yield os.path.join(dp, fn)


def _method_body(text, start):
    i = text.find("{", start)
    if i < 0:
        return ""
    depth = 0
    for j in range(i, len(text)):
        if text[j] == "{":
            depth += 1
        elif text[j] == "}":
            depth -= 1
            if depth == 0:
                return text[i:j + 1]
    return text[i:]


def _strip_comments(t):
    t = re.sub(r"/\*.*?\*/", "", t, flags=re.S)
    return re.sub(r"//[^\n]*", "", t)


_PAUSE_RISK = re.compile(r"PlayerPrefs\.Save|File\.(Write|Append|Copy|Move|Delete)|\.Write(All)?(Text|Bytes|Lines)?\(|StreamWriter|"
                         r"UnityWebRequest|HttpClient|\.SendWebRequest|Thread\.Sleep|\.Wait\(\)|\.Result\b|while\s*\(|for\s*\(|foreach\s*\(|"
                         r"Analytics|\.Flush\(")
_SDK_INIT = re.compile(r"\b(\w+)\.(Initialize|Init|InitializeAsync|Configure|Start)\s*\(")
_SDK_HINT = re.compile(r"(Ads|LevelPlay|IronSource|Firebase|Analytics|Purchasing|UnityServices|Adjust|AppsFlyer|Facebook|GameAnalytics|Crashlytics|Push|Notification)", re.I)
_LEGACY_IAP = re.compile(r"\b(IStoreListener|IDetailedStoreListener|ConfigurationBuilder|UnityPurchasing\.Initialize|IStoreController|"
                         r"SubscriptionManager|hasReceipt|GooglePlayProrationMode|ProcessPurchase\s*\()")
_LEGACY_ADS = re.compile(r"\b(IronSource\.Agent|LevelPlayEvents\.onSdkInitializationCompletedEvent|Advertisement\.Initialize|UnityEngine\.Advertisements)")


_GRANT_CALL = re.compile(r"\b(Grant\w*|AddCoins|AddCurrency|GiveReward\w*)\s*\(")


def _handler_body(text, pos):
    """Body of an event handler attached with `+=` at pos: a lambda block, a lambda expression up
    to ';', or the method named by a method group."""
    rest = text[pos:]
    mg = re.match(r"\s*([A-Za-z_]\w*)\s*;", rest)
    if mg:
        m = re.search(r"void\s+" + re.escape(mg.group(1)) + r"\s*\(", text)
        return _method_body(text, m.end()) if m else ""
    arrow = rest.find("=>")
    if arrow < 0:
        return rest[:200]
    after = rest[arrow + 2:].lstrip()
    if after.startswith("{"):
        return _method_body(after, 0)
    end = after.find(";")
    return after[:end if end >= 0 else 200]


def code_scan(root):
    """Static scan of the project's C# (Assets/, not packages) for mobile shipping risks, in the
    AgentAudit findings format: ANR risks in pause/focus handlers and SDK init at boot
    (Unity Android team, pezwIhA0e04), touch anti-patterns (6.3 Input System docs), IAP 4 and old
    ads API left after an upgrade, file-timestamp APIs that need a privacy manifest reason.
    A regex scan: it flags candidates for a human or agent to confirm, it does not prove a bug."""
    root = os.path.abspath(root)
    findings = []
    timestamp_uses = []

    def add(sev, code, path, line, msg, fix):
        findings.append({"severity": sev, "code": code, "path": "%s:%d" % (os.path.relpath(path, root), line), "message": msg, "fix": fix})

    uses = {"pending": [], "confirm": False, "confirmed_handler": [], "failed_order": False, "async_load": [], "fully_drawn": False}
    for path in _cs_files(os.path.join(root, "Assets")):   # project code only (not packages, not nested projects)
        raw = Path(path).read_text(errors="replace")
        text = _strip_comments(raw)
        line_of = lambda pos: text.count("\n", 0, pos) + 1
        for m in re.finditer(r"void\s+(OnApplicationPause|OnApplicationFocus)\s*\(", text):
            body = _method_body(text, m.end())
            hit = _PAUSE_RISK.search(body)
            if hit:
                add("error", "mobile.anr.pause_io", path, line_of(m.start()),
                    "%s does '%s': Android runs pause handlers in the onPause window, the top ANR source while backgrounding" % (m.group(1), hit.group(0)),
                    "save and send analytics earlier (checkpoints, level end); keep pause handlers to flags")
        for m in re.finditer(r"void\s+(Awake|Start|OnEnable)\s*\(", text):
            body = _method_body(text, m.end())
            for s in _SDK_INIT.finditer(body):
                if _SDK_HINT.search(s.group(1)):
                    add("warn", "mobile.anr.sdk_init_at_boot", path, line_of(m.start()),
                        "%s.%s in %s: SDKs initialised all at boot block the main thread on low-end phones" % (s.group(1), s.group(2), m.group(1)),
                        "initialise asynchronously and stagger by milestone (after onboarding)")
        for m in re.finditer(r"void\s+(Update|FixedUpdate)\s*\(", text):
            body = _method_body(text, m.end())
            if "Touchscreen.current" in body:
                add("warn", "mobile.touch.poll_touchscreen", path, line_of(m.start()),
                    "Touchscreen.current read in %s: short taps between frames are missed" % m.group(1),
                    "EnhancedTouch.Touch.activeTouches after EnhancedTouchSupport.Enable()")
            if re.search(r"Debug\.Log(Format)?\s*\(", body):
                add("info", "mobile.cpu.log_in_update", path, line_of(m.start()),
                    "Debug.Log in %s (allocates and costs ms every frame on device)" % m.group(1), "remove or guard with a define")
        for m in re.finditer(r"\bInput\.(touches|GetTouch|touchCount)\b", text):
            add("warn", "mobile.touch.legacy_input", path, line_of(m.start()), "legacy Input Manager touch API (disabled in 6.3 template projects)", "Input System EnhancedTouch")
        for m in re.finditer(r"TouchSimulation\.Enable\s*\(", text):
            before = text[:m.start()]
            if before.count("#if UNITY_EDITOR") <= before.count("#endif"):
                add("info", "mobile.touch.simulation_in_player", path, line_of(m.start()), "TouchSimulation.Enable outside #if UNITY_EDITOR", "guard it")
        for m in re.finditer(r"ReadValueAsObject\s*\(", text):
            add("info", "mobile.input.boxing", path, line_of(m.start()), "ReadValueAsObject allocates", "ReadValue<T>()")
        for m in _LEGACY_IAP.finditer(text):
            add("error", "mobile.iap.v4_api", path, line_of(m.start()), "IAP 4 API '%s' (removed in IAP 5)" % m.group(1), "StoreController flow of IAP 5.x")
        for m in _LEGACY_ADS.finditer(text):
            add("warn", "mobile.ads.legacy_api", path, line_of(m.start()), "legacy ads API '%s'" % m.group(1), "LevelPlay 9 (LevelPlay.Init, ad objects after OnInitSuccess)")
        for m in re.finditer(r"OnAdClosed\w*\s*(\+=|\()", text):
            body = _method_body(text, m.end()) if m.group(1) == "(" else _handler_body(text, m.end())
            if _GRANT_CALL.search(body):
                add("warn", "mobile.ads.reward_on_close", path, line_of(m.start()), "reward granted from OnAdClosed", "grant in OnAdRewarded (may arrive after OnAdClosed)")
        for m in re.finditer(r"PurchaseProduct\s*\(\s*\"", text):
            add("warn", "mobile.iap.purchase_by_string", path, line_of(m.start()), "PurchaseProduct(string): buys an unfetched product as an unknown type", "purchase a fetched Product object")
        for m in TIMESTAMP_APIS.finditer(text):
            timestamp_uses.append("%s:%d" % (os.path.relpath(path, root), line_of(m.start())))
        # --- v0.2 rules (Y11 refactor)
        for m in re.finditer(r"\bIPostGenerateGradleAndroidProject\b", text):
            add("info", "mobile.android.post_generate_gradle", path, line_of(m.start()),
                "IPostGenerateGradleAndroidProject edits bypass the incremental build pipeline (then only a clean build is safe)",
                "AndroidProjectFilesModifier (Setup + OnModifyAndroidProjectFiles), e.g. MobileAndroidManifest; keep post-generate for moving files")
        for m in re.finditer(r"\b(ValidateIntegration|LaunchTestSuite)\s*\(|\"is_test_suite\"", text):
            before = text[:m.start()]
            line = text[text.rfind("\n", 0, m.start()) + 1:text.find("\n", m.start())]
            guarded = before.count("#if DEVELOPMENT_BUILD") + before.count("#if UNITY_EDITOR") > before.count("#endif") \
                or re.search(r"if\s*\([^)]*(test|isDebugBuild|DEVELOPMENT)", line, re.I)
            if not guarded:
                add("warn", "mobile.ads.test_calls_in_release", path, line_of(m.start()), "LevelPlay integration validation or test suite reachable in release",
                    "remove before release or guard with #if DEVELOPMENT_BUILD (GvIpY8yE4UY [00:44:32])")
        for m in re.finditer(r"\bLevelPlay\.SetConsent\s*\(", text):
            add("info", "mobile.ads.obsolete_consent", path, line_of(m.start()), "LevelPlay.SetConsent is [Obsolete] in LevelPlay 9.5.1",
                "LevelPlayPrivacySettings.SetGDPRConsent / SetCCPA / SetCOPPA, before LevelPlay.Init")
        for m in re.finditer(r"\"[^\"\n]*(?:[$\u20ac\u00a3\u00a5]\s?\d+[.,]\d{2}|\d+[.,]\d{2}\s?(?:USD|EUR|GBP|\u20ac|\$))[^\"\n]*\"", text):
            add("info", "mobile.iap.hardcoded_price", path, line_of(m.start()), "hardcoded price string %s" % m.group(0)[:30],
                "show product.metadata.localizedPriceString from the store (szS2KMxZsl4 [00:06:04])")
        for m in re.finditer(r"Screen\.height\s*-\s*(?:UnityEngine\.(?:Device\.)?)?Screen\.safeArea\.y\b(?!Max)", text):
            add("warn", "mobile.ui.safe_area_flip", path, line_of(m.start()), "UI Toolkit top computed from safeArea.y (that is the bottom inset)",
                "top = Screen.height - Screen.safeArea.yMax (SafeAreaTests.UiToolkitFlipUsesYMax)")
        if re.search(r"\bOnPurchasePending\s*\+=", text):
            uses["pending"].append("%s:%d" % (os.path.relpath(path, root), line_of(text.find("OnPurchasePending"))))
        if "ConfirmPurchase(" in text:
            uses["confirm"] = True
        if re.search(r"\bOnPurchaseConfirmed\s*\+=", text):
            uses["confirmed_handler"].append("%s:%d" % (os.path.relpath(path, root), line_of(text.find("OnPurchaseConfirmed"))))
        if "FailedOrder" in text:
            uses["failed_order"] = True
        if re.search(r"\b(LoadSceneAsync|LoadSceneAsyncAdditive|Addressables\.LoadSceneAsync)\s*\(", text):
            uses["async_load"].append("%s:%d" % (os.path.relpath(path, root), line_of(re.search(r"LoadSceneAsync", text).start())))
        if "CallReportFullyDrawn" in text or "StartupReport.Interactive" in text:
            uses["fully_drawn"] = True
    if uses["pending"] and not uses["confirm"]:
        findings.append({"severity": "error", "code": "mobile.iap.no_confirm", "path": uses["pending"][0],
                         "message": "OnPurchasePending handled but ConfirmPurchase never called: redelivered every session, refunded by Google after 3 days",
                         "fix": "grant, persist, then ConfirmPurchase(order) (IAP 5 docs)"})
    if uses["confirmed_handler"] and not uses["failed_order"]:
        findings.append({"severity": "warn", "code": "mobile.iap.failed_order_ignored", "path": uses["confirmed_handler"][0],
                         "message": "OnPurchaseConfirmed handled without FailedOrder: a failed confirmation looks like success",
                         "fix": "on FailedOrder retry ConfirmPurchase with the kept PendingOrder, never grant again"})
    if uses["async_load"] and not uses["fully_drawn"]:
        findings.append({"severity": "info", "code": "mobile.android.report_fully_drawn", "path": uses["async_load"][0],
                         "message": "a loader scene loads the game asynchronously but nothing reports the interactive frame: Android's startup metric stops before the first scene's Awake",
                         "fix": "StartupReport.Interactive() (DiagnosticsReporting.CallReportFullyDrawn) on the first interactive frame (6.3 Manual)"})
    declared = privacy_declared(root)
    if timestamp_uses and not (FILE_TIMESTAMP_REASONS & set(declared.get("NSPrivacyAccessedAPICategoryFileTimestamp", []))):
        findings.append({"severity": "error", "code": "mobile.ios.privacy_timestamp", "path": timestamp_uses[0],
                         "message": "C# file timestamp API used (%d places) with no File timestamp reason in Assets/**/PrivacyInfo.xcprivacy" % len(timestamp_uses),
                         "fix": "declare NSPrivacyAccessedAPICategoryFileTimestamp with a reason (C617.1 for files in the app container) in Assets/Plugins/PrivacyInfo.xcprivacy"})
    counts = {s: sum(1 for f in findings if f["severity"] == s) for s in ("error", "warn", "info")}
    return {"findings": findings, "counts": counts, "timestamp_uses": timestamp_uses, "declared_privacy": declared}


def _ver(v):
    try:
        return tuple(int(x) for x in re.findall(r"\d+", v or "")[:3])
    except ValueError:
        return ()


def package_check(root):
    """Monetization packages as the project really has them (manifest + lock): 6000.3.21f1 installs
    IAP 4.15.1 and LevelPlay 8.10.1 by default while the docs are IAP 5 and LevelPlay 9 (deltas § 1.3,
    § 12); com.unity.ads is legacy for monetization since 2026-01-31; moving LevelPlay from below
    9.0.0 means removing Assets/LevelPlay (or Assets/IronSource) SDK code and Assets/Mobile Dependency
    Resolver first (deltas § 12, upgrade guide). LevelPlay 9 itself keeps settings in
    Assets/LevelPlay/Resources and adapter XMLs in Assets/LevelPlay/Editor (read from the 9.5.1 source),
    so only code (.cs, .dll, .jar, .aar) elsewhere under those folders counts as a leftover."""
    root = os.path.abspath(root)
    man = json.loads(Path(root, "Packages", "manifest.json").read_text()).get("dependencies", {})
    lock_p = os.path.join(root, "Packages", "packages-lock.json")
    lock = json.loads(Path(lock_p).read_text()).get("dependencies", {}) if os.path.isfile(lock_p) else {}
    ver = lambda n: (lock.get(n) or {}).get("version") or man.get(n)
    iap, lp, ads = ver("com.unity.purchasing"), ver("com.unity.services.levelplay"), ver("com.unity.ads")
    f = []
    add = lambda sev, code, msg, fix: f.append({"severity": sev, "code": code, "path": "Packages/manifest.json", "message": msg, "fix": fix})
    if iap and _ver(iap) < (5,):
        add("error", "mobile.pkg.iap4", "com.unity.purchasing %s (IAP 4 API: IStoreListener, ProcessPurchase)" % iap, "pin \"com.unity.purchasing\": \"5.4.3\" before writing purchase code")
    if lp and _ver(lp) < (9,):
        add("warn", "mobile.pkg.levelplay8", "com.unity.services.levelplay %s" % lp, "pin 9.5.1; first move pre-9 SDK folders (Assets/LevelPlay code, Assets/IronSource, Assets/Mobile Dependency Resolver) to an archive")
    if ads:
        add("info", "mobile.pkg.unity_ads_legacy", "com.unity.ads %s: legacy for monetization since 2026-01-31" % ads, "LevelPlay 9 (Unity Ads is a LevelPlay network)")
    leftovers = []
    for folder in ("LevelPlay", "IronSource"):
        base = os.path.join(root, "Assets", folder)
        for dp, _dn, fns in os.walk(base):
            rel = os.path.relpath(dp, root).replace("\\", "/")
            if rel.startswith("Assets/LevelPlay/Resources") or rel.startswith("Assets/LevelPlay/Editor"):
                continue
            leftovers += [os.path.join(rel, n) for n in fns if n.endswith((".cs", ".dll", ".jar", ".aar"))]
    for folder in ("Mobile Dependency Resolver", "ExternalDependencyManager"):
        if os.path.isdir(os.path.join(root, "Assets", folder)):
            leftovers.append("Assets/" + folder)
    if leftovers and lp and _ver(lp) >= (9,):
        add("warn", "mobile.pkg.levelplay_leftovers", "LevelPlay %s with pre-9 SDK files in Assets (%d, e.g. %s)" % (lp, len(leftovers), leftovers[0]),
            "move them to an archive folder outside Assets, then Force Resolve")
    return {"iap": iap, "levelplay": lp, "unity_ads": ads, "leftovers": leftovers[:20], "findings": f,
            "counts": {s: sum(1 for x in f if x["severity"] == s) for s in ("error", "warn", "info")}}


def soak_verdict(csv_path, fps, headroom=MOBILE_HEADROOM, window_s=300, min_minutes=20):
    """Judge a DeviceSoakLogger CSV (device development build, 20 to 30 minutes on the lowest phone):
    the last `window_s` against the first, each row's CPU (and GPU when logged) p95 against the
    sustained budget (65% of 1000/fps, e-book), the highest thermal warning reached and when,
    and whether the policy had to lower quality. verdict: pass (last window under budget, no
    Throttling), warn (over budget in the last window or ThrottlingImminent), fail (Throttling or a
    last-window p95 over the raw frame time); too_short below min_minutes (the provisional verdict is
    kept in `provisional`): throttling shows only after many minutes."""
    import csv as _csv
    with open(csv_path) as fh:
        rows = list(_csv.DictReader(fh))
    b = budgets(fps, headroom)
    num = lambda r, k: float(r[k]) if r.get(k) not in (None, "") else None
    if not rows:
        return {"verdict": "no_data", "rows": 0}
    t_end = num(rows[-1], "t_s") or 0.0
    first = [r for r in rows if (num(r, "t_s") or 0) <= window_s]
    last = [r for r in rows if (num(r, "t_s") or 0) >= t_end - window_s]
    def worst(rs, k):
        v = [num(r, k) for r in rs if num(r, k) is not None]
        return max(v) if v else None
    def med(rs, k):
        v = sorted(num(r, k) for r in rs if num(r, k) is not None)
        return v[len(v) // 2] if v else None
    warn_levels = [(num(r, "t_s"), int(float(r["thermal_warning"]))) for r in rows if r.get("thermal_warning") not in (None, "")]
    max_warn = max((w for _t, w in warn_levels), default=None)
    first_warn_t = next((t for t, w in warn_levels if w >= 1), None)
    over = sum(1 for r in rows if (num(r, "cpu_p95_ms") or 0) > b["sustained_ms"] or (num(r, "gpu_p95_ms") or 0) > b["sustained_ms"])
    last_cpu, last_gpu = med(last, "cpu_p95_ms"), med(last, "gpu_p95_ms")
    last_worst = max(x for x in (last_cpu, last_gpu, 0.0) if x is not None)
    if (max_warn or 0) >= 2 or last_worst > b["raw_ms"]:
        verdict = "fail"
    elif (max_warn or 0) >= 1 or last_worst > b["sustained_ms"]:
        verdict = "warn"
    else:
        verdict = "pass"
    provisional = verdict
    if t_end < min_minutes * 60:
        verdict = "too_short"
    scales = sorted({r.get("render_scale") for r in rows if r.get("render_scale")})
    return {"verdict": verdict, "provisional": provisional, "rows": len(rows), "duration_min": round(t_end / 60.0, 1), "budgets": b,
            "first_window": {"cpu_p95_median": med(first, "cpu_p95_ms"), "gpu_p95_median": med(first, "gpu_p95_ms"), "fps_median": med(first, "fps")},
            "last_window": {"cpu_p95_median": last_cpu, "gpu_p95_median": last_gpu, "fps_median": med(last, "fps"), "cpu_max": worst(last, "cpu_max_ms")},
            "rows_over_sustained": over, "max_thermal_warning": max_warn, "first_warning_at_s": first_warn_t,
            "render_scales_seen": scales, "battery_temp_max_c": worst(rows, "battery_temp_c"),
            "short_session": t_end < min_minutes * 60,
            "note": "device verdict only for a development player on the lowest target phone; 10 to 15 min cooldown between runs"}


def privacy_declared(root):
    """Union of NSPrivacyAccessedAPITypes reasons over every Assets/**/PrivacyInfo.xcprivacy."""
    out = {}
    for p in glob.glob(os.path.join(root, "Assets", "**", "PrivacyInfo.xcprivacy"), recursive=True):
        r = _privacy_reasons(p)
        for k, v in (r.get("api_reasons") or {}).items():
            out.setdefault(k, [])
            out[k] = sorted(set(out[k]) | set(v))
    return out


def unity_privacy_template(version=ut_env.DEFAULT_VERSION):
    """Unity's own engine reasons, from <editor>/PlaybackEngines/iOSSupport/Tools/XCode/PrivacyInfo.xcprivacy
    (6000.3.21f1: SystemBootTime 35F9.1, DiskSpace E174.1, UserDefaults CA92.1, FileTimestamp 0A2A.1 + C617.1)."""
    p = os.path.join(ut_env.HUB_EDITORS, version, "PlaybackEngines", "iOSSupport", "Tools", "XCode", "PrivacyInfo.xcprivacy")
    return (_privacy_reasons(p).get("api_reasons") or {}) if os.path.isfile(p) else {}


def write_privacy_manifest(path, api_reasons, tracking=False, keep_unity_reasons=True):
    """Write a minimal PrivacyInfo.xcprivacy (plist) declaring required-reason APIs,
    e.g. {"NSPrivacyAccessedAPICategoryFileTimestamp": ["C617.1"]}. Collected data types are the
    developer's legal answer and are left empty here.
    keep_unity_reasons: observed 2026-09-24 in 6000.3.21f1, a category declared in Assets/Plugins
    REPLACES Unity's reasons for that category in the exported UnityFramework manifest (FileTimestamp
    0A2A.1 was dropped when the project declared only C617.1), so the union with Unity's template
    reasons is written for every category you declare."""
    reasons = {k: list(v) for k, v in api_reasons.items()}
    if keep_unity_reasons:
        for k, v in unity_privacy_template().items():
            if k in reasons:
                reasons[k] = sorted(set(reasons[k]) | set(v))
    d = {"NSPrivacyTracking": tracking, "NSPrivacyTrackingDomains": [], "NSPrivacyCollectedDataTypes": [],
         "NSPrivacyAccessedAPITypes": [{"NSPrivacyAccessedAPIType": k, "NSPrivacyAccessedAPITypeReasons": v} for k, v in reasons.items()]}
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        plistlib.dump(d, f)
    return path


# ============================================================================ test assets
def write_png(path, w, h, pixel, alpha=False):
    """Minimal PNG writer (stdlib). pixel(x, y) -> (r, g, b) or (r, g, b, a) in 0..255."""
    ch = 4 if alpha else 3
    rows = bytearray()
    for y in range(h):
        rows.append(0)
        for x in range(w):
            px = pixel(x, y)
            rows.extend(bytes(px[:ch]))
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6 if alpha else 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(rows), 6)) + chunk(b"IEND", b"")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(png)
    return path


def write_wav(path, seconds, rate=44100, channels=2, freq=440.0):
    """Minimal 16-bit PCM WAV writer (stdlib wave): a sine tone, for audio import tests."""
    import math
    n = int(seconds * rate)
    frames = bytearray()
    for i in range(n):
        v = int(12000 * math.sin(2 * math.pi * freq * i / rate))
        frames += struct.pack("<h", v) * channels
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with wave.open(path, "wb") as w:
        w.setnchannels(channels); w.setsampwidth(2); w.setframerate(rate)
        w.writeframes(bytes(frames))
    return path


def write_hdr(path, w, h, pixel):
    """Minimal Radiance .hdr writer (flat RGBE scanlines). pixel(x, y) -> (r, g, b) floats (linear, may exceed 1)."""
    import math
    out = bytearray(b"#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y %d +X %d\n" % (h, w))
    for y in range(h):
        for x in range(w):
            r, g, b = pixel(x, y)
            v = max(r, g, b)
            if v < 1e-32:
                out.extend(b"\0\0\0\0")
            else:
                m, e = math.frexp(v)
                s = m * 256.0 / v
                out.extend(bytes([int(r * s), int(g * s), int(b * s), e + 128]))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(bytes(out))
    return path


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description="scenario-unity-mobile helpers")
    sub = ap.add_subparsers(dest="cmd")
    s1 = sub.add_parser("scan"); s1.add_argument("project")
    s2 = sub.add_parser("aab"); s2.add_argument("path")
    s3 = sub.add_parser("xcode"); s3.add_argument("folder")
    s4 = sub.add_parser("budget"); s4.add_argument("csv"); s4.add_argument("--fps", type=int, default=60)
    s5 = sub.add_parser("soak"); s5.add_argument("csv"); s5.add_argument("--fps", type=int, default=30)
    s6 = sub.add_parser("packages"); s6.add_argument("project")
    s7 = sub.add_parser("thinning"); s7.add_argument("report")
    a = ap.parse_args()
    if a.cmd == "scan":
        print(json.dumps(code_scan(a.project), indent=1))
    elif a.cmd == "aab":
        fa = aab_facts(a.path)
        fa["gates"] = aab_findings(fa)
        print(json.dumps(fa, indent=1))
    elif a.cmd == "xcode":
        print(json.dumps(xcode_facts(a.folder), indent=1))
    elif a.cmd == "budget":
        print(json.dumps(budget_verdict(a.csv, a.fps), indent=1))
    elif a.cmd == "soak":
        print(json.dumps(soak_verdict(a.csv, a.fps), indent=1))
    elif a.cmd == "packages":
        print(json.dumps(package_check(a.project), indent=1))
    elif a.cmd == "thinning":
        print(json.dumps(app_thinning_report(a.report), indent=1))
    else:
        ap.print_help()
