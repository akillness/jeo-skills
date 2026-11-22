#!/usr/bin/env python3
"""Monetization and live-ops harness for Roblox places: receipt tests, audits, store art checks.

Built on the scenario-roblox-expert toolkit (rbx_mcp, rbx_run, rbx_play, rbx_review). Live helpers
need an open place; `audit_place`, `check_art`, `thumb_from_capture` and `mde` run offline.

    import sys; sys.path[:0] = ["<skills>/scenario-roblox-expert/scripts", "<skills>/scenario-roblox-monetization/scripts"]
    import rbx_monetization as mon
    mon.audit_place("game.rbxl")                         # offline, Lune: MonAudit findings
    r = mon.run(studio, "return Odds.display(Odds.fromWeights({{'A', 1}, {'B', 3}}))", kit=["Odds"])
    with Playtest(studio) as pt:
        mon.studio_probe(pt)                             # what each API answers in this place
    mon.check_art("icon.png", "icon")                    # icon, pass, product or thumbnail rules
    mon.thumb_from_capture("capture.png", "thumb.png")   # 16:9 crop, 1920x1080
    mon.mde(enrolled=5000, baseline=0.02)                # smallest lift an experiment can see

Pure modules (Odds, Catalog, Purchases, Telemetry, LiveConfig, Entitlements, PriceText, MonAudit)
and the data layer's Receipts inline as locals into an rbx_run chunk with `kit=[...]`.

CLI:
  rbx_monetization.py audit <place.rbxl> [--warn]
  rbx_monetization.py art <image> --kind icon|pass|product|thumbnail
  rbx_monetization.py thumb <capture.png> <out.png>
  rbx_monetization.py mde --enrolled N --baseline P [--arms 2]
"""
from __future__ import annotations

import json
import math
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
KIT_DIR = HERE / "agentkit" / "monetization"
SKILLS = HERE.parents[1]
LEAD = SKILLS / "scenario-roblox-expert" / "scripts"
DATA_KIT = SKILLS / "scenario-roblox-data" / "scripts" / "agentkit" / "data"
sys.path.insert(0, str(LEAD))
import rbx_run  # noqa: E402

__version__ = "0.1.0"

PURE = ("Odds", "Catalog", "Purchases", "Telemetry", "LiveConfig", "Entitlements", "PriceText", "ShopRank", "MonAudit")


def kit_source(names) -> str:
    """Luau that defines each named module as a local. "Receipts" comes from scenario-roblox-data."""
    parts = []
    for n in names:
        if n == "Receipts":
            path = DATA_KIT / "Receipts.luau"
            if not path.exists():
                raise FileNotFoundError("Receipts needs the scenario-roblox-data skill next to this one")
        elif n in PURE:
            path = KIT_DIR / f"{n}.luau"
        else:
            raise ValueError(f"unknown module {n}; pure modules: {', '.join(PURE)}, Receipts")
        parts.append(f"local {n} = (function()\n{path.read_text()}\nend)()")
    return "\n".join(parts) + "\n" if parts else ""


def run(studio, code: str, dm: str = "Edit", kit=(), lead_kit=(), timeout: float | None = None) -> dict:
    """rbx_run.run with this skill's modules inlined before `code`. Same result dict."""
    head = kit_source(kit)
    r = rbx_run.run(studio, head + code, dm, timeout=timeout, kit=list(lead_kit))
    if r.get("error") and head:
        r["error"] = rbx_run._fix_lines(r["error"], head.count("\n"))
    return r


def audit_place(place: str | Path, warn_only: bool = False) -> dict:
    """Offline MonAudit of a .rbxl/.rbxlx with Lune. Returns {findings, facts, tally, rules}."""
    cmd = ["lune", "run", str(KIT_DIR / "lune_mon_audit.luau"), str(Path(place).resolve())]
    if warn_only:
        cmd.append("--warn")
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    if r.returncode != 0:
        raise RuntimeError(f"lune_mon_audit failed: {r.stderr or r.stdout}")
    return json.loads(r.stdout)


# ---------------------------------------------------------------- live helpers (Studio)

PROBE_SERVER = r'''
local MPS = game:GetService("MarketplaceService")
local AS = game:GetService("AnalyticsService")
local CS = game:GetService("ConfigService")
local player = game:GetService("Players"):GetPlayers()[1]
local out = {}
local function try(label, fn)
	local t0 = os.clock()
	local ok, v = pcall(fn)
	out[label] = { ok = ok, value = if ok then v else tostring(v), ms = math.floor((os.clock() - t0) * 1000) }
end
try("productInfo_unknownProduct", function() return MPS:GetProductInfoAsync(PRODUCT_ID, Enum.InfoType.Product) end)
try("userOwnsGamePass_unknown", function() return MPS:UserOwnsGamePassAsync(player.UserId, PASS_ID) end)
for _, subId in { "EXP-0", "EXP-1", "EXP-0000000001", "not-an-id" } do
	try("subscriptionStatus " .. subId, function() return MPS:GetUserSubscriptionStatusAsync(player, subId) end)
end
-- Only the level: the answer also carries the tester's UserId, which evidence must not record.
try("priceLevel", function() return MPS:GetUsersPriceLevelsAsync({ player.UserId })[1].PriceLevel end)
try("rankProducts_server", function() return MPS:RankProductsAsync({ { InfoType = Enum.InfoType.Product, Id = PRODUCT_ID } }) end)
try("developerProducts", function() return MPS:GetDeveloperProductsAsync():GetCurrentPage() end)
try("hasRobloxSubscription", function() return player.HasRobloxSubscription end)
try("paidRandomRestricted", function() return game:GetService("PolicyService"):GetPolicyInfoForPlayerAsync(player).ArePaidRandomItemsRestricted end)
try("logCustomEvent", function() AS:LogCustomEvent(player, "ProbeEvent", 1) return "returned" end)
try("playerSegments", function() return AS:GetPlayerSegmentsAsync(player).HasData end)
try("rewardedVideo", function()
	local ad = game:GetService("AdService")
	return ad:ShowRewardedVideoAdAsync(player, ad:CreateAdRewardFromDevProductId(PRODUCT_ID))
end)
if WITH_CONFIG then
	try("getConfig", function() return CS:GetConfigAsync():GetValue("probe.key") end)
end
return out
'''

PROBE_CLIENT = r'''
local out = {}
local player = game:GetService("Players").LocalPlayer
local function try(label, fn)
	local ok, v = pcall(fn)
	out[label] = { ok = ok, value = if ok then v else tostring(v) }
end
try("adAvailability", function()
	return game:GetService("AdService"):GetAdAvailabilityNowAsync(Enum.AdFormat.RewardedVideo).AdAvailabilityResult
end)
try("rankProducts_client", function()
	return game:GetService("MarketplaceService"):RankProductsAsync({ { InfoType = Enum.InfoType.Product, Id = PRODUCT_ID } })
end)
try("configOnClient", function() return game:GetService("ConfigService"):GetConfigAsync() end)
try("analyticsOnClient", function() game:GetService("AnalyticsService"):LogCustomEvent(player, "ClientProbe", 1) return "returned" end)
return out
'''


def studio_probe(pt, product_id: int = 1001, pass_id: int = 2001, with_config: bool = False) -> dict:
    """What the monetization APIs answer in this playtest (Server and Client), without binding
    receipts or prompting. `with_config` adds ConfigService:GetConfigAsync, which takes about 30 s
    to fail in an unpublished place. Returns {"server": {...}, "client": {...}}."""
    head = f"local PRODUCT_ID, PASS_ID, WITH_CONFIG = {int(product_id)}, {int(pass_id)}, {str(with_config).lower()}\n"
    s = pt.server(head + PROBE_SERVER, timeout=90 if with_config else 30)
    c = rbx_run.run(pt.s, head + PROBE_CLIENT, "Client", timeout=30)
    return {"server": s.get("result") or {"error": s.get("error")}, "client": c.get("result") or {"error": c.get("error")}}


# ---------------------------------------------------------------- store art (offline)

ART_RULES = {
    # kind: (formats, size rule) from the Creator Hub docs pages named in references/sources.md
    "icon": ({".png", ".jpg", ".jpeg", ".bmp"}, "square, at least 512x512, readable at 150x150"),
    "pass": ({".png", ".jpg", ".jpeg", ".bmp"}, "at most 512x512, details inside the circle"),
    "product": ({".png", ".jpg", ".jpeg", ".bmp"}, "at most 512x512, details inside the circle"),
    "thumbnail": ({".png", ".jpg", ".jpeg", ".gif", ".tga", ".bmp"}, "16:9, ideally 1920x1080, under 3 MB"),
}


def _luma_std(img) -> float:
    g = img.convert("L")
    px = list(g.getdata())
    n = len(px) or 1
    mean = sum(px) / n
    return math.sqrt(sum((v - mean) ** 2 for v in px) / n) / 255


def check_art(path: str | Path, kind: str) -> dict:
    """Size, format and layout checks of store art before upload. Returns {ok, errors, warnings, numbers}.

    errors break a documented rule; warnings are heuristics ([added] thresholds) worth a look."""
    from PIL import Image  # Pillow
    p = Path(path)
    if kind not in ART_RULES:
        raise ValueError(f"kind must be one of {', '.join(ART_RULES)}")
    formats, rule = ART_RULES[kind]
    errors, warnings = [], []
    im = Image.open(p)
    w, h = im.size
    size_mb = p.stat().st_size / 1e6
    nums = {"width": w, "height": h, "mb": round(size_mb, 2), "rule": rule}
    if p.suffix.lower() not in formats:
        errors.append(f"format {p.suffix} not accepted for {kind}: {', '.join(sorted(formats))}")
    rgb = im.convert("RGB")
    if kind == "icon":
        if w != h:
            errors.append(f"icon must be square, got {w}x{h}")
        if min(w, h) < 512:
            errors.append(f"icon below 512x512: {w}x{h}")
        small = rgb.resize((150, 150), Image.LANCZOS)
        nums["std_at_150"] = round(_luma_std(small), 3)
        if nums["std_at_150"] < 0.08:
            warnings.append("flat at 150x150: little contrast left at the size players see in lists")
    elif kind in ("pass", "product"):
        if w > 512 or h > 512:
            errors.append(f"{kind} icon above 512x512: {w}x{h}")
        if w != h:
            warnings.append(f"not square ({w}x{h}): the circular crop cuts unevenly")
        # Corners outside the inscribed circle are cropped away in the store.
        cx, cy, r = w / 2, h / 2, min(w, h) / 2
        g = rgb.convert("L")
        corner, inside = [], []
        step = max(1, min(w, h) // 128)
        for y in range(0, h, step):
            for x in range(0, w, step):
                (inside if (x - cx) ** 2 + (y - cy) ** 2 <= r * r else corner).append(g.getpixel((x, y)))
        if corner:
            m = sum(corner) / len(corner)
            nums["corner_std"] = round(math.sqrt(sum((v - m) ** 2 for v in corner) / len(corner)) / 255, 3)
            if nums["corner_std"] > 0.12:
                warnings.append("detail outside the circle: corners are cropped in the store")
    else:
        ratio = w / h if h else 0
        nums["ratio"] = round(ratio, 4)
        if abs(ratio - 16 / 9) > 0.01:
            errors.append(f"thumbnail is not 16:9 ({w}x{h}): Roblox stretches it to 16:9")
        if (w, h) != (1920, 1080):
            warnings.append(f"{w}x{h}: 1920x1080 is the documented ideal")
        if size_mb >= 3:
            errors.append(f"{size_mb:.2f} MB: keep thumbnails under 3 MB")
        band = rgb.crop((0, int(h * 0.88), w, h))
        nums["bottom_band_std"] = round(_luma_std(band), 3)
        nums["image_std"] = round(_luma_std(rgb), 3)
        if nums["bottom_band_std"] > 1.5 * max(nums["image_std"], 1e-6):
            warnings.append("busy bottom band: the player count overlay covers the bottom of thumbnails")
    return {"path": str(p), "kind": kind, "ok": not errors, "errors": errors, "warnings": warnings, "numbers": nums}


def thumb_from_capture(src: str | Path, out: str | Path, size=(1920, 1080)) -> dict:
    """Center-crop a Studio capture to 16:9 and resize to `size`. PNG, or JPEG when PNG reaches 3 MB."""
    from PIL import Image
    im = Image.open(src).convert("RGB")
    w, h = im.size
    target = size[0] / size[1]
    if w / h > target:
        nw = int(h * target)
        box = ((w - nw) // 2, 0, (w - nw) // 2 + nw, h)
    else:
        nh = int(w / target)
        box = (0, (h - nh) // 2, w, (h - nh) // 2 + nh)
    im = im.crop(box).resize(size, Image.LANCZOS)
    out = Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    im.save(out)
    if out.stat().st_size >= 3e6:
        out = out.with_suffix(".jpg")
        im.save(out, quality=90)
    return {"out": str(out), "source": [w, h], "crop": list(box), "size": list(size), "upscaled": box[2] - box[0] < size[0]}


# ---------------------------------------------------------------- experiments (offline)

def mde(enrolled: int, baseline: float, arms: int = 2, alpha: float = 0.05, power: float = 0.8) -> dict:
    """[added] Smallest lift a rate metric (payer conversion, D1) can show with `enrolled` unique
    users split evenly over `arms`: two-sided two-proportion z test. Roblox reports its own MDE in
    the Experiments dashboard; use this before launching to see if a test is worth running."""
    from statistics import NormalDist
    per_arm = enrolled / arms
    z = NormalDist().inv_cdf(1 - alpha / 2) + NormalDist().inv_cdf(power)
    absolute = z * math.sqrt(2 * baseline * (1 - baseline) / per_arm)
    return {"per_arm": int(per_arm), "absolute": round(absolute, 5), "relative": round(absolute / baseline, 4)}


def _main(argv: list[str]) -> int:
    import argparse
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("audit")
    a.add_argument("place")
    a.add_argument("--warn", action="store_true")
    b = sub.add_parser("art")
    b.add_argument("image")
    b.add_argument("--kind", required=True, choices=sorted(ART_RULES))
    c = sub.add_parser("thumb")
    c.add_argument("capture")
    c.add_argument("out")
    d = sub.add_parser("mde")
    d.add_argument("--enrolled", type=int, required=True)
    d.add_argument("--baseline", type=float, required=True)
    d.add_argument("--arms", type=int, default=2)
    args = ap.parse_args(argv)
    if args.cmd == "audit":
        r = audit_place(args.place, args.warn)
        print(json.dumps(r, indent=1))
        return 1 if r["tally"].get("error", 0) else 0
    if args.cmd == "art":
        r = check_art(args.image, args.kind)
        print(json.dumps(r, indent=1))
        return 0 if r["ok"] else 1
    if args.cmd == "thumb":
        print(json.dumps(thumb_from_capture(args.capture, args.out), indent=1))
        return 0
    print(json.dumps(mde(args.enrolled, args.baseline, args.arms), indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(_main(sys.argv[1:]))
