"""
ut_web: the runner side of the scenario-unity-web skill. Everything a Unity 6.3 Web build needs after (and
around) the build itself: the header table, a local test server that serves those headers (HTTP or
HTTPS, optional COOP/COEP), a header audit, a size and budget report measured the way portals
measure it, static scans for C# APIs that hang the browser and for ES6 or deprecated calls in
.jslib files, a headless browser check (Playwright + installed Chrome) that asserts the build loaded,
which graphics API really runs, and that the JavaScript interop fired, and itch.io packaging.

System python3 3.9+, stdlib only; optional: brotli (else the brotli CLI), playwright (browser_check).
Imports the shared toolkit, never copies it:
    import sys; sys.path.insert(0, "<skills>/scenario-unity-expert/scripts"); sys.path.insert(0, "<skills>/scenario-unity-web/scripts")
    import ut_env, ut_run, ut_web
    P = ut_env.base_project("3d", "<root>/tests/projects/unity-web")
    ut_web.install_runtime(P); ut_env.install_agentkit(P, src=ut_web.AGENTKIT_WEB)
    ut_run.run_method(P, "AgentKit.Web.WebJobs.ApplySettings", {"preset": "own-https"}, build_target="WebGL")
    b = ut_run.build(P, "web", out="Builds/Web")
    srv = ut_web.serve(P + "/Builds/Web")                 # correct Content-Encoding / Content-Type
    ut_web.header_audit(srv.url, P + "/Builds/Web")       # verdict per file
    ut_web.budget_check(ut_web.size_report(P + "/Builds/Web"), portal="crazygames-mobile")
    r = ut_web.browser_check(srv.url + "index.html", wait_events=("ready", "gameplay_start", "leaderboard"))
    srv.stop()

v0.2 adds: an error collector on the test server (ERROR_ENDPOINT, srv.error_reports()), browser_check
engine="webkit", phone emulation, frame_match (portal iframe), metrics soak (GetMetricsInfo), loading
screenshot and custom actions; heap_advice, build_log_report, package_report, merge_texture_variants
(dual DXT/ASTC data), add_preload, iframe_host_page, PAGE_INPUT_JS; a targetFrameRate rule in the scan.

Run in Unity 6000.3.21f1 builds on 2026-09-24 (macOS 26.5.1, Apple Silicon, Chrome 153 headless):
tests/code/unity-web/test_offline.py, test_live_web.py and test_live_web_v2.py.
"""

__version__ = "0.1"  # scenario-unity-web skill v0.1 (2026-09-24 refactor after blind grade Y12)

import datetime
import gzip
import http.server
import json
import os
import re
import shutil
import ssl
import subprocess
import threading
import time
import urllib.parse
import zipfile

SKILL_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUNTIME_SRC = os.path.join(SKILL_DIR, "scripts", "WebRuntime")
AGENTKIT_WEB = os.path.join(SKILL_DIR, "scripts", "AgentKit")
SCREENSHOT_DIR = os.path.expanduser("~/Developer/scratch/playwright-screenshots")
MB = 1000 * 1000  # portal limits are read as decimal MB (the stricter reading) [added]

# ============================================================================ header table
# 6.3 Manual, "Deploy a Web application" + server samples (Apache, Nginx, IIS, Node.js):
# precompressed files need the matching Content-Encoding; every .wasm variant needs
# application/wasm (streaming compilation); .data.gz is application/gzip because of Safari bug
# 247421; .unityweb (Decompression Fallback on) is decoded by the loader's JavaScript.
_RULES = [
    (r"\.wasm\.br$", "application/wasm", "br"),
    (r"\.wasm\.gz$", "application/wasm", "gzip"),
    (r"\.wasm$", "application/wasm", None),
    (r"\.js\.br$", "application/javascript", "br"),
    (r"\.js\.gz$", "application/javascript", "gzip"),
    (r"\.js$", "application/javascript", None),
    (r"\.data\.br$", "application/octet-stream", "br"),
    (r"\.data\.gz$", "application/gzip", "gzip"),
    (r"\.data$", "application/octet-stream", None),
    (r"\.symbols\.json\.br$", "application/octet-stream", "br"),
    (r"\.symbols\.json\.gz$", "application/octet-stream", "gzip"),
    (r"\.json$", "application/json", None),
    (r"\.(unityweb|bundle)$", "application/octet-stream", None),
    (r"\.html?$", "text/html; charset=utf-8", None),
    (r"\.css$", "text/css", None),
    (r"\.png$", "image/png", None),
    (r"\.jpe?g$", "image/jpeg", None),
    (r"\.ico$", "image/x-icon", None),
    (r"\.webmanifest$", "application/manifest+json", None),
]


def expected_headers(path):
    """(Content-Type, Content-Encoding or None) a correct server sends for a Unity Web build file."""
    p = urllib.parse.urlparse(path).path.lower()
    for rx, ctype, enc in _RULES:
        if re.search(rx, p):
            return ctype, enc
    return None, None


def headers_table():
    """The table as Markdown (for READMEs, handoffs, server tickets)."""
    rows = ["| File suffix | Content-Type | Content-Encoding |", "|---|---|---|"]
    for rx, ctype, enc in _RULES[:13]:
        rows.append("| `%s` | `%s` | %s |" % (rx.replace("\\", "").replace("$", ""), ctype, "`%s`" % enc if enc else "none"))
    return "\n".join(rows)


THREADS_HEADERS = {  # Native C/C++ multithreading: on HTML and JS responses (6.3 Manual)
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp",
    "Cross-Origin-Resource-Policy": "cross-origin",
}


# ============================================================================ runtime install
def install_runtime(project, addressables=False, tests=False):
    """Copy the skill's runtime pieces into the project (files only, Unity imports them on start):
    WebRuntime/Scripts/*.cs -> Assets/AgentWeb/Scripts/, WebRuntime/Plugins/WebGL/*.jslib ->
    Assets/AgentWeb/Plugins/WebGL/, WebRuntime/WebGLTemplates/AgentWeb -> Assets/WebGLTemplates/AgentWeb.
    addressables=True also installs the optional Addressables loader and its editor job (the project
    must list com.unity.addressables: add_package). tests=True installs the EditMode policy tests
    (AgentKitOptional/Tests -> Assets/AgentWeb/EditorTests, own asmdef; needs com.unity.test-framework).
    Files are rewritten only when their content changed. Returns the written paths."""
    root = _project_root(project)
    maps = [
        (os.path.join(RUNTIME_SRC, "Scripts"), os.path.join(root, "Assets", "AgentWeb", "Scripts")),
        (os.path.join(RUNTIME_SRC, "Plugins", "WebGL"), os.path.join(root, "Assets", "AgentWeb", "Plugins", "WebGL")),
        (os.path.join(RUNTIME_SRC, "WebGLTemplates", "AgentWeb"), os.path.join(root, "Assets", "WebGLTemplates", "AgentWeb")),
    ]
    if tests:
        maps.append((os.path.join(SKILL_DIR, "scripts", "AgentKitOptional", "Tests"),
                     os.path.join(root, "Assets", "AgentWeb", "EditorTests")))
    if addressables:
        maps += [
            (os.path.join(RUNTIME_SRC, "Optional", "Addressables"), os.path.join(root, "Assets", "AgentWeb", "Addressables")),
            (os.path.join(SKILL_DIR, "scripts", "AgentKitOptional", "Addressables"),
             os.path.join(root, "Assets", "Editor", "AgentKit", "WebAddressables")),
        ]
    written = []
    for src, dst in maps:
        for dirpath, _dirs, files in os.walk(src):
            rel = os.path.relpath(dirpath, src)
            for fn in files:
                if fn.startswith(".") or fn.endswith(".meta"):
                    continue
                s = os.path.join(dirpath, fn)
                d = os.path.normpath(os.path.join(dst, rel, fn))
                if os.path.isfile(d) and _read(s) == _read(d):
                    continue
                os.makedirs(os.path.dirname(d), exist_ok=True)
                shutil.copyfile(s, d)
                written.append(os.path.relpath(d, root))
    return written


def add_package(project, name, version):
    """Add or pin a package in Packages/manifest.json (Unity resolves it on the next start; needs
    network the first time). The previous manifest is kept as manifest.json.bak-<timestamp>.
    Returns True when the file changed."""
    root = _project_root(project)
    path = os.path.join(root, "Packages", "manifest.json")
    with open(path) as f:
        text = f.read()
    data = json.loads(text)
    if data.get("dependencies", {}).get(name) == version:
        return False
    shutil.copyfile(path, path + ".bak-" + datetime.datetime.now().strftime("%Y%m%d-%H%M%S"))
    data.setdefault("dependencies", {})[name] = version
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")
    return True


def _project_root(project):
    p = os.path.abspath(project)
    while p != "/" and not os.path.isdir(os.path.join(p, "Assets")):
        p = os.path.dirname(p)
    if p == "/":
        raise FileNotFoundError("not a Unity project: %s" % project)
    return p


def _read(path):
    with open(path, "rb") as f:
        return f.read()


# ============================================================================ local server
class _Log(object):
    def __init__(self):
        self.lock = threading.Lock()
        self.rows = []

    def add(self, row):
        with self.lock:
            self.rows.append(row)


ERROR_ENDPOINT = "/__agentweb_errors"   # test-server sink for the template's error reports (sendBeacon POST)


def _make_handler(root, mode, threads, cors, cache, log):
    base = http.server.SimpleHTTPRequestHandler

    class Handler(base):
        def __init__(self, *a, **kw):
            super().__init__(*a, directory=root, **kw)

        def log_message(self, fmt, *args):  # quiet; rows go to log
            pass

        def do_POST(self):
            # stands in for a production error collector: the AgentWeb template (errorHandler, loader
            # banners) and WebErrorReporter.cs (C# exceptions) POST JSON here with navigator.sendBeacon
            path = urllib.parse.urlparse(self.path).path
            n = int(self.headers.get("Content-Length") or 0)
            body = self.rfile.read(n) if n else b""
            if path != ERROR_ENDPOINT:
                self.send_response(404)
                self.end_headers()
                return
            try:
                payload = json.loads(body.decode("utf-8", "replace"))
            except ValueError:
                payload = {"raw": body.decode("utf-8", "replace")[:4000]}
            log.add({"t": time.time(), "method": "POST", "path": path, "status": 204, "error_report": payload})
            self.send_response(204)
            self.end_headers()

        def send_response(self, code, message=None):
            self._code = code
            super().send_response(code, message)

        def guess_type(self, path):
            if mode == "naive":
                return base.guess_type(self, path)
            ctype, _enc = expected_headers(path)
            if mode == "no-wasm-type" and ctype == "application/wasm":
                return "application/octet-stream"
            return ctype or base.guess_type(self, path)

        def end_headers(self):
            path = urllib.parse.urlparse(self.path).path
            ctype, enc = expected_headers(path)
            ok = getattr(self, "_code", 200) in (200, 206, 304)
            if ok and mode != "naive" and enc:
                self.send_header("Content-Encoding", enc)
            if ok and mode != "naive":
                if path.endswith("/") or path.endswith(".html"):
                    self.send_header("Cache-Control", "no-cache")
                elif cache:
                    self.send_header("Cache-Control", cache)
            if threads and re.search(r"(\.html?|\.js(\.gz|\.br)?|/)$", path):
                for k, v in THREADS_HEADERS.items():
                    self.send_header(k, v)
            if cors:
                self.send_header("Access-Control-Allow-Origin", "*")
            log.add({"t": time.time(), "method": self.command, "path": path, "status": getattr(self, "_code", None),
                     "content_type": ctype if mode != "naive" else None, "content_encoding": enc if (ok and mode != "naive") else None})
            super().end_headers()

    return Handler


class _QuietServer(http.server.ThreadingHTTPServer):
    daemon_threads = True

    def handle_error(self, request, client_address):
        # browsers drop connections (tab closed, request cancelled): not an error worth a traceback
        import sys
        exc = sys.exc_info()[1]
        if isinstance(exc, (ConnectionResetError, BrokenPipeError, ssl.SSLError, TimeoutError)):
            return
        super().handle_error(request, client_address)


class WebServer(object):
    """A local static server for a Unity Web build folder, in a background thread.
    mode: "unity" (the header table: right Content-Encoding and Content-Type), "naive" (Python's
    http.server as is: no Content-Encoding, like most quick local servers), "no-wasm-type" (right
    encodings, .wasm served as application/octet-stream). https=True needs cert and key (see
    self_signed_cert). threads=True adds COOP/COEP/CORP. host "0.0.0.0" exposes the folder to the
    whole network: bind it only for phone tests and stop it afterwards."""

    def __init__(self, root, host="127.0.0.1", port=0, mode="unity", https=False, cert=None, key=None,
                 threads=False, cors=False, cache=None, url_host=None):
        if mode not in ("unity", "naive", "no-wasm-type"):
            raise ValueError("mode must be unity, naive or no-wasm-type")
        self.root = os.path.abspath(root)
        if not os.path.isfile(os.path.join(self.root, "index.html")):
            raise FileNotFoundError("no index.html in %s" % self.root)
        self.log = _Log()
        handler = _make_handler(self.root, mode, threads, cors, cache, self.log)
        self.httpd = _QuietServer((host, port), handler)
        if https:
            if not (cert and key):
                raise ValueError("https=True needs cert and key (ut_web.self_signed_cert)")
            ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            ctx.minimum_version = ssl.TLSVersion.TLSv1_2
            ctx.load_cert_chain(cert, key)
            self.httpd.socket = ctx.wrap_socket(self.httpd.socket, server_side=True)
        self.port = self.httpd.server_address[1]
        self.mode = mode
        shown = url_host or ("localhost" if host in ("127.0.0.1", "0.0.0.0") else host)
        self.url = "%s://%s:%d/" % ("https" if https else "http", shown, self.port)
        self._thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self._thread.start()

    def url_for(self, host):
        return re.sub(r"//[^:/]+:", "//%s:" % host, self.url)

    def requests(self):
        return list(self.log.rows)

    def error_reports(self):
        """Error reports POSTed to ERROR_ENDPOINT (template errorHandler, loader banners, C# exceptions)."""
        return [r["error_report"] for r in self.log.rows if r.get("error_report") is not None]

    def stop(self):
        self.httpd.shutdown()
        self.httpd.server_close()


def serve(root, **kw):
    """Start a WebServer (see its docstring) and return it; call .stop() when done."""
    return WebServer(root, **kw)


def lan_ip():
    """This Mac's LAN address (en0, then en1), for phone tests. None when offline."""
    for iface in ("en0", "en1"):
        try:
            out = subprocess.run(["ipconfig", "getifaddr", iface], capture_output=True, text=True, timeout=5).stdout.strip()
        except Exception:
            out = ""
        if out:
            return out
    return None


def self_signed_cert(out_dir, hosts=("localhost", "127.0.0.1"), days=30):
    """Self-signed certificate for local HTTPS (sensors, WebGPU and Brotli on a phone need a secure
    context). openssl req -x509 with subjectAltName for every host (DNS names and IPs).
    Returns (cert_path, key_path). The phone still shows a warning: accept it for tests only."""
    os.makedirs(out_dir, exist_ok=True)
    cert, key = os.path.join(out_dir, "cert.pem"), os.path.join(out_dir, "key.pem")
    san = ",".join(("IP:%s" % h) if re.match(r"^\d+\.\d+\.\d+\.\d+$", h) else ("DNS:%s" % h) for h in hosts)
    cmd = ["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", cert,
           "-days", str(days), "-subj", "/CN=%s" % hosts[0], "-addext", "subjectAltName=%s" % san]
    subprocess.run(cmd, check=True, capture_output=True)
    return cert, key


# ============================================================================ header audit
def _fetch(url, method="GET", insecure=True, read_bytes=64):
    u = urllib.parse.urlparse(url)
    if u.scheme == "https":
        ctx = ssl.create_default_context()
        if insecure:
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
        import http.client as hc
        conn = hc.HTTPSConnection(u.hostname, u.port or 443, timeout=20, context=ctx)
    else:
        import http.client as hc
        conn = hc.HTTPConnection(u.hostname, u.port or 80, timeout=20)
    conn.request(method, u.path or "/", headers={"Accept-Encoding": "gzip, deflate, br"})
    r = conn.getresponse()
    body = r.read() if method == "GET" else b""
    hdrs = {k.lower(): v for k, v in r.getheaders()}
    conn.close()
    return r.status, hdrs, body


def build_files(build_root):
    """Files of a Web build: {"index", "build": [names], "compression", "fallback", "hashed", "symbols",
    "streaming_assets": [relative paths], "template_data": [names]}."""
    root = os.path.abspath(build_root)
    bdir = os.path.join(root, "Build")
    names = sorted(os.listdir(bdir)) if os.path.isdir(bdir) else []
    comp = "br" if any(n.endswith(".br") for n in names) else ("gzip" if any(n.endswith(".gz") for n in names) else None)
    fallback = any(n.endswith(".unityweb") for n in names)
    hashed = any(re.match(r"^[0-9a-f]{32}\.", n) for n in names)
    sa, td = [], []
    for sub, acc in (("StreamingAssets", sa), ("TemplateData", td)):
        d = os.path.join(root, sub)
        for dirpath, _d, files in os.walk(d):
            for fn in files:
                acc.append(os.path.relpath(os.path.join(dirpath, fn), root))
    return {"root": root, "index": os.path.isfile(os.path.join(root, "index.html")), "build": names,
            "compression": "fallback" if fallback else (comp or "none"), "fallback": fallback, "hashed": hashed,
            "symbols": any(".symbols." in n for n in names), "streaming_assets": sorted(sa), "template_data": sorted(td)}


def header_audit(base_url, build_root):
    """GET every Build/ file (and index.html) from a running server, without letting the client
    decode, and compare with the header table. Also catches double compression (body differs from
    the file on disk) and a missing application/wasm. Returns {"ok", "files": [...], "verdicts": [...]}."""
    info = build_files(build_root)
    rels = ["index.html"] + ["Build/" + n for n in info["build"]]
    files, verdicts = [], []
    for rel in rels:
        url = urllib.parse.urljoin(base_url, urllib.parse.quote(rel))
        status, hdrs, body = _fetch(url)
        exp_type, exp_enc = expected_headers(rel)
        got_type = (hdrs.get("content-type") or "").split(";")[0].strip()
        got_enc = hdrs.get("content-encoding")
        disk = _read(os.path.join(info["root"], rel))
        row = {"file": rel, "status": status, "content_type": got_type, "content_encoding": got_enc,
               "expected_type": (exp_type or "").split(";")[0], "expected_encoding": exp_enc,
               "bytes_sent": len(body), "bytes_on_disk": len(disk), "cache_control": hdrs.get("cache-control"),
               "coop": hdrs.get("cross-origin-opener-policy"), "coep": hdrs.get("cross-origin-embedder-policy")}
        problems = []
        if status != 200:
            problems.append("error: HTTP %s" % status)
        if exp_enc and got_enc != exp_enc:
            problems.append("error: Content-Encoding %r, expected %r (the loader cannot parse a precompressed file the browser did not decode)" % (got_enc, exp_enc))
        if not exp_enc and got_enc:
            problems.append("error: Content-Encoding %r on a file that is not precompressed on disk" % got_enc)
        if exp_type == "application/wasm" and got_type != "application/wasm":
            problems.append("warn: %s served as %r: no WebAssembly streaming compilation (slower startup)" % (rel, got_type))
        if rel.endswith(".data.gz") and got_type != "application/gzip":
            problems.append("warn: .data.gz as %r: Safari (bug 247421) wants application/gzip" % got_type)
        if status == 200 and body != disk:
            problems.append("error: body differs from the file on disk (host recompressed it? disable dynamic compression on Unity's precompressed files)")
        row["problems"] = problems
        files.append(row)
        verdicts += ["%s: %s" % (rel, p) for p in problems]
    errors = [v for f in files for v in f["problems"] if v.startswith("error")]
    return {"ok": not errors, "errors": len(errors), "files": files, "verdicts": verdicts, "compression": info["compression"]}


# ============================================================================ sizes and budgets
def _decompress(data, kind):
    if kind == "gzip":
        return gzip.decompress(data)
    if kind == "br":
        try:
            import brotli  # optional module
            return brotli.decompress(data)
        except ImportError:
            exe = shutil.which("brotli")
            if not exe:
                raise RuntimeError("no brotli module or CLI to measure raw sizes")
            return subprocess.run([exe, "-d", "-c"], input=data, capture_output=True, check=True).stdout
    return data


def _compress_estimate(data):
    """Transfer estimate for an uncompressed file (Compression Disabled, the host compresses)."""
    out = {"gzip": len(gzip.compress(data, 9))}
    try:
        import brotli
        out["br"] = len(brotli.compress(data, quality=11))
    except ImportError:
        exe = shutil.which("brotli")
        if exe:
            out["br"] = len(subprocess.run([exe, "-c", "-q", "11"], input=data, capture_output=True, check=True).stdout)
    return out


def _role(name):
    n = name.lower()
    for key in ("loader.js", "framework.js", ".wasm", ".data", "symbols"):
        if key in n:
            return {"loader.js": "loader", "framework.js": "framework", ".wasm": "wasm", ".data": "data", "symbols": "symbols"}[key]
    return "other"


def size_report(build_root, raw=True, estimate=True):
    """Bytes a player downloads, per file and in total, as a portal counts them.
    initial_bytes = index.html + TemplateData + loader + framework + wasm + data (fetched before the
    first frame); symbols are fetched only on errors and StreamingAssets only when the game asks
    (deferred_bytes). raw=True adds decompressed sizes (the wasm raw size tracks engine and code
    size). For uncompressed builds, estimate=True adds gzip -9 and brotli -q 11 transfer estimates."""
    info = build_files(build_root)
    root = info["root"]
    rows, initial, raw_total = [], 0, 0
    est_initial = {"gzip": 0, "br": 0}
    for name in info["build"]:
        path = os.path.join(root, "Build", name)
        size = os.path.getsize(path)
        role = _role(name)
        row = {"file": "Build/" + name, "role": role, "bytes": size}
        kind = "br" if name.endswith(".br") else ("gzip" if name.endswith(".gz") else None)
        if raw:
            data = _read(path)
            if kind:
                row["raw_bytes"] = len(_decompress(data, kind))
            elif name.endswith(".unityweb"):
                for k in ("gzip", "br"):
                    try:
                        row["raw_bytes"] = len(_decompress(data, k))
                        row["fallback_codec"] = k
                        break
                    except Exception:
                        continue
            else:
                row["raw_bytes"] = size
                if estimate and role != "symbols":
                    row["estimate"] = _compress_estimate(data)
        if role != "symbols":
            initial += size
            raw_total += row.get("raw_bytes", size)
            for k in est_initial:
                est_initial[k] += (row.get("estimate") or {}).get(k, size)
        rows.append(row)
    extra = 0
    for rel in ["index.html"] + info["template_data"]:
        p = os.path.join(root, rel)
        if os.path.isfile(p):
            extra += os.path.getsize(p)
    deferred = sum(os.path.getsize(os.path.join(root, r)) for r in info["streaming_assets"])
    total_files = sum(len(fs) for _d, _s, fs in os.walk(root))
    rep = {"root": root, "compression": info["compression"], "hashed": info["hashed"], "files": rows,
           "page_bytes": extra, "initial_bytes": initial + extra, "initial_mb": round((initial + extra) / MB, 3),
           "raw_initial_bytes": raw_total + extra, "deferred_bytes": deferred,
           "total_bytes": initial + extra + deferred + sum(r["bytes"] for r in rows if r["role"] == "symbols"),
           "file_count": total_files,
           "wasm_bytes": sum(r["bytes"] for r in rows if r["role"] == "wasm"),
           "wasm_raw_bytes": sum(r.get("raw_bytes", 0) for r in rows if r["role"] == "wasm"),
           "data_bytes": sum(r["bytes"] for r in rows if r["role"] == "data")}
    if info["compression"] == "none" and estimate:
        rep["estimated_initial_bytes"] = {k: v + extra for k, v in est_initial.items()}
    rep["largest"] = sorted(rows, key=lambda r: -r["bytes"])[:5]
    return rep


PORTALS = {
    # CrazyGames technical requirements: initial download (bytes until gameplayStart) at most 50 MB,
    # at most 20 MB for the mobile homepage, 250 MB total, 1,500 files, 20 s to gameplay for external content.
    "crazygames": {"initial_mb": 50, "total_mb": 250, "files": 1500},
    "crazygames-mobile": {"initial_mb": 20, "total_mb": 250, "files": 1500},
    # Stratton Studios (Josh Loveridge, FYsVftoLBP8 [00:03:29]): 30 MB binary as "table stakes".
    "stratton": {"initial_mb": 30},
    # Unity Play upload: under 1 GB (6.3 Manual, Build options table).
    "unity-play": {"total_mb": 1000},
}


def budget_check(report, initial_mb=None, total_mb=None, files=None, portal=None, use_estimate=None):
    """Compare a size_report with a budget (explicit numbers, or a PORTALS preset).
    For an uncompressed build (Poki: the host compresses) use_estimate="br" or "gzip" judges the
    estimated transfer. Returns {"ok", "verdict", "checks": [...], "initial_mb", "headroom_mb"}."""
    lim = dict(PORTALS.get(portal, {})) if portal else {}
    if initial_mb is not None:
        lim["initial_mb"] = initial_mb
    if total_mb is not None:
        lim["total_mb"] = total_mb
    if files is not None:
        lim["files"] = files
    if not lim:
        raise ValueError("give initial_mb/total_mb/files or a portal (%s)" % ", ".join(PORTALS))
    init = report["initial_bytes"]
    if use_estimate and report.get("estimated_initial_bytes"):
        init = report["estimated_initial_bytes"][use_estimate]
    checks = []
    if "initial_mb" in lim:
        checks.append({"what": "initial download", "value_mb": round(init / MB, 3), "limit_mb": lim["initial_mb"],
                       "ok": init <= lim["initial_mb"] * MB})
    if "total_mb" in lim:
        checks.append({"what": "total upload", "value_mb": round(report["total_bytes"] / MB, 3), "limit_mb": lim["total_mb"],
                       "ok": report["total_bytes"] <= lim["total_mb"] * MB})
    if "files" in lim:
        checks.append({"what": "file count", "value": report["file_count"], "limit": lim["files"],
                       "ok": report["file_count"] <= lim["files"]})
    ok = all(c["ok"] for c in checks)
    out = {"ok": ok, "verdict": "pass" if ok else "fail", "checks": checks, "initial_mb": round(init / MB, 3), "portal": portal}
    if "initial_mb" in lim:
        out["headroom_mb"] = round(lim["initial_mb"] - init / MB, 3)
    return out


def download_seconds(nbytes, mbps):
    """Transfer time only (no latency, compile or startup): bytes at a line speed in Mbit/s."""
    return round(nbytes * 8.0 / (mbps * 1000 * 1000), 2)


# Measured size costs of the usual stack, first line items against a tight budget. Sources: CrazyGames
# optimization tips (their tests, Brotli, Unity version unstated), 6.3 Manual (Remove unused resources),
# and this skill's builds (observed 2026-09-24, Unity 6000.3.21f1, Brotli, Disk Size).
PACKAGE_COSTS = {
    "com.unity.render-pipelines.universal": "about +3.6 MB (CrazyGames test); drop it for a simple 2D sprite game with a tight budget",
    "urp-post-processing": "about +1 MB (CrazyGames, Brotli); observed here: -1.61 MB initial download (.data 3.92 to 2.31 MB, Brotli) with the renderers' post data off, the build report then drops 12 FilmGrain textures and SMAA AreaTex",
    "textmeshpro-resources": "about +0.7 MB fresh import, 0.5 MB after trimming Resources (emoji and fallback fonts) (CrazyGames test)",
    "com.unity.inputsystem": "\"can significantly increase the build size if it's not removed\" (6.3 Manual); keep only if the game reads it",
    "com.unity.addressables": "+0.27 MB initial download, +0.21 MB Brotli wasm (observed)",
    "splash-unity-logo": "the build report lists 'Splash Screen Unity Logo' at 2.7 MB uncompressed, yet turning off Show Splash Screen AND Show Unity Logo shrank the Brotli .data by only 38 KB (observed): rank with the report, judge with size_report",
}


def package_report(project):
    """Packages in Packages/manifest.json that carry a measured Web size cost (PACKAGE_COSTS), plus
    TextMesh Pro resources when Assets/TextMesh Pro exists. The unused-package pass: remove what the
    game does not use, rebuild, and record the before/after size_report. Returns [{"item", "cost"}]."""
    root = _project_root(project)
    with open(os.path.join(root, "Packages", "manifest.json")) as f:
        deps = json.load(f).get("dependencies", {})
    out = [{"item": k, "version": deps[k], "cost": PACKAGE_COSTS[k]} for k in PACKAGE_COSTS if k in deps]
    if os.path.isdir(os.path.join(root, "Assets", "TextMesh Pro")):
        out.append({"item": "textmeshpro-resources", "version": None, "cost": PACKAGE_COSTS["textmeshpro-resources"]})
    return out


def build_log_report(log_path):
    """Parse the 'Build Report' block Unity writes to the build log (the job's unity.log or Editor.log):
    uncompressed usage by category and the largest used assets. Jason Weimann's loop
    (7O21c8BzEzM [00:01:07] to [00:01:41]): measure, rank, fix the top items, rebuild.
    Returns {"categories": {name: bytes}, "complete_build_bytes", "top_assets": [{"bytes", "pct", "path"}],
    "flags": [...]} or None when the log has no report (development builds still have one)."""
    text = read_text_file(log_path)
    i = text.rfind("Build Report\nUncompressed usage by category")
    if i < 0:
        return None
    block = text[i:].splitlines()
    units = {"b": 1, "kb": 1024, "mb": 1024 ** 2, "gb": 1024 ** 3}
    cats, top, complete = {}, [], None
    for line in block[2:400]:
        m = re.match(r"^([A-Za-z][A-Za-z ]+?)\s+([\d.]+)\s*(b|kb|mb|gb)\s+([\d.]+)%", line.strip())
        if m and not top:
            cats[m.group(1).strip()] = int(float(m.group(2)) * units[m.group(3)])
            continue
        m = re.match(r"^Complete build size\s+([\d.]+)\s*(b|kb|mb|gb)", line.strip())
        if m:
            complete = int(float(m.group(1)) * units[m.group(2)])
            continue
        m = re.match(r"^\s*([\d.]+)\s*(b|kb|mb|gb)\s+([\d.]+)%\s+(.+)$", line)
        if m:
            top.append({"bytes": int(float(m.group(1)) * units[m.group(2)]), "pct": float(m.group(3)), "path": m.group(4).strip()})
            continue
        if top and line.strip() == "":
            break
        if top and not re.match(r"^\s*[\d.]+\s*(b|kb|mb|gb)\s", line):
            break
    flags = []
    if any("Splash Screen Unity Logo" in a["path"] for a in top):
        flags.append("splash logo shipped: turn off Show Splash Screen and Show Unity Logo (Unity 6)")
    post = [a for a in top if "/Textures/FilmGrain/" in a["path"] or "/SMAA/" in a["path"]]
    if post:
        flags.append("URP post-processing data shipped: %d textures, %.1f MB uncompressed" % (len(post), sum(a["bytes"] for a in post) / 1024.0 ** 2))
    return {"categories": cats, "complete_build_bytes": complete, "top_assets": top, "flags": flags}


def read_text_file(path):
    with open(path, "r", errors="replace") as f:
        return f.read()


def heap_advice(samples, initial_mb=32, step_mb=16):
    """Size Initial Memory Size from a measured session (6.3 Manual, Memory in Unity Web: on mobile set it
    to the typical heap usage, because growing the heap can crash when the browser finds no contiguous
    block). samples: browser_check(...)["metrics"] (unityInstance.GetMetricsInfo() snapshots).
    Returns {"peak_total_mb", "peak_used_mb", "grew": total heap above initial_mb, "initial_memory_mb":
    peak total rounded up to step_mb}."""
    tot = [s.get("totalWASMHeapSize") or 0 for s in samples if isinstance(s, dict)]
    used = [s.get("usedWASMHeapSize") or 0 for s in samples if isinstance(s, dict)]
    if not tot:
        return {"error": "no metrics samples"}
    peak_t, peak_u = max(tot) / 1048576.0, max(used) / 1048576.0
    rec = int(-(-peak_t // step_mb) * step_mb)
    return {"peak_total_mb": round(peak_t, 1), "peak_used_mb": round(peak_u, 1), "initial_mb": initial_mb,
            "grew": peak_t > initial_mb + 0.5, "initial_memory_mb": rec}


def merge_texture_variants(desktop_root, mobile_root, key="astc"):
    """Unity's dual build (6.3 Manual, Texture compression in Web): build once with the DXT subtarget
    (desktop) and once with ASTC (mobile), copy the mobile .data into the desktop Build/ folder, and
    let the page pick it when the GPU exposes WEBGL_compressed_texture_astc. The AgentWeb template holds
    the marker line 'var agentWebDataVariants = null; // AGENTWEB_DATA_VARIANTS' that this rewrites.
    Refuses when framework/wasm differ between the two builds (the .data must match the code).
    Returns {"ok", "desktop_data", "mobile_data", "code_identical", "data_bytes": {...}}."""
    d, m = build_files(desktop_root), build_files(mobile_root)

    def pick(info, role):
        return sorted(n for n in info["build"] if _role(n) == role)

    def same_bytes(role):
        a, b = pick(d, role), pick(m, role)
        return len(a) == len(b) and all(_read(os.path.join(d["root"], "Build", x)) == _read(os.path.join(m["root"], "Build", y))
                                        for x, y in zip(a, b))

    if not (same_bytes("framework") and same_bytes("wasm")):
        return {"ok": False, "error": "framework or wasm differ between the builds: rebuild both from the same code and settings",
                "code_identical": False}
    dd, md = pick(d, "data"), pick(m, "data")
    if len(dd) != 1 or len(md) != 1:
        return {"ok": False, "error": "expected one .data file per build", "code_identical": True}
    mobile_name = md[0] if md[0] != dd[0] else key + "." + md[0]
    shutil.copyfile(os.path.join(m["root"], "Build", md[0]), os.path.join(d["root"], "Build", mobile_name))
    idx = os.path.join(d["root"], "index.html")
    html = read_text_file(idx)
    marker = re.compile(r"var agentWebDataVariants = [^;]*; // AGENTWEB_DATA_VARIANTS")
    if not marker.search(html):
        return {"ok": False, "error": "index.html has no AGENTWEB_DATA_VARIANTS marker (AgentWeb template)", "code_identical": True}
    html = marker.sub("var agentWebDataVariants = %s; // AGENTWEB_DATA_VARIANTS" % json.dumps({key: "Build/" + mobile_name}), html)
    with open(idx, "w") as f:
        f.write(html)
    return {"ok": True, "code_identical": True, "desktop_data": "Build/" + dd[0], "mobile_data": "Build/" + mobile_name,
            "data_bytes": {"desktop": os.path.getsize(os.path.join(d["root"], "Build", dd[0])),
                           "mobile": os.path.getsize(os.path.join(d["root"], "Build", mobile_name))}}


def add_preload(build_root, rel_urls):
    """Insert <link rel="preload" as="fetch" crossorigin> tags after the AgentWeb template's
    '<!-- AGENTWEB_PRELOAD -->' marker, so the first bundles start downloading with the page
    (Craven, LlE35onVdmQ [00:13:41]). Preload only what the first playable moment needs: preloaded
    bytes move BEFORE gameplay start, into the window portals count. Hashed bundle names change per
    content build, so run this after every build. Returns the tags written."""
    idx = os.path.join(os.path.abspath(build_root), "index.html")
    html = read_text_file(idx)
    if "<!-- AGENTWEB_PRELOAD -->" not in html:
        raise ValueError("index.html has no <!-- AGENTWEB_PRELOAD --> marker (AgentWeb template)")
    tags = ['<link rel="preload" href="%s" as="fetch" crossorigin="anonymous">' % u for u in rel_urls]
    html = html.replace("<!-- AGENTWEB_PRELOAD -->", "<!-- AGENTWEB_PRELOAD -->\n    " + "\n    ".join(tags), 1)
    with open(idx, "w") as f:
        f.write(html)
    return tags


def iframe_host_page(game_url, out_dir, width=960, height=600, name="host.html"):
    """Write a host page that embeds the game in an iframe, the way itch.io, CrazyGames and Poki serve
    it. Serve out_dir from ANOTHER origin (for example serve(out_dir, url_host="127.0.0.1") while the
    game runs on localhost) to reproduce a cross-origin embed: third-party storage (Data Caching's
    IndexedDB), keyboard focus, and permission policies (fullscreen, autoplay) then behave as on a portal.
    Returns the file path."""
    os.makedirs(out_dir, exist_ok=True)
    html = """<!doctype html><html><head><meta charset="utf-8"><title>portal host</title>
<style>body{margin:0;background:#111;color:#ccc;font:14px sans-serif} #bar{padding:6px 10px}</style></head>
<body><div id="bar">host page (portal stand-in) <input id="host-input" placeholder="host field"></div>
<iframe id="game" src="%s" width="%d" height="%d" allow="fullscreen; autoplay; gamepad" style="border:0;display:block"></iframe>
</body></html>""" % (game_url, width, height)
    path = os.path.join(out_dir, name)
    with open(path, "w") as f:
        f.write(html)
    return path


# ============================================================================ static scans
_HANG = [
    (r"\bTask\.Run\s*\(", "error", "hang", "Task.Run: unrecoverable browser hang on the Web", "Awaitable / coroutine; spread work across frames"),
    (r"\bTask\.Delay\s*\(", "error", "hang", "Task.Delay: unrecoverable browser hang on the Web", "await Awaitable.WaitForSecondsAsync(s)"),
    (r"\bParallel\.(For|ForEach|Invoke)\b", "error", "hang", "Parallel.*: unrecoverable browser hang", "plain loops over frames, or Burst jobs (no worker threads on the 6.3 Web player)"),
    (r"\b(Task\.Factory|TaskFactory)\b.*\b(StartNew|ContinueWhenAll|ContinueWhenAny)\b|\bnew\s+TaskFactory\b", "error", "hang", "TaskFactory: unrecoverable browser hang", "Awaitable"),
    (r"\bnew\s+Thread\s*\(", "error", "no-run", "Thread.Start does not throw but the delegate never runs", "coroutine / Awaitable"),
    (r"\bThreadPool\.(QueueUserWorkItem|UnsafeQueueUserWorkItem)\b", "error", "no-run", "ThreadPool callbacks never run", "coroutine / Awaitable"),
    (r"\bSystem\.Threading\.Timer\b|\bnew\s+Timer\s*\(\s*[A-Za-z_]", "error", "no-run", "System.Threading.Timer never fires", "Update timer or Awaitable"),
    (r"\bSystem\.Timers\.Timer\b", "error", "no-run", "System.Timers.Timer never fires", "Update timer or Awaitable"),
    (r"\bnew\s+CancellationTokenSource\s*\(\s*[^)\s]|\.CancelAfter\s*\(", "error", "no-run", "CancellationTokenSource timeouts never fire", "frame-time timeouts, UnityWebRequest.timeout"),
    (r"\b(HttpClient|WebClient|HttpWebRequest|FileWebRequest)\b|\bWebRequest\.Create\b", "error", "hang", "System.Net HTTP: not implemented, browser hang", "UnityWebRequest"),
    (r"\b(ClientWebSocket|TcpClient|UdpClient|HttpListener|SslStream)\b|\bSystem\.Net\.Sockets\b", "error", "unsupported", "sockets are not available in the browser", "WebSocket/WebRTC through a .jslib, or a Netcode web transport"),
    (r"\bnew\s+Ping\s*\(", "error", "unsupported", "UnityEngine.Ping (ICMP) is not supported", "an HTTP request to your own endpoint"),
    (r"\bMicrophone\.", "error", "unsupported", "Microphone is not supported on the 6.3 Web player (6.4 adds it)", "a .jslib over getUserMedia"),
    (r"\.(ReadAsync|WriteAsync|CopyToAsync|FlushAsync)\s*\(", "warn", "hang", "async Stream methods: FileStream async hangs the browser", "synchronous FileStream calls (MEMFS)"),
    (r"while\s*\(\s*!\s*[\w\.\[\]]+\.isDone\s*\)", "error", "hang", "busy-wait on isDone blocks the only thread", "yield return request.SendWebRequest() in a coroutine"),
    (r"\bSystem\.Reflection\.Emit\b", "error", "unsupported", "Reflection.Emit: AOT platform", "source generators or pre-built code"),
    (r"\bGetPixels(32)?\s*\(|\bComputeBuffer\b.*\.GetData\s*\(|\bGraphicsBuffer\b.*\.GetData\s*\(|\bScreenCapture\.CaptureScreenshot(AsTexture)?\s*\(", "info", "webgpu", "synchronous GPU readback fails on WebGPU", "AsyncGPUReadback; ScreenCapture.CaptureScreenshotIntoRenderTexture + AsyncGPUReadback"),
    # 6.3 Manual (Web performance considerations > Throttling): leave -1 so the browser's render loop
    # paces frames; Unity cannot query the refresh rate and assumes 60 Hz. A "mobile = 30" habit from
    # native builds is the classic mistake; a deliberate throttle (paused menu, idle screen) is fine.
    (r"\bApplication\.targetFrameRate\s*=\s*(?!\s*-\s*1\s*;)", "warn", "pacing", "Application.targetFrameRate set: on the Web Unity then times its own loop against an assumed 60 Hz instead of the browser's render loop", "leave -1 (default); set a value only to throttle on purpose (paused menu, idle), and restore -1"),
]
_ES6 = [
    (r"(^|[^\w$.])let\s+[A-Za-z_$]", "let"), (r"(^|[^\w$.])const\s+[A-Za-z_$]", "const"), (r"=>", "arrow function"),
    (r"`", "template literal"), (r"(^|[^\w$.])class\s+[A-Za-z_$]", "class"), (r"\.\.\.[A-Za-z_$\[]", "spread/rest"),
    (r"(^|[^\w$.])async\s+function|(^|[^\w$.])await\s", "async/await"),
]
_DEPRECATED_JS = [
    (r"\bPointer_stringify\s*\(", "Pointer_stringify: use UTF8ToString"),
    (r"(?<![\w.])dynCall\s*\(|\bdynCall_[a-z]+\s*\(|\bModule\.dynCall\b", "dynCall: use {{{ makeDynCall('sig', 'cb') }}}(...)"),
    (r"\bunity\.Instance\s*\(|\bUnityLoader\.instantiate\b", "unity.Instance / UnityLoader: use createUnityInstance"),
    (r"\bgameInstance\b", "gameInstance: use the unityInstance from createUnityInstance(...).then"),
]


def _strip_line_comment(line):
    i = line.find("//")
    return line if i < 0 else line[:i]


def _excluded_by_defines(cond):
    c = cond.replace(" ", "")
    return c in ("UNITY_EDITOR", "!UNITY_WEBGL", "UNITY_STANDALONE", "UNITY_ANDROID", "UNITY_IOS") or c.startswith("UNITY_EDITOR&&")


def scan_hang_apis(project, include=("Assets",), skip_editor=True):
    """Static scan of shipped C# for APIs that hang, never run or are missing on the Web player
    (6.3 Manual, ".NET API support on the Web platform"). Heuristics: // comments ignored, Editor
    folders skipped, blocks under #if UNITY_EDITOR or #if !UNITY_WEBGL skipped (simple nesting only).
    Returns findings in the AgentKit core format plus "line"."""
    if os.path.isfile(project):
        root, paths = os.path.dirname(os.path.abspath(project)), [os.path.abspath(project)]
    else:
        root, paths = _project_root(project), []
        for inc in include:
            for dirpath, dirs, files in os.walk(os.path.join(root, inc)):
                if skip_editor:
                    dirs[:] = [d for d in dirs if d != "Editor"]      # editor code never ships
                paths += [os.path.join(dirpath, f) for f in files if f.endswith(".cs")]
    findings = []
    for path in sorted(paths):
        with open(path, "r", errors="replace") as f:
            lines = f.read().splitlines()
        stack = []
        in_block_comment = False
        for i, raw_line in enumerate(lines, 1):
            s = raw_line.strip()
            m = re.match(r"#\s*(if|elif|else|endif)\b(.*)", s)
            if m:
                kw, cond = m.group(1), m.group(2).strip()
                if kw == "if":
                    stack.append(_excluded_by_defines(cond))
                elif kw == "elif" and stack:
                    stack[-1] = _excluded_by_defines(cond)
                elif kw == "else" and stack:
                    stack[-1] = not stack[-1]
                elif kw == "endif" and stack:
                    stack.pop()
                continue
            if any(stack):
                continue
            line = raw_line
            if in_block_comment:
                if "*/" in line:
                    line = line.split("*/", 1)[1]
                    in_block_comment = False
                else:
                    continue
            if "/*" in line and "*/" not in line.split("/*", 1)[1]:
                line = line.split("/*", 1)[0]
                in_block_comment = True
            line = _strip_line_comment(line)
            for rx, sev, kind, msg, fix in _HANG:
                if re.search(rx, line):
                    findings.append({"severity": sev, "code": "web.csharp." + kind, "path": os.path.relpath(path, root),
                                     "line": i, "message": msg, "fix": fix, "source": s[:160]})
    return findings


def scan_jslib(project):
    """ES6 syntax in .jslib/.jspre (ES5 only, 6.3 Manual) and deprecated interop calls in .jslib,
    .jspre and Assets/WebGLTemplates/**/*.html|js. Returns findings (core format + line)."""
    root = _project_root(project)
    findings = []
    for dirpath, _dirs, files in os.walk(os.path.join(root, "Assets")):
        for fn in files:
            path = os.path.join(dirpath, fn)
            rel = os.path.relpath(path, root)
            is_plugin = fn.endswith(".jslib") or fn.endswith(".jspre")
            is_template = "/WebGLTemplates/" in "/" + rel + "/" and (fn.endswith(".html") or fn.endswith(".js"))
            if not (is_plugin or is_template):
                continue
            with open(path, "r", errors="replace") as f:
                lines = f.read().splitlines()
            for i, raw in enumerate(lines, 1):
                line = _strip_line_comment(raw)
                if is_plugin and "{{{" in raw[len(line):]:
                    # observed 2026-09-24: Emscripten expands {{{ }}} inside // comments too; a bare
                    # macro name there injected the macro's source and failed the build
                    # ("SyntaxError: Illegal return statement")
                    findings.append({"severity": "error", "code": "web.jslib.macro_in_comment", "path": rel, "line": i,
                                     "message": "Emscripten {{{ }}} macro inside a comment: it is expanded anyway",
                                     "fix": "remove the braces from the comment", "source": raw.strip()[:160]})
                if is_plugin:
                    code = re.sub(r"\{\{\{.*?\}\}\}", "MACRO", line)       # Emscripten macros are fine
                    code = re.sub(r"'[^']*'|\"[^\"]*\"", "''", code)
                    for rx, what in _ES6:
                        if re.search(rx, code):
                            findings.append({"severity": "error", "code": "web.jslib.es6", "path": rel, "line": i,
                                             "message": "%s in a %s file (ES5 only)" % (what, fn.rsplit(".", 1)[1]),
                                             "fix": "rewrite in ES5 (var, function)", "source": raw.strip()[:160]})
                for rx, what in _DEPRECATED_JS:
                    if re.search(rx, line):
                        findings.append({"severity": "error", "code": "web.jslib.deprecated", "path": rel, "line": i,
                                         "message": what, "fix": what.split(": ", 1)[1], "source": raw.strip()[:160]})
    return findings


# ============================================================================ browser check
def _parse_agentweb(text):
    m = re.search(r"AGENTWEB (\{.*\})", text)
    if not m:
        return None
    try:
        return json.loads(m.group(1))
    except ValueError:
        return None


def _parse_agentweb_error(text):
    m = re.search(r"AGENTWEB_ERROR (\{.*\})", text)
    if not m:
        return None
    try:
        return json.loads(m.group(1))
    except ValueError:
        return None


def browser_check(url, wait_events=("ready", "gameplay_start"), timeout=120, headless=True, channel="chrome",
                  viewport=(960, 600), init_script=None, send_messages=(), after_send_events=(), screenshot=None,
                  throttle_mbps=None, latency_ms=0, cpu_slowdown=None, ignore_https_errors=False, args=(),
                  hold_seconds=0.0, device_scale_factor=1, reload=False, engine="chromium", user_agent=None,
                  is_mobile=False, has_touch=False, frame_match=None, metrics=False, metrics_seconds=0,
                  loading_screenshot=None, actions=None):
    """Open a Unity Web build in a browser (Playwright; installed Chrome by default) and report.
    Waits for "AGENTWEB {json}" console lines (WebBridge) whose "event" is in wait_events, then sends
    each (object, method, arg) of send_messages through window.unityInstance.SendMessage and waits
    for after_send_events. init_script runs before the page and in every frame (for example a mock
    window.StudioLeaderboard). throttle_mbps / latency_ms / cpu_slowdown use CDP (Chrome only).
    reload=True reloads once in the same browser context (warm cache: Data Caching serves .data
    from IndexedDB) and reports it under "reload".
    engine: "chromium" (channel="chrome": installed Chrome) or "webkit" (Playwright's WebKit build: the
    Safari engine, not Safari itself). user_agent / is_mobile / has_touch / device_scale_factor emulate a
    phone (the template's mobile branch and DPR cap key on the user agent). frame_match: the url is a
    host page (iframe_host_page) and the game runs in the frame whose URL contains this text.
    metrics=True reads unityInstance.GetMetricsInfo() (WASM heap total/used, JS heap, fps, janked
    frames, load timings; works in release builds without the Diagnostics Overlay); metrics_seconds=N
    samples it every second for N seconds (a soak). loading_screenshot: full-page PNG taken while the
    loader progress is between 5 and 95 percent (judge the loading screen). actions: callable(page,
    frame, out) run after send_messages (custom checks: typing into page fields, clicks).
    Returns {"ok", "events": {name: payload}, "event_times_s", "console", "errors", "banners",
    "reported_errors", "network": [...], "bytes_before": {event: encoded bytes}, "bytes_total",
    "screenshot", "secure_context", "webgpu_in_page", "load_seconds", "canvas", "metrics", "data_url"}.
    Screenshots go to ~/Developer/scratch/playwright-screenshots/."""
    from playwright.sync_api import sync_playwright  # optional dependency

    def new_phase():
        return {"events": {}, "event_times_s": {}, "console": [], "errors": [], "banners": [], "network": [],
                "reported_errors": [], "finished": [], "t0": time.time()}

    cur = [new_phase()]

    def on_console(msg):
        ph = cur[0]
        text = msg.text
        now = time.time() - ph["t0"]
        ph["console"].append({"t": round(now, 3), "type": msg.type, "text": text[:2000]})
        ev = _parse_agentweb(text)
        if ev and ev.get("event") and ev["event"] not in ph["events"]:
            ph["events"][ev["event"]] = ev
            ph["event_times_s"][ev["event"]] = round(now, 3)
        rep = _parse_agentweb_error(text)
        if rep:
            ph["reported_errors"].append(rep)
        if "AGENTWEB_BANNER" in text:
            ph["banners"].append(text[:2000])
        if msg.type == "error":
            ph["errors"].append(text[:2000])

    def game_frame(page):
        if not frame_match:
            return page.main_frame
        for f in page.frames:
            if frame_match in (f.url or ""):
                return f
        return None

    shot = {"loading": None}

    def wait_for(page, names, limit):
        deadline = time.time() + limit
        while time.time() < deadline and not all(e in cur[0]["events"] for e in names):
            if any("[error]" in b for b in cur[0]["banners"]):
                break
            if loading_screenshot and not shot["loading"]:
                fr = game_frame(page)
                try:
                    prog = fr.evaluate("() => (window.__agentWeb || {}).progress || 0") if fr else 0
                except Exception:  # noqa: BLE001
                    prog = 0
                if 0.05 <= prog <= 0.95:
                    os.makedirs(os.path.dirname(os.path.abspath(loading_screenshot)), exist_ok=True)
                    page.screenshot(path=loading_screenshot)
                    shot["loading"] = {"path": loading_screenshot, "progress": round(prog, 3),
                                       "t": round(time.time() - cur[0]["t0"], 3)}
            page.wait_for_timeout(100)

    def finish(ph):
        for t, r in ph.pop("finished"):
            try:
                sz = r.sizes()
                resp = r.response()
                h = resp.headers if resp else {}
                body = sz.get("responseBodySize", 0)          # -1: served from the browser cache
                ph["network"].append({"t": round(t - ph["t0"], 3), "url": r.url, "status": resp.status if resp else None,
                                      "encoded_bytes": max(0, body), "from_cache": body < 0,
                                      "content_encoding": h.get("content-encoding"), "content_type": h.get("content-type")})
            except Exception as e:  # noqa: BLE001
                ph["network"].append({"t": round(t - ph["t0"], 3), "url": r.url, "error": str(e)[:200]})
        ph["bytes_total"] = sum(n.get("encoded_bytes", 0) for n in ph["network"])
        ph["bytes_before"] = {ev: sum(n.get("encoded_bytes", 0) for n in ph["network"] if n["t"] <= t)
                              for ev, t in ph["event_times_s"].items()}
        ph["load_seconds"] = ph["event_times_s"].get("gameplay_start") or ph["event_times_s"].get("ready")
        ph.pop("t0", None)
        return ph

    def read_metrics(fr):
        try:
            return fr.evaluate("() => (window.unityInstance && window.unityInstance.GetMetricsInfo) ? window.unityInstance.GetMetricsInfo() : null")
        except Exception as e:  # noqa: BLE001
            return {"error": str(e)[:200]}

    out = {"url": url, "screenshot": None, "engine": engine}
    with sync_playwright() as p:
        bt = getattr(p, engine)
        launch = {"headless": headless, "args": list(args)}
        if channel and engine == "chromium":
            launch["channel"] = channel
        browser = bt.launch(**launch)
        ctx_kw = {"viewport": {"width": viewport[0], "height": viewport[1]}, "ignore_https_errors": ignore_https_errors,
                  "device_scale_factor": device_scale_factor, "has_touch": has_touch}
        if engine != "firefox":
            ctx_kw["is_mobile"] = is_mobile
        if user_agent:
            ctx_kw["user_agent"] = user_agent
        ctx = browser.new_context(**ctx_kw)
        page = ctx.new_page()
        if (throttle_mbps or cpu_slowdown) and engine == "chromium":
            cdp = ctx.new_cdp_session(page)
            if throttle_mbps:
                cdp.send("Network.enable")
                bps = throttle_mbps * 1000 * 1000 / 8.0
                cdp.send("Network.emulateNetworkConditions", {"offline": False, "latency": latency_ms,
                                                              "downloadThroughput": bps, "uploadThroughput": bps / 4})
            if cpu_slowdown:
                cdp.send("Emulation.setCPUThrottlingRate", {"rate": cpu_slowdown})
        if init_script:
            page.add_init_script(init_script)
        page.on("console", on_console)
        page.on("pageerror", lambda e: cur[0]["errors"].append("pageerror: " + str(e)[:2000]))
        page.on("requestfinished", lambda r: cur[0]["finished"].append((time.time(), r)))
        page.on("requestfailed", lambda r: cur[0]["errors"].append("requestfailed: %s %s" % (r.url, r.failure)))
        cur[0]["t0"] = time.time()
        page.goto(url, wait_until="load", timeout=timeout * 1000)
        wait_for(page, wait_events, timeout)
        fr = game_frame(page) or page.main_frame
        for obj, method, arg in send_messages:
            payload = arg if isinstance(arg, str) else json.dumps(arg)
            fr.evaluate("([o, m, a]) => window.unityInstance.SendMessage(o, m, a)", [obj, method, payload])
        wait_for(page, after_send_events, min(timeout, 30))
        if actions:
            actions(page, fr, out)
        samples = []
        if metrics or metrics_seconds:
            samples.append(read_metrics(fr))
            for _i in range(int(metrics_seconds)):
                page.wait_for_timeout(1000)
                samples.append(read_metrics(fr))
        if hold_seconds:
            page.wait_for_timeout(int(hold_seconds * 1000))
        page.wait_for_timeout(300)  # let the last frame land before the screenshot
        info = fr.evaluate("""() => { var c = document.querySelector('#unity-canvas'); var r = c ? c.getBoundingClientRect() : null;
            return {secure: window.isSecureContext, webgpu: !!navigator.gpu,
            isolated: window.crossOriginIsolated, agent: window.__agentWeb || null,
            lb: window.__lbCalls || null, ua: navigator.userAgent, dpr: window.devicePixelRatio,
            canvas: c ? {width: c.width, height: c.height, css_width: r.width, css_height: r.height} : null,
            idb: typeof indexedDB !== 'undefined' && indexedDB !== null}; }""")
        if screenshot:
            os.makedirs(os.path.dirname(os.path.abspath(screenshot)), exist_ok=True)
            fr.locator("#unity-canvas").screenshot(path=screenshot)
            out["screenshot"] = screenshot
        first = finish(cur[0])
        out.update(first)
        agent = info["agent"] or {}
        out.update({"secure_context": info["secure"], "webgpu_in_page": info["webgpu"],
                    "cross_origin_isolated": info["isolated"], "page_events": agent.get("events"),
                    "leaderboard_calls": info["lb"], "user_agent": info["ua"], "window_dpr": info["dpr"],
                    "canvas": info["canvas"], "indexeddb_in_frame": info["idb"], "data_url": agent.get("dataUrl"),
                    "metrics": samples, "loading_screenshot": shot["loading"]})
        if reload:
            cur[0] = new_phase()
            page.reload(wait_until="load", timeout=timeout * 1000)
            wait_for(page, wait_events, timeout)
            page.wait_for_timeout(500)
            out["reload"] = finish(cur[0])
        ctx.close()
        browser.close()
    need = tuple(wait_events) + tuple(after_send_events)
    out["ok"] = all(e in out["events"] for e in need) and not any("[error]" in b for b in out["banners"])
    return out


def screenshot_path(label):
    """~/Developer/scratch/playwright-screenshots/unity-web_<label>_<timestamp>.png"""
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    return os.path.join(SCREENSHOT_DIR, "unity-web_%s_%s.png" % (re.sub(r"[^A-Za-z0-9_-]+", "-", label), stamp))


# A page text field for the keyboard-capture check: Unity Web takes keyboard input page-wide by default
# (6.3 Manual, Input in Web > Keyboard input and focus handling), which can starve fields like this one.
PAGE_INPUT_JS = """
document.addEventListener('DOMContentLoaded', function () {
  var i = document.createElement('input');
  i.id = 'page-name'; i.placeholder = 'player name (page field)';
  i.style.cssText = 'position:fixed;right:8px;top:8px;z-index:10;font:16px sans-serif;width:220px';
  document.body.appendChild(i);
});
"""

MOCK_LEADERBOARD_JS = """
window.__lbCalls = [];
window.StudioLeaderboard = {
  submit: function (name, score) {
    window.__lbCalls.push({ name: name, score: score });
    return new Promise(function (resolve) { setTimeout(function () { resolve({ rank: 3 }); }, 50); });
  }
};
"""


# ============================================================================ packaging and host configs
def package_zip(build_root, out_zip):
    """Zip the build folder's CONTENTS (index.html at the zip root, as itch.io expects). Returns
    {"zip", "entries", "index_at_root", "bytes"}."""
    root = os.path.abspath(build_root)
    os.makedirs(os.path.dirname(os.path.abspath(out_zip)), exist_ok=True)
    with zipfile.ZipFile(out_zip, "w", zipfile.ZIP_STORED) as z:   # files are already compressed
        for dirpath, _dirs, files in os.walk(root):
            for fn in sorted(files):
                if fn.startswith(".") or fn == "agent_build_report.json":
                    continue
                full = os.path.join(dirpath, fn)
                z.write(full, os.path.relpath(full, root))
    with zipfile.ZipFile(out_zip) as z:
        names = z.namelist()
    return {"zip": out_zip, "entries": len(names), "index_at_root": "index.html" in names, "bytes": os.path.getsize(out_zip)}


def archive_symbols(project, build_root, dest):
    """Keep what production stack traces need next to a release: Build/*.symbols.json* (Debug Symbols
    External) and Library/Bee/artifacts/WebGL/il2cppOutput/cpp/Symbols/MethodMap.tsv, which Unity does
    not copy to the output (6.3 Manual, Debug production Web builds). Returns the copied paths."""
    root = _project_root(project)
    os.makedirs(dest, exist_ok=True)
    out = []
    mm = os.path.join(root, "Library", "Bee", "artifacts", "WebGL", "il2cppOutput", "cpp", "Symbols", "MethodMap.tsv")
    if os.path.isfile(mm):
        shutil.copyfile(mm, os.path.join(dest, "MethodMap.tsv"))
        out.append(os.path.join(dest, "MethodMap.tsv"))
    bdir = os.path.join(os.path.abspath(build_root), "Build")
    for fn in (os.listdir(bdir) if os.path.isdir(bdir) else []):
        if ".symbols." in fn:
            shutil.copyfile(os.path.join(bdir, fn), os.path.join(dest, fn))
            out.append(os.path.join(dest, fn))
    return out


def nginx_config(prefix="/"):
    """Nginx locations for precompressed Unity builds (6.3 Manual sample, condensed): nested in the
    site's location, gzip off on precompressed files (no double compression)."""
    lines = ["# Unity 6.3 Web build under %s (from the 6.3 Manual Nginx sample)" % prefix, "location %s {" % prefix]
    for suffix, ctype, enc in (("data|symbols\\.json", "application/octet-stream", "br"), ("js", "application/javascript", "br"),
                               ("wasm", "application/wasm", "br"), ("data", "application/gzip", "gzip"),
                               ("symbols\\.json", "application/octet-stream", "gzip"), ("js", "application/javascript", "gzip"),
                               ("wasm", "application/wasm", "gzip")):
        ext = "br" if enc == "br" else "gz"
        lines.append("    location ~ .+\\.(%s)\\.%s$ { gzip off; add_header Content-Encoding %s; default_type %s; }" % (suffix, ext, enc, ctype))
    lines.append("    location ~ .+\\.wasm$ { default_type application/wasm; }")
    lines.append("}")
    return "\n".join(lines)


def apache_htaccess():
    """.htaccess for precompressed Unity builds (6.3 Manual sample, needs mod_mime)."""
    return "\n".join([
        "# Unity 6.3 Web build (6.3 Manual Apache sample)",
        "<IfModule mod_mime.c>",
        "  RemoveType .gz", "  AddEncoding gzip .gz", "  AddType application/gzip .data.gz",
        "  AddType application/wasm .wasm.gz", "  AddType application/javascript .js.gz",
        "  AddType application/octet-stream .symbols.json.gz",
        "  RemoveType .br", "  RemoveLanguage .br", "  AddEncoding br .br", "  AddType application/octet-stream .data.br",
        "  AddType application/wasm .wasm.br", "  AddType application/javascript .js.br",
        "  AddType application/octet-stream .symbols.json.br", "  AddType application/wasm .wasm",
        "</IfModule>",
    ])


# ============================================================================ CLI
if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description="scenario-unity-web runner tools")
    sub = ap.add_subparsers(dest="cmd", required=True)
    s1 = sub.add_parser("serve", help="serve a build folder with correct headers until Ctrl+C")
    s1.add_argument("build")
    s1.add_argument("--port", type=int, default=8080)
    s1.add_argument("--host", default="127.0.0.1")
    s1.add_argument("--mode", default="unity")
    s1.add_argument("--https", action="store_true")
    s1.add_argument("--threads", action="store_true")
    s2 = sub.add_parser("size", help="size report and optional portal budget")
    s2.add_argument("build")
    s2.add_argument("--portal")
    s3 = sub.add_parser("scan", help="hang-API and .jslib scans of a project")
    s3.add_argument("project")
    s4 = sub.add_parser("audit-headers")
    s4.add_argument("url")
    s4.add_argument("build")
    s5 = sub.add_parser("zip")
    s5.add_argument("build")
    s5.add_argument("out")
    a = ap.parse_args()
    if a.cmd == "serve":
        cert = key = None
        if a.https:
            cert, key = self_signed_cert(os.path.join(a.build, "..", ".agentweb-cert"), hosts=("localhost", "127.0.0.1", lan_ip() or "127.0.0.1"))
        srv = serve(a.build, host=a.host, port=a.port, mode=a.mode, https=a.https, cert=cert, key=key, threads=a.threads)
        print("serving %s at %s (Ctrl+C to stop)" % (a.build, srv.url))
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            srv.stop()
    elif a.cmd == "size":
        rep = size_report(a.build)
        print(json.dumps({k: rep[k] for k in ("compression", "initial_mb", "initial_bytes", "wasm_raw_bytes", "deferred_bytes", "file_count")}, indent=2))
        if a.portal:
            print(json.dumps(budget_check(rep, portal=a.portal), indent=2))
    elif a.cmd == "scan":
        print(json.dumps({"csharp": scan_hang_apis(a.project), "jslib": scan_jslib(a.project)}, indent=2))
    elif a.cmd == "audit-headers":
        print(json.dumps(header_audit(a.url, a.build), indent=2))
    elif a.cmd == "zip":
        print(json.dumps(package_zip(a.build, a.out), indent=2))
