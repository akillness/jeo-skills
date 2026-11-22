# SPDX-License-Identifier: Apache-2.0
"""How a motion plays — a request value, not a state's name.

`loop` repeats; `once-return` plays once and ends on its first pose; `once-hold` plays once and holds its last pose;
`lifetime` is an effect that appears and is gone. A named state is a preset: it plays as `preset` says when the
request names no mode, and its own sentence, canvas row and cut are the engine's as before. A motion the engine has
no state for is filmed under the caller's name for it, in the mode the request gives, with the caller's motion text
or the mode's own sentence (`batch.PLAY_TEXT`). The mode decides whether the clip is pinned to end on its first
frame (`batch.pins_last_frame`), what the prompt asks of the ending (`batch.clip_prompt_parts`), how the clip is cut
(`batch.cycle_for`) and what the strip's metadata says (`loop`, `hold_last`, `returns`). A once-hold ends on its first
settled pose: a terminal state's by its own body geometry, any other motion's by a drawing other than its first
(`nonloop.end_pose`).
"""

from __future__ import annotations

from sprite_gen.video import effect, nonloop

LOOP, ONCE_RETURN, ONCE_HOLD, LIFETIME = MODES = ("loop", "once-return", "once-hold", "lifetime")
# The modes a named state's own sentence films beyond its preset: the attack's — one strike, then a recovery to the
# exact starting stance, filmed pinned to its first frame — is a once-return as it stands.
ALSO_FILMS = {"attack": ONCE_RETURN}


def fixed(state: str) -> str | None:
    """The one mode a state plays in by its nature, or None: an effect lives and is gone, a terminal state
    (`nonloop.STATES`) holds its last pose, and a cyclic one (`nonloop.CYCLIC_STATES`) repeats."""
    if state == effect.STATE:
        return LIFETIME
    if state in nonloop.STATES:
        return ONCE_HOLD
    if state in nonloop.CYCLIC_STATES:
        return LOOP
    return None


def preset(state: str) -> str:
    """How a state plays when the request names no mode: its fixed mode, otherwise a loop."""
    return fixed(state) or LOOP


def resolve(state: str, play: str | None, *, prog: str = "video") -> str:
    """The mode `state` is filmed in: `play` when the request gives one, else the state's preset. A mode that is not
    one of `MODES`, or one a state of a fixed mode cannot play, is refused."""
    if play is None:
        return preset(state)
    if play not in MODES:
        raise SystemExit(f"{prog}: a play mode is one of {', '.join(MODES)}, got {play!r}")
    own = fixed(state)
    if own is not None and play != own:
        raise SystemExit(f"{prog}: {state} plays {own} only, not {play}; film the other motion under a name of its "
                         f"own with play mode {play}")
    return play


def own_sentence(state: str, mode: str) -> bool:
    """Whether `state`'s own sentence films `mode`: its preset, or the mode `ALSO_FILMS` names for it."""
    return mode == preset(state) or ALSO_FILMS.get(state) == mode
