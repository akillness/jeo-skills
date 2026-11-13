#!/usr/bin/env python3
"""Report local executable discovery without executing binaries or using the network."""

import argparse
import json
import shutil


def main():
    argparse.ArgumentParser(description=__doc__).parse_args()
    print(json.dumps({
        "ctx7": shutil.which("ctx7"),
        "node": shutil.which("node"),
        "node_version_not_checked": True,
        "mcp_status": "not_checked",
        "network_used": False,
    }, sort_keys=True))


if __name__ == "__main__":
    main()
