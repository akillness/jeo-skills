# SPDX-License-Identifier: Apache-2.0
"""Black-backed emissions keep their energy, isolated sparks and empty endpoints."""
from PIL import Image
import pytest

from sprite_gen._deps import np
from sprite_gen.video import frames, batch, clip_prompt
from sprite_gen.video import loop, canvas
from sprite_gen.util.gif_utils import save_clean_gif


def test_brightness_alpha_reconstructs_dark_and_saturated_emission(tmp_path):
    src = tmp_path / "raw.png"
    rgb = np.zeros((16, 16, 3), dtype=np.uint8)
    rgb[0, 0] = (255, 0, 0)  # an intentional isolated edge spark
    rgb[7, 7] = (3, 3, 3)  # dark smoke cannot be discarded by a threshold
    rgb[8, 8] = (65, 25, 5)  # soft glow: no double multiplication by alpha
    Image.fromarray(rgb).save(src)
    report = frames.key_frames([src], tmp_path / "keyed", alpha_mode="brightness")
    rgba = np.array(Image.open(tmp_path / "keyed" / src.name)).astype(float)
    emitted = rgba[:, :, :3] * rgba[:, :, 3:] / 255
    assert np.max(abs(emitted - rgb)) <= .5
    assert rgba[7, 7, 3] == 3 and rgba[0, 0, 3] == 255
    assert not rgba[1, 1].any()
    # An additive preview on a bright surface must never acquire a dark halo.
    for background in (0, 220, 255):
        composed = np.minimum(background + emitted, 255)
        assert np.min(composed) >= background
    assert report["blend"] == "add" and report["edge_policy"] == "off"
    assert report["specks"]["dropped"] == 0


def test_brightness_run_skips_chroma_cleanup(tmp_path, monkeypatch):
    src = tmp_path / "f0001.png"
    Image.new("RGB", (8, 8), (0, 0, 0)).save(src)
    clip = tmp_path / "clip.mp4"
    clip.write_bytes(b"synthetic")
    monkeypatch.setattr(frames, "probe", lambda _: {"stream_index": 0, "fps": 24})
    monkeypatch.setattr(frames, "extract", lambda *a: [src])
    def forbidden(*a, **k):
        pytest.fail("brightness alpha must not call chroma cleanup")
    for name in ("cutout", "drop_specks", "decide_spill", "edge_contact"):
        monkeypatch.setattr(frames, name, forbidden)
    report = frames.run_frames(clip, tmp_path / "out", key="auto", allow_edge_contact=False,
                              report_path=None, alpha_mode="brightness")
    assert report["alpha_zero_pct_min"] == 100
    assert report["alpha_mode"] == "brightness" and report["blend"] == "add"


def test_brightness_black_floor_removes_noise_without_dimming_light(tmp_path):
    src = tmp_path / "raw.png"
    rgb = np.zeros((8, 8, 3), dtype=np.uint8)
    rgb[0, :4] = [(1, 1, 1), (0, 2, 1), (3, 3, 3), (70, 20, 4)]
    Image.fromarray(rgb).save(src)
    report = frames.key_frames([src], tmp_path / "keyed", alpha_mode="brightness")
    rgba = np.array(Image.open(tmp_path / "keyed" / src.name)).astype(float)
    assert not rgba[0, :2].any()
    assert rgba[0, 2, 3] == 3
    emitted = rgba[0, 2:4, :3] * rgba[0, 2:4, 3:] / 255
    assert np.max(abs(emitted - rgb[0, 2:4])) <= .5
    assert report["brightness_noise_floor"] == 2


def test_effect_prompt_uses_black_end_and_lifetime_only():
    prompt = batch.build_prompt("front", "effect", "A burst of fire")
    assert "black" in prompt and "disappear" in prompt
    assert "no effects" not in prompt and "chroma" not in prompt
    assert "no effects" in batch.build_prompt("front", "attack", None)
    assert batch.pins_last_frame("effect", "front")
    plan = clip_prompt.plan_prompt(direction="front", state="effect")
    assert plan["last_frame"] == "black" and plan["cycle"] == "lifetime"
    assert "--alpha-mode brightness" in plan["commands"]["frames"]
    with pytest.raises(SystemExit, match="end.frame"):
        clip_prompt.plan_prompt(direction="front", state="effect", last_frame=False, unpinned=True)


def test_effect_canvas_keeps_origin_and_pins_a_blank_end(tmp_path):
    src = tmp_path / "still.png"
    im = Image.new("RGBA", (32, 48))
    im.putpixel((16, 24), (255, 64, 0, 128))
    im.save(src)
    report = canvas.run_canvas(src, tmp_path / "canvas.png", state="effect", shape=None,
                               facing="right", headroom=None, lead=None, report_path=None)
    assert report["offset"] == [0, 0] and report["canvas"] == [32, 48]
    assert Image.open(tmp_path / "canvas.png").getpixel((16, 24)) == (128, 32, 0)
    assert Image.open(report["end_frame"]).getextrema() == ((0, 0), (0, 0), (0, 0))


def lifetime_frames(tmp_path, *, fade=True):
    directory = tmp_path / "keyed"
    directory.mkdir()
    for k in range(90):
        im = Image.new("RGBA", (40, 40))
        if 3 <= k <= 86:
            im.paste((255, 128, 0, min(255, (k - 2) * 7, (87 - k) * 7)), (17, 17, 23, 23))
            im.putpixel((0, 0), (255, 255, 255, 3))
        elif not fade and k > 86:
            im.putpixel((0, 0), (255, 255, 255, 1))
        im.save(directory / f"frame-{k:03d}.png")
    return directory


def cut(directory, output, **kwargs):
    return loop.run_loop(directory, output, fps=24, state="effect", min_len=None, max_len=None,
                         n_out=10, seam_max=0, name="effect", report_path=None, **kwargs)


def test_lifetime_cut_keeps_dim_edge_spark_and_terminal_sample(tmp_path):
    report = cut(lifetime_frames(tmp_path), tmp_path / "out")
    assert report["cycle"]["kind"] == "lifetime"
    assert report["cycle"]["start"] == 2 and report["cycle"]["end_frame"] == 87
    assert report["specks_dropped"] == 0
    meta = report["strip"]
    assert meta["loop"] is False and meta["hold_last"] is False and meta["blend"] == "add"
    assert meta["end_frame"] == meta["frames"] - 1
    assert meta["source_cut"]["samples"][-1] == 87
    assert isinstance(meta["events"][0]["frame"], int)
    left, top, _, _ = meta["source_rect"]
    assert meta["anchor"] == [(20 - left) * meta["scale"], (20 - top) * meta["scale"]]
    strip = Image.open(meta["path"]).convert("RGBA")
    assert strip.getpixel((meta["w"] - left, -top))[3] == 3
    assert strip.crop((meta["end_frame"] * meta["w"], 0, strip.width, strip.height)).getchannel("A").getbbox() is None
    with Image.open(tmp_path / "out" / "effect.webp") as preview:
        assert preview.info["loop"] == 1
        preview.seek(preview.n_frames - 1)
        assert preview.convert("RGBA").getchannel("A").getbbox() is None


def test_lifetime_preview_composites_over_white_without_an_unreported_matte(tmp_path):
    report = cut(lifetime_frames(tmp_path), tmp_path / "out")
    meta = report["strip"]
    strip = Image.open(meta["path"]).convert("RGBA")
    cells = []
    for k in report["playback_indices"]:
        cell = strip.crop((k * meta["w"], 0, (k + 1) * meta["w"], meta["h"]))
        if not cells or cell.tobytes() != cells[-1].tobytes():
            cells.append(cell)
    white = Image.new("RGBA", cells[0].size, "white")
    black = Image.new("RGBA", cells[0].size, "black")
    # One cut, both previews: the GIF and the WebP are written from the same cells.
    for extension in ("gif", "webp"):
        background = report[extension].get("background")
        with Image.open(tmp_path / "out" / f"effect.{extension}") as preview:
            assert preview.n_frames == len(cells), extension
            opacity = []
            for k, cell in enumerate(cells):
                preview.seek(k)
                decoded = preview.convert("RGBA")
                expected = Image.alpha_composite(black if background == "#000000" else white, cell)
                actual = Image.alpha_composite(white, decoded)
                # Ordinary alpha compositing catches black matte pixels on white;
                # additive compositing on white would make this comparison vacuous.
                delta = np.array(expected, dtype=int) - np.array(actual, dtype=int)
                assert np.abs(delta).max() <= 2, f"{extension} frame {k} has an unreported matte"
                opacity.append(decoded.getchannel("A").getextrema())
            if extension == "gif":
                assert all(extrema == (255, 255) for extrema in opacity)
                assert background == "#000000"
                assert report[extension]["opaque"] is True
                assert decoded.getextrema() == ((0, 0), (0, 0), (0, 0), (255, 255))
            else:
                assert background is None
                assert decoded.getchannel("A").getbbox() is None


def test_animation_background_is_explicit_and_requires_full_opacity(tmp_path):
    path = tmp_path / "preview.gif"
    image = Image.new("RGBA", (8, 8), "black")
    save_clean_gif([image], path, duration_ms=100, loop=None)
    with pytest.raises(SystemExit, match="corner is not transparent"):
        loop.verify_animation(path, expect_frames=1, check_stale=False, expected_loop=None)
    image.putpixel((4, 4), (0, 0, 0, 0))
    save_clean_gif([image], path, duration_ms=100, loop=None)
    with pytest.raises(SystemExit, match="not opaque"):
        loop.verify_animation(path, expect_frames=1, check_stale=False, expected_loop=None, background="#000000")


def test_lifetime_refuses_an_end_with_even_one_dim_pixel(tmp_path):
    with pytest.raises(SystemExit, match="empty"):
        cut(lifetime_frames(tmp_path, fade=False), tmp_path / "out", cycle_mode="lifetime")


def test_video_set_routes_effect_through_black_pin_and_shared_cut(tmp_path, monkeypatch):
    keyed = lifetime_frames(tmp_path)
    raw = tmp_path / "raw"
    raw.mkdir()
    for src in sorted(keyed.glob("*.png")):
        rgba = np.array(Image.open(src)).astype(float)
        Image.fromarray(np.rint(rgba[:, :, :3] * rgba[:, :, 3:] / 255).astype(np.uint8)).save(raw / src.name)
    base = raw / "frame-010.png"
    captured = {}
    def runner(image, prompt, clip, report, **kwargs):
        assert "no effects" not in prompt and "black" in prompt
        assert Image.open(kwargs["last_frame"]).getextrema() == ((0, 0), (0, 0), (0, 0))
        assert kwargs["last_frame"] != image
        captured["pinned"] = True
        clip.write_bytes(b"synthetic")
        return 0
    monkeypatch.setattr(frames, "probe", lambda _: {"stream_index": 0, "fps": 24})
    monkeypatch.setattr(frames, "extract", lambda *a: sorted(raw.glob("*.png")))
    def forbidden(*a, **kw):
        pytest.fail("effects must not trigger facing analysis or chroma cleanup")
    monkeypatch.setattr(batch.facing_mod, "prepare_still", forbidden)
    monkeypatch.setattr(frames, "cutout", forbidden)
    result = batch.run_item(item="side-effect", direction="side", state="effect", base=base,
                            root=tmp_path / "batch", character="A spark", duration=3, resolution="480p",
                            key="auto", force=False, gap=0, video_runner=runner)
    assert captured["pinned"] and result["ok"], result
    assert result["loop"]["kind"] == "lifetime"
