# SPDX-License-Identifier: Apache-2.0
"""`sprite_gen.video.follow` — the Sway layer (`sprite_gen.video.sway`) under its old name.

Kept so an old call gives the old result: every name of the Sway layer reads through this module, and the
entry points that say their command's name (`follow_loop`, `read_request`, `solve`, `fold_notes`, `run`,
`main`, ...) say `video-follow`, as they always did. `sprite-gen video-follow` runs this."""

from __future__ import annotations

from typing import Any

from sprite_gen.video import sway as _sway
from sprite_gen.util.console import utf8_streams

VERB = _sway.OLD_VERB
follow_loop = _sway.follow_loop
follow_offsets = _sway.follow_offsets


def __getattr__(name: str) -> Any:
    return getattr(_sway, name)


def read_request(*args: Any, **kwargs: Any) -> Any:
    return _sway.read_request(*args, **{"verb": VERB, **kwargs})


def solve(*args: Any, **kwargs: Any) -> Any:
    return _sway.solve(*args, **{"verb": VERB, **kwargs})


def read_on_relation(*args: Any, **kwargs: Any) -> str:
    return _sway.read_on_relation(*args, **{"verb": VERB, **kwargs})


def transported_motion(*args: Any, **kwargs: Any) -> Any:
    return _sway.transported_motion(*args, **{"verb": VERB, **kwargs})


def fold_notes(record: dict[str, Any], verb: str = VERB) -> list[str]:
    return _sway.fold_notes(record, verb)


def run(**kwargs: object) -> int:
    return _sway.run(**{"verb": VERB, **kwargs})


def main(argv: list[str] | None = None) -> int:
    utf8_streams()
    return _sway.main(argv, verb=VERB)


if __name__ == "__main__":
    raise SystemExit(main())
