# SPDX-License-Identifier: Apache-2.0
"""A verb's `run(**kwargs)`: the keyword arguments of a Python call read as its command line would be.

Every verb whose `run` takes keyword arguments for the flags of its parser reads them here, so a call
from Python and the same flags on the command line reach the verb as one `argparse.Namespace`: a flag
left out takes the parser's default (an empty list for `nargs="*"`, None for a suppressed default), a
required flag left out is a TypeError naming it, and a keyword the parser does not know is a TypeError
naming it — never a value dropped or invented on the way.
"""
from __future__ import annotations

import argparse
from typing import Mapping


def namespace_from_kwargs(parser: argparse.ArgumentParser, kwargs: Mapping[str, object]) -> argparse.Namespace:
    values: dict[str, object] = {}
    remaining = dict(kwargs)
    for action in parser._actions:
        if action.dest == "help":
            continue
        default = [] if action.nargs == "*" else action.default
        if default is argparse.SUPPRESS:
            default = None
        value = remaining.pop(action.dest, default)
        if getattr(action, "required", False) and value is None:
            raise TypeError(f"missing required argument: {action.dest}")
        values[action.dest] = value
    if remaining:
        names = ", ".join(sorted(remaining))
        raise TypeError(f"unexpected keyword argument(s): {names}")
    return argparse.Namespace(**values)
