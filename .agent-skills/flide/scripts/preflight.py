#!/usr/bin/env python3
"""Inspect local metadata and executable paths without importing or running Flide."""
import importlib.metadata
import json
import platform
import shutil
import sys


def main():
    try:
        version = importlib.metadata.version("flide")
    except importlib.metadata.PackageNotFoundError:
        version = None
    report = {
        "python": sys.version.split()[0],
        "python_supported": sys.version_info >= (3, 10),
        "system": platform.system(),
        "flide_package_version": version,
        "flide_cli": shutil.which("flide"),
        "uv": shutil.which("uv"),
        "nvidia_smi": shutil.which("nvidia-smi"),
        "note": "Offline metadata and paths only; GPU, CUDA, WSL2, model access and runtime readiness are not checked.",
    }
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
