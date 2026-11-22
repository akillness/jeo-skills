# SPDX-License-Identifier: Apache-2.0
"""Observe a side-view input; correction requires opt-in and never edits its source."""
from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path

from sprite_gen.gen import facing as policy
from sprite_gen.gen import facing_vision as vision
from sprite_gen.gen.base import publish_png
from sprite_gen.gen.xai import Credential, HttpCall

FIXES = ("mirror", "none")


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


@dataclass
class _Vision:
    credential: Credential | None = None
    call: HttpCall | None = None

    def inspect_facing(self, path: Path, workdir: Path):
        return vision.grok_inspect(path, credential=self.credential, call=self.call)


def prepare_still(source: Path, out: Path, *, facing: str = "right", fix: str = "none",
                  credential: Credential | None = None, call: HttpCall | None = None) -> dict:
    """Inspect once on the video provider; copy unchanged unless correction is opted in."""
    policy.validate(facing, fix)
    if fix not in FIXES:
        raise SystemExit("video facing: expected mirror or none")
    source, out = source.resolve(), out.resolve()
    if source == out:
        raise SystemExit("video facing: corrected copy must not overwrite the source")
    publish_png(source.read_bytes(), out, label="video-facing")
    observed = policy.inspect(_Vision(credential, call), out, out.parent)
    report = {**observed, "requested": facing, "fix": fix, "action": "none",
              "source": str(source), "source_sha256": digest(source), "out": str(out),
              "final_direction": observed["direction"], "final_direction_source": "observation"}
    opposite = "left" if facing == "right" else "right"
    if observed["direction"] == opposite and fix == "mirror":
        policy.mirror(out)
        report.update(action="mirror", final_direction=facing, final_direction_source="mirror-of-observation")
    elif observed["direction"] == opposite:
        report["reason"] = "correction-disabled"
    elif observed["direction"] != facing:
        report.setdefault("reason", "not-lateral")
    report["output_sha256"] = digest(out)
    return report
