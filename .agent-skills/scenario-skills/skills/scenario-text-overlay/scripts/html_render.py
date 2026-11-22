"""Browser-engine rendering: overlay payloads to transparent PNGs.

Pages are captured with a Chromium-family browser's headless screenshot
mode, so any installed Chrome, Chromium, Edge, or Brave works and no Python
browser bindings are needed. Rich layers get full HTML/CSS typography; text
layers are translated to an absolutely positioned block that mirrors the
text-layer contract (wrap at the box width; clip and shrink overflow).
"""

import html
import os
import re
import subprocess
import shutil
import sys
import tempfile
from pathlib import Path
from urllib.parse import quote_plus, urlparse

DEFAULT_STYLE = "html, body { margin:0; padding:0; background: transparent; }"
BROWSER_ENV = "SCENARIO_TEXT_OVERLAY_BROWSER"
MIN_SHRINK_SIZE = 4
# Virtual time pauses while resource fetches (fonts included) are pending,
# and both font paths are paint-blocking (font-display: block), so
# --screenshot captures the loaded face, never fallback glyphs.
_VIRTUAL_TIME_BUDGET_MS = 10000

# Hostname suffixes a page may reference without a warning. Anything else
# should be inlined as a data: URI so the render is self-contained and
# reproducible offline.
_QUIET_HOSTNAME_SUFFIXES = (
    "fonts.googleapis.com",
    "fonts.gstatic.com",
    "scenario.com",
)

_BROWSER_CANDIDATES = (
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser",
    "microsoft-edge",
    "brave-browser",
    "chrome",
)


def _resolve_candidate(candidate):
    return shutil.which(candidate) or (candidate if Path(candidate).is_file() else None)


def find_browser(explicit=None):
    """Return the path of a usable Chromium-family browser, or None.

    An explicit path (--browser) or $SCENARIO_TEXT_OVERLAY_BROWSER that does
    not resolve is an error rather than a silent fallback.
    """
    for source in (explicit, os.environ.get(BROWSER_ENV)):
        if source:
            found = _resolve_candidate(source)
            if not found:
                raise SystemExit(f"browser not found: {source!r}")
            return found
    for candidate in _BROWSER_CANDIDATES:
        found = _resolve_candidate(candidate)
        if found:
            return found
    return None


def google_fonts_url(family, weight, style):
    """Return the css2 URL for one family/weight/style, paint blocked on load."""
    ital = 1 if style == "italic" else 0
    family_qs = quote_plus(family)
    return (
        "https://fonts.googleapis.com/css2"
        f"?family={family_qs}:ital,wght@{ital},{weight}"
        "&display=block"
    )


def assemble_html(body, css=None):
    """Wrap a rendered body fragment in the deterministic HTML5 shell.

    Default style first so payload CSS wins.
    """
    user_css = f"\n{css}" if css else ""
    return (
        "<!doctype html><html><head>"
        '<meta charset="utf-8">'
        f"<style>{DEFAULT_STYLE}{user_css}</style>"
        f"</head><body>{body}</body></html>"
    )


def text_layer_html(payload, rendered_text, font_size, measure=False):
    """Return a full HTML document for a text-layer payload at a fixed size.

    The rendered text is embedded HTML-escaped so its glyphs appear exactly
    as substituted. With measure=True the page carries a script that waits
    for fonts, binary-searches the largest size in [MIN_SHRINK_SIZE,
    font_size] whose wrapped height fits the box, and records the result
    (-1 when even the minimum overflows) in a data-fitted-size attribute on
    <body> for --dump-dom to read.
    """
    box = payload["bbox"][0]
    if payload.get("font_family"):
        family = payload["font_family"]
        fonts_url = google_fonts_url(family, payload["font_weight"], payload["font_style"])
        head = f'<link rel="stylesheet" href="{fonts_url}">'
        css = None
    else:
        family = "scenario-overlay-font"
        head = ""
        css = (
            f"@font-face {{ font-family: '{family}'; "
            f"src: url('{payload['font_url']}'); "
            f"font-weight: {payload['font_weight']}; "
            f"font-style: {payload['font_style']}; "
            "font-display: block; }"
        )
    clip = f" height:{box['h']}px; overflow:hidden;" if payload["overflow"] == "clip" else ""
    body = (
        f"{head}"
        f'<div style="position:absolute; left:{box["x"]}px; top:{box["y"]}px;'
        f' width:{box["w"]}px;{clip}">'
        f'<div id="overlay-text" style="'
        f"font-family:'{family}'; "
        f"font-weight:{payload['font_weight']}; "
        f"font-style:{payload['font_style']}; "
        f"font-size:{font_size}px; "
        f"color:{payload['color']}; "
        f"text-align:{payload['align']}; "
        f"line-height:{payload['line_height']}; "
        f"letter-spacing:{payload['letter_spacing']}px; "
        f'white-space:pre-wrap; overflow-wrap:break-word;">'
        f"{html.escape(rendered_text)}</div></div>"
    )
    if measure:
        body += (
            "<script>document.fonts.ready.then(function () {"
            'var el = document.getElementById("overlay-text");'
            f"var max = {box['h']}, lo = {MIN_SHRINK_SIZE}, hi = {font_size}, fit = -1;"
            "function heightAt(px) {"
            'el.style.fontSize = px + "px";'
            "return el.getBoundingClientRect().height; }"
            "if (heightAt(lo) <= max) { fit = lo;"
            "while (lo < hi) {"
            "var mid = Math.floor((lo + hi + 1) / 2);"
            "if (heightAt(mid) <= max) { fit = mid; lo = mid; } else { hi = mid - 1; } } }"
            'document.body.setAttribute("data-fitted-size", String(fit));'
            "});</script>"
        )
    return assemble_html(body, css)


def _run_browser(browser, page_path, extra_args):
    command = [
        browser,
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--no-first-run",
        f"--virtual-time-budget={_VIRTUAL_TIME_BUDGET_MS}",
        *extra_args,
        Path(page_path).resolve().as_uri(),
    ]
    try:
        return subprocess.run(command, capture_output=True, text=True, timeout=120)
    except subprocess.TimeoutExpired:
        raise SystemExit("browser timed out rendering the page (120s)")


def screenshot(browser, html_doc, out_path, width, height, device_scale_factor=1.0):
    """Capture html_doc as a transparent PNG of width x height (times scale)."""
    with tempfile.TemporaryDirectory() as tmp:
        page = Path(tmp) / "overlay.html"
        page.write_text(html_doc, encoding="utf-8")
        args = [
            f"--window-size={width},{height}",
            "--default-background-color=00000000",
            f"--screenshot={Path(out_path).resolve()}",
        ]
        if device_scale_factor != 1.0:
            args.insert(0, f"--force-device-scale-factor={device_scale_factor}")
        result = _run_browser(browser, page, args)
    if result.returncode != 0 or not Path(out_path).is_file():
        raise SystemExit(
            f"browser screenshot failed (exit {result.returncode}):\n{result.stderr.strip()}"
        )


def fitted_size(browser, measure_doc):
    """Run a measuring page and return the fitted font size (-1: no fit)."""
    with tempfile.TemporaryDirectory() as tmp:
        page = Path(tmp) / "measure.html"
        page.write_text(measure_doc, encoding="utf-8")
        result = _run_browser(browser, page, ["--dump-dom"])
    match = re.search(r'data-fitted-size="(-?\d+)"', result.stdout)
    if result.returncode != 0 or not match:
        raise SystemExit(
            f"browser measurement failed (exit {result.returncode}):\n{result.stderr.strip()}"
        )
    return int(match.group(1))


def warn_remote_urls(html_doc, allowed_url_prefixes=()):
    """Warn (stderr) about URLs the local browser would fetch over the network.

    https URLs on the quiet suffixes or on a host named in
    allowed_url_prefixes pass silently; everything else earns a warning,
    because a self-contained page (assets inlined as data: URIs) renders
    reproducibly anywhere, offline included.
    """
    allowed_hosts = set()
    for prefix in allowed_url_prefixes:
        host = (urlparse(prefix).hostname or "").lower()
        if host:
            allowed_hosts.add(host)
    warned = set()
    for url in re.findall(r"""https?://[^\s"'<>)]+""", html_doc, flags=re.IGNORECASE):
        parsed = urlparse(url)
        host = (parsed.hostname or "").lower()
        quiet = parsed.scheme.lower() == "https" and (
            host in allowed_hosts
            or any(host == s or host.endswith("." + s) for s in _QUIET_HOSTNAME_SUFFIXES)
        )
        if quiet or url in warned:
            continue
        warned.add(url)
        print(
            f"warning: the page references {url}; the local browser will try to "
            "fetch it. Inline assets as data: URIs for a self-contained render.",
            file=sys.stderr,
        )
