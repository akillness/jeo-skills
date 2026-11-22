# SPDX-License-Identifier: Apache-2.0
"""Grok video modes wired into `sprite-gen video` / `video-extend` / `video-edit`:
request bodies per mode, the unchanged image-to-video body, local pre-checks that
run before any call, and the report's `mode` / `inputs`. No network — HTTP is a fake."""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest
from PIL import Image

from sprite_gen.gen import video

MP4 = b"\x00\x00\x00\x18ftypisom" + b"\x00" * 64
CRED = video.Credential(token="tok", source=video.AUTH_SOURCE_GROK_LOGIN)


def _still(tmp_path: Path, name: str = "still.png", size=(8, 8)) -> Path:
    path = tmp_path / name
    Image.new("RGBA", size, (255, 120, 0, 255)).save(path)
    return path


def _clip(tmp_path: Path, name: str = "in.mp4", payload: bytes = MP4) -> Path:
    path = tmp_path / name
    path.write_bytes(payload)
    return path


class _FakeApi:
    def __init__(self, post=(200, {"request_id": "req-1"}), done=None):
        self.post = post
        self.done = done or {"status": "done", "video": {"url": "https://vidgen.x.ai/v/1.mp4", "duration": 5.04}, "model": "grok-imagine-video-1.5"}
        self.calls: list[tuple[str, str, str, dict | None]] = []

    def call(self, method, url, token, body, *, deadline=None):
        self.calls.append((method, url, token, body))
        return self.post if method == "POST" else (200, self.done)

    def download(self, url, token, *, deadline=None):
        return MP4

    def kw(self):
        return dict(credential=CRED, call=self.call, download=self.download, sleep=lambda s: None)

    @property
    def body(self) -> dict:
        return self.calls[0][3]

    @property
    def endpoint(self) -> str:
        return self.calls[0][1]


def _gen(tmp_path: Path, **overrides) -> video.VideoRequest:
    kwargs = dict(image=None, prompt="she charges at the oni", out=tmp_path / "clip.mp4")
    kwargs.update(overrides)
    return video.VideoRequest(**kwargs)


# --- the image-to-video body is what it was -------------------------------------


def test_image_only_body_is_the_pre_modes_snapshot(tmp_path: Path) -> None:
    still = _still(tmp_path)
    api = _FakeApi()
    result = video.generate_video(_gen(tmp_path, image=still, duration=6, resolution="720p"), **api.kw())
    assert api.endpoint == "https://api.x.ai/v1/videos/generations"
    assert list(api.body) == ["model", "prompt", "duration", "resolution", "image"]
    assert api.body == {
        "model": "grok-imagine-video-1.5",
        "prompt": "she charges at the oni",
        "duration": 6,
        "resolution": "720p",
        "image": {"url": video._data_url(still)},
    }
    assert result.mode == "image-to-video"
    payload = result.to_dict()
    assert payload["mode"] == "image-to-video" and payload["inputs"] == {"image": str(still.resolve())}
    assert payload["image"] == str(still.resolve())  # the pre-modes field stays
    assert "input_duration" not in payload


def test_image_only_body_with_aspect_and_audio_keeps_its_key_order(tmp_path: Path) -> None:
    api = _FakeApi()
    video.generate_video(_gen(tmp_path, image=_still(tmp_path), aspect_ratio="1:1", generate_audio=False), **api.kw())
    assert list(api.body) == ["model", "prompt", "duration", "resolution", "image", "aspect_ratio", "generate_audio"]
    assert "last_frame" not in api.body and "reference_images" not in api.body


def test_report_keeps_every_pre_modes_field(tmp_path: Path) -> None:
    api = _FakeApi()
    payload = video.generate_video(_gen(tmp_path, image=_still(tmp_path)), **api.kw()).to_dict()
    assert set(payload) >= {
        "kind", "provider", "auth_source", "model", "request_id", "image", "prompt", "out", "bytes", "host",
        "duration_requested", "duration_reported", "resolution", "aspect_ratio", "generate_audio", "elapsed_seconds", "polls",
    }


# --- first/last frame and reference bodies --------------------------------------


def test_first_and_last_frame_posts_image_and_last_frame(tmp_path: Path) -> None:
    first, last = _still(tmp_path, "first.png"), _still(tmp_path, "last.png")
    api = _FakeApi()
    result = video.generate_video(_gen(tmp_path, image=first, last_frame=last, resolution="480p", duration=5, aspect_ratio="16:9"), **api.kw())
    assert api.endpoint.endswith("/videos/generations") and api.body["model"] == "grok-imagine-video-1.5"
    assert api.body["image"] == {"url": video._data_url(first)}
    assert api.body["last_frame"] == {"url": video._data_url(last)}
    assert "reference_images" not in api.body
    assert result.mode == "first-last"
    assert result.to_dict()["inputs"] == {"image": str(first.resolve()), "last_frame": str(last.resolve())}


def test_last_frame_alone_posts_no_image(tmp_path: Path) -> None:
    last = _still(tmp_path, "last.png")
    api = _FakeApi()
    result = video.generate_video(_gen(tmp_path, last_frame=last), **api.kw())
    assert "image" not in api.body and api.body["last_frame"] == {"url": video._data_url(last)}
    assert result.mode == "last-frame"
    payload = result.to_dict()
    assert payload["image"] is None and payload["inputs"] == {"last_frame": str(last.resolve())}


def test_reference_to_video_posts_reference_images_in_order(tmp_path: Path) -> None:
    refs = [_still(tmp_path, f"ref{i}.png") for i in range(3)]
    api = _FakeApi()
    result = video.generate_video(
        _gen(tmp_path, prompt="<IMAGE_0> fights <IMAGE_1> in <IMAGE_2>", reference_images=refs, resolution="480p"), **api.kw()
    )
    assert api.body["reference_images"] == [{"url": video._data_url(r)} for r in refs]
    assert "image" not in api.body and "last_frame" not in api.body
    assert result.mode == "reference"
    payload = result.to_dict()
    assert payload["inputs"] == {"reference_images": [str(r.resolve()) for r in refs]}
    assert "data:" not in json.dumps(payload) and "vidgen.x.ai/v/1.mp4" not in json.dumps(payload)


def test_reference_with_image_keeps_both(tmp_path: Path) -> None:
    api = _FakeApi()
    result = video.generate_video(_gen(tmp_path, image=_still(tmp_path, "a.png"), reference_images=[_still(tmp_path, "r.png")], prompt="<IMAGE_0>"), **api.kw())
    assert "image" in api.body and len(api.body["reference_images"]) == 1
    assert result.mode == "reference"


# --- local pre-checks run before any call ---------------------------------------


@pytest.mark.parametrize(
    ("build", "expected"),
    [
        (lambda t: _gen(t), "pass --image, --last-frame and/or --reference"),
        (lambda t: _gen(t, last_frame=t / "missing.png"), "--last-frame still image not found"),
        (lambda t: _gen(t, reference_images=[t / "missing.png"], prompt="<IMAGE_0>"), "--reference still image not found"),
        (lambda t: _gen(t, reference_images=[_still(t, f"r{i}.png") for i in range(8)]), "at most 7 --reference"),
        (lambda t: _gen(t, reference_images=[_still(t)], resolution="1080p"), "capped at 720p"),
        (lambda t: _gen(t, reference_images=[_still(t), _still(t, "b.png")], prompt="<IMAGE_0> and <IMAGE_2>"), "<IMAGE_2> but only 2 --reference"),
        (lambda t: _gen(t, image=_still(t), prompt="<IMAGE_0> walks"), "<IMAGE_0> but no --reference"),
        (lambda t: _gen(t, image=_still(t), last_frame=_still(t, "l.png"), model=video.CLASSIC_MODEL), "classic grok-imagine-video rejects last_frame"),
        (lambda t: _gen(t, image=_still(t), reference_images=[_still(t, "r.png")], model=video.CLASSIC_MODEL), "rejects --image combined with --reference"),
    ],
)
def test_mode_precheck_rejects_before_any_call(tmp_path: Path, build, expected) -> None:
    api = _FakeApi()
    with pytest.raises(SystemExit, match=expected):
        video.generate_video(build(tmp_path), **api.kw())
    assert api.calls == []


def test_seven_references_and_tag_zero_to_six_are_accepted(tmp_path: Path) -> None:
    refs = [_still(tmp_path, f"r{i}.png") for i in range(7)]
    api = _FakeApi()
    video.generate_video(_gen(tmp_path, reference_images=refs, prompt=" ".join(f"<IMAGE_{i}>" for i in range(7))), **api.kw())
    assert len(api.body["reference_images"]) == 7


# --- video-extend ----------------------------------------------------------------


def _ext(tmp_path: Path, **overrides) -> video.ExtendRequest:
    kwargs = dict(video=_clip(tmp_path), prompt="she presses the attack", out=tmp_path / "longer.mp4")
    kwargs.update(overrides)
    return video.ExtendRequest(**kwargs)


def _probe(input_seconds: float, output_seconds: float):
    """ffprobe stand-in: the input clip vs the staged `.part` download."""
    return lambda clip: output_seconds if clip.name.endswith(".part") else input_seconds


def test_extend_posts_classic_model_to_extensions_and_inherits_the_rest(tmp_path: Path) -> None:
    # Live 2026-09-13: the poll's video.duration is the seconds ADDED (5), the bytes are 20.04 s.
    api = _FakeApi(done={"status": "done", "video": {"url": "https://vidgen.x.ai/v/2.mp4", "duration": 5}, "model": "grok-imagine-video"})
    result = video.extend_video(_ext(tmp_path, duration=5), probe=_probe(15.04, 20.04), **api.kw())
    assert api.endpoint == "https://api.x.ai/v1/videos/extensions"
    assert list(api.body) == ["model", "prompt", "duration", "video"]
    assert api.body["model"] == "grok-imagine-video" and api.body["duration"] == 5
    assert api.body["video"]["url"].startswith("data:video/mp4;base64,")
    assert "resolution" not in api.body and "aspect_ratio" not in api.body
    payload = result.to_dict()
    assert payload["mode"] == "extend" and payload["inputs"] == {"video": str((tmp_path / "in.mp4").resolve())}
    assert payload["input_duration"] == 15.04 and payload["output_duration"] == 20.04
    assert payload["duration_reported"] == 5 and payload["duration_requested"] == 5
    assert result.out.read_bytes() == MP4


def test_extend_refuses_a_result_shorter_than_the_input_measured_from_bytes(tmp_path: Path) -> None:
    # The poll claims 17 s; the downloaded bytes are 5 s. Bytes win, nothing is published.
    api = _FakeApi(done={"status": "done", "video": {"url": "https://vidgen.x.ai/v/2.mp4", "duration": 17.0}, "model": "grok-imagine-video"})
    request = _ext(tmp_path)
    with pytest.raises(SystemExit, match="returned clip is 5.00s for a 12.00s input — not an extension"):
        video.extend_video(request, probe=_probe(12.0, 5.0), **api.kw())
    assert not request.out.exists() and not list(tmp_path.glob("*.part"))


@pytest.mark.parametrize(
    ("build", "seconds", "expected"),
    [
        (lambda t: _ext(t, prompt="  "), 5.0, "empty prompt"),
        (lambda t: _ext(t, model=video.DEFAULT_MODEL), 5.0, "only the classic grok-imagine-video supports extension"),
        (lambda t: _ext(t, duration=1), 5.0, "2..10 seconds"),
        (lambda t: _ext(t, duration=11), 5.0, "2..10 seconds"),
        (lambda t: _ext(t, video=_clip(t, "in.mov")), 5.0, "must be an .mp4"),
        (lambda t: _ext(t, video=t / "nope.mp4"), 5.0, "input clip not found"),
        (lambda t: _ext(t, video=_clip(t, "bad.mp4", b"<html>")), 5.0, "not an mp4"),
        (lambda t: _ext(t), 1.5, "extends clips of 2..15s"),
        (lambda t: _ext(t), 15.11, "extends clips of 2..15s"),
    ],
)
def test_extend_precheck_rejects_before_any_call(tmp_path: Path, build, seconds, expected) -> None:
    api = _FakeApi()
    with pytest.raises(SystemExit, match=expected):
        video.extend_video(build(tmp_path), probe=lambda clip: seconds, **api.kw())
    assert api.calls == []


# --- video-edit ------------------------------------------------------------------


def _edit(tmp_path: Path, **overrides) -> video.EditRequest:
    kwargs = dict(video=_clip(tmp_path), prompt="change her hakama to solid black", out=tmp_path / "edited.mp4")
    kwargs.update(overrides)
    return video.EditRequest(**kwargs)


def test_edit_posts_classic_model_to_edits_without_duration(tmp_path: Path) -> None:
    api = _FakeApi(done={"status": "done", "video": {"url": "https://vidgen.x.ai/v/3.mp4", "duration": 7.71}, "model": "grok-imagine-video"})
    result = video.edit_video(_edit(tmp_path), probe=_probe(8.0, 7.71), **api.kw())
    assert api.endpoint == "https://api.x.ai/v1/videos/edits"
    assert list(api.body) == ["model", "prompt", "video"]
    assert api.body["model"] == "grok-imagine-video"
    payload = result.to_dict()
    assert payload["mode"] == "edit" and payload["input_duration"] == 8.0 and payload["output_duration"] == 7.71
    assert payload["inputs"] == {"video": str((tmp_path / "in.mp4").resolve())}


@pytest.mark.parametrize(
    ("build", "seconds", "expected"),
    [
        (lambda t: _edit(t), 8.71, "at most 8.7s"),
        (lambda t: _edit(t, video=_clip(t, "in.webm")), 5.0, "must be an .mp4"),
        (lambda t: _edit(t, model=video.DEFAULT_MODEL), 5.0, "only the classic grok-imagine-video supports editing"),
        (lambda t: _edit(t, prompt=""), 5.0, "empty prompt"),
    ],
)
def test_edit_precheck_rejects_before_any_call(tmp_path: Path, build, seconds, expected) -> None:
    api = _FakeApi()
    with pytest.raises(SystemExit, match=expected):
        video.edit_video(build(tmp_path), probe=lambda clip: seconds, **api.kw())
    assert api.calls == []


@pytest.mark.parametrize("spelling", ["same", "capitals"])
@pytest.mark.parametrize("verb", ["extend", "edit"])
def test_the_result_is_never_published_over_the_clip_it_is_made_from(tmp_path: Path, verb: str, spelling: str) -> None:
    """`--out` naming the input clip — as given, or spelt in capitals on a volume that ignores case — is refused before
    any call: the result is published over `--out`, which would replace the clip."""
    given = MP4 + b"the input clip"
    api = _FakeApi(done={"status": "done", "video": {"url": "https://vidgen.x.ai/v/4.mp4", "duration": 5}, "model": "grok-imagine-video"})
    clip = tmp_path / "take.mp4"
    out = clip if spelling == "same" else tmp_path / "TAKE.MP4"
    request = _ext(tmp_path, video=clip, out=out) if verb == "extend" else _edit(tmp_path, video=clip, out=out)
    _clip(tmp_path, "take.mp4", given)  # after the request: `_ext`/`_edit` write their own default clip, `in.mp4`
    if not out.exists():
        pytest.skip("대소문자를 가리는 볼륨 — 철자가 다르면 다른 파일이다")
    make = video.extend_video if verb == "extend" else video.edit_video
    try:
        make(request, probe=_probe(5.0, 10.0), **api.kw())
        said = "published"
    except SystemExit as refusal:
        said = str(refusal)
    assert clip.read_bytes() == given, f"video-{verb} 이 입력 클립 위에 결과를 내놓았다 ({said}, calls {len(api.calls)})"
    assert re.search(rf"video-{verb}: --video and --out are the same file", said), said
    assert api.calls == []


@pytest.mark.parametrize("verb", ["extend", "edit"])
def test_the_download_is_never_staged_through_a_link_to_the_clip(tmp_path: Path, verb: str) -> None:
    """The result is downloaded to `<out>.part` before it is published over `--out`: a `<out>.part` already there as a
    link to the input clip is refused before any call — the download would be written through it, over the clip."""
    given = MP4 + b"the input clip"
    api = _FakeApi(done={"status": "done", "video": {"url": "https://vidgen.x.ai/v/5.mp4", "duration": 5}, "model": "grok-imagine-video"})
    clip, out = tmp_path / "take.mp4", tmp_path / "result.mp4"
    request = _ext(tmp_path, video=clip, out=out) if verb == "extend" else _edit(tmp_path, video=clip, out=out)
    _clip(tmp_path, "take.mp4", given)
    (tmp_path / "result.mp4.part").symlink_to(clip)
    make = video.extend_video if verb == "extend" else video.edit_video
    try:
        make(request, probe=_probe(5.0, 10.0), **api.kw())
        said = "published"
    except SystemExit as refusal:
        said = str(refusal)
    assert clip.read_bytes() == given, f"video-{verb} 이 <out>.part 링크를 지나 입력 클립 위에 내려받았다 ({said}, calls {len(api.calls)})"
    assert re.search(rf"video-{verb}: --video and result\.mp4\.part beside --out are the same file", said), said
    assert api.calls == []


@pytest.mark.parametrize("verb", ["extend", "edit"])
def test_the_report_is_never_written_over_the_clip_it_is_made_from(tmp_path: Path, monkeypatch, verb: str) -> None:
    """`--report` naming the input clip is refused before any call: the report is written once the result is made, and
    would replace the clip."""
    given = MP4 + b"the input clip"
    api = _FakeApi(done={"status": "done", "video": {"url": "https://vidgen.x.ai/v/6.mp4", "duration": 5}, "model": "grok-imagine-video"})
    monkeypatch.setattr(video, "resolve_credential", lambda **_: CRED)
    monkeypatch.setattr(video, "http_json", api.call)
    monkeypatch.setattr(video, "http_download", api.download)
    monkeypatch.setattr(video.time, "sleep", lambda s: None)
    monkeypatch.setattr(video, "probe_duration_seconds", lambda clip, *, verb: 11.0 if clip.name.endswith(".part") else 6.0)
    clip = _clip(tmp_path, "take.mp4", given)
    run = video.run_extend if verb == "extend" else video.run_edit
    try:
        run(video=clip, prompt="go on", prompt_file=None, out=tmp_path / "result.mp4", report=clip,
            **({"duration": 5} if verb == "extend" else {}))
        said = "written"
    except SystemExit as refusal:
        said = str(refusal)
    assert clip.read_bytes() == given, f"video-{verb} 이 입력 클립 위에 보고서를 썼다 ({said}, calls {len(api.calls)})"
    assert re.search(rf"video-{verb}: --video and --report are the same file", said), said
    assert api.calls == []


def test_edit_accepts_exactly_the_limit(tmp_path: Path) -> None:
    api = _FakeApi()
    video.edit_video(_edit(tmp_path), probe=lambda clip: 8.7, **api.kw())
    assert len(api.calls) >= 1


# --- ffprobe ---------------------------------------------------------------------


def test_missing_ffprobe_is_loud(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(video.shutil, "which", lambda name: None)
    with pytest.raises(SystemExit, match="ffprobe is required"):
        video.probe_duration_seconds(_clip(tmp_path), verb="video-edit")


def test_probe_reads_ffprobe_output(tmp_path: Path, monkeypatch) -> None:
    class Proc:
        returncode, stdout, stderr = 0, "8.004000\n", ""

    monkeypatch.setattr(video.shutil, "which", lambda name: "/usr/bin/ffprobe")
    monkeypatch.setattr(video.subprocess, "run", lambda *a, **k: Proc())
    assert video.probe_duration_seconds(_clip(tmp_path), verb="video-edit") == pytest.approx(8.004)


# --- CLI parsers and the unified CLI ---------------------------------------------


def test_video_parser_takes_last_frame_and_repeated_references() -> None:
    parser = video._build_parser()
    args = parser.parse_args(["--last-frame", "b.png", "--prompt", "p", "--out", "o.mp4"])
    assert args.image is None and args.last_frame == Path("b.png") and args.reference_images is None
    args = parser.parse_args(["--reference", "x.png", "--reference", "y.png", "--image", "a.png", "--prompt", "<IMAGE_0>", "--out", "o.mp4"])
    assert args.reference_images == [Path("x.png"), Path("y.png")] and args.image == Path("a.png")


def test_extend_and_edit_parsers_have_no_resolution_aspect_or_model_flags() -> None:
    extend = video._build_extend_parser()
    args = extend.parse_args(["--video", "in.mp4", "--prompt", "p", "--out", "o.mp4"])
    assert args.duration == video.EXTEND_DURATION_DEFAULT == 6
    for bad in (["--resolution", "480p"], ["--aspect-ratio", "16:9"], ["--model", "grok-imagine-video-1.5"]):
        with pytest.raises(SystemExit):
            extend.parse_args(["--video", "in.mp4", "--prompt", "p", "--out", "o.mp4", *bad])
    edit = video._build_edit_parser()
    edit.parse_args(["--video", "in.mp4", "--prompt", "p", "--out", "o.mp4"])
    for bad in (["--duration", "5"], ["--resolution", "480p"], ["--aspect-ratio", "16:9"], ["--model", "x"]):
        with pytest.raises(SystemExit):
            edit.parse_args(["--video", "in.mp4", "--prompt", "p", "--out", "o.mp4", *bad])


def test_unified_cli_exposes_extend_and_edit_under_gen() -> None:
    from sprite_gen import cli

    assert {"video-extend", "video-edit"} <= set(cli.COMMANDS)
    assert {"video", "video-extend", "video-edit"} <= set(cli.command_domains()["gen"])
    assert not ({"video-extend", "video-edit"} & set(cli.command_domains().get("video", [])))
    parser = cli._build_parser()
    assert parser.parse_args(["video-extend", "--video", "in.mp4", "--prompt", "p", "--out", "o.mp4", "--duration", "5"]).command == "video-extend"
    assert parser.parse_args(["video-edit", "--video", "in.mp4", "--prompt", "p", "--out", "o.mp4"]).command == "video-edit"
    assert parser.parse_args(["video", "--last-frame", "b.png", "--prompt", "p", "--out", "o.mp4"]).command == "video"


def test_pipeline_verbs_are_untouched_by_the_new_modes() -> None:
    from sprite_gen import _modules

    pipeline_b = next(p for p in _modules.PIPELINES if p["key"] == "B")
    assert "video-extend" not in pipeline_b["verbs"] and "video-edit" not in pipeline_b["verbs"]


def test_run_extend_kwargs_writes_report(tmp_path: Path, monkeypatch) -> None:
    api = _FakeApi(done={"status": "done", "video": {"url": "https://vidgen.x.ai/v/2.mp4", "duration": 11.0}, "model": "grok-imagine-video"})
    monkeypatch.setattr(video, "resolve_credential", lambda **_: CRED)
    monkeypatch.setattr(video, "http_json", api.call)
    monkeypatch.setattr(video, "http_download", api.download)
    monkeypatch.setattr(video.time, "sleep", lambda s: None)
    monkeypatch.setattr(video, "probe_duration_seconds", lambda clip, *, verb: 11.0 if clip.name.endswith(".part") else 6.0)
    out, report = tmp_path / "longer.mp4", tmp_path / "longer.report.json"
    rc = video.run_extend(video=_clip(tmp_path), prompt="go on", prompt_file=None, out=out, duration=5, report=report)
    assert rc == 0 and out.read_bytes() == MP4
    payload = json.loads(report.read_text(encoding="utf-8"))
    assert payload["mode"] == "extend" and payload["model"] == "grok-imagine-video"
    assert payload["input_duration"] == 6.0 and payload["output_duration"] == 11.0
    with pytest.raises(TypeError, match="unexpected keyword"):
        video.run_edit(video=_clip(tmp_path), prompt="p", prompt_file=None, out=out, report=None, duration=5)
