# SPDX-License-Identifier: Apache-2.0
"""A colour written `#RRGGBB`, read and written in one place for every verb.

`parse_hex` reads six hex digits, the `#` optional and blanks around them ignored, and nothing
else: a sign, an underscore or a seventh character is not a colour (Python's `int(…, 16)` alone
takes `-1`, `+f` and `1_0`). A verb words a colour it cannot read with its own flag's name, so
the error here is a ValueError for it to turn into its own line. `format_hex` writes upper case,
as `prepare` records a chroma key and `pixel-draw` a palette; `recolor` keeps the lower case it
has always written into its report and palette draft (`lower=True`), whose readers compare the
strings.
"""
from __future__ import annotations

import re
from typing import Sequence

_HEX = re.compile(r"#?([0-9A-Fa-f]{6})")


def parse_hex(text: str) -> tuple[int, int, int]:
    """`#RRGGBB` or `RRGGBB` as `(r, g, b)`; a ValueError for anything else."""
    match = _HEX.fullmatch(text.strip())
    if match is None:
        raise ValueError(f"expected #RRGGBB, got {text!r}")
    digits = match.group(1)
    return int(digits[0:2], 16), int(digits[2:4], 16), int(digits[4:6], 16)


def format_hex(rgb: Sequence[int], *, lower: bool = False) -> str:
    """The first three channels of `rgb` as `#RRGGBB` (`#rrggbb` with `lower`)."""
    text = "#{:02X}{:02X}{:02X}".format(*rgb[:3])
    return text.lower() if lower else text
