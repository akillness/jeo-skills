# SPDX-License-Identifier: Apache-2.0
"""Shared xAI credentials and JSON transport for direct image/video generation.

The user's Grok subscription login takes precedence over XAI_API_KEY. The key
is used only when no login file exists, or when SPRITE_GEN_LOGINS=off reads no
login (`base.logins_on`). The Grok CLI alone writes/refreshes that login. Never
spawn an agent or switch sources after a login failure. Where the calls go is
`address` ("xai"), read at each call.
"""
from __future__ import annotations

import http.client
import json
import os
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from . import address, refusal, retry
from .base import LOGINS_ENV, env_api_key, logins_on

AUTH_ENV = "XAI_API_KEY"
AUTH_SOURCE_API_KEY = AUTH_ENV
AUTH_SOURCE_GROK_LOGIN = "grok-login"
HTTP_TIMEOUT_SECONDS = 120

# The refresh instruction for an expired login. The grok CLI refreshes the token
# lazily, on its next API round-trip after `expires_at` has passed (2026-09-13
# measurement: while the token is still valid no command moves expires_at).
# The command must be a non-agent round-trip: a bare prompt (`grok -p ok`) starts
# the coding agent, which reads the cwd, may write files and may call paid APIs
# on its own (2026-09-13 incident, sprite-gen worktree). `grok models` only lists
# models and exits. Run it from an empty directory anyway so nothing of the
# user's is in reach. `grok login` is the full re-sign-in for a revoked, missing
# or non-refreshable login.
GROK_REFRESH_COMMAND = "grok models"
GROK_REFRESH_WHERE = "from an empty directory (e.g. `cd \"$(mktemp -d)\"`)"
GROK_LOGIN_COMMAND = "grok login"


def grok_home() -> Path:
    configured = os.environ.get("GROK_HOME")
    if configured is None:
        return Path.home() / ".grok"
    if not configured.strip():
        raise SystemExit("xai: GROK_HOME is set but empty; refusing to guess the grok home")
    return Path(configured).expanduser().resolve()


@dataclass(frozen=True)
class Credential:
    token: str = field(repr=False)
    source: str  # AUTH_SOURCE_API_KEY | AUTH_SOURCE_GROK_LOGIN
    expires_at: str | None = None


def _parse_expiry(raw: str) -> datetime:
    text = raw.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    parsed = datetime.fromisoformat(text)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _load_grok_login(auth_path: Path, *, now: datetime) -> Credential:
    if not auth_path.is_file():
        raise SystemExit(
            f"xai: grok login path {auth_path} is not a readable file; "
            f"run `{GROK_LOGIN_COMMAND}`. Refusing API-credit fallback."
        )
    try:
        auth = json.loads(auth_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SystemExit(f"xai: cannot read grok login file {auth_path}: {exc}") from exc
    entries = [entry for entry in (auth.values() if isinstance(auth, dict) else []) if isinstance(entry, dict)]
    if len(entries) != 1:
        raise SystemExit(
            f"xai: grok login file {auth_path} holds {len(entries)} account entr"
            f"{'y' if len(entries) == 1 else 'ies'}; expected exactly one — refusing to pick one silently. "
            f"Run `{GROK_LOGIN_COMMAND}` to reset it."
        )
    entry = entries[0]
    token = entry.get("key")
    if not isinstance(token, str) or not token.strip():
        raise SystemExit(f"xai: grok login file {auth_path} has no access token; run `{GROK_LOGIN_COMMAND}`.")
    expires_at = entry.get("expires_at")
    if isinstance(expires_at, str) and expires_at.strip():
        try:
            expiry = _parse_expiry(expires_at)
        except ValueError as exc:
            raise SystemExit(f"xai: grok login file {auth_path} has an unreadable expires_at {expires_at!r}: {exc}") from exc
        if expiry <= now:
            raise SystemExit(
                f"xai: the grok login token expired at {expires_at} (now {now.isoformat()}); nothing was uploaded.\n"
                f"  refresh it with `{GROK_REFRESH_COMMAND}` run {GROK_REFRESH_WHERE} — a non-agent round-trip; "
                f"never a bare prompt like `grok -p …`, which starts the coding agent in your cwd — "
                f"or sign in again with `{GROK_LOGIN_COMMAND}`. This tool never rewrites {auth_path} itself."
            )
    return Credential(token=token, source=AUTH_SOURCE_GROK_LOGIN, expires_at=expires_at if isinstance(expires_at, str) else None)


def resolve_credential(*, env: dict[str, str] | None = None, now: datetime | None = None) -> Credential:
    """Prefer the subscription login; a failed login never switches to API credit. With SPRITE_GEN_LOGINS=off no
    login is looked for and the key is the one route."""
    env = os.environ if env is None else env
    now = now or datetime.now(timezone.utc)
    if not logins_on(env):
        api_key = env_api_key(AUTH_ENV, env, who="xai")
        if api_key:
            return Credential(token=api_key, source=AUTH_SOURCE_API_KEY)
        raise SystemExit(f"xai: no xAI credential — {LOGINS_ENV}=off reads no grok login and {AUTH_ENV} is not set.\n"
                         f"  export {AUTH_ENV}=<your xAI console key>, or unset {LOGINS_ENV} to use a grok login.")
    auth_path = grok_home() / "auth.json"
    # Only absence allows the API key. Broken links/directories are invalid
    # logins too, not permission to switch to another billing source.
    try:
        auth_path.lstat()
    except FileNotFoundError:
        pass
    except OSError as exc:
        raise SystemExit(f"xai: cannot inspect grok login file {auth_path}; refusing API-credit fallback") from exc
    else:
        return _load_grok_login(auth_path, now=now)
    api_key = env_api_key(AUTH_ENV, env, who="xai")
    if api_key:
        return Credential(token=api_key, source=AUTH_SOURCE_API_KEY)
    raise SystemExit(
        f"xai: no xAI credential — no grok login at {auth_path} and {AUTH_ENV} is not set.\n"
        f"  sign in with `{GROK_LOGIN_COMMAND}` (SuperGrok Imagine quota, no API key), "
        f"or export {AUTH_ENV}=<your xAI console key>."
    )


def rejected_fix(credential: Credential) -> str:
    """What to do when xAI rejects `credential` (401/403), for every Grok call: a login is refreshed by a
    non-agent round-trip or signed in again; a key is checked."""
    if credential.source == AUTH_SOURCE_GROK_LOGIN:
        return f"refresh the login with `{GROK_REFRESH_COMMAND}` run {GROK_REFRESH_WHERE} or `{GROK_LOGIN_COMMAND}`"
    return f"check the {AUTH_ENV} value"


HttpCall = Callable[[str, str, str, dict | None], tuple[int, Any]]


def post(call: HttpCall, url: str, token: str, body: dict, *, who: str, label: str,
         sleep: Callable[[float], None] | None = None, deadline: float | None = None) -> tuple[int, Any, int]:
    """POST `body` with `call` (as http_json), and again after a refusal `retry` sends again within `deadline`,
    the call's time limit (which `call` reads by only when the caller hands it too): (status, answer, sends).
    xAI documents 429 alone as a request not taken, and no retry-after, so http_json keeps no headers."""
    status, reply, _headers, sends = retry.ask(lambda: (*call("POST", url, token, body), None), provider=address.XAI,
                                               who=who, label=label, sleep=sleep, kind=refusal.provider_code,
                                               deadline=deadline)
    return status, reply, sends


TRANSPORT_FAILED = "xai: request failed or timed out; no automatic retry (the server may have accepted it)"
NOT_JSON = "xai: response was not valid JSON"


class TransportError(SystemExit):
    """No answer that could be read came back: the connection failed or timed out, the answer broke
    after it began (a body shorter than its Content-Length, a status line that is not one), or it came
    whole and was not JSON — and the server may have taken the request. Still the SystemExit and line
    it always was (`NOT_JSON` for the last); a caller that may safely ask again (a poll of an accepted
    request, the download of a clip that is done) catches this type. `reason` is what the transport said."""

    def __init__(self, reason: str, line: str = TRANSPORT_FAILED) -> None:
        super().__init__(line)
        self.reason = reason


# Everything that ends a request before its answer is read whole. http.client raises its own
# HTTPException family (IncompleteRead, BadStatusLine, LineTooLong, …) past urllib once the answer
# has begun; the socket's errors are OSError, inside a URLError while the request is still sent.
NO_ANSWER = (OSError, http.client.HTTPException)


def no_answer(exc: BaseException) -> TransportError:
    return TransportError(no_answer_reason(exc))


def no_answer_reason(exc: BaseException) -> str:
    """What the transport said when a request got no answer it could read: the words every direct
    provider call (xAI here, Anthropic in `anthropic_api`) puts in its line."""
    said = exc.reason if isinstance(exc, urllib.error.URLError) else exc
    # An http.client exception carries what the server sent (BadStatusLine its line, CRLF included);
    # its repr names the kind and keeps that on one line. RemoteDisconnected is a reset too: its words.
    if isinstance(said, http.client.HTTPException) and not isinstance(said, OSError):
        return repr(said)[:200]
    return (str(said) or type(said).__name__)[:200]


ANSWER_CHUNK = 1 << 16  # what one read of an answer bounded by a deadline asks for


def time_left(timeout: float, deadline: float | None) -> float:
    """What one read may wait: `timeout`, cut to what is left before `deadline`, a `time.monotonic()`
    instant (None: no deadline). With nothing left it is a TimeoutError before anything is sent or read."""
    if deadline is None:
        return timeout
    left = deadline - time.monotonic()
    if left <= 0:
        raise TimeoutError("timed out")
    return min(timeout, left)


def read_whole(response: http.client.HTTPResponse, timeout: float, deadline: float | None) -> bytes:
    """`response`'s body read whole, as `response.read()` reads it — and with a `deadline`, by then.

    A socket's timeout bounds one read, so an answer that keeps coming a little at a time is never cut
    by it. With a deadline the body is read a chunk at a time, each read waiting only what is left, so
    an answer that stalls or comes too slowly ends in `TimeoutError('timed out')` when the deadline
    comes. A body that ends short of its Content-Length raises IncompleteRead, as `read()` does."""
    if deadline is None:
        return response.read()
    chunks: list[bytes] = []
    while not response.isclosed():
        # http.client keeps no public handle on the connection once its answer began; the socket under
        # the response's reader is where a read's wait is set.
        response.fp.raw._sock.settimeout(time_left(timeout, deadline))
        chunk = response.read1(ANSWER_CHUNK)
        if not chunk:
            break
        chunks.append(chunk)
    data = b"".join(chunks)
    if response.length:  # read1 stops where the connection closed, short of the Content-Length, without a word
        raise http.client.IncompleteRead(data, response.length)
    return data


def error_body(refused: urllib.error.HTTPError, timeout: float = HTTP_TIMEOUT_SECONDS, deadline: float | None = None) -> Any:
    """The body of a refusal, read whole (read_whole): its JSON, or its text as `refusal.RawBody`. A refusal's
    status alone is not an answer read whole: a body broken on the way raises what broke it (one of NO_ANSWER),
    which every direct provider transport (`xai`, `anthropic_api`, `openai_provider`) takes as no answer."""
    raw = read_whole(refused.fp, timeout, deadline).decode("utf-8", "replace")
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return refusal.RawBody(raw)


def http_json(method: str, url: str, token: str, body: dict | None = None, *, timeout: float = HTTP_TIMEOUT_SECONDS,
              deadline: float | None = None) -> tuple[int, Any]:
    """One request, its JSON answer read whole. `timeout` bounds each wait on the connection. A `deadline`
    (a `time.monotonic()` instant) cuts the waits for the answer to what is left of it when the request
    goes and the reads of its body to what is left at each (read_whole): an answer that stalls or comes
    too slowly is no answer when it comes (TransportError, `timed out`)."""
    data = None if body is None else json.dumps(body).encode("utf-8")
    request = urllib.request.Request(url, data=data, method=method)
    request.add_header("Authorization", f"Bearer {token}")
    request.add_header("Accept", "application/json")
    if body is not None:
        request.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(request, timeout=time_left(timeout, deadline)) as response:
            raw = read_whole(response, timeout, deadline).decode("utf-8")
            return response.status, (json.loads(raw) if raw else {})
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise TransportError("response was not valid JSON", NOT_JSON) from exc
    except urllib.error.HTTPError as exc:
        try:
            return exc.code, error_body(exc, timeout, deadline)
        except NO_ANSWER as cut:
            raise no_answer(cut) from cut
    except NO_ANSWER as exc:
        raise no_answer(exc) from exc
