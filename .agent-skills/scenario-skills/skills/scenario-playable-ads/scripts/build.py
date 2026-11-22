"""Inline the runtime, game code and every {{asset}} into one self-contained playable per network.

Usage: python3 build.py <project_dir> [--networks meta,google,web | all] [--bundle]

Reads <project_dir>/src/index.src.html:
  <!-- include: path -->   replaced by a <script> with that file (path relative to project_dir)
  <!-- network:head -->    replaced by the network's head tags
  {{name.ext}}            replaced by a data URI of assets/web/name.ext
Writes dist/<network>/index.html for every network, plus the package each network takes (see NETWORKS):
  dist/google/<project>-google.zip, dist/meta/<project>-meta.zip, dist/liftoff/<project>-liftoff.zip,
  dist/pangle/<project>-pangle.zip (index.html + config.json). --bundle (or --networks all) also writes
  dist/<project>-networks.zip with one deliverable per network, named <project>-<network>.html|zip.
Refuses external references (two allowed exceptions, Google's exitapi.js and the TikTok/Pangle playable SDK),
emoji in the source, builds over a network's size limit, and fetch/XHR/storage calls in the game's own code.
The per-network contract, and what is still unconfirmed, is in the skill's references/networks.md.

Third-party bundles (an include whose path ends in .min.js or sits under vendor/, such as a tree-shaken
three.js) are not scanned for fetch/XHR/storage: libraries carry unused loader code. The hard guard is
still zero network requests at run time (qa.py zero_network_requests) and no external src/href here.

{{hand.webp}} (the hint hand) is optional: without assets/web/hand.webp the runtime draws a vector hand.
"""
import argparse
import base64
import json
import re
import sys
import zipfile
from pathlib import Path

MIME = {".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".mp3": "audio/mpeg",
        ".woff2": "font/woff2", ".glb": "model/gltf-binary", ".bin": "application/octet-stream",
        ".json": "application/json"}
FORBIDDEN = re.compile(r"localStorage|sessionStorage|XMLHttpRequest|fetch\(")
EXITAPI = "https://tpc.googlesyndication.com/pagead/gadgets/html5/api/exitapi.js"
PANGLE_SDK = "https://sf16-muse-va.ibytedtos.com/obj/union-fe-nc-i18n/playable/sdk/playable-sdk.js"
MB = 1024 * 1024


def net_tag(name):
    return f'<script>window.NETWORK="{name}";</script>'


# Per network: head tags, body tags, the package the network takes, its size cap, the one external file it may load.
#   head:    replaces <!-- network:head -->
#   body:    goes right before the first <script> in <body>, ahead of the game's own JS
#   package: "html" = dist/<net>/index.html is the deliverable; "zip" = <project>-<net>.zip with index.html at its root
#   extra:   files that go in the ZIP next to index.html
#   html_cap applies to the HTML file, cap to the deliverable (the ZIP when there is one)
# Sources and the unconfirmed items: the skill's references/networks.md.
NETWORKS = {
    # Meta: single HTML up to 2 MB, or a ZIP up to 5 MB whose index.html is also capped at 2 MB
    "meta":      {"head": net_tag("meta"), "package": "zip", "html_cap": 2 * MB, "cap": 5 * MB, "external": None},
    # Google App campaigns: ZIP up to 5 MB; orientation meta, exitapi.js and ExitApi.exit() for the CTA
    "google":    {"head": ('<meta name="ad.orientation" content="portrait">\n'
                           f'<script src="{EXITAPI}"></script>\n' + net_tag("google")),
                  "package": "zip", "html_cap": None, "cap": 5 * MB, "external": EXITAPI},
    # MRAID containers inject window.mraid; the runtime waits for ready and for viewable
    "applovin":  {"head": net_tag("applovin"), "package": "html", "html_cap": 5 * MB, "cap": 5 * MB, "external": None},
    "unity":     {"head": net_tag("unity"), "package": "html", "html_cap": 5 * MB, "cap": 5 * MB, "external": None},
    "mraid":     {"head": net_tag("mraid"), "package": "html", "html_cap": 5 * MB, "cap": 5 * MB, "external": None},
    # Moloco: FbPlayableAd.onCTAClick() rather than MRAID
    "moloco":    {"head": net_tag("moloco"), "package": "html", "html_cap": 5 * MB, "cap": 5 * MB, "external": None},
    # Mintegral: single HTML; lifecycle gameReady, gameStart, gameEnd, gameRetry, gameClose, install
    "mintegral": {"head": net_tag("mintegral"), "package": "html", "html_cap": 5 * MB, "cap": 5 * MB, "external": None},
    # Liftoff: parent.postMessage('download'); its MRAID buyers take the "mraid" file
    "liftoff":   {"head": net_tag("liftoff"), "package": "zip", "html_cap": 5 * MB, "cap": 5 * MB, "external": None},
    # TikTok / Pangle: playable SDK at the end of body before the game's JS, config.json orientation (1 = portrait only)
    "pangle":    {"head": net_tag("pangle"), "body": f'<script src="{PANGLE_SDK}"></script>',
                  "package": "zip", "html_cap": 5 * MB, "cap": 5 * MB, "external": PANGLE_SDK,
                  "extra": {"config.json": json.dumps({"playable_orientation": 1})}},
    "web":       {"head": net_tag("web"), "package": "html", "html_cap": None, "cap": None, "external": None},
}
ALL = list(NETWORKS)

ap = argparse.ArgumentParser()
ap.add_argument("project")
ap.add_argument("--networks", default="meta,google", help="comma list, or 'all'")
ap.add_argument("--bundle", action="store_true", help="also write dist/<project>-networks.zip")
args = ap.parse_args()
nets = ALL if args.networks == "all" else args.networks.split(",")
unknown = [n for n in nets if n not in NETWORKS]
assert not unknown, f"unknown network(s) {unknown}; known: {', '.join(ALL)}"
root = Path(args.project).resolve()
src = (root / "src" / "index.src.html").read_text(encoding="utf-8")


OWN, VENDOR = [], []


def third_party(path):
    return path.endswith(".min.js") or path.startswith("vendor/") or "/vendor/" in path


def include(m):
    path = m.group(1).strip()
    code = (root / path).read_text(encoding="utf-8")
    (VENDOR if third_party(path) else OWN).append((path, code))
    assert "</script" not in code.lower(), f"{m.group(1)} contains </script"
    return f"<script>\n{code}\n</script>"


OPTIONAL = {"hand.webp"}  # the runtime has a vector fallback for these


def inline(m):
    path = root / "assets" / "web" / m.group(1)
    if not path.exists() and m.group(1) in OPTIONAL:
        return ""
    data = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{MIME[path.suffix]};base64,{data}"


html = re.sub(r"<!--\s*include:\s*(.+?)\s*-->", include, src)
# a network's body tags go right before the first script in <body>, ahead of the game's own JS
BODY_MARK = "<!-- network:body -->"
first_script = html.find("<script", max(html.find("<body"), 0))
assert html.find("<body") >= 0 and first_script >= 0, "template needs a <body> holding the game's scripts"
html = html[:first_script] + BODY_MARK + "\n" + html[first_script:]
# no emoji anywhere in the ad: check the code before assets are inlined
EMOJI = re.compile("[\U0001F000-\U0001FAFF☀-➿️⬀-⯿]")
bad = sorted(set(EMOJI.findall(html)))
assert not bad, f"emoji in the source: {bad}"
# the game's own code (and the page) must never call the network or storage
for path, code in [("src/index.src.html", src)] + OWN:
    hit = FORBIDDEN.search(code)
    assert not hit, f"{path}: storage or network API in the game's code: {hit.group(0)}"
for path, code in VENDOR:
    if FORBIDDEN.search(code):
        print(f"note: {path} (third-party) contains fetch/XHR/storage code; QA must still see zero requests")
html = re.sub(r"\{\{([\w.-]+)\}\}", inline, html)
assert "{{" not in html, "unresolved asset token"
assert "<!-- network:head -->" in html, "template needs a <!-- network:head --> marker"

ok = True
deliverables = {}  # network -> path of the file a network takes
for net in nets:
    spec = NETWORKS[net]
    out_html = html.replace("<!-- network:head -->", spec["head"]).replace(BODY_MARK, spec.get("body", ""))
    # a playable must not load anything from the network (each network's own SDK file is the one exception)
    external = [u for u in re.findall(r'(?:src|href)=["\']((?:https?:)?//[^"\']+)', out_html) if u != spec["external"]]
    assert not external, f"{net}: external resource reference: {external}"
    d = root / "dist" / net
    d.mkdir(parents=True, exist_ok=True)
    out = d / "index.html"
    out.write_text(out_html, encoding="utf-8")
    size = out.stat().st_size
    msg = f"{net:9s} {out.relative_to(root)}  {size / 1024:.0f} KB"
    if spec["html_cap"] and size > spec["html_cap"]:
        msg += f"  HTML OVER LIMIT ({spec['html_cap'] // 1024} KB)"
        ok = False
    deliverable = out
    if spec["package"] == "zip":
        z = d / f"{root.name}-{net}.zip"
        with zipfile.ZipFile(z, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.write(out, "index.html")
            for name, body in spec.get("extra", {}).items():
                zf.writestr(name, body)
        deliverable = z
        msg += f"  zip {z.name} {z.stat().st_size / 1024:.0f} KB"
    for name, body in spec.get("extra", {}).items():
        (d / name).write_text(body, encoding="utf-8")  # also beside index.html so the folder mirrors the zip
    dsize = deliverable.stat().st_size
    if spec["cap"] and dsize > spec["cap"]:
        msg += f"  OVER LIMIT ({spec['cap'] // 1024} KB)"
        ok = False
    deliverables[net] = deliverable
    print(msg)

if args.bundle or args.networks == "all":
    b = root / "dist" / f"{root.name}-networks.zip"
    with zipfile.ZipFile(b, "w", zipfile.ZIP_DEFLATED) as zf:
        for net, f in deliverables.items():
            if net != "web":  # "web" is the local preview, not something a network takes
                zf.write(f, f"{root.name}-{net}{f.suffix}")
    n_files = sum(1 for n in deliverables if n != "web")
    print(f"bundle    {b.relative_to(root)}  {b.stat().st_size / 1024:.0f} KB  ({n_files} files)")
sys.exit(0 if ok else 1)
