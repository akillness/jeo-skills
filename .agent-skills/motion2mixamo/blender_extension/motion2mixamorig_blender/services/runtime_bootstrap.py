"""One-click runtime setup, run as a child process with Blender's bundled Python.

Standard library only. Builds everything under one home folder:

    <home>/app      Motion2MixamoRig code copied from the add-on, plus assets/ weights/ outputs/
    <home>/tools    uv (downloads Python and installs packages)
    <home>/python   uv-managed CPython
    <home>/venv     environment the add-on runs `m2mr` with
    <home>/cache    uv download cache

Progress is written as JSON lines ({"stage", "progress", "message"}) so the
add-on can show it with the same reader it uses for `m2mr run`.

    <blender-python> runtime_bootstrap.py --home ~/Motion2MixamoRig --backend <addon>/backend --progress setup.jsonl
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.request
import zipfile
from pathlib import Path

UV_VERSION = "0.12.23"
# (sys.platform, machine) -> (release asset, sha256)
UV_ASSETS = {
    ("darwin", "arm64"): (
        "uv-aarch64-apple-darwin.tar.gz",
        "50487ae565ccd96e499056b4674d438f4c53170202617b4c759defe0c6a1b544",
    ),
    ("darwin", "x86_64"): (
        "uv-x86_64-apple-darwin.tar.gz",
        "960da44cb4b73685206ddd250b19e0a117fa41095710c1038f081f5cb613efb4",
    ),
    ("win32", "amd64"): (
        "uv-x86_64-pc-windows-msvc.zip",
        "75d05de6762778c31ee183398de7dd15093fad0ed90b1f236d8205ea5ec00c90",
    ),
    ("linux", "x86_64"): (
        "uv-x86_64-unknown-linux-gnu.tar.gz",
        "9167d72b3319674b6303c4cbe071854bba13ebdf3d76b1a7cbdc175471fb66d6",
    ),
}
PYTHON_VERSION = "3.11"
# Files copied from the bundled backend into <home>/app (the pip project root).
BACKEND_ITEMS = ("motion2mixamorig", "pyproject.toml", "LICENSE", "NOTICE.md")
USER_DIRS = (
    "assets/body_models/smplx",
    "assets/mixamo",
    "assets/video",
    "assets/image",
    "weights",
    "outputs",
)


class SetupError(RuntimeError):
    pass


class Progress:
    def __init__(self, path: Path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("", encoding="utf-8")

    def emit(self, stage: str, progress: float, message: str) -> None:
        line = json.dumps({"stage": stage, "progress": progress, "message": message})
        with self.path.open("a", encoding="utf-8") as handle:
            handle.write(line + "\n")
        print(f"[{progress:4.0%}] {stage}: {message}", flush=True)


def venv_python(venv: Path) -> Path:
    if sys.platform == "win32":
        return venv / "Scripts" / "python.exe"
    return venv / "bin" / "python"


def clean_env(home: Path) -> dict[str, str]:
    """Environment for uv / the new Python: nothing inherited from Blender's interpreter."""
    env = {
        key: value
        for key, value in os.environ.items()
        if not key.startswith("PYTHON") and key not in {"__PYVENV_LAUNCHER__", "VIRTUAL_ENV"}
    }
    env["UV_PYTHON_INSTALL_DIR"] = str(home / "python")
    env["UV_CACHE_DIR"] = str(home / "cache")
    env["UV_PYTHON_PREFERENCE"] = "only-managed"  # never pick up a system Python
    env["PYTHONUNBUFFERED"] = "1"
    return env


def run(argv: list[str], env: dict[str, str]) -> None:
    print("$ " + " ".join(argv), flush=True)
    completed = subprocess.run(argv, env=env, stdin=subprocess.DEVNULL, check=False)
    if completed.returncode != 0:
        raise SetupError(f"command failed ({completed.returncode}): {argv[0]} {argv[1] if len(argv) > 1 else ''}")


def copy_backend(backend: Path, app: Path) -> None:
    if not (backend / "motion2mixamorig").is_dir():
        raise SetupError(f"bundled Motion2MixamoRig code not found in {backend}")
    app.mkdir(parents=True, exist_ok=True)
    for name in BACKEND_ITEMS:
        src, dest = backend / name, app / name
        if not src.exists():
            continue
        if dest.is_dir():
            shutil.rmtree(dest)
        elif dest.exists():
            dest.unlink()
        if src.is_dir():
            shutil.copytree(src, dest, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
        else:
            shutil.copy2(src, dest)
    for rel in USER_DIRS:  # user data survives updates: only created, never cleared
        (app / rel).mkdir(parents=True, exist_ok=True)


def download(url: str, dest: Path) -> None:
    """HTTPS download that works with Blender's Python, which ships no system CA paths on macOS."""
    import ssl

    try:
        import certifi  # bundled with Blender

        context = ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        context = ssl.create_default_context()
    try:
        with urllib.request.urlopen(url, timeout=60, context=context) as response, dest.open("wb") as out:
            shutil.copyfileobj(response, out)
        return
    except OSError as exc:
        curl = shutil.which("curl")  # macOS and Windows 10+ ship curl with the OS trust store
        if curl is None:
            raise SetupError(f"download failed: {url}: {exc}") from exc
        print(f"urllib failed ({exc}); retrying with curl", flush=True)
    run([curl, "-fL", "--retry", "3", "-o", str(dest), url], dict(os.environ))


def ensure_uv(tools: Path) -> Path:
    exe = tools / ("uv.exe" if sys.platform == "win32" else "uv")
    if exe.is_file():
        return exe
    key = (sys.platform, platform.machine().lower())
    if key not in UV_ASSETS:
        raise SetupError(f"no prebuilt uv for this system: {key}")
    asset, sha256 = UV_ASSETS[key]
    url = f"https://github.com/astral-sh/uv/releases/download/{UV_VERSION}/{asset}"
    tools.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        archive = Path(tmp) / asset
        print(f"downloading {url}", flush=True)
        download(url, archive)
        digest = hashlib.sha256(archive.read_bytes()).hexdigest()
        if digest != sha256:
            raise SetupError(f"uv download checksum mismatch: {digest}")
        if asset.endswith(".zip"):
            with zipfile.ZipFile(archive) as zf:
                zf.extractall(tmp)
        else:
            with tarfile.open(archive) as tf:
                tf.extractall(tmp, filter="data")
        found = next(p for p in Path(tmp).rglob(exe.name) if p.is_file())
        shutil.copy2(found, exe)
    exe.chmod(0o755)
    return exe


def setup(home: Path, backend: Path, progress: Progress) -> Path:
    app, venv = home / "app", home / "venv"
    progress.emit("copy", 0.02, "Copying Motion2MixamoRig")
    copy_backend(backend, app)

    progress.emit("tools", 0.05, "Downloading the installer (uv)")
    uv = str(ensure_uv(home / "tools"))
    env = clean_env(home)

    progress.emit("python", 0.10, f"Installing Python {PYTHON_VERSION}")
    run([uv, "venv", "--python", PYTHON_VERSION, "--seed", "--allow-existing", str(venv)], env)
    py = str(venv_python(venv))

    progress.emit("packages", 0.25, "Installing base packages")
    run([uv, "pip", "install", "--python", py, "pip", "setuptools", "wheel", "numpy>=1.26"], env)
    # chumpy's setup.py imports pip, so it must build without isolation (see README).
    run([uv, "pip", "install", "--python", py, "--no-build-isolation", "chumpy==0.70"], env)

    progress.emit("packages", 0.40, "Installing Motion2MixamoRig and its dependencies (large download)")
    run([uv, "pip", "install", "--python", py, "-e", str(app)], env)

    progress.emit("verify", 0.95, "Checking the installation")
    run([py, "-c", "import motion2mixamorig.cli"], env)

    (home / "runtime.json").write_text(
        json.dumps({"python": py, "app": str(app), "uv": UV_VERSION}, indent=2), encoding="utf-8"
    )
    progress.emit("done", 1.0, "Runtime ready")
    return Path(py)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--home", type=Path, required=True)
    parser.add_argument("--backend", type=Path, required=True)
    parser.add_argument("--progress", type=Path, required=True)
    args = parser.parse_args(argv)
    progress = Progress(args.progress)
    try:
        setup(args.home.expanduser(), args.backend, progress)
    except Exception as exc:  # report every failure through the progress file
        progress.emit("failed", 1.0, f"{type(exc).__name__}: {exc}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
