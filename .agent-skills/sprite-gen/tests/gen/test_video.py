# SPDX-License-Identifier: Apache-2.0
"""`sprite-gen video` contract: credential resolution, the api.x.ai call shape,
verified mp4 publishing, and loud failures. No network — the HTTP layer is a fake."""

from __future__ import annotations

import errno
import http.client
import io
import json
import os
import re
import socket
import urllib.error
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from PIL import Image

from sprite_gen.gen import address, retry, video, xai

NOW = datetime(2026, 9, 8, 12, 0, tzinfo=timezone.utc)
MP4 = b"\x00\x00\x00\x18ftypisom" + b"\x00" * 64


def _still(tmp_path: Path) -> Path:
    path = tmp_path / "still.png"
    Image.new("RGBA", (8, 8), (255, 120, 0, 255)).save(path)
    return path


def _login_file(tmp_path: Path, *, expires_at: str | None = "2026-09-08T18:00:00.000000Z", key: str = "tok") -> Path:
    home = tmp_path / "grokhome"
    home.mkdir(exist_ok=True)
    entry = {"key": key, "auth_mode": "oidc"}
    if expires_at is not None:
        entry["expires_at"] = expires_at
    (home / "auth.json").write_text(json.dumps({"https://auth.x.ai::client": entry}), encoding="utf-8")
    return home


class _FakeApi:
    """Scripted xAI: one POST reply, then a sequence of poll replies."""

    def __init__(self, post=(200, {"request_id": "req-1"}), polls=None):
        self.post = post
        self.polls = list(polls or [(200, {"status": "done", "video": {"url": "https://vidgen.x.ai/v/1.mp4", "duration": 6.0}, "model": "grok-imagine-video-1.5"})])
        self.calls: list[tuple[str, str, str, dict | None]] = []
        self.downloads: list[str] = []
        self.payload = MP4

    def call(self, method, url, token, body, *, deadline=None):
        self.calls.append((method, url, token, body))
        if method == "POST":
            return self.post
        return self.polls.pop(0) if len(self.polls) > 1 else self.polls[0]

    def download(self, url, token, *, deadline=None):
        self.downloads.append(url)
        return self.payload


def _request(tmp_path: Path, **overrides) -> video.VideoRequest:
    kwargs = dict(image=_still(tmp_path), prompt="camera locked, gentle idle sway", out=tmp_path / "clip.mp4")
    kwargs.update(overrides)
    return video.VideoRequest(**kwargs)


class _Clock:
    """A test's one clock: `monotonic()` is `now`, `sleep()` moves it on (each wait kept in `slept`), and a
    scripted connection's reads wait on it too (`_Connection`)."""

    def __init__(self) -> None:
        self.now = 0.0
        self.slept: list[float] = []

    def monotonic(self) -> float:
        return self.now

    def sleep(self, seconds: float) -> None:
        self.slept.append(seconds)
        self.now += seconds

    def waking_late(self, late: float):
        """A sleep on this clock that wakes `late` seconds after the time it was asked for, as a real one may."""
        def sleep(seconds: float) -> None:
            self.sleep(seconds)
            self.now += late
        return sleep


@pytest.fixture
def clock(monkeypatch) -> _Clock:
    """The test's clock, in place of `time` where video, xai and retry read it: the run's deadline, its waits
    and the reads of its answers all count on it, and nothing waits on the real clock. Other modules keep theirs."""
    clock = _Clock()
    for module in (video, xai, retry):
        monkeypatch.setattr(module, "time", clock)
    return clock


# --- credential resolution -------------------------------------------------


# A login file is read before the env is (`xai.resolve_credential`), so any key value, or none, takes one path.
@pytest.mark.parametrize("api_key", ["xai-console", "  "])
def test_grok_login_wins_over_api_key_env(tmp_path: Path, monkeypatch, api_key) -> None:
    monkeypatch.setenv("GROK_HOME", str(_login_file(tmp_path)))
    cred = video.resolve_credential(env={"XAI_API_KEY": api_key}, now=NOW)
    assert cred.token == "tok" and cred.source == video.AUTH_SOURCE_GROK_LOGIN
    assert cred.expires_at == "2026-09-08T18:00:00.000000Z"


def test_api_key_is_used_only_without_a_login_file(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("GROK_HOME", str(tmp_path / "no-login"))
    cred = video.resolve_credential(env={"XAI_API_KEY": "xai-console"}, now=NOW)
    assert cred == video.Credential(token="xai-console", source=video.AUTH_SOURCE_API_KEY)


def test_missing_login_and_key_prescribes_both_setups(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("GROK_HOME", str(tmp_path / "nowhere"))
    with pytest.raises(SystemExit, match="no xAI credential") as excinfo:
        video.resolve_credential(env={}, now=NOW)
    assert "grok login" in str(excinfo.value) and "XAI_API_KEY" in str(excinfo.value)


def test_empty_api_key_env_is_refused_not_ignored(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("GROK_HOME", str(tmp_path / "no-login"))
    with pytest.raises(SystemExit, match="XAI_API_KEY is set but empty"):
        video.resolve_credential(env={"XAI_API_KEY": "  "}, now=NOW)


def test_login_without_expiry_is_accepted(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("GROK_HOME", str(_login_file(tmp_path, expires_at=None)))
    assert video.resolve_credential(env={}, now=NOW).expires_at is None


# --- generation ------------------------------------------------------------


def test_generate_video_posts_data_url_polls_and_publishes_verified_mp4(tmp_path: Path) -> None:
    api = _FakeApi(polls=[(200, {"status": "pending", "progress": 10}), (200, {"status": "done", "video": {"url": "https://vidgen.x.ai/v/1.mp4", "duration": 6.0}, "model": "grok-imagine-video-1.5"})])
    slept: list[float] = []
    cred = video.Credential(token="tok", source=video.AUTH_SOURCE_GROK_LOGIN)

    result = video.generate_video(
        _request(tmp_path, aspect_ratio="1:1", generate_audio=False),
        credential=cred, call=api.call, download=api.download, sleep=slept.append,
    )

    method, url, token, body = api.calls[0]
    assert (method, url, token) == ("POST", "https://api.x.ai/v1/videos/generations", "tok")
    assert body["model"] == video.DEFAULT_MODEL
    assert body["duration"] == 6 and body["resolution"] == "720p" and body["aspect_ratio"] == "1:1"
    assert body["generate_audio"] is False
    assert body["image"]["url"].startswith("data:image/png;base64,")
    assert "output" not in body  # no upload_url: the direct call is what works on ZDR teams
    assert api.calls[1][:2] == ("GET", "https://api.x.ai/v1/videos/req-1")
    assert slept == [video.POLL_INTERVAL_SECONDS]
    assert api.downloads == ["https://vidgen.x.ai/v/1.mp4"]
    assert result.out.read_bytes() == MP4
    assert not result.out.with_name("clip.mp4.part").exists()
    payload = result.to_dict()
    assert payload["kind"] == "sprite-gen-video-report"
    assert payload["auth_source"] == "grok-login"
    assert payload["request_id"] == "req-1"
    assert payload["host"] == "vidgen.x.ai"
    assert payload["duration_reported"] == 6.0 and payload["duration_requested"] == 6
    assert payload["polls"] == 2
    # Secrets never reach the report: no token, no full download URL.
    dumped = json.dumps(payload)
    assert "tok" not in dumped.replace("token", "") and "vidgen.x.ai/v/1.mp4" not in dumped


# A refused POST, a failed poll, a poll refused for good and a done poll naming no url each have their own test below.
@pytest.mark.parametrize(
    ("post", "polls", "expected"),
    [
        ((200, {"error": "quota"}), None, "generation request refused"),
        ((403, {"code": "unauthenticated:bad-credentials", "error": "The OAuth2 access token could not be validated."}), None, "rejected the credential \\(grok-login\\) with HTTP 403"),
        ((200, {"request_id": "r"}), [(200, {"status": "expired"})], "status='expired'"),
    ],
)
def test_api_failures_are_named_and_write_nothing(tmp_path: Path, post, polls, expected) -> None:
    api = _FakeApi(post=post, polls=polls)
    request = _request(tmp_path)
    with pytest.raises(SystemExit, match=expected):
        video.generate_video(request, credential=video.Credential("t", video.AUTH_SOURCE_GROK_LOGIN), call=api.call, download=api.download, sleep=lambda s: None)
    assert not request.out.exists()
    assert not list(tmp_path.glob("*.part"))


def test_bad_credential_prescribes_refresh_for_login_and_check_for_key(tmp_path: Path) -> None:
    api = _FakeApi(post=(403, {"error": "bad"}))
    with pytest.raises(SystemExit, match=video.GROK_REFRESH_COMMAND.split()[0]):
        video.generate_video(_request(tmp_path), credential=video.Credential("t", video.AUTH_SOURCE_GROK_LOGIN), call=api.call, download=api.download, sleep=lambda s: None)
    with pytest.raises(SystemExit, match="check the XAI_API_KEY value"):
        video.generate_video(_request(tmp_path), credential=video.Credential("t", video.AUTH_SOURCE_API_KEY), call=api.call, download=api.download, sleep=lambda s: None)


@pytest.mark.parametrize(
    ("overrides", "expected"),
    [
        ({"duration": 0}, "--duration must be 1..15"),
        ({"duration": 16}, "--duration must be 1..15"),
        ({"resolution": "4k"}, "--resolution must be one of"),
        ({"aspect_ratio": "21:9"}, "--aspect-ratio must be one of"),
        ({"prompt": "   "}, "empty prompt"),
    ],
)
def test_request_validation_runs_before_any_call(tmp_path: Path, overrides, expected) -> None:
    api = _FakeApi()
    with pytest.raises(SystemExit, match=expected):
        video.generate_video(_request(tmp_path, **overrides), credential=video.Credential("t", "XAI_API_KEY"), call=api.call, download=api.download)
    assert api.calls == []


def test_missing_still_fails_before_any_call(tmp_path: Path) -> None:
    api = _FakeApi()
    with pytest.raises(SystemExit, match="still image not found"):
        video.generate_video(video.VideoRequest(image=tmp_path / "nope.png", prompt="p", out=tmp_path / "o.mp4"), credential=video.Credential("t", "XAI_API_KEY"), call=api.call, download=api.download)
    assert api.calls == []


# --- CLI ---------------------------------------------------------------------


def test_cli_run_writes_report_and_defaults(tmp_path: Path, monkeypatch, clock) -> None:
    api = _FakeApi()
    monkeypatch.setattr(video, "resolve_credential", lambda **_: video.Credential("t", video.AUTH_SOURCE_API_KEY))
    monkeypatch.setattr(video, "http_json", api.call)
    monkeypatch.setattr(video, "http_download", api.download)
    out = tmp_path / "clip.mp4"
    report = tmp_path / "report.json"

    rc = video.run(image=_still(tmp_path), prompt="sway", prompt_file=None, out=out, duration=6, resolution="720p", aspect_ratio=None, model=video.DEFAULT_MODEL, generate_audio=None, report=report)

    assert rc == 0
    assert out.read_bytes() == MP4
    payload = json.loads(report.read_text(encoding="utf-8"))
    assert payload["auth_source"] == "XAI_API_KEY" and payload["out"] == str(out.resolve())


def test_cli_parser_shape() -> None:
    parser = video._build_parser()
    args = parser.parse_args(["--image", "a.png", "--prompt", "p", "--out", "o.mp4"])
    assert args.duration == 6 and args.resolution == "720p" and args.aspect_ratio is None and args.generate_audio is None
    assert parser.parse_args(["--image", "a.png", "--out", "o.mp4", "--no-audio"]).generate_audio is False
    assert parser.parse_args(["--image", "a.png", "--out", "o.mp4", "--audio"]).generate_audio is True
    with pytest.raises(SystemExit):
        parser.parse_args(["--image", "a.png", "--out", "o.mp4", "--resolution", "4k"])


def test_unified_cli_exposes_video() -> None:
    from sprite_gen import cli

    assert "video" in cli.COMMANDS
    parser = cli._build_parser()
    args = parser.parse_args(["video", "--image", "a.png", "--prompt", "p", "--out", "o.mp4"])
    assert args.command == "video"


@pytest.mark.parametrize("contents, message", [
    ('{"account":{"key":"subscription","expires_at":"2000-01-01T00:00:00Z"}}', "expired"),
    ('{', "cannot read grok login"),
    ('{"account":{}}', "no access token"),
    ('{"a":{"key":"one"},"b":{"key":"two"}}', "holds 2 account"),
])
def test_invalid_login_never_falls_back_to_configured_key(tmp_path, monkeypatch, contents, message):
    monkeypatch.setenv("GROK_HOME", str(tmp_path))
    auth = tmp_path / "auth.json"
    auth.write_text(contents)
    with pytest.raises(SystemExit, match=message):
        video.resolve_credential(env={"XAI_API_KEY": "console-key"}, now=NOW)
    assert auth.read_text() == contents


def test_login_directory_never_permits_api_credit(tmp_path, monkeypatch):
    monkeypatch.setenv("GROK_HOME", str(tmp_path))
    (tmp_path / "auth.json").mkdir()
    with pytest.raises(SystemExit, match="not a readable file"):
        video.resolve_credential(env={"XAI_API_KEY": "console-key"}, now=NOW)


def test_uninspectable_login_never_permits_api_credit(tmp_path, monkeypatch):
    monkeypatch.setenv("GROK_HOME", str(tmp_path))
    original = Path.lstat
    def denied(path, *args, **kwargs):
        if path == tmp_path / "auth.json":
            raise PermissionError("test")
        return original(path, *args, **kwargs)
    monkeypatch.setattr(Path, "lstat", denied)
    with pytest.raises(SystemExit, match="refusing API-credit fallback"):
        video.resolve_credential(env={"XAI_API_KEY": "console-key"}, now=NOW)


# 403 and 503 both end on the first call, on the subscription token.
@pytest.mark.parametrize("status", [200, 403])
def test_video_uses_subscription_with_api_key_present(tmp_path, monkeypatch, status):
    monkeypatch.setenv("GROK_HOME", str(_login_file(tmp_path, key="subscription-token", expires_at="2100-01-01T00:00:00Z")))
    monkeypatch.setenv("XAI_API_KEY", "console-key")
    api = _FakeApi(post=(status, {"error": "rejected"}) if status != 200 else (200, {"request_id": "req-1"}))
    request = _request(tmp_path)
    if status != 200:
        with pytest.raises(SystemExit, match=f"HTTP {status}"):
            video.generate_video(request, call=api.call, download=api.download, sleep=lambda _: None)
        assert len(api.calls) == 1 and not request.out.exists()
    else:
        result = video.generate_video(request, call=api.call, download=api.download, sleep=lambda _: None)
        assert result.auth_source == "grok-login"
    assert all(call[2] == "subscription-token" for call in api.calls)


def test_refresh_prescription_is_a_non_agent_command_run_outside_the_repo(tmp_path: Path, monkeypatch) -> None:
    # 2026-09-13 incident: `grok -p ok` started the coding agent in the worker's cwd,
    # overwrote a script and spent a paid video call. The prescription must never be
    # a prompt, and must say where to run it.
    assert video.GROK_REFRESH_COMMAND == "grok models"
    assert " -p " not in f" {video.GROK_REFRESH_COMMAND} " and "--single" not in video.GROK_REFRESH_COMMAND
    assert "empty directory" in video.GROK_REFRESH_WHERE
    monkeypatch.setenv("GROK_HOME", str(_login_file(tmp_path, expires_at="2026-09-08T10:56:34.899829Z")))
    with pytest.raises(SystemExit, match="expired at 2026-09-08T10:56:34") as excinfo:
        video.resolve_credential(env={}, now=NOW)
    message = str(excinfo.value)
    assert video.GROK_REFRESH_COMMAND in message
    assert video.GROK_LOGIN_COMMAND in message
    assert "never rewrites" in message
    assert video.GROK_REFRESH_WHERE in message
    assert "grok -p ok" not in message.replace("`grok -p …`", "")
    assert "coding agent" in message


# --- the API-credit notice (구독 우선 불변식 5) ---------------------------------


def _billed_run(verb: str, tmp_path: Path, **transport):
    """Submit one job of `verb` through the fake transport."""
    if verb == "video":
        return video.generate_video(_request(tmp_path, duration=3, resolution="480p"), **transport)
    clip = tmp_path / "in.mp4"
    clip.write_bytes(MP4)
    transport = {**transport, "probe": lambda path: 6.0}  # ffprobe stand-in: input and staged alike
    if verb == "video-extend":
        return video.extend_video(video.ExtendRequest(video=clip, prompt="she presses on", out=tmp_path / "longer.mp4", duration=4), **transport)
    return video.edit_video(video.EditRequest(video=clip, prompt="make the hakama black", out=tmp_path / "edited.mp4"), **transport)


@pytest.mark.parametrize("verb, priced", [
    ("video", " (duration=3s, resolution=480p)"),
    ("video-extend", " (duration=4s)"),
    ("video-edit", ""),  # the edit body sends neither knob, so the line names neither
])
def test_every_verb_announces_the_charge_before_the_request_leaves(tmp_path: Path, capsys, verb, priced) -> None:
    """A clip on XAI_API_KEY is metered API credit; the payer hears it before the upload,
    not on the invoice. Imagine prices a clip by length x output size, so the knobs that
    set the amount ride along with the charge."""
    api = _FakeApi()
    heard: list[str] = []

    def call(method, url, token, body, **kw):
        if method == "POST":
            heard.append(capsys.readouterr().err)  # everything said before the job was submitted
        return api.call(method, url, token, body, **kw)

    _billed_run(verb, tmp_path, credential=video.Credential("console-key", video.AUTH_SOURCE_API_KEY),
                call=call, download=api.download, sleep=lambda s: None)

    notice = [line for line in heard[0].splitlines() if "per-call API charge" in line]
    assert len(notice) == 1
    assert notice[0].startswith(f"[gen] {verb}: running on {video.AUTH_ENV} ")
    assert f"not a subscription{priced} — " in notice[0]
    # The shared prefix denies the subscription once; the detail carries the remedy only
    # (the grok image notice read "not a subscription (...), not your Grok subscription").
    assert notice[0].count("not ") == 1
    assert f"`{video.GROK_LOGIN_COMMAND}` signs your Grok subscription in." in notice[0]


# One `if credential.source == AUTH_SOURCE_API_KEY` for every verb.
@pytest.mark.parametrize("verb", ["video"])
def test_the_subscription_route_stays_silent_about_billing(tmp_path: Path, capsys, verb) -> None:
    api = _FakeApi()
    _billed_run(verb, tmp_path, credential=video.Credential("tok", video.AUTH_SOURCE_GROK_LOGIN),
                call=api.call, download=api.download, sleep=lambda s: None)
    assert "per-call API charge" not in capsys.readouterr().err


def test_a_request_that_never_leaves_never_announces_a_charge(tmp_path: Path, monkeypatch, capsys) -> None:
    """The line tracks charges, not intentions: a body refused locally costs nothing."""
    monkeypatch.setenv("GROK_HOME", str(tmp_path / "no-login"))
    monkeypatch.setenv("XAI_API_KEY", "console-key")
    api = _FakeApi()
    with pytest.raises(SystemExit, match="--duration must be"):
        video.generate_video(_request(tmp_path, duration=99), call=api.call, download=api.download, sleep=lambda s: None)
    assert api.calls == []
    assert "per-call API charge" not in capsys.readouterr().err


def test_the_cli_announces_on_stderr_leaving_the_report_on_stdout(tmp_path: Path, monkeypatch, clock, capsys) -> None:
    """The credential the environment actually hands the CLI is what decides, and the
    notice goes to stderr so a caller parsing stdout still reads one JSON report."""
    monkeypatch.setenv("GROK_HOME", str(tmp_path / "no-login"))
    monkeypatch.setenv("XAI_API_KEY", "console-key")
    api = _FakeApi()
    monkeypatch.setattr(video, "http_json", api.call)
    monkeypatch.setattr(video, "http_download", api.download)

    rc = video.run(image=_still(tmp_path), prompt="sway", prompt_file=None, out=tmp_path / "clip.mp4",
                   duration=6, resolution="720p", aspect_ratio=None, model=video.DEFAULT_MODEL,
                   generate_audio=None, report=None)

    captured = capsys.readouterr()
    assert rc == 0
    assert len([line for line in captured.err.splitlines() if "per-call API charge" in line]) == 1
    assert json.loads(captured.out)["auth_source"] == "XAI_API_KEY"
    assert "console-key" not in captured.err + captured.out  # the key itself is never printed


# --- refusal lines: the provider code, and xAI's one content-policy signal ---------

HTTP_STATUS = re.compile(r"\(HTTP (\d{3})\)")  # what a caller reads the status with


def _refused(tmp_path: Path, api: _FakeApi) -> tuple[str, Path]:
    request = _request(tmp_path)
    with pytest.raises(SystemExit) as refused:
        video.generate_video(request, credential=video.Credential("t", video.AUTH_SOURCE_GROK_LOGIN), call=api.call, download=api.download, sleep=lambda s: None)
    assert not request.out.exists() and not list(tmp_path.glob("*.part"))
    assert api.downloads == []
    return str(refused.value), request.out


def test_a_moderated_clip_is_a_content_policy_refusal(tmp_path: Path) -> None:
    api = _FakeApi(polls=[(200, {"status": "done", "video": {"url": "", "respect_moderation": False}})])
    message, _ = _refused(tmp_path, api)
    assert message == ("video: generation req-1 refused by the provider's content policy (HTTP 200) "
                       "respect_moderation=false; nothing was written")
    assert HTTP_STATUS.search(message).group(1) == "200"


def test_a_failed_poll_names_the_code_inside_its_error_object(tmp_path: Path) -> None:
    """`invalid_argument` covers moderation and bad parameters alike, so it is a code, not a policy verdict."""
    api = _FakeApi(polls=[(200, {"status": "failed", "error": {"code": "invalid_argument", "message": "synthetic"}})])
    message, _ = _refused(tmp_path, api)
    assert message.startswith("video: generation req-1 ended with status='failed' (HTTP 200) code=invalid_argument: ")
    assert "content policy" not in message


@pytest.mark.parametrize("scripted", ["post", "poll"])
def test_what_xai_said_is_shown_with_keys_and_signatures_masked(tmp_path: Path, scripted) -> None:
    """The image lines' mask (refusal.masked) on the clip lines, which already print the body."""
    token = "synthetic-login-token"
    said = (f"echo {token}, key xai-{'Synthetic0Key1For2Tests3Only4' * 3}, "
            "url https://vidgen.x.ai/v/1.mp4?sig=abc, (HTTP 999) code=decoy")
    error = {"code": "invalid_argument", "message": said}
    api = _FakeApi(post=(400, {"error": error})) if scripted == "post" else _FakeApi(polls=[(200, {"status": "failed", "error": error})])
    request = _request(tmp_path)
    with pytest.raises(SystemExit) as refused:
        video.generate_video(request, credential=video.Credential(token, video.AUTH_SOURCE_GROK_LOGIN),
                             call=api.call, download=api.download, sleep=lambda s: None)
    message = str(refused.value)
    front = ("video: generation request refused (HTTP 400) code=invalid_argument: " if scripted == "post"
             else "video: generation req-1 ended with status='failed' (HTTP 200) code=invalid_argument: ")
    # A query runs to the next space or quote, so the comma after it goes too.
    assert message == front + ("error={'code': 'invalid_argument', 'message': 'echo [redacted], key xai-[redacted], "
                               "url https://vidgen.x.ai/v/1.mp4?[redacted] (HTTP 999) code=decoy'}"
                               + ("" if scripted == "post" else ", status='failed'"))
    assert HTTP_STATUS.search(message).group(1) == ("400" if scripted == "post" else "200")


@pytest.mark.parametrize("body", [
    "x" * 285 + " xai-" + "K" * 60,
    {"detail": "x" * 270 + " xai-" + "K" * 60},
], ids=["text", "json"])
def test_a_key_the_300_character_cut_would_split_is_masked_before_the_cut(body) -> None:
    """Masked, then cut: cut first, the key's tail was shorter than a key and slipped through."""
    detail = video._error_detail(body)
    assert "KKKK" not in detail
    assert "xai-[redacted]" in detail and len(detail) <= 300


# The separators and the word case are cells of tests/gen/test_refusal.py's masking grid (`video:repr`);
# this lowercase row is the one that reaches `_BEARER`'s `(?i)`.
@pytest.mark.parametrize(("said", "masked"), [
    ("x-bearer " + "synthetic.token.value-0123456789", "x-bearer [redacted]"),
], ids=["hyphen"])
def test_a_bearer_value_after_an_underscore_or_hyphen_is_masked_and_a_word_ending_in_bearer_is_not(said, masked) -> None:
    assert video._error_detail({"message": said}) == f"message={masked!r}"


# One code read and one left off; refusal.read's other cases are the provider grids'.
@pytest.mark.parametrize(("post", "prefix"), [
    ((400, {"code": "invalid-argument", "error": "synthetic"}), "video: generation request refused (HTTP 400) code=invalid-argument: "),
    ((400, {"code": "not a code", "error": "synthetic"}), "video: generation request refused (HTTP 400): "),
])
def test_a_refused_request_names_a_well_formed_code(tmp_path: Path, post, prefix) -> None:
    message, _ = _refused(tmp_path, _FakeApi(post=post))
    assert message.startswith(prefix)
    assert HTTP_STATUS.search(message).group(1) == str(post[0])


# --- a poll answered 429 or 5xx ----------------------------------------------
# The POST was accepted, so xAI may bill the clip whatever its polls answer. A poll the
# provider throttles (429) or fails on its side (5xx) asks the same request again; ending
# the run there sends a caller that retries on `(HTTP 429)` (video-set, a product's
# backoff) to submit a second clip and pay for both.

DONE = (200, {"status": "done", "video": {"url": "https://vidgen.x.ai/v/1.mp4", "duration": 6.0}, "model": "grok-imagine-video-1.5"})


# One branch, `http in retry.GET_AGAIN`; the set itself is tests/gen/test_retry.py's.
@pytest.mark.parametrize("status", [429, 503])
def test_a_throttled_poll_asks_the_same_request_again_and_publishes(tmp_path: Path, status) -> None:
    api = _FakeApi(polls=[(status, {"code": "synthetic", "error": "slow down"}), (status, {"error": "slow down"}),
                          (200, {"status": "pending"}), DONE])
    slept: list[float] = []
    result = video.generate_video(_request(tmp_path), credential=video.Credential("t", video.AUTH_SOURCE_GROK_LOGIN),
                                  call=api.call, download=api.download, sleep=slept.append)
    assert [call[0] for call in api.calls] == ["POST", "GET", "GET", "GET", "GET"]
    assert {call[1] for call in api.calls[1:]} == {"https://api.x.ai/v1/videos/req-1"}
    # The wait doubles from the poll interval while the polls are refused; an answer puts it back.
    assert slept == [video.POLL_INTERVAL_SECONDS * 2, video.POLL_INTERVAL_SECONDS * 4, video.POLL_INTERVAL_SECONDS]
    assert result.out.read_bytes() == MP4
    payload = result.to_dict()
    assert payload["request_id"] == "req-1" and payload["polls"] == 4 and payload["polls_refused"] == 2


def test_a_clip_answered_at_once_reports_no_retry_none_unanswered_and_one_download(tmp_path: Path) -> None:
    api = _FakeApi()
    payload = video.generate_video(_request(tmp_path), credential=video.Credential("t", "XAI_API_KEY"),
                                   call=api.call, download=api.download, sleep=lambda s: None).to_dict()
    assert payload["polls"] == 1 and payload["polls_refused"] == 0
    assert payload["polls_unanswered"] == 0
    assert payload["downloads"] == 1


def test_polls_refused_until_the_poll_timeout_end_naming_the_request_to_ask_again(tmp_path: Path, clock, capsys) -> None:
    api = _FakeApi(polls=[(429, {"code": "synthetic", "error": "slow down"})])
    request = _request(tmp_path)
    with pytest.raises(video.GenerationUnfinished) as unfinished:
        video.generate_video(request, credential=video.Credential("t", video.AUTH_SOURCE_GROK_LOGIN),
                             call=api.call, download=api.download, sleep=clock.sleep, poll_timeout=300)
    assert isinstance(unfinished.value, SystemExit)
    assert [call[0] for call in api.calls].count("POST") == 1
    assert {call[1] for call in api.calls[1:]} == {"https://api.x.ai/v1/videos/req-1"}
    # Doubling, held at the ceiling; the poll at 296 s would wait past the timeout for the next, so it is the last.
    assert clock.slept == [8.0, 16.0, 32.0, 60.0, 60.0, 60.0, 60.0]
    assert clock.now == 296 and len(api.calls) == 1 + 8
    message = str(unfinished.value)
    assert message == ("video: generation req-1 was accepted, but its polls were refused (last answer 429) until the "
                       "poll timeout (300s, 8 polls); it may still finish and be billed — ask for request_id=req-1 "
                       f"again with `sprite-gen video-resume --request-id req-1 --out {request.out.resolve()}` "
                       "instead of submitting a new request; nothing was written")
    # No `(HTTP n)`, a refusal line's status: a caller reading `(HTTP 429)` sends the request again.
    assert HTTP_STATUS.search(message) is None
    assert "HTTP 429" not in message + capsys.readouterr().err
    assert (unfinished.value.request_id, unfinished.value.last_http, unfinished.value.polls) == ("req-1", 429, 8)
    assert not request.out.exists() and not list(tmp_path.glob("*.part")) and api.downloads == []


def test_a_poll_timeout_while_pending_names_the_request_to_ask_again(tmp_path: Path, clock) -> None:
    api = _FakeApi(polls=[(200, {"status": "pending"})])
    request = _request(tmp_path)
    with pytest.raises(video.GenerationUnfinished) as unfinished:
        video.generate_video(request, credential=video.Credential("t", "XAI_API_KEY"),
                             call=api.call, download=api.download, sleep=clock.sleep, poll_timeout=10)
    message = str(unfinished.value)
    assert message.startswith("video: generation req-1 still 'pending' after 3 polls — poll timeout; ")
    assert "request_id=req-1" in message and HTTP_STATUS.search(message) is None
    assert (unfinished.value.request_id, unfinished.value.last_http, unfinished.value.last_status) == ("req-1", 200, "pending")
    assert not request.out.exists()


# One branch for any status past GET_AGAIN and 401/403; 404 is the resume test's.
@pytest.mark.parametrize("status", [400])
def test_a_poll_refused_for_good_ends_at_once_with_its_status(tmp_path: Path, status) -> None:
    api = _FakeApi(polls=[(status, {"error": "synthetic"})])
    message, _ = _refused(tmp_path, api)
    assert len(api.calls) == 2
    assert HTTP_STATUS.search(message).group(1) == str(status)


# Every status but 429 fails `retry.again_after("xai")`; the table is tests/gen/test_retry.py's.
@pytest.mark.parametrize("status", [503])
def test_a_refused_submission_is_never_sent_again(tmp_path: Path, status) -> None:
    """A POST is sent again only on an answer xAI documents as a request not taken, 429 (gen.retry):
    any other refusal may have been worked on, and it keeps `(HTTP n)` for the caller."""
    api = _FakeApi(post=(status, {"error": "refused"}))
    message, _ = _refused(tmp_path, api)
    assert [call[0] for call in api.calls] == ["POST"]
    assert HTTP_STATUS.search(message).group(1) == str(status)


def test_a_rate_limited_submission_is_sent_again_and_the_poll_timeout_counts_from_its_first_send(
        tmp_path: Path, clock, capsys) -> None:
    """xAI's 429 ("reached the rate limit") made nothing: the POST goes again after the doubling wait the
    polls wait by, and the poll timeout starts at the first send, so that wait is inside it."""
    answers = [(429, {"code": "resource-exhausted", "error": "slow down"}), (200, {"request_id": "req-1"})]
    api = _FakeApi()
    api.post = None
    real_call = api.call

    def call(method, url, token, body, *, deadline=None):
        if method == "POST":
            api.calls.append((method, url, token, body))
            return answers.pop(0)
        assert deadline == 30  # the first send, at 0; the accepted one came after the 8 s wait
        return real_call(method, url, token, body, deadline=deadline)

    result = video.generate_video(_request(tmp_path), credential=video.Credential("t", video.AUTH_SOURCE_GROK_LOGIN),
                                  call=call, download=api.download, sleep=clock.sleep, poll_timeout=30)
    assert [c[0] for c in api.calls] == ["POST", "POST", "GET"] and clock.slept == [8.0]
    assert result.out.read_bytes() == MP4
    assert "[video] xai refused the request (429 resource-exhausted); nothing was made — asking again in 8s (1 of 2)" \
        in capsys.readouterr().err


def test_a_rate_limit_still_there_after_two_more_sends_keeps_its_status_for_the_caller(tmp_path: Path) -> None:
    api = _FakeApi(post=(429, {"error": "slow down"}))
    message, _ = _refused(tmp_path, api)
    assert [call[0] for call in api.calls] == ["POST"] * 3
    assert HTTP_STATUS.search(message).group(1) == "429"


def test_a_rate_limited_submission_whose_next_wait_would_reach_the_poll_timeout_is_not_sent_again(
        tmp_path: Path, clock, capsys) -> None:
    """The waits before a refused POST goes again are inside the poll timeout: with 20 s, the 8 s wait leaves
    some of it and the 16 s one would reach it, so the second 429 ends the run, its status kept for the
    caller and its stderr line saying why it was not sent again — before a ceiling set above the timeout."""
    api = _FakeApi(post=(429, {"code": "resource-exhausted", "error": "slow down"}))
    request = _request(tmp_path)
    with pytest.raises(SystemExit) as refused:
        video.generate_video(request, credential=video.Credential("t", video.AUTH_SOURCE_GROK_LOGIN),
                             call=api.call, download=api.download, sleep=clock.sleep, poll_timeout=20)
    assert [call[0] for call in api.calls] == ["POST", "POST"] and clock.slept == [8.0]
    assert HTTP_STATUS.search(str(refused.value)).group(1) == "429"
    assert ("[video] xai refused the request (429 resource-exhausted); nothing was made — not asking again: "
            "the 16s wait would reach the time limit (12s left)") in capsys.readouterr().err
    assert not request.out.exists() and api.downloads == []


def test_a_rate_limited_submission_whose_wait_woke_past_the_poll_timeout_is_not_sent_again(
        tmp_path: Path, clock, capsys) -> None:
    """The counterexample: with 8.01 s, the 8 s wait after a 429 ends before the poll timeout as asked, but the
    sleep wakes 20 ms late, past it. The timeout is read again right before the send, so no second POST goes —
    one sent then could be taken, and billed, after the limit the caller set — and the 429 ends the run with
    its status, its stderr line saying why."""
    answers = [(429, {"code": "resource-exhausted", "error": "slow down"}), (200, {"request_id": "req-late"})]
    sent = []

    def call(method, url, token, body, *, deadline=None):
        sent.append((method, clock.now))
        assert method == "POST", "no poll goes after the poll timeout"
        return answers.pop(0)

    request = _request(tmp_path)
    with pytest.raises(SystemExit) as refused:
        video.generate_video(request, credential=video.Credential("t", video.AUTH_SOURCE_GROK_LOGIN), call=call,
                             download=lambda *a, **k: pytest.fail("no download"), sleep=clock.waking_late(0.020),
                             poll_timeout=8.010)
    assert sent == [("POST", 0.0)] and clock.slept == [8.0]
    assert not isinstance(refused.value, video.GenerationUnfinished)
    assert HTTP_STATUS.search(str(refused.value)).group(1) == "429"
    assert capsys.readouterr().err.splitlines()[-1] == (
        "[video] xai refused the request (429 resource-exhausted); nothing was made — not asking again: "
        "the time limit came during the 8s wait")
    assert not request.out.exists()


def test_the_cli_leaves_an_unfinished_report_naming_the_request(tmp_path: Path, monkeypatch, clock, capsys) -> None:
    api = _FakeApi(polls=[(503, {"error": "unavailable"})])
    monkeypatch.setattr(video, "resolve_credential", lambda **_: video.Credential("t", video.AUTH_SOURCE_GROK_LOGIN))
    monkeypatch.setattr(video, "http_json", api.call)
    monkeypatch.setattr(video, "http_download", api.download)
    monkeypatch.setattr(video, "POLL_TIMEOUT_SECONDS", 30)
    out, report = tmp_path / "clip.mp4", tmp_path / "clip.report.json"
    with pytest.raises(video.GenerationUnfinished):
        video.run(image=_still(tmp_path), prompt="sway", out=out, report=report)
    assert json.loads(report.read_text(encoding="utf-8")) == {
        "kind": "sprite-gen-video-unfinished",
        "provider": "grok-imagine",
        "verb": "video",
        "auth_source": "grok-login",
        "model": video.DEFAULT_MODEL,
        "request_id": "req-1",
        "out": str(out.resolve()),
        "polls": 3,
        "polls_refused": 3,
        "polls_unanswered": 0,
        "last_poll": {"http": 503, "status": None},
        "elapsed_seconds": 24.0,
    }
    assert capsys.readouterr().out == "" and not out.exists()


# --- a poll that gets no answer, or whose credential xAI rejects ----------------------
# The POST was accepted either way, so the run must leave the request's id. A poll lost on the
# way (the connection failed or timed out) is a GET, safe to ask again like a refused one; a
# poll whose credential is rejected ends unfinished at once — that token will not mend itself.

LOST = "lost"  # a scripted poll that gets no HTTP answer


class _LossyApi(_FakeApi):
    def call(self, method, url, token, body, *, deadline=None):
        reply = super().call(method, url, token, body)
        if reply == LOST:
            raise video.TransportError("timed out")
        return reply


# `xai.no_answer_reason`: a URLError unwrapped, an empty message named by its type, a plain OSError.
@pytest.mark.parametrize(("raised", "reason"), [
    (urllib.error.URLError(TimeoutError("timed out")), "timed out"),
    (TimeoutError(), "TimeoutError"),
    (ConnectionResetError(54, "Connection reset by peer"), "[Errno 54] Connection reset by peer"),
], ids=["url-timeout", "bare-timeout", "reset"])
def test_http_json_names_a_request_that_got_no_answer(monkeypatch, raised, reason) -> None:
    """Still the SystemExit and line it always was; the type lets a caller that may ask again catch it."""
    def urlopen(request, *, timeout):
        raise raised

    monkeypatch.setattr(xai.urllib.request, "urlopen", urlopen)
    with pytest.raises(xai.TransportError) as lost:
        xai.http_json("GET", "https://api.x.ai/v1/videos/req-1", "t")
    assert isinstance(lost.value, SystemExit) and video.TransportError is xai.TransportError
    assert str(lost.value) == "xai: request failed or timed out; no automatic retry (the server may have accepted it)"
    assert lost.value.reason == reason


def test_a_poll_that_gets_no_answer_is_asked_again_and_publishes(tmp_path: Path, capsys) -> None:
    api = _LossyApi(polls=[LOST, (200, {"status": "pending"}), (503, {"error": "unavailable"}), LOST, DONE])
    slept: list[float] = []
    result = video.generate_video(_request(tmp_path), credential=video.Credential("t", video.AUTH_SOURCE_GROK_LOGIN),
                                  call=api.call, download=api.download, sleep=slept.append)
    assert [call[0] for call in api.calls] == ["POST", "GET", "GET", "GET", "GET", "GET"]
    assert {call[1] for call in api.calls[1:]} == {"https://api.x.ai/v1/videos/req-1"}
    # A lost poll waits like a refused one, and a refused poll then a lost one are two in a row.
    assert slept == [8.0, 4.0, 8.0, 16.0]
    assert result.out.read_bytes() == MP4
    payload = result.to_dict()
    assert (payload["polls"], payload["polls_refused"], payload["polls_unanswered"]) == (5, 1, 2)
    assert "[video] poll 1 of generation req-1 got no answer (timed out); asking again in 8s" in capsys.readouterr().err


def test_polls_that_get_no_answer_until_the_poll_timeout_end_unfinished_naming_the_request(tmp_path: Path, clock) -> None:
    api = _LossyApi(polls=[LOST])
    request = _request(tmp_path)
    with pytest.raises(video.GenerationUnfinished) as unfinished:
        video.generate_video(request, credential=video.Credential("t", video.AUTH_SOURCE_GROK_LOGIN),
                             call=api.call, download=api.download, sleep=clock.sleep, poll_timeout=30)
    assert [call[0] for call in api.calls].count("POST") == 1
    assert clock.slept == [8.0, 16.0] and clock.now == 24 and len(api.calls) == 1 + 3
    message = str(unfinished.value)
    assert message == ("video: generation req-1 was accepted, but its polls got no answer (last: timed out) until the "
                       "poll timeout (30s, 3 polls); it may still finish and be billed — ask for request_id=req-1 "
                       f"again with `sprite-gen video-resume --request-id req-1 --out {request.out.resolve()}` "
                       "instead of submitting a new request; nothing was written")
    assert HTTP_STATUS.search(message) is None
    report = unfinished.value.to_dict()
    assert (report["polls"], report["polls_refused"], report["polls_unanswered"]) == (3, 0, 3)
    assert report["last_poll"] == {"http": None, "status": None, "error": "timed out"}
    assert not request.out.exists() and not list(tmp_path.glob("*.part")) and api.downloads == []


def test_a_submission_that_gets_no_answer_is_not_unfinished_and_is_never_sent_again(tmp_path: Path) -> None:
    """No request_id came back, so there is nothing to ask for: the POST's line stays as it was."""
    calls: list[str] = []

    def call(method, url, token, body):
        calls.append(method)
        raise video.TransportError("timed out")

    with pytest.raises(SystemExit) as failed:
        video.generate_video(_request(tmp_path), credential=video.Credential("t", video.AUTH_SOURCE_GROK_LOGIN),
                             call=call, download=lambda url, token, **_: MP4, sleep=lambda s: None)
    assert not isinstance(failed.value, video.GenerationUnfinished)
    assert calls == ["POST"] and "no automatic retry" in str(failed.value)


# `http in (401, 403)` is one branch; the source picks only the fix text.
@pytest.mark.parametrize(("status", "source", "fix"), [
    (401, video.AUTH_SOURCE_GROK_LOGIN, f"refresh the login with `{video.GROK_REFRESH_COMMAND}` run {video.GROK_REFRESH_WHERE} "
                                        f"or `{video.GROK_LOGIN_COMMAND}`"),
    (403, video.AUTH_SOURCE_API_KEY, f"check the {video.AUTH_ENV} value"),
], ids=["401-grok-login", "403-api-key"])
def test_a_poll_whose_credential_is_rejected_ends_unfinished_at_once(tmp_path: Path, status, source, fix) -> None:
    api = _FakeApi(polls=[(200, {"status": "pending"}), (status, {"error": "token expired"})])
    request = _request(tmp_path)
    with pytest.raises(video.GenerationUnfinished) as unfinished:
        video.generate_video(request, credential=video.Credential("t", source),
                             call=api.call, download=api.download, sleep=lambda s: None)
    assert [call[0] for call in api.calls] == ["POST", "GET", "GET"]
    message = str(unfinished.value)
    assert message == (f"video: generation req-1 was accepted, but xAI rejected the credential ({source}) on poll 2 "
                       f"(answer {status}); it may still finish and be billed — {fix}, then ask for request_id=req-1 "
                       f"again with `sprite-gen video-resume --request-id req-1 --out {request.out.resolve()}` "
                       "instead of submitting a new request; nothing was written")
    assert HTTP_STATUS.search(message) is None and f"HTTP {status}" not in message
    report = unfinished.value.to_dict()
    assert (report["request_id"], report["polls"], report["last_poll"]) == ("req-1", 2, {"http": status, "status": None})
    assert not request.out.exists() and api.downloads == []


# --- video-resume: an accepted request asked for again by its id ----------------------
# The request an unfinished run named is polled, downloaded and published — no POST, so nothing
# is bought twice. A resume cut short again is unfinished on the same id.

RESUMED = video.Credential("t", video.AUTH_SOURCE_GROK_LOGIN)


def _resume(tmp_path: Path, api: _FakeApi, request_id: str = "req-7", **kwargs) -> video.VideoResult:
    return video.resume_video(video.ResumeRequest(request_id=request_id, out=tmp_path / "clip.mp4"),
                              call=api.call, download=api.download, **{"credential": RESUMED, "sleep": lambda s: None, **kwargs})


def test_resume_polls_the_request_without_a_submission_and_publishes(tmp_path: Path, capsys) -> None:
    api = _FakeApi(polls=[(429, {"error": "slow down"}), (200, {"status": "pending"}), DONE])
    result = _resume(tmp_path, api, credential=video.Credential("xai-console", video.AUTH_SOURCE_API_KEY))
    assert [call[0] for call in api.calls] == ["GET", "GET", "GET"]
    assert {call[1] for call in api.calls} == {"https://api.x.ai/v1/videos/req-7"}
    assert result.out == (tmp_path / "clip.mp4").resolve() and result.out.read_bytes() == MP4
    payload = result.to_dict()
    assert payload["kind"] == "sprite-gen-video-report" and payload["mode"] == "resume"
    assert (payload["request_id"], payload["polls"], payload["polls_refused"]) == ("req-7", 3, 1)
    assert payload["model"] == "grok-imagine-video-1.5" and payload["duration_reported"] == 6.0
    assert payload["duration_requested"] is None and payload["inputs"] == {} and payload["auth_source"] == "XAI_API_KEY"
    # Nothing new is bought, so the API-key route announces no charge.
    assert "per-call API charge" not in capsys.readouterr().err


def test_a_resume_cut_short_again_is_unfinished_on_the_same_request(tmp_path: Path, clock) -> None:
    # The polls' stop reasons (refused, lost, pending) are `_poll_publish`'s, tested on the generate path.
    api = _LossyApi(polls=[LOST])
    with pytest.raises(video.GenerationUnfinished) as unfinished:
        _resume(tmp_path, api, sleep=clock.sleep, poll_timeout=30)
    assert "POST" not in [call[0] for call in api.calls]
    message = str(unfinished.value)
    assert message.startswith("video-resume: generation req-7 ")
    assert message.endswith("it may still finish and be billed — ask for request_id=req-7 again with "
                            f"`sprite-gen video-resume --request-id req-7 --out {(tmp_path / 'clip.mp4').resolve()}` "
                            "instead of submitting a new request; nothing was written")
    report = unfinished.value.to_dict()
    assert (report["verb"], report["request_id"], report["model"]) == ("video-resume", "req-7", None)
    assert not (tmp_path / "clip.mp4").exists()


def test_a_resume_of_a_request_xai_does_not_know_ends_with_its_status(tmp_path: Path) -> None:
    api = _FakeApi(polls=[(404, {"error": "not found"})])
    with pytest.raises(SystemExit) as refused:
        _resume(tmp_path, api)
    assert not isinstance(refused.value, video.GenerationUnfinished)
    assert str(refused.value).startswith("video-resume: generation req-7 ")
    assert HTTP_STATUS.search(str(refused.value)).group(1) == "404"
    assert not (tmp_path / "clip.mp4").exists()


@pytest.mark.parametrize("request_id", ["", "  ", "req/../1", "req-1?x=1", "req 1", "req#1", "%2e%2e", "-req"])
def test_resume_refuses_what_cannot_be_a_request_id_before_any_call(tmp_path: Path, request_id) -> None:
    api = _FakeApi()
    with pytest.raises(SystemExit, match="video-resume: --request-id"):
        _resume(tmp_path, api, request_id=request_id)
    assert api.calls == []


def test_the_resume_cli_writes_the_report_and_prints_it(tmp_path: Path, monkeypatch, clock, capsys) -> None:
    api = _FakeApi()
    monkeypatch.setattr(video, "resolve_credential", lambda **_: RESUMED)
    monkeypatch.setattr(video, "http_json", api.call)
    monkeypatch.setattr(video, "http_download", api.download)
    out, report = tmp_path / "clip.mp4", tmp_path / "clip.report.json"
    assert video.run_resume(request_id="req-7", out=out, report=report) == 0
    payload = json.loads(report.read_text(encoding="utf-8"))
    assert (payload["mode"], payload["request_id"], payload["out"]) == ("resume", "req-7", str(out.resolve()))
    assert json.loads(capsys.readouterr().out)["report"] == str(report.resolve())
    assert [call[0] for call in api.calls] == ["GET"] and out.read_bytes() == MP4
    with pytest.raises(TypeError, match="unexpected keyword"):
        video.run_resume(request_id="req-7", out=out, prompt="p")


def test_the_resume_cli_leaves_an_unfinished_report_on_the_same_request(tmp_path: Path, monkeypatch, clock, capsys) -> None:
    api = _FakeApi(polls=[(200, {"status": "pending"})])
    monkeypatch.setattr(video, "resolve_credential", lambda **_: RESUMED)
    monkeypatch.setattr(video, "http_json", api.call)
    monkeypatch.setattr(video, "http_download", api.download)
    monkeypatch.setattr(video, "POLL_TIMEOUT_SECONDS", 10)
    out, report = tmp_path / "clip.mp4", tmp_path / "clip.report.json"
    with pytest.raises(video.GenerationUnfinished):
        video.run_resume(request_id="req-7", out=out, report=report)
    assert json.loads(report.read_text(encoding="utf-8")) == {
        "kind": "sprite-gen-video-unfinished",
        "provider": "grok-imagine",
        "verb": "video-resume",
        "auth_source": "grok-login",
        "model": None,
        "request_id": "req-7",
        "out": str(out.resolve()),
        "polls": 3,
        "polls_refused": 0,
        "polls_unanswered": 0,
        "last_poll": {"http": 200, "status": "pending"},
        "elapsed_seconds": 8.0,
    }
    assert capsys.readouterr().out == "" and not out.exists()


def test_the_unified_cli_routes_video_resume_under_gen() -> None:
    from sprite_gen import cli

    assert "video-resume" in cli.command_domains()["gen"]
    parser = cli._build_parser()
    args = parser.parse_args(["video-resume", "--request-id", "req-7", "--out", "o.mp4", "--report", "r.json"])
    assert (args.command, args.request_id, args.out, args.report) == ("video-resume", "req-7", Path("o.mp4"), Path("r.json"))
    for missing in (["--out", "o.mp4"], ["--request-id", "req-7"]):
        with pytest.raises(SystemExit):
            parser.parse_args(["video-resume", *missing])


# --- an answer cut short, garbled or not JSON, read by http.client -------------------
# A poll whose answer began and broke (the body ends before its Content-Length, the status line is
# not one) or came whole but is not JSON gave the run nothing to read: it is asked again on the same
# request like a lost one, and at the poll timeout the run is unfinished on that id — never an
# exception that leaves no id behind. The answers reach the run through urllib and http.client, and
# only the socket under them is scripted (`_Wire`), so http.client raises what it raises on the wire
# and every wait is on the test's clock.


def _answer(status: str, body: bytes, *, length: int | None = None, content_type: str = "application/json") -> bytes:
    """A raw HTTP/1.1 answer whose Content-Length says `length` (by default the body's own)."""
    head = (f"HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\n"
            f"Content-Length: {len(body) if length is None else length}\r\nConnection: close\r\n\r\n")
    return head.encode("latin-1") + body


ACCEPTED = _answer("200 OK", b'{"request_id": "req-1"}')
CUT = _answer("200 OK", b'{"status":', length=200)  # 10 of 200 bytes, then the connection closes
CUT_REFUSAL = _answer("503 Service Unavailable", b'{"error":', length=200)  # a refusal's body cut the same way
GARBLED = b"garbage\r\n"  # where the status line should be
NOT_JSON = _answer("200 OK", b"<html>upstream busy</html>")  # whole, and not JSON
PENDING_ON_WIRE = _answer("200 OK", b'{"status": "pending"}')
DONE_ON_WIRE = _answer("200 OK", json.dumps(DONE[1]).encode("utf-8"))
CUT_SAID = "IncompleteRead(10 bytes read, 190 more expected)"


class _Hold:
    """Scripted bytes after which the connection stays open and nothing more comes: a read waits out its timeout."""

    def __init__(self, data: bytes) -> None:
        self.data = data


class _Trickle:
    """A scripted answer whose head comes at once and whose body comes a byte every `every` seconds — an
    answer that keeps coming, too slowly for one read's timeout ever to fire — then the connection closes."""

    def __init__(self, head: bytes, body: bytes, every: float) -> None:
        self.head, self.body, self.every = head, body, every


class _Wire:
    """A scripted xAI at `root`: http.client's connect to it opens a `_Connection`, and each request sent on one
    gets the next scripted bytes (the last one repeats), then the connection closes whatever its Content-Length
    promised — or, for a `_Hold`, stays open with nothing more to come; a `_Trickle` comes as it says. A connect
    to any other address is refused, as one to a port nothing listens on is."""

    host, port = "wire.test", 80
    root = f"http://{host}"
    base = f"{root}/v1"

    def __init__(self, clock: _Clock, answers: list[bytes | _Hold | _Trickle]) -> None:
        self.clock = clock
        self.answers = list(answers)
        self.seen: list[tuple[str, str]] = []

    def connect(self, connection: http.client.HTTPConnection) -> None:
        """In place of HTTPConnection.connect: its socket, with its timeout, as socket.create_connection sets it."""
        if (connection.host, connection.port) != (self.host, self.port):
            raise ConnectionRefusedError(errno.ECONNREFUSED, os.strerror(errno.ECONNREFUSED))
        connection.sock = _Connection(self, connection.timeout)

    def answer(self, request: bytes) -> bytes | _Hold | _Trickle:
        """The scripted answer to `request`, sent whole."""
        assert b"\r\n\r\n" in request, "a read came before the request was sent"
        method, path = request.split(b"\r\n", 1)[0].decode("latin-1").split(" ")[:2]
        self.seen.append((method, path))
        return self.answers.pop(0) if len(self.answers) > 1 else self.answers[0]


class _Connection:
    """A connection to the wire, as http.client uses a socket. What is sent is kept; the first read takes the
    wire's answer to it, whose bytes come from then on as scripted. A read takes what has come; with nothing there
    it waits on the test's clock for the next bytes, at most its timeout — past that, as a socket's read does, it
    raises TimeoutError('timed out'). The reader over it is socket.SocketIO, the one a socket's makefile gives."""

    def __init__(self, wire: _Wire, timeout: float) -> None:
        self.wire, self.timeout = wire, timeout
        self.sent = b""
        self.coming: list[tuple[float, bytes]] | None = None  # the answer's bytes, each with when it comes
        self.held = False  # the connection stays open once they are read

    def settimeout(self, timeout: float) -> None:
        self.timeout = timeout

    def sendall(self, data: bytes) -> None:
        self.sent += data

    def makefile(self, mode: str) -> io.BufferedReader:
        return io.BufferedReader(socket.SocketIO(self, mode))

    def close(self) -> None:
        """The answer's reader still reads, as one from a socket's makefile does after the socket is closed."""

    def _decref_socketios(self) -> None:
        """What socket.SocketIO tells its socket as it closes; there is nothing to free here."""

    def recv_into(self, buffer: memoryview) -> int:
        clock = self.wire.clock
        if self.coming is None:
            answer = self.wire.answer(self.sent)
            if isinstance(answer, _Trickle):
                self.coming = [(clock.now, answer.head)] + [
                    (clock.now + (at + 1) * answer.every, answer.body[at:at + 1]) for at in range(len(answer.body))]
            else:
                self.held = isinstance(answer, _Hold)
                self.coming = [(clock.now, answer.data if self.held else answer)]
        if not self.coming and not self.held:
            return 0  # all of it read, and the wire closed the connection
        if not self.coming or self.coming[0][0] - clock.now > self.timeout:
            clock.now += self.timeout
            raise TimeoutError("timed out")
        clock.now = max(clock.now, self.coming[0][0])
        data = b""
        while self.coming and self.coming[0][0] <= clock.now:
            data += self.coming.pop(0)[1]
        if len(data) > len(buffer):
            self.coming.insert(0, (clock.now, data[len(buffer):]))
            data = data[:len(buffer)]
        buffer[:len(data)] = data
        return len(data)


@pytest.fixture
def wire(monkeypatch, clock):
    """`wire(*answers)` scripts a _Wire on the test's clock, opens every HTTP connection of the test on it, and
    makes it xAI's own address (the variable unset, so a clip is downloaded from where the poll names it)."""

    def serve(*answers: bytes | _Hold | _Trickle) -> _Wire:
        server = _Wire(clock, list(answers))
        monkeypatch.setattr(http.client.HTTPConnection, "connect", lambda connection: server.connect(connection))
        monkeypatch.delenv("SPRITE_GEN_XAI_BASE_URL", raising=False)
        monkeypatch.setitem(address.PROVIDERS, "xai", replace(address.PROVIDERS["xai"], default=server.base))
        return server

    return serve


def _on_wire(method, url, token, body, **deadline):
    # The real transport, each wait on the connection 5 s at most, and the run's deadline.
    return xai.http_json(method, url, token, body, timeout=5, **deadline)


# A body cut short reads differently with and without a deadline; a garbled status line fails inside urlopen
# and a whole body that is not JSON fails in json.loads, the same on either read.
@pytest.mark.parametrize(("answer", "line", "reason", "bounded"), [
    (CUT, xai.TRANSPORT_FAILED, CUT_SAID, False),
    (CUT, xai.TRANSPORT_FAILED, CUT_SAID, True),
    (CUT_REFUSAL, xai.TRANSPORT_FAILED, "IncompleteRead(9 bytes read, 191 more expected)", False),
    (CUT_REFUSAL, xai.TRANSPORT_FAILED, "IncompleteRead(9 bytes read, 191 more expected)", True),
    (GARBLED, xai.TRANSPORT_FAILED, "BadStatusLine('garbage\\r\\n')", False),
    (NOT_JSON, "xai: response was not valid JSON", "response was not valid JSON", False),
], ids=["cut-no-deadline", "cut-deadline", "cut-refusal-no-deadline", "cut-refusal-deadline", "garbled", "not-json"])
def test_http_json_reads_an_answer_it_cannot_read_whole_as_no_answer(wire, clock, answer, line, reason, bounded) -> None:
    """The line each always had — the transport's, or the not-JSON one — on the type a poll asks again on,
    whether or not a deadline bounds the read (a body read a chunk at a time still knows it was cut short)."""
    server = wire(answer)
    with pytest.raises(xai.TransportError) as lost:
        _on_wire("GET", f"{server.base}/videos/req-1", "t", None, **({"deadline": clock.now + 60} if bounded else {}))
    assert isinstance(lost.value, SystemExit)
    assert (str(lost.value), lost.value.reason) == (line, reason)
    assert server.seen == [("GET", "/v1/videos/req-1")]


def test_a_poll_cut_short_garbled_or_not_json_is_asked_again_and_publishes(tmp_path: Path, wire, clock, capsys) -> None:
    server = wire(ACCEPTED, CUT, GARBLED, NOT_JSON, CUT_REFUSAL, PENDING_ON_WIRE, DONE_ON_WIRE)
    result = video.generate_video(_request(tmp_path), credential=video.Credential("t", video.AUTH_SOURCE_GROK_LOGIN),
                                  call=_on_wire, download=lambda url, token, **_: MP4, sleep=clock.sleep)
    assert server.seen == [("POST", "/v1/videos/generations")] + [("GET", "/v1/videos/req-1")] * 6
    # Four unreadable answers in a row wait like four lost polls; the pending answer puts the wait back.
    assert clock.slept == [8.0, 16.0, 32.0, 60.0, 4.0]
    assert result.out.read_bytes() == MP4
    payload = result.to_dict()
    assert (payload["request_id"], payload["polls"], payload["polls_refused"], payload["polls_unanswered"]) == ("req-1", 6, 0, 4)
    err = capsys.readouterr().err
    assert f"[video] poll 1 of generation req-1 got no answer ({CUT_SAID}); asking again in 8s" in err
    assert "[video] poll 3 of generation req-1 got no answer (response was not valid JSON); asking again in 32s" in err


def test_polls_cut_short_until_the_poll_timeout_leave_an_unfinished_report_naming_the_request(
        tmp_path: Path, wire, clock, monkeypatch, capsys) -> None:
    server = wire(ACCEPTED, CUT)
    monkeypatch.setattr(video, "resolve_credential", lambda **_: video.Credential("t", video.AUTH_SOURCE_GROK_LOGIN))
    monkeypatch.setattr(video, "POLL_TIMEOUT_SECONDS", 30)
    out, report = tmp_path / "clip.mp4", tmp_path / "clip.report.json"
    with pytest.raises(video.GenerationUnfinished) as unfinished:
        video.run(image=_still(tmp_path), prompt="sway", out=out, report=report)
    assert server.seen == [("POST", "/v1/videos/generations")] + [("GET", "/v1/videos/req-1")] * 3
    assert clock.slept == [8.0, 16.0] and clock.now == 24
    message = str(unfinished.value)
    assert message == (f"video: generation req-1 was accepted, but its polls got no answer (last: {CUT_SAID}) until the "
                       "poll timeout (30s, 3 polls); it may still finish and be billed — ask for request_id=req-1 "
                       f"again with `sprite-gen video-resume --request-id req-1 --out {out.resolve()}` "
                       "instead of submitting a new request; nothing was written")
    assert HTTP_STATUS.search(message) is None
    assert json.loads(report.read_text(encoding="utf-8")) == {
        "kind": "sprite-gen-video-unfinished",
        "provider": "grok-imagine",
        "verb": "video",
        "auth_source": "grok-login",
        "model": video.DEFAULT_MODEL,
        "request_id": "req-1",
        "out": str(out.resolve()),
        "polls": 3,
        "polls_refused": 0,
        "polls_unanswered": 3,
        "last_poll": {"http": None, "status": None, "error": CUT_SAID},
        "elapsed_seconds": 24.0,
    }
    assert capsys.readouterr().out == "" and not out.exists() and not list(tmp_path.glob("*.part"))


def test_a_submission_cut_short_is_not_unfinished_and_is_never_sent_again(tmp_path: Path, wire) -> None:
    """No request_id could be read, so there is nothing to ask for: the POST ends at once on the transport's line."""
    server = wire(CUT)
    with pytest.raises(SystemExit) as failed:
        video.generate_video(_request(tmp_path), credential=video.Credential("t", video.AUTH_SOURCE_GROK_LOGIN),
                             call=_on_wire, download=lambda url, token, **_: MP4, sleep=lambda s: None)
    assert isinstance(failed.value, xai.TransportError) and not isinstance(failed.value, video.GenerationUnfinished)
    assert str(failed.value) == xai.TRANSPORT_FAILED and failed.value.reason == CUT_SAID
    assert server.seen == [("POST", "/v1/videos/generations")]


# --- a clip that is done and could not be downloaded, read by http.client ---------------
# The poll said done: the clip is made and may be billed, and its request_id is the one way back to
# it. A download that gets no answer it can read (the connection refused, the body cut short, a read
# that timed out) or that the clip's host refuses with 429 or 5xx is downloaded again, up to three
# downloads; one still failing — or refused with another status, or bytes that are not an mp4 —
# leaves the run unfinished on that request_id, never an exception that names no request, and
# `video-resume` polls it again for a fresh URL.

CLIP = _answer("200 OK", MP4, content_type="video/mp4")
CLIP_CUT = _answer("200 OK", MP4[:10], length=len(MP4), content_type="video/mp4")  # closes 10 bytes in
CLIP_HELD = _Hold(CLIP_CUT)  # the same 10 bytes, then the connection stays open: the read times out
CLIP_REFUSED = _answer("503 Service Unavailable", b"busy", content_type="text/plain")
CLIP_GONE = _answer("404 Not Found", b"gone", content_type="text/plain")
NOT_A_CLIP_BODY = b"<html>this link has expired</html>"
NOT_A_CLIP = _answer("200 OK", NOT_A_CLIP_BODY, content_type="text/html")  # whole, and not an mp4
CLIP_CUT_SAID = f"IncompleteRead(10 bytes read, {len(MP4) - 10} more expected)"
REFUSED_URL = "http://refused.test/clips/1.mp4"  # a clip on an address the wire is not: its connect is refused
REFUSED_SAID = f"[Errno {errno.ECONNREFUSED}] {os.strerror(errno.ECONNREFUSED)}"
READ_TIMEOUT_SECONDS = 1.0
SUBMITTED = [("POST", "/v1/videos/generations"), ("GET", "/v1/videos/req-1")]


def _done_at(url: str) -> bytes:
    """The done poll, naming the clip at `url`."""
    return _answer("200 OK", json.dumps({**DONE[1], "video": {**DONE[1]["video"], "url": url}}).encode("utf-8"))


def _clip_wire(wire, *downloads: bytes | _Hold | _Trickle, clip_url: str | None = None) -> _Wire:
    """The POST accepted, one poll done naming the clip at `clip_url` (by default on the wire itself,
    `/clips/1.mp4`), then `downloads` answer the clip's downloads in turn."""
    server = wire()
    server.answers = [ACCEPTED, _done_at(clip_url or f"{server.root}/clips/1.mp4"), *downloads]
    return server


def _cli_on_wire(monkeypatch) -> None:
    """The CLI on its own transports, a read of the clip waiting READ_TIMEOUT_SECONDS at most."""
    monkeypatch.setattr(video, "resolve_credential", lambda **_: video.Credential("t", video.AUTH_SOURCE_GROK_LOGIN))
    monkeypatch.setattr(video, "HTTP_TIMEOUT_SECONDS", READ_TIMEOUT_SECONDS)


@pytest.mark.parametrize(("failure", "said", "elapsed"), [
    ("cut", CLIP_CUT_SAID, 24.0),
    ("read-timeout", "timed out", 24.0 + 3 * READ_TIMEOUT_SECONDS),  # each download waits out its read, too
    ("refused-connection", REFUSED_SAID, 24.0),
], ids=["cut", "read-timeout", "refused-connection"])
def test_a_clip_whose_downloads_get_no_answer_leaves_an_unfinished_report_naming_the_request(
        tmp_path: Path, wire, clock, monkeypatch, capsys, failure, said, elapsed) -> None:
    if failure == "refused-connection":
        server, downloads = _clip_wire(wire, clip_url=REFUSED_URL), []
    else:
        server = _clip_wire(wire, CLIP_CUT if failure == "cut" else CLIP_HELD)
        downloads = [("GET", "/clips/1.mp4")] * 3
    _cli_on_wire(monkeypatch)
    out, report = tmp_path / "clip.mp4", tmp_path / "clip.report.json"
    with pytest.raises(video.GenerationUnfinished) as unfinished:
        video.run(image=_still(tmp_path), prompt="sway", out=out, report=report)
    # One POST, one poll; the clip downloaded three times with waits 8 and 16 between.
    assert server.seen == SUBMITTED + downloads
    assert clock.slept == [8.0, 16.0] and clock.now == elapsed
    message = str(unfinished.value)
    assert message == (f"video: generation req-1 is done, but its download got no answer (last: {said}) after 3 "
                       "attempts; the clip is made and may be billed — ask for request_id=req-1 again with "
                       f"`sprite-gen video-resume --request-id req-1 --out {out.resolve()}` instead of submitting a "
                       "new request; nothing was written")
    assert HTTP_STATUS.search(message) is None
    assert json.loads(report.read_text(encoding="utf-8")) == {
        "kind": "sprite-gen-video-unfinished",
        "provider": "grok-imagine",
        "verb": "video",
        "auth_source": "grok-login",
        "model": video.DEFAULT_MODEL,
        "request_id": "req-1",
        "out": str(out.resolve()),
        "polls": 1,
        "polls_refused": 0,
        "polls_unanswered": 0,
        "last_poll": {"http": 200, "status": "done"},
        "downloads": 3,
        "last_download": {"http": None, "error": said},
        "elapsed_seconds": elapsed,
    }
    captured = capsys.readouterr()
    assert captured.out == ""
    assert f"[video] download 1 of generation req-1 got no answer ({said}); downloading again in 8s" in captured.err
    assert f"[video] download 2 of generation req-1 got no answer ({said}); downloading again in 16s" in captured.err
    assert not out.exists() and not list(tmp_path.glob("*.part"))


def test_a_download_cut_short_or_refused_is_downloaded_again_and_publishes(tmp_path: Path, wire, clock, monkeypatch, capsys) -> None:
    server = _clip_wire(wire, CLIP_CUT, CLIP_REFUSED, CLIP)
    monkeypatch.setattr(video, "HTTP_TIMEOUT_SECONDS", READ_TIMEOUT_SECONDS)
    result = video.generate_video(_request(tmp_path), credential=video.Credential("t", video.AUTH_SOURCE_GROK_LOGIN),
                                  call=_on_wire, sleep=clock.sleep)
    assert server.seen == SUBMITTED + [("GET", "/clips/1.mp4")] * 3
    assert clock.slept == [8.0, 16.0]
    assert result.out.read_bytes() == MP4
    payload = result.to_dict()
    assert (payload["request_id"], payload["polls"], payload["downloads"]) == ("req-1", 1, 3)
    err = capsys.readouterr().err
    assert f"[video] download 1 of generation req-1 got no answer ({CLIP_CUT_SAID}); downloading again in 8s" in err
    assert "[video] download 2 of generation req-1 was refused (503); downloading again in 16s" in err


@pytest.mark.parametrize(("answer", "downloads", "said", "status"), [
    (CLIP_REFUSED, 3, "was refused (last answer 503) after 3 attempts", 503),
    (CLIP_GONE, 1, "was refused (answer 404)", 404),
], ids=["refused-503", "gone-404"])
def test_a_download_refused_ends_unfinished_on_the_same_request(tmp_path: Path, wire, clock, answer, downloads, said, status) -> None:
    """429 and 5xx are downloaded again; any other status ends at once — `video-resume` asks for a fresh URL."""
    server = _clip_wire(wire, answer)
    request = _request(tmp_path)
    with pytest.raises(video.GenerationUnfinished) as unfinished:
        video.generate_video(request, credential=video.Credential("t", video.AUTH_SOURCE_GROK_LOGIN),
                             call=_on_wire, sleep=clock.sleep)
    assert server.seen == SUBMITTED + [("GET", "/clips/1.mp4")] * downloads
    assert clock.slept == [8.0, 16.0][:downloads - 1]
    message = str(unfinished.value)
    assert message == (f"video: generation req-1 is done, but its download {said}; the clip is made and may be billed — "
                       f"ask for request_id=req-1 again with `sprite-gen video-resume --request-id req-1 --out "
                       f"{request.out.resolve()}` instead of submitting a new request; nothing was written")
    # No `(HTTP n)`: a caller reading `(HTTP 503)` sends the request again and buys the clip twice.
    assert HTTP_STATUS.search(message) is None
    report = unfinished.value.to_dict()
    assert (report["request_id"], report["downloads"], report["last_download"]) == ("req-1", downloads, {"http": status})
    assert not request.out.exists() and not list(tmp_path.glob("*.part"))


def test_a_download_that_is_not_an_mp4_is_unfinished_on_the_same_request(tmp_path: Path, wire) -> None:
    """The ruling on a failed mp4 check: bytes that came whole and are not an mp4 are not xAI's verdict on
    the request (that is `respect_moderation`, read before the download), so the run is unfinished on its
    id — `video-resume` polls for a fresh URL — and never a refusal that leaves only a second purchase.
    The same URL would bring the same bytes, so it is not downloaded again."""
    server = _clip_wire(wire, NOT_A_CLIP)
    request = _request(tmp_path)
    with pytest.raises(video.GenerationUnfinished) as unfinished:
        video.generate_video(request, credential=video.Credential("t", video.AUTH_SOURCE_GROK_LOGIN),
                             call=_on_wire, sleep=lambda s: None)
    assert server.seen == SUBMITTED + [("GET", "/clips/1.mp4")]
    size = len(NOT_A_CLIP_BODY)
    assert str(unfinished.value) == (
        f"video: generation req-1 is done, but its download brought {size} bytes that are not an mp4 (no ftyp box); "
        "the clip is made and may be billed — ask for request_id=req-1 again with `sprite-gen video-resume "
        f"--request-id req-1 --out {request.out.resolve()}` instead of submitting a new request; nothing was written")
    report = unfinished.value.to_dict()
    assert (report["downloads"], report["last_download"]) == (
        1, {"http": None, "error": "not an mp4 (no ftyp box)", "bytes": size})
    assert not request.out.exists() and not list(tmp_path.glob("*.part"))


def test_a_clip_left_unfinished_by_its_download_is_published_by_video_resume(tmp_path: Path, wire, monkeypatch, capsys) -> None:
    """The run's report names the request; `video-resume` on that id polls without a POST, gets the clip's
    fresh URL and publishes it."""
    server = _clip_wire(wire, CLIP_CUT, CLIP_CUT, CLIP_CUT)
    server.answers += [_done_at(f"{server.root}/clips/2.mp4"), CLIP]
    _cli_on_wire(monkeypatch)
    out, report = tmp_path / "clip.mp4", tmp_path / "clip.report.json"
    with pytest.raises(video.GenerationUnfinished):
        video.run(image=_still(tmp_path), prompt="sway", out=out, report=report)
    left = json.loads(report.read_text(encoding="utf-8"))
    assert (left["kind"], left["request_id"], left["downloads"]) == ("sprite-gen-video-unfinished", "req-1", 3)
    capsys.readouterr()

    assert video.run_resume(request_id=left["request_id"], out=out, report=report) == 0
    assert server.seen == SUBMITTED + [("GET", "/clips/1.mp4")] * 3 + [("GET", "/v1/videos/req-1"), ("GET", "/clips/2.mp4")]
    resumed = json.loads(report.read_text(encoding="utf-8"))
    assert (resumed["kind"], resumed["mode"], resumed["request_id"]) == ("sprite-gen-video-report", "resume", "req-1")
    assert (resumed["polls"], resumed["downloads"]) == (1, 1)
    assert json.loads(capsys.readouterr().out)["report"] == str(report.resolve())
    assert out.read_bytes() == MP4 and not list(tmp_path.glob("*.part"))


# --- one time limit: the poll timeout bounds the polls and the downloads ------------------
# A caller that stops the run at a hard limit (an app's clip stage) sets the poll timeout under it, and must
# get the request_id back before that limit: a run it kills leaves no id, and the clip it may be billed for
# can then only be bought again. So the timeout counts from the request's send, every poll and download
# reads only what is left of it — one that stalls, or keeps coming too slowly for a read's timeout ever to
# fire, is cut when it comes — and a poll or download whose wait would reach it is not asked: the run is
# unfinished on the request_id then. A done poll that names nothing to download is unfinished on its id
# too. The slow cases run with a poll timeout of BUDGET seconds and end when it comes, on the test's clock.

BUDGET = 1.5  # a run's poll timeout
SLOW_CLIP = MP4 + b"\x00" * 240  # a clip whose bytes, a byte every 40 ms, come for about 13 s
SLOW_CLIP_HEAD = _answer("200 OK", b"", length=len(SLOW_CLIP), content_type="video/mp4")  # its head alone
PENDING_BODY = b'{"status": "pending"}'


def _cli_on_a_budget(monkeypatch) -> None:
    """The CLI on its own transports, its poll timeout BUDGET and its read timeout longer than that — the
    120 s read against what is left of a 210 s stage."""
    monkeypatch.setattr(video, "resolve_credential", lambda **_: video.Credential("t", video.AUTH_SOURCE_GROK_LOGIN))
    monkeypatch.setattr(video, "POLL_TIMEOUT_SECONDS", BUDGET)
    monkeypatch.setattr(video, "HTTP_TIMEOUT_SECONDS", BUDGET + 2.5)


@pytest.mark.parametrize("slow", ["stalled", "trickled"])
def test_a_download_slower_than_the_time_left_leaves_an_unfinished_report_by_the_poll_timeout(
        tmp_path: Path, wire, clock, monkeypatch, capsys, slow) -> None:
    """The counterexample: a download that stalls (its read timeout longer than what is left) or that keeps
    coming a byte at a time is cut when the poll timeout comes, and the run leaves its report naming the
    request then — not three downloads and two waits later, when its caller has killed it."""
    answer = (_Hold(SLOW_CLIP_HEAD + SLOW_CLIP[:10]) if slow == "stalled"
              else _Trickle(SLOW_CLIP_HEAD, SLOW_CLIP, 0.04))
    server = _clip_wire(wire, answer)
    _cli_on_a_budget(monkeypatch)
    out, report = tmp_path / "clip.mp4", tmp_path / "clip.report.json"
    with pytest.raises(video.GenerationUnfinished) as unfinished:
        video.run(image=_still(tmp_path), prompt="sway", out=out, report=report)
    # One download, cut at the deadline; another one's wait would run past it, so none is tried.
    assert server.seen == SUBMITTED + [("GET", "/clips/1.mp4")]
    assert clock.slept == [] and clock.now == BUDGET
    message = str(unfinished.value)
    assert message == ("video: generation req-1 is done, but its download got no answer (last: timed out) until the "
                       f"poll timeout ({BUDGET:g}s, 1 attempt); the clip is made and may be billed — ask for "
                       f"request_id=req-1 again with `sprite-gen video-resume --request-id req-1 --out {out.resolve()}` "
                       "instead of submitting a new request; nothing was written")
    assert HTTP_STATUS.search(message) is None
    assert json.loads(report.read_text(encoding="utf-8")) == {
        "kind": "sprite-gen-video-unfinished",
        "provider": "grok-imagine",
        "verb": "video",
        "auth_source": "grok-login",
        "model": video.DEFAULT_MODEL,
        "request_id": "req-1",
        "out": str(out.resolve()),
        "polls": 1,
        "polls_refused": 0,
        "polls_unanswered": 0,
        "last_poll": {"http": 200, "status": "done"},
        "downloads": 1,
        "last_download": {"http": None, "error": "timed out"},
        "elapsed_seconds": BUDGET,
    }
    assert capsys.readouterr().out == "" and not out.exists() and not list(tmp_path.glob("*.part"))


def test_a_download_whose_next_wait_would_reach_the_poll_timeout_is_not_tried_again(
        tmp_path: Path, wire, clock, capsys) -> None:
    """The downloads and their waits (8 s, then 16 s) run inside the poll timeout: a refused download whose
    next wait would reach it ends the run on the request_id there, not a wait and a download later."""
    server = _clip_wire(wire, CLIP_REFUSED)
    request = _request(tmp_path)
    with pytest.raises(video.GenerationUnfinished) as unfinished:
        video.generate_video(request, credential=video.Credential("t", video.AUTH_SOURCE_GROK_LOGIN),
                             call=_on_wire, sleep=clock.sleep, poll_timeout=20)
    assert server.seen == SUBMITTED + [("GET", "/clips/1.mp4")] * 2
    assert clock.slept == [8.0] and clock.now == 8.0
    assert str(unfinished.value) == (
        "video: generation req-1 is done, but its download was refused (last answer 503) until the poll timeout "
        "(20s, 2 attempts); the clip is made and may be billed — ask for request_id=req-1 again with `sprite-gen "
        f"video-resume --request-id req-1 --out {request.out.resolve()}` instead of submitting a new request; "
        "nothing was written")
    report = unfinished.value.to_dict()
    assert (report["downloads"], report["last_download"], report["elapsed_seconds"]) == (2, {"http": 503}, 8.0)
    assert "[video] download 1 of generation req-1 was refused (503); downloading again in 8s" in capsys.readouterr().err
    assert not request.out.exists() and not list(tmp_path.glob("*.part"))


def test_a_download_whose_wait_woke_past_the_poll_timeout_is_not_tried(tmp_path: Path, wire, clock) -> None:
    """The 8 s wait after a refused download, asked with 8.01 s left, wakes 20 ms late, past the poll timeout:
    no download is tried then, and the run ends on the refusal it had — not on a download the transport found
    no time left to send, counted as one that got no answer."""
    server = _clip_wire(wire, CLIP_REFUSED)
    request = _request(tmp_path)
    with pytest.raises(video.GenerationUnfinished) as unfinished:
        video.generate_video(request, credential=video.Credential("t", video.AUTH_SOURCE_GROK_LOGIN),
                             call=_on_wire, sleep=clock.waking_late(0.020), poll_timeout=8.010)
    assert server.seen == SUBMITTED + [("GET", "/clips/1.mp4")] and clock.slept == [8.0]
    assert str(unfinished.value) == (
        "video: generation req-1 is done, but its download was refused (last answer 503) until the poll timeout "
        "(8.01s, 1 attempt); the clip is made and may be billed — ask for request_id=req-1 again with `sprite-gen "
        f"video-resume --request-id req-1 --out {request.out.resolve()}` instead of submitting a new request; "
        "nothing was written")
    report = unfinished.value.to_dict()
    assert (report["downloads"], report["last_download"]) == (1, {"http": 503})
    assert not request.out.exists() and not list(tmp_path.glob("*.part"))


@pytest.mark.parametrize("slow", ["stalled", "trickled"])
def test_a_poll_slower_than_the_time_left_ends_unfinished_by_the_poll_timeout(tmp_path: Path, wire, clock, monkeypatch, slow) -> None:
    """A poll's own read is cut by the poll timeout too: one that stalls past it, or whose answer keeps coming
    too slowly, does not hold the run a read timeout past the limit its caller set."""
    head = _answer("200 OK", b"", length=len(PENDING_BODY))
    server = wire(ACCEPTED, PENDING_ON_WIRE, _Hold(head) if slow == "stalled" else _Trickle(head, PENDING_BODY, 0.3))
    monkeypatch.setattr(video, "POLL_INTERVAL_SECONDS", 0.1)
    request = _request(tmp_path)
    with pytest.raises(video.GenerationUnfinished) as unfinished:
        video.generate_video(request, credential=video.Credential("t", video.AUTH_SOURCE_GROK_LOGIN),
                             call=_on_wire, download=lambda url, token, **_: MP4, sleep=clock.sleep, poll_timeout=BUDGET)
    assert server.seen == [("POST", "/v1/videos/generations")] + [("GET", "/v1/videos/req-1")] * 2
    assert clock.slept == [0.1] and clock.now == BUDGET
    message = str(unfinished.value)
    assert message.startswith("video: generation req-1 was accepted, but its polls got no answer (last: timed out) "
                              f"until the poll timeout ({BUDGET:g}s, 2 polls); it may still finish and be billed — "
                              "ask for request_id=req-1 again with ")
    report = unfinished.value.to_dict()
    assert report["elapsed_seconds"] == BUDGET
    assert (report["polls"], report["polls_unanswered"], report["last_poll"]) == (
        2, 1, {"http": None, "status": None, "error": "timed out"})
    assert not request.out.exists()


def test_a_poll_whose_wait_woke_past_the_poll_timeout_is_not_sent(tmp_path: Path, wire, clock) -> None:
    """Each wait here wakes 40 ms late: the second, asked at 4.04 s for 4 s with 4.01 s of the 8.05 s poll
    timeout left, wakes at 8.08 s, past it. No poll goes then, and the run ends on the last one as it came —
    still pending after 2 polls — not on a third the transport found no time left to send, counted as a poll
    that got no answer."""
    server = wire(ACCEPTED, PENDING_ON_WIRE)
    request = _request(tmp_path)
    with pytest.raises(video.GenerationUnfinished) as unfinished:
        video.generate_video(request, credential=video.Credential("t", video.AUTH_SOURCE_GROK_LOGIN), call=_on_wire,
                             download=lambda url, token, **_: MP4, sleep=clock.waking_late(0.040), poll_timeout=8.05)
    assert server.seen == [("POST", "/v1/videos/generations")] + [("GET", "/v1/videos/req-1")] * 2
    assert clock.slept == [4.0, 4.0]
    assert str(unfinished.value).startswith("video: generation req-1 still 'pending' after 2 polls — poll timeout; ")
    report = unfinished.value.to_dict()
    assert (report["polls"], report["polls_unanswered"], report["last_poll"]) == (
        2, 0, {"http": 200, "status": "pending"})
    assert not request.out.exists()


def test_the_poll_timeout_counts_from_the_requests_send(tmp_path: Path, clock) -> None:
    """A caller's limit covers the POST: the polls get what the POST's answer left of the timeout."""
    api = _FakeApi(polls=[(200, {"status": "pending"})])

    def call(method, url, token, body, **kw):
        if method == "POST":
            clock.now += 12.0  # the upload and xAI's answer took 12 of the 20 seconds
        return api.call(method, url, token, body, **kw)

    with pytest.raises(video.GenerationUnfinished) as unfinished:
        video.generate_video(_request(tmp_path), credential=video.Credential("t", video.AUTH_SOURCE_GROK_LOGIN),
                             call=call, download=api.download, sleep=clock.sleep, poll_timeout=20)
    # Polls at 12 s and 16 s; a third at 20 s would have no time left to be answered.
    assert [sent[0] for sent in api.calls] == ["POST", "GET", "GET"] and clock.slept == [4.0]
    assert str(unfinished.value).startswith("video: generation req-1 still 'pending' after 2 polls — poll timeout; ")
    assert (unfinished.value.polls, unfinished.value.elapsed_seconds) == (2, 16.0)


def test_a_request_accepted_after_the_whole_poll_timeout_is_unfinished_before_any_poll(tmp_path: Path, clock) -> None:
    """The POST is not cut by the poll timeout — its answer is the one way to the id — and one that comes after
    the whole of it ends the run there, naming the request, without a poll that would run past the limit."""
    api = _FakeApi()

    def call(method, url, token, body, **kw):
        if method == "POST":
            clock.now += 25.0
        return api.call(method, url, token, body, **kw)

    request = _request(tmp_path)
    with pytest.raises(video.GenerationUnfinished) as unfinished:
        video.generate_video(request, credential=video.Credential("t", video.AUTH_SOURCE_GROK_LOGIN),
                             call=call, download=api.download, sleep=clock.sleep, poll_timeout=20)
    assert [sent[0] for sent in api.calls] == ["POST"] and clock.slept == [] and api.downloads == []
    message = str(unfinished.value)
    assert message == ("video: generation req-1 was accepted after the poll timeout (20s) had run out, before any poll; "
                       "it may still finish and be billed — ask for request_id=req-1 again with `sprite-gen video-resume "
                       f"--request-id req-1 --out {request.out.resolve()}` instead of submitting a new request; "
                       "nothing was written")
    assert HTTP_STATUS.search(message) is None
    report = unfinished.value.to_dict()
    assert (report["request_id"], report["polls"], report["last_poll"], report["elapsed_seconds"]) == (
        "req-1", 0, {"http": None, "status": None}, 25.0)
    assert not request.out.exists()


def _done_naming(named) -> bytes:
    """A done poll on the wire whose `video` is `named`."""
    return _answer("200 OK", json.dumps({"status": "done", "video": named, "model": video.DEFAULT_MODEL}).encode("utf-8"))


# The branches: `video` not an object, its url not a str, a str with no scheme.
@pytest.mark.parametrize("named", [
    {"duration": 6.0},
    {"url": "vidgen.x.ai/v/1.mp4"},
    "a clip",
], ids=["no-url", "no-scheme", "not-an-object"])
def test_a_done_poll_that_names_no_url_leaves_an_unfinished_report_naming_the_request(
        tmp_path: Path, wire, monkeypatch, capsys, named) -> None:
    """The second counterexample: xAI says done — the clip is made and may be billed — and names nothing the
    run can download. The run ends unfinished on the request_id, its report left for the caller, never as a
    refusal or a crash that leaves no id; `video-resume` polls it afresh."""
    server = wire(ACCEPTED, _done_naming(named))
    _cli_on_wire(monkeypatch)
    out, report = tmp_path / "clip.mp4", tmp_path / "clip.report.json"
    with pytest.raises(video.GenerationUnfinished) as unfinished:
        video.run(image=_still(tmp_path), prompt="sway", out=out, report=report)
    assert server.seen == SUBMITTED
    message = str(unfinished.value)
    assert message == ("video: generation req-1 is done, but its poll named no video url to download; the clip is made "
                       "and may be billed — ask for request_id=req-1 again with `sprite-gen video-resume --request-id "
                       f"req-1 --out {out.resolve()}` instead of submitting a new request; nothing was written")
    assert HTTP_STATUS.search(message) is None
    assert json.loads(report.read_text(encoding="utf-8")) == {
        "kind": "sprite-gen-video-unfinished",
        "provider": "grok-imagine",
        "verb": "video",
        "auth_source": "grok-login",
        "model": video.DEFAULT_MODEL,
        "request_id": "req-1",
        "out": str(out.resolve()),
        "polls": 1,
        "polls_refused": 0,
        "polls_unanswered": 0,
        "last_poll": {"http": 200, "status": "done"},
        "elapsed_seconds": 0.0,
    }
    assert capsys.readouterr().out == "" and not out.exists() and not list(tmp_path.glob("*.part"))
