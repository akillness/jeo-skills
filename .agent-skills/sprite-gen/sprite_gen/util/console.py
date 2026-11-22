# SPDX-License-Identifier: Apache-2.0
"""A command's text streams are UTF-8 on every host locale."""

from __future__ import annotations

import codecs
import sys


def utf8_streams() -> None:
    """Reopen stdout and stderr as UTF-8 where they are not already, at a command's entry.

    A line a command prints may hold an em dash, Korean or a path in any script. A Windows console
    or pipe on a legacy code page (cp949, cp1252) cannot encode them, and Python raises at the
    print, after the work is done. UTF-8 is the byte contract of every command's output
    (`gen.base.print_json` writes its reports that way too). Every `main()` and `sprite-gen` call
    this first; importing sprite_gen does not, so a program that imports it keeps its own streams.
    stderr keeps backslashreplace for what it still cannot write. Python 3.15 makes UTF-8 the
    default (PEP 686); until then this does it.
    """
    for name, errors in (("stdout", "strict"), ("stderr", "backslashreplace")):
        stream = getattr(sys, name)
        reconfigure = getattr(stream, "reconfigure", None)
        encoding = getattr(stream, "encoding", None)
        if reconfigure is None or (encoding and codecs.lookup(encoding).name == "utf-8"):
            continue
        reconfigure(encoding="utf-8", errors=errors)
