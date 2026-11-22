# SPDX-License-Identifier: Apache-2.0
"""`sprite_gen.video.follow_inspect` — `sprite_gen.video.sway_inspect` under its old name.

Kept so an old call gives the old result: every name reads through this module, and the entry points say
`video-follow-inspect`, as they always did. `sprite-gen video-follow-inspect` runs this."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from sprite_gen.video import sway_inspect as _inspect
from sprite_gen.util.console import utf8_streams

VERB = _inspect.OLD_VERB


def __getattr__(name: str) -> Any:
    return getattr(_inspect, name)


def inspect_loop(loop_dir: Path, regions: list[tuple[float, float, float, float]], out_dir: Path,
                 **kwargs: Any) -> dict[str, Any]:
    return _inspect.inspect_loop(loop_dir, regions, out_dir, **{"verb": VERB, **kwargs})


def run(**kwargs: object) -> int:
    return _inspect.run(**{"verb": VERB, **kwargs})


def main(argv: list[str] | None = None) -> int:
    utf8_streams()
    return _inspect.main(argv, verb=VERB)


if __name__ == "__main__":
    raise SystemExit(main())
