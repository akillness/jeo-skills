#!/usr/bin/env python3
"""Offline metadata inspection; never import or run browser-use."""
import importlib.metadata
import json
import shutil
import sys


def main():
    try:
        version = importlib.metadata.version("browser-use")
    except importlib.metadata.PackageNotFoundError:
        version = None
    report = {
        "python": sys.version.split()[0],
        "python_supported": sys.version_info >= (3, 11),
        "browser_use_package_version": version,
        "browser_use_cli": shutil.which("browser-use"),
        "uv": shutil.which("uv"),
        "note": "Offline metadata only; runtime, browser, credentials and network are not checked.",
    }
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
