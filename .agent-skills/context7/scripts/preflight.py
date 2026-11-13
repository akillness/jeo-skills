#!/usr/bin/env python3
"""Report local executable discovery without executing binaries or using the network."""

import argparse
import json
import os
import shutil
from pathlib import Path


def scoped_binary(base, relative):
    prefix = base / relative
    for path in (prefix, *prefix.parents):
        if path == base:
            break
        if path.is_symlink():
            return None
    binary = prefix / "node_modules/.bin/ctx7"
    if (binary.is_file() and os.access(binary, os.X_OK)
            and binary.resolve().is_relative_to(prefix.resolve())):
        return str(binary)
    return None


def main():
    argparse.ArgumentParser(description=__doc__).parse_args()
    ctx7 = (scoped_binary(Path.cwd(), ".agents/context7")
            or scoped_binary(Path.home(), ".local/share/jeo-skill/context7")
            or shutil.which("ctx7"))
    print(json.dumps({
        "ctx7": ctx7,
        "node": shutil.which("node"),
        "node_version_not_checked": True,
        "mcp_status": "not_checked",
        "network_used": False,
    }, sort_keys=True))


if __name__ == "__main__":
    main()
