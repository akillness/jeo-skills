#!/usr/bin/env python3
"""Inspect the local Lightpanda candidate without running it or accessing the network."""
import argparse
import errno
import json
import os
import platform
import shutil
import stat
import sys


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--binary", help="candidate executable path; default: search PATH")
    args = parser.parse_args()
    system = platform.system()
    machine = platform.machine().lower()
    libc_name, libc_version = "not_applicable", ""
    if system == "Android":
        libc_name = "bionic"
    if system == "Linux":
        libc_name, libc_version = platform.libc_ver()
        libc_name = libc_name.lower() or "unknown"
        if hasattr(sys, "getandroidapilevel"):
            libc_name = "bionic"
        elif libc_name not in ("glibc", "musl", "bionic"):
            libc_name = "unknown"
    candidate = args.binary if args.binary is not None else shutil.which("lightpanda")
    regular = False
    executable = False
    found = False
    error = None
    if candidate:
        try:
            info = os.stat(candidate)
            found = True
            regular = stat.S_ISREG(info.st_mode)
            executable = regular and os.access(candidate, os.X_OK)
        except OSError as exc:
            if exc.errno not in (errno.ENOENT, errno.ENOTDIR):
                found = regular = executable = None
                error = {"errno": exc.errno, "message": exc.strerror or str(exc)}
    arch = {"arm64": "aarch64", "aarch64": "aarch64", "amd64": "x86_64", "x86_64": "x86_64"}.get(machine)
    release_os = "macos" if system == "Darwin" else "linux" if system == "Linux" and libc_name == "glibc" else None
    asset = f"lightpanda-{arch}-{release_os}" if arch and release_os else None
    value = os.environ.get("LIGHTPANDA_DISABLE_TELEMETRY")
    print(json.dumps({
        "platform": system,
        "architecture": machine,
        "libc": {"name": libc_name, "version": libc_version},
        "platform_supported": machine in ("arm64", "aarch64", "x86_64", "amd64") and (system == "Darwin" or (system == "Linux" and libc_name == "glibc")),
        "stable_release": {"version": "1.0.2", "asset": asset},
        "binary": {"path": candidate, "found": found, "regular_file": regular, "executable": executable, "error": error},
        "telemetry_env": "unset" if value is None else "set" if value == "true" else "other",
        "network_accessed": False,
        "binary_executed": False,
    }, sort_keys=True))
    return 1 if error else 0


if __name__ == "__main__":
    sys.exit(main())
