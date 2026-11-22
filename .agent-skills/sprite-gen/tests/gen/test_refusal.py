# SPDX-License-Identifier: Apache-2.0
"""The mask on a provider's error body sees each string as the provider sent it.

Every value here is synthetic. A key, a `Bearer` value or a URL query in a body
is masked whatever stands in front of it, except a key or `Bearer` value right
after an ASCII letter or digit of the provider's own text (`task-…`, `xbearer …`).
The credential the request carried is masked everywhere.
"""
from __future__ import annotations

import pytest

from sprite_gen.gen import refusal, video

SECRET = "synthetic-login-token-0123456789"  # the credential the request carried

# kind -> (the token as a provider body repeats it, the part that must not be readable)
TOKENS = {
    "sk": ("sk-" + "Synthetic0Key1For2Tests" * 2, "Synthetic0Key1For2Tests"),
    "xai": ("xai-" + "Synthetic0Key1For2Tests" * 2, "Synthetic0Key1For2Tests"),
    "bearer": ("Bearer synthetic.token.value-0123456789", "synthetic.token.value-0123456789"),
    "url": ("https://files.example.invalid/o.png?X-Signature=0a1b2c3d&Expires=1", "X-Signature=0a1b2c3d"),
    "secret": (SECRET, SECRET),
}

# What stands right in front of the token in the provider's text: one of each class the mask's one lookbehind,
# `(?<![A-Za-z0-9])`, tells apart. JSON, `repr` and the raw-body line join write some of these as an escape
# (`\n`, `→`), which a mask on the finished line read as a letter or digit.
SEPARATORS = {
    "start": "", "space": " ", "underscore": "_", "hyphen": "-", "LF": "\n", "arrow": "→", "hangul": "한",
    # A letter or digit in front: a key or Bearer value is part of a word.
    "letter": "x", "digit": "2",
    # The provider's own encoding: its text has a letter or digit in front, so the same.
    "provider-backslash-n": "\\n",
}

# path -> how the provider's string reaches the printed line
PATHS = {
    "said:json-value": lambda s: refusal.said({"error": {"message": s}}, SECRET),
    "said:json-key": lambda s: refusal.said({"error": {s: 1}}, SECRET),
    "said:raw": lambda s: refusal.said(refusal.RawBody(s), SECRET),
    "video:repr": lambda s: video._error_detail({"message": s}, SECRET),
    "video:json": lambda s: video._error_detail({"detail": s}, SECRET),
    "video:list": lambda s: video._error_detail([s], SECRET),
}


def _masked_by_rule(sep: str, kind: str) -> bool:
    before = sep[-1:]
    return kind in ("url", "secret") or not (before.isascii() and before.isalnum())


# a URL query or the credential is masked whatever stands in front: the start and an escaped LF are enough
CELLS = [(sep, kind) for sep in SEPARATORS for kind in TOKENS
         if kind not in ("url", "secret") or sep in ("start", "LF")]


@pytest.mark.parametrize("path", PATHS)
@pytest.mark.parametrize(("sep", "kind"), CELLS, ids=[f"{sep}-{kind}" for sep, kind in CELLS])
def test_masked_whatever_stands_in_front_unless_a_letter_or_digit_makes_it_a_word(sep, kind, path) -> None:
    """10 separators x 3 kinds and 2 x 2 for a URL query and the credential, x 6 paths: 150 cells masked, 54 left
    as a word."""
    token, hidden = TOKENS[kind]
    printed = PATHS[path](("x" + SEPARATORS[sep] if SEPARATORS[sep] else "") + token)
    if _masked_by_rule(SEPARATORS[sep], kind):
        assert hidden not in printed
        assert "[redacted]" in printed
    else:
        assert hidden in printed
        assert "[redacted]" not in printed


def test_a_url_query_is_masked_wherever_the_url_starts() -> None:
    # the URL query has no lookbehind: a letter in front, which leaves a key a word, still masks it
    assert (refusal.said({"error": {"message": "seehttps://files.example.invalid/o.png?X-Signature=0a1b"}})
            == ': {"error": {"message": "seehttps://files.example.invalid/o.png?[redacted]"}}')


@pytest.mark.parametrize("path", PATHS)
@pytest.mark.parametrize("gap", ["\n", "\xa0"], ids=["LF", "NBSP"])  # one `\s+`: an escaped one and a Unicode one
def test_a_bearer_value_after_any_whitespace(gap, path) -> None:
    assert "synthetic.token" not in PATHS[path]("x Bearer" + gap + "synthetic.token.value-0123456789")


@pytest.mark.parametrize("path", PATHS)
@pytest.mark.parametrize(("secret", "hidden"), [
    ('synthetic"quoted-token-0123', "quoted-token-0123"),
    ("synthetic-töken-0123456789", "ken-0123456789"),
], ids=["quote", "non-ascii"])
def test_the_credential_is_masked_even_with_a_character_a_serializer_escapes(secret, hidden, path) -> None:
    body = "echo " + secret
    shapes = {
        "said:json-value": lambda: refusal.said({"error": {"message": body}}, secret),
        "said:json-key": lambda: refusal.said({"error": {body: 1}}, secret),
        "said:raw": lambda: refusal.said(refusal.RawBody(body), secret),
        "video:repr": lambda: video._error_detail({"message": body}, secret),
        "video:json": lambda: video._error_detail({"detail": body}, secret),
        "video:list": lambda: video._error_detail([body], secret),
    }
    assert hidden not in shapes[path]()


@pytest.mark.parametrize("path", ["said", "video:repr", "video:json"])
def test_a_number_equal_to_the_credential_is_masked(path) -> None:
    secret = "123456789012"
    printed = {
        "said": lambda: refusal.said({"error": {"n": 123456789012}}, secret),
        "video:repr": lambda: video._error_detail({"code": 123456789012}, secret),
        "video:json": lambda: video._error_detail({"n": 123456789012}, secret),
    }[path]()
    assert "123456789012" not in printed and "[redacted]" in printed


def test_masked_changes_strings_only_and_keeps_a_raw_body_raw() -> None:
    key = TOKENS["sk"][0]
    body = {"error": {"code": None, "n": 3, "ok": False, "items": [1.5, key]}}
    assert refusal.masked(body) == {"error": {"code": None, "n": 3, "ok": False, "items": [1.5, "sk-[redacted]"]}}
    raw = refusal.masked(refusal.RawBody("x\n" + key))
    assert isinstance(raw, refusal.RawBody)
    assert raw.text == "x\nsk-[redacted]" and raw == {"raw": "x\nsk-[redacted]"}


def test_masked_leaves_the_body_it_was_given_alone() -> None:
    key = TOKENS["sk"][0]
    body = {"error": {"message": key, "items": [key]}}
    refusal.masked(body, SECRET)
    assert body == {"error": {"message": key, "items": [key]}}


def test_the_credential_is_masked_whole_and_a_key_keeps_its_prefix() -> None:
    key = TOKENS["sk"][0]
    assert refusal.said({"error": {"message": f"sent {key}"}}, key) == ': {"error": {"message": "sent [redacted]"}}'
    assert refusal.said({"error": {"message": f"sent {key}"}}) == ': {"error": {"message": "sent sk-[redacted]"}}'
