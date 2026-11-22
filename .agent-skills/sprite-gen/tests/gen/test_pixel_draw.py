# SPDX-License-Identifier: Apache-2.0
"""`sprite-gen pixel-draw` end to end against a fake Claude at the transport seam: what is asked
and in what order, the row repair, the one redraw (G1 still broken, or no answer at max_tokens one
effort lower), refusals and failed calls reported as they came, the G7 pick, Message Batches and
`--resume`, the run folder and its report, and `--grid`. No key, no network: the answers are the
model's own recorded ones (tests/fixtures/pixel_draw)."""
from __future__ import annotations

import base64
import io
import json
from dataclasses import replace
from pathlib import Path
from types import SimpleNamespace

import pytest
from PIL import Image

from conftest import help_options
from sprite_gen.gen import anthropic_api as api
from sprite_gen.gen import claude_login, pixel_draw, refusal
from sprite_gen.gen import pixel_grid as pg
from sprite_gen.gen.anthropic_api import ApiError, Reply

KEY = "sk-ant-api03-" + "Synthetic0Key1For2Tests" * 2
FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "pixel_draw"


def fixture(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


SPRITE16 = fixture("sprite-16-safe-area-pass.txt")  # one frame, `sprite`, inside the 14x14 safe area
FULL16 = fixture("sprite-16-pass.txt")  # drawn when the prompt asked to fill the canvas: rows 1 and 16 used
ICON32 = fixture("icon-32-pass.txt")
ICON_ROW = fixture("icon-32-row-width.txt")
ICON_ROW_FIX = fixture("icon-32-row-width.repair.txt")
TILE_CUT = fixture("tile-32-truncated.txt")
TILE_CUT_FIX = fixture("tile-32-truncated.repair.txt")
WALK32 = fixture("walk-32-safe-area-pass.txt")
FOURDIR16 = fixture("fourdir-16-pass.txt")
VERDICT = fixture("pick-verdict.json")  # best: "A"


def tile_text(size: int) -> str:
    return "```pixels\nPALETTE\n. transparent\ng #4e9038\nFRAME tile\n" + "\n".join(["g" * size] * size) + "\nEND\n```"


def reply(text: str, *, stop: str = "end_turn", output: int = 1200, thinking: int = 1000, details=None) -> Reply:
    return Reply(text=text, thinking="summary", stop_reason=stop, stop_details=details, model=api.MODEL,
                 usage={"input_tokens": 500, "output_tokens": output, "output_tokens_details": {"thinking_tokens": thinking},
                        "cache_creation_input_tokens": 0, "cache_read_input_tokens": 0},
                 message_id="msg_x", seconds=1.5)


class FakeClaude:
    """Answers by call id (realtime: the label names it; batches: the custom_id)."""

    def __init__(self, script, polls=None, known=None):
        self.script = dict(script)
        self.asked: list[tuple[str, dict]] = []
        self.submitted: list[tuple[str, list]] = []
        self.polls = dict(polls or {})
        self.batch_ids = dict(known or {})
        self.deadlines: list[tuple[str, float | None]] = []  # each batch read and the time limit it was handed

    def stream(self, token, body, *, sleep, label, timeout=None):
        assert token == KEY
        call_id = label.split()[-1]
        self.asked.append((call_id, body))
        if call_id not in self.script:
            pytest.fail(f"unexpected call {call_id}")
        outcome = self.script[call_id]
        if isinstance(outcome, ApiError):
            raise outcome
        return replace(outcome, request_id=f"req_{call_id}")

    def submit(self, token, requests, *, sleep, label):
        batch_id = f"msgbatch_{len(self.submitted) + 1}"
        self.submitted.append((batch_id, requests))
        self.batch_ids[batch_id] = [cid for cid, _ in requests]
        return {"id": batch_id, "processing_status": "in_progress"}

    def get(self, token, batch_id, *, sleep, label, deadline=None):
        self.deadlines.append(("get", deadline))
        states = self.polls.setdefault(batch_id, ["ended"])
        state = states.pop(0) if len(states) > 1 else states[0]
        return {"id": batch_id, "processing_status": state, "results_url": f"https://results.invalid/{batch_id}",
                "ended_at": "2026-10-12T00:00:00Z" if state == "ended" else None}

    def results(self, token, batch, *, sleep, label, deadline=None):
        self.deadlines.append(("results", deadline))
        return {cid: replace(self.script[cid], mode="batch", batch_id=batch["id"], seconds=None)
                for cid in self.batch_ids[batch["id"]]}


@pytest.fixture
def claude(monkeypatch):
    """The API key route: no subscription login here (`claude_login.login`), `ANTHROPIC_API_KEY` set."""
    monkeypatch.setenv("ANTHROPIC_API_KEY", KEY)
    monkeypatch.setattr(claude_login, "login", lambda env=None, run=None: None)
    monkeypatch.setattr(pixel_draw, "BATCH_POLL_SECONDS", 0)

    def make(script, **kwargs) -> FakeClaude:
        fake = FakeClaude(script, **kwargs)
        monkeypatch.setattr(api, "stream_message", fake.stream)
        monkeypatch.setattr(api, "submit_batch", fake.submit)
        monkeypatch.setattr(api, "get_batch", fake.get)
        monkeypatch.setattr(api, "batch_results", fake.results)
        return fake

    return make


def draw(out: Path, *args: str) -> int:
    return pixel_draw.main(["--out-dir", str(out), *args])


def report_of(out: Path) -> dict:
    return json.loads((out / "report.json").read_text(encoding="utf-8"))


def asked(fake: FakeClaude) -> list[str]:
    return [call_id for call_id, _ in fake.asked]


def test_the_effort_order_is_the_api_s() -> None:
    assert pixel_draw.EFFORTS is api.EFFORTS


def test_one_candidate_is_drawn_checked_and_written(tmp_path, claude, capsys):
    fake = claude({"c1-gen1": reply(SPRITE16, output=2515, thinking=2300)})
    out = tmp_path / "run"
    assert draw(out, "--subject", "a knight", "--size", "16", "--candidates", "1") == 0
    report = report_of(out)
    captured = capsys.readouterr()
    assert json.loads(captured.out) == report
    assert "[gen] claude: running on ANTHROPIC_API_KEY — this is a per-call API charge" in captured.err
    assert report["status"] == "ok" and report["chosen"] == "c1" and report["pick"] == {"by": "only", "best": "c1"}
    assert sorted(p.name for p in out.iterdir()) == sorted([
        "report.json", "request.json", "calls", "candidates", "grid.txt", "palette.json", "frame-sprite.png",
        "preview-x16.png"])
    assert report["files"] == {"grid": "grid.txt", "palette": "palette.json", "frames": {"sprite": "frame-sprite.png"},
                               "preview": "preview-x16.png"}
    (call,) = report["calls"]
    assert {k: call[k] for k in ("id", "purpose", "candidate", "outcome", "mode", "model", "effort", "max_tokens",
                                 "request_id", "stop_reason", "thinking_tokens")} == {
        "id": "c1-gen1", "purpose": "generate", "candidate": "c1", "outcome": "reply", "mode": "realtime",
        "model": "claude-opus-5-5", "effort": "high", "max_tokens": 32000, "request_id": "req_c1-gen1",
        "stop_reason": "end_turn", "thinking_tokens": 2300}
    assert call["cost_usd"] == api.cost_usd(call["usage"], batch=False) == report["cost_usd"]
    assert report["usage"]["output_tokens"] == 2515 and report["usage"]["thinking_tokens"] == 2300
    assert report["seconds"] >= 0
    (candidate,) = report["candidates"]
    assert candidate["status"] == "passed" and candidate["G1"] == {"ok": True, "issues": [], "recovered": []}
    assert candidate["gates"]["ok"] and candidate["files"]["grid"] == "candidates/c1/grid.txt"
    assert not candidate["gates"]["G8"]["warn"] and candidate["warnings"] == [] and candidate["info"] == []
    assert report["warnings"] == [] and report["info"] == []
    grid, _ = pg.parse_answer(SPRITE16, "chargrid", 16, 16, ("sprite",))
    assert (out / "grid.txt").read_text(encoding="utf-8") == pg.to_text(grid)
    assert (out / "frame-sprite.png").read_bytes() == pg.png_bytes(pg.frame_pixels(grid, "sprite"))
    assert (out / "frame-sprite.png").read_bytes() == (out / "candidates" / "c1" / "frame-sprite.png").read_bytes()
    record = json.loads((out / "calls" / "c1-gen1.json").read_text(encoding="utf-8"))
    assert record["reply"]["text"] == SPRITE16 and record["prompt"].startswith("Draw: a knight\nCanvas: exactly 16x16")
    body = fake.asked[0][1]
    assert body["model"] == "claude-opus-5-5" and body["system"] == pixel_draw.SYSTEM
    assert body["thinking"] == {"type": "adaptive", "display": "summarized"} and body["output_config"] == {"effort": "high"}
    request = json.loads((out / "request.json").read_text(encoding="utf-8"))
    assert request["palette"] == {"name": "free:16", "limit": 16, "colors": []} and request["frames"] == ["sprite"]


def test_a_broken_row_is_asked_for_alone_and_spliced(tmp_path, claude):
    fake = claude({"c1-gen1": reply(ICON_ROW), "c1-gen1-fix1": reply(ICON_ROW_FIX, output=336, thinking=318)})
    out = tmp_path / "run"
    assert draw(out, "--subject", "a wooden chest", "--kind", "icon", "--candidates", "1") == 0
    assert asked(fake) == ["c1-gen1", "c1-gen1-fix1"]
    (candidate,) = report_of(out)["candidates"]
    assert candidate["repairs"] == [{"call": "c1-gen1-fix1", "rows_asked": ["icon 16"], "rows_answered": ["icon 16"],
                                     "ignored": [], "rows_still_broken": []}]
    assert candidate["G1"]["ok"] and candidate["generations"] == ["c1-gen1"]
    body = fake.asked[1][1]
    assert body["output_config"] == {"effort": "medium"} and body["max_tokens"] == 16000
    prompt = body["messages"][0]["content"]
    lines = prompt.splitlines()
    broken = next(line for line in lines if "BROKEN" in line)
    assert broken == "  row 16 (BROKEN, 33 characters): .ooooooooooooGGooGgooooooooooooo."
    ruler = lines[lines.index(broken) + 1]
    assert ruler.startswith("  ruler") and ruler.index("123456789") == broken.index(".oooo")
    assert "Rows to write: icon 16" in prompt and "`ROW <frame> <row number>: <exactly 32 characters>`" in prompt
    rows = (out / "grid.txt").read_text(encoding="utf-8").splitlines()
    assert rows[rows.index("FRAME icon") + 16] == ".ooooooooooooGGooGgoooooooooooo."


def test_a_row_left_broken_goes_back_in_a_second_round(tmp_path, claude):
    row25 = "ggggggggggggggdkdggggggggggggggg"
    fake = claude({"c1-gen1": reply(TILE_CUT), "c1-gen1-fix1": reply(TILE_CUT_FIX),
                   "c1-gen1-fix2": reply(f"ROW tile 25: {row25}")})
    out = tmp_path / "run"
    assert draw(out, "--subject", "grass", "--kind", "tile", "--candidates", "1") == 0
    (candidate,) = report_of(out)["candidates"]
    first, second = candidate["repairs"]
    assert first["rows_asked"] == [f"tile {n}" for n in range(16, 33)] and first["rows_still_broken"] == ["tile 25"]
    assert second["rows_asked"] == ["tile 25"] and second["rows_still_broken"] == []
    assert candidate["G1"] == {"ok": True, "issues": [], "recovered": [{"code": "no_end"}]}
    assert "rows 17-32 are MISSING" in fake.asked[1][1]["messages"][0]["content"]
    assert (out / "tiled-3x3.png").is_file()


def test_still_broken_after_two_rounds_is_drawn_once_more(tmp_path, claude, capsys):
    fake = claude({"c1-gen1": reply(TILE_CUT), "c1-gen1-fix1": reply(TILE_CUT_FIX),
                   "c1-gen1-fix2": reply("ROW tile 25: " + "g" * 33), "c1-gen2": reply(tile_text(32))})
    out = tmp_path / "run"
    assert draw(out, "--subject", "grass", "--kind", "tile", "--candidates", "1") == 0
    assert asked(fake) == ["c1-gen1", "c1-gen1-fix1", "c1-gen1-fix2", "c1-gen2"]
    (candidate,) = report_of(out)["candidates"]
    assert candidate["generations"] == ["c1-gen1", "c1-gen2"]
    assert candidate["redraws"] == [{"after": "c1-gen1", "why": "G1", "effort": "high"}]
    assert candidate["status"] == "passed" and "drawing c1 once more" in capsys.readouterr().err


def test_a_structural_failure_is_drawn_again_without_repair_and_a_second_one_ends_it(tmp_path, claude):
    broken = FOURDIR16.replace("FRAME up\n", "")
    fake = claude({"c1-gen1": reply(broken), "c1-gen2": reply(broken)})
    out = tmp_path / "run"
    with pytest.raises(SystemExit) as caught:
        draw(out, "--subject", "a knight", "--size", "16", "--frames", "down,up,left,right", "--candidates", "1")
    assert "no candidate passed the gates (c1: G1: frame_missing up, row_count_over down)" in str(caught.value)
    assert asked(fake) == ["c1-gen1", "c1-gen2"]
    report = report_of(out)
    assert report["status"] == "failed" and report["candidates"][0]["files"] == {}
    assert report["chosen"] is None and not (out / "grid.txt").exists()


def test_no_answer_at_max_tokens_is_drawn_once_more_one_effort_lower(tmp_path, claude, capsys):
    fake = claude({"c1-gen1": reply("", stop="max_tokens", output=32000, thinking=32000), "c1-gen2": reply(SPRITE16)})
    out = tmp_path / "run"
    assert draw(out, "--subject", "a knight", "--size", "16", "--candidates", "1", "--effort", "xhigh") == 0
    assert [body["output_config"]["effort"] for _, body in fake.asked] == ["xhigh", "high"]
    report = report_of(out)
    (candidate,) = report["candidates"]
    assert candidate["redraws"] == [{"after": "c1-gen1", "why": "max_tokens", "effort": "high"}]
    assert candidate["effort"] == "high" and candidate["status"] == "passed"
    assert report["cost_usd"] == pytest.approx(sum(c["cost_usd"] for c in report["calls"]))
    assert "drawing c1 once more at effort high" in capsys.readouterr().err


def test_an_answer_cut_off_at_max_tokens_keeps_its_rows_and_is_repaired(tmp_path, claude):
    rows = SPRITE16.split("FRAME sprite\n")[1].split("\nEND")[0].splitlines()
    cut = SPRITE16[:SPRITE16.index("FRAME sprite\n")] + "FRAME sprite\n" + "\n".join(rows[:10])
    fix = "\n".join(f"ROW sprite {n}: {rows[n - 1]}" for n in range(11, 17))
    fake = claude({"c1-gen1": reply(cut, stop="max_tokens", output=32000, thinking=31000), "c1-gen1-fix1": reply(fix)})
    out = tmp_path / "run"
    assert draw(out, "--subject", "a knight", "--size", "16", "--candidates", "1") == 0
    assert asked(fake) == ["c1-gen1", "c1-gen1-fix1"]
    (candidate,) = report_of(out)["candidates"]
    assert candidate["redraws"] == [] and candidate["repairs"][0]["rows_asked"] == [f"sprite {n}" for n in range(11, 17)]
    assert [r["code"] for r in candidate["G1"]["recovered"]] == ["block_unclosed", "no_end"]
    grid, _ = pg.parse_answer(SPRITE16, "chargrid", 16, 16, ("sprite",))
    assert (out / "grid.txt").read_text(encoding="utf-8") == pg.to_text(grid)


def test_no_answer_twice_ends_the_candidate(tmp_path, claude):
    empty = reply("", stop="max_tokens", output=32000, thinking=32000)
    fake = claude({"c1-gen1": empty, "c1-gen2": empty})
    out = tmp_path / "run"
    with pytest.raises(SystemExit) as caught:
        draw(out, "--subject", "stones", "--kind", "tile", "--candidates", "1", "--effort", "medium")
    assert "c1: max_tokens: c1-gen2 used all 32000 tokens at effort low and wrote nothing" in str(caught.value)
    assert [body["output_config"]["effort"] for _, body in fake.asked] == ["medium", "low"]


def test_a_candidate_is_drawn_twice_at_most(tmp_path, claude):
    fake = claude({"c1-gen1": reply("", stop="max_tokens"), "c1-gen2": reply("no grid here")})
    with pytest.raises(SystemExit, match=r"c1: G1: no_block"):
        draw(tmp_path / "run", "--subject", "a knight", "--candidates", "1")
    assert asked(fake) == ["c1-gen1", "c1-gen2"]


def test_an_answer_that_writes_its_block_again_is_read_from_the_last_whole_block(tmp_path, claude):
    """A block, then 'Corrected:' and the block again (seen on the subscription, 2026-10-15): the last
    block that reads whole is the answer - recorded, not drawn again."""
    half = SPRITE16[:SPRITE16.index("FRAME sprite")] + "END\n```"
    fake = claude({"c1-gen1": reply(half + "\n\nWait, the frame belongs inside the block. Corrected:\n\n" + SPRITE16)})
    out = tmp_path / "run"
    assert draw(out, "--subject", "a knight", "--size", "16", "--candidates", "1") == 0
    assert asked(fake) == ["c1-gen1"]
    (candidate,) = report_of(out)["candidates"]
    assert candidate["status"] == "passed" and candidate["redraws"] == []
    assert candidate["G1"] == {"ok": True, "issues": [], "recovered": [{"code": "block_many", "detail": "2 blocks, read block 2"}]}


def test_a_refusal_is_reported_as_it_came(tmp_path, claude):
    fake = claude({"c1-gen1": reply("", stop="refusal", details={"type": "refusal", "category": "cyber", "explanation": "x"})})
    out = tmp_path / "run"
    with pytest.raises(SystemExit) as caught:
        draw(out, "--subject", "something", "--candidates", "1")
    assert str(caught.value).startswith(
        f"pixel-draw: {refusal.CONTENT_POLICY} (stop_reason=refusal category=cyber); every candidate was refused")
    assert asked(fake) == ["c1-gen1"]
    report = report_of(out)
    assert report["status"] == "refused" and report["candidates"][0]["status"] == "refused"


def test_a_failed_call_is_not_asked_again(tmp_path, claude):
    error = ApiError("pixel-draw: claude request failed (HTTP 400) code=invalid_request_error; not asked again",
                     status=400, request_id="req_400", billed=False)
    fake = claude({"c1-gen1": error})
    out = tmp_path / "run"
    with pytest.raises(SystemExit, match=r"c1: pixel-draw: claude request failed \(HTTP 400\)"):
        draw(out, "--subject", "a knight", "--candidates", "1")
    assert asked(fake) == ["c1-gen1"]
    (call,) = report_of(out)["calls"]
    assert call["outcome"] == "error" and call["request_id"] == "req_400" and call["cost_usd"] == 0.0
    assert call["error"] == error.line and call["billed"] is False


def test_the_vision_pick_chooses_between_two_that_passed(tmp_path, claude):
    variant = SPRITE16.replace("r #d03a34", "r #c03030")
    fake = claude({"c1-gen1": reply(SPRITE16), "c2-gen1": reply(variant), "pick": reply(VERDICT, output=300, thinking=90)})
    out = tmp_path / "run"
    assert draw(out, "--subject", "a knight", "--size", "16") == 0
    report = report_of(out)
    pick = report["pick"]
    assert pick["by"] == "vision" and sorted(pick["labels"]) == ["A", "B"] and sorted(pick["labels"].values()) == ["c1", "c2"]
    assert pick["best"] == pick["labels"]["A"] == report["chosen"] and pick["verdict"]["best"] == "A"
    body = dict(fake.asked)["pick"]
    image, text = body["messages"][0]["content"]
    assert image["source"]["media_type"] == "image/png"
    assert base64.standard_b64decode(image["source"]["data"]) == (out / "pick-sheet.png").read_bytes()
    assert text["text"].startswith("You are judging pixel-art game assets") and "candidates labelled A, B" in text["text"]
    assert body["output_config"] == {"effort": "low", "format": {"type": "json_schema", "schema": pixel_draw.PICK_SCHEMA}}
    assert "system" not in body
    chosen = out / "candidates" / report["chosen"]
    assert (out / "grid.txt").read_bytes() == (chosen / "grid.txt").read_bytes()
    assert (out / "frame-sprite.png").read_bytes() == (chosen / "frame-sprite.png").read_bytes()
    assert [c["id"] for c in report["calls"]] == ["c1-gen1", "c2-gen1", "pick"]


def test_the_pick_sheet_shows_transparency_on_the_engines_preview_checker(tmp_path):
    """The candidates' transparent pixels show the checker the engine's contact sheets and GIF
    previews show (`qa.preview.checker`), eight sheet pixels a square."""
    from sprite_gen.qa.preview import checker

    by_label = {}
    for label, cid in (("A", "c1"), ("B", "c2")):
        (tmp_path / cid).mkdir()
        Image.new("RGBA", (64, 48), (0, 0, 0, 0)).save(tmp_path / cid / "preview.png")
        by_label[label] = pixel_draw.Candidate(cid, files={"preview": f"{cid}/preview.png"})
    sheet = Image.open(io.BytesIO(pixel_draw.pick_sheet(tmp_path, by_label, tile=False))).convert("RGB")
    left, top = 16 + 56, 16  # past the margin and the label column
    assert sheet.crop((left, top, left + 64, top + 48)).tobytes() == checker((64, 48), square=8).convert("RGB").tobytes()


def test_a_person_picks_when_asked(tmp_path, claude):
    fake = claude({"c1-gen1": reply(SPRITE16), "c2-gen1": reply(SPRITE16.replace("r #d03a34", "r #c03030"))})
    out = tmp_path / "run"
    assert draw(out, "--subject", "a knight", "--size", "16", "--pick", "human") == 0
    report = report_of(out)
    assert report["pick"] == {"by": "human", "best": None, "candidates": ["c1", "c2"]}
    assert report["status"] == "ok" and report["chosen"] is None and not (out / "grid.txt").exists()
    assert "pick" not in asked(fake)


def test_a_pick_that_names_no_candidate_fails_the_run(tmp_path, claude):
    verdict = json.loads(VERDICT)
    verdict["best"] = "Z"
    claude({"c1-gen1": reply(SPRITE16), "c2-gen1": reply(SPRITE16.replace("r #d03a34", "r #c03030")),
            "pick": reply(json.dumps(verdict))})
    out = tmp_path / "run"
    with pytest.raises(SystemExit, match=r"2 candidates passed but the pick failed \(the pick named 'Z', not one of A, B\)"):
        draw(out, "--subject", "a knight", "--size", "16")
    assert report_of(out)["status"] == "pick_failed" and not (out / "grid.txt").exists()


def test_one_that_passed_alone_is_the_pick(tmp_path, claude):
    fake = claude({"c1-gen1": reply(SPRITE16), "c2-gen1": reply(""), "c2-gen2": reply("")})
    out = tmp_path / "run"
    assert draw(out, "--subject", "a knight", "--size", "16") == 0
    report = report_of(out)
    assert report["pick"] == {"by": "only", "best": "c1"} and "pick" not in asked(fake)
    assert [c["status"] for c in report["candidates"]] == ["passed", "failed"]


def test_batches_draw_at_half_price_and_repairs_stay_realtime(tmp_path, claude):
    fake = claude({"c1-gen1": reply(ICON_ROW), "c2-gen1": reply(""), "c1-gen1-fix1": reply(ICON_ROW_FIX),
                   "c2-gen2": reply(ICON32), "pick": reply(VERDICT)},
                  polls={"msgbatch_1": ["in_progress", "ended"]})
    out = tmp_path / "run"
    assert draw(out, "--subject", "a chest", "--kind", "icon", "--batch") == 0
    assert [(b, [cid for cid, _ in requests]) for b, requests in fake.submitted] == [
        ("msgbatch_1", ["c1-gen1", "c2-gen1"]), ("msgbatch_2", ["c2-gen2"])]
    assert all("stream" not in params for _, requests in fake.submitted for _, params in requests)
    assert asked(fake) == ["c1-gen1-fix1", "pick"]
    report = report_of(out)
    calls = {c["id"]: c for c in report["calls"]}
    assert calls["c1-gen1"]["mode"] == "batch" and calls["c1-gen1"]["batch_id"] == "msgbatch_1"
    assert calls["c1-gen1"]["cost_usd"] == api.cost_usd(calls["c1-gen1"]["usage"], batch=True)
    assert calls["c1-gen1-fix1"]["mode"] == "realtime"
    assert [(b["id"], b["collected"]) for b in report["batches"]] == [("msgbatch_1", True), ("msgbatch_2", True)]


def test_the_batch_wait_is_the_time_limit_its_reads_are_asked_again_within(tmp_path, claude, monkeypatch):
    """--batch-wait holds the reads of the batch, the waits `retry` asks a refused one again after included:
    each status and results read is handed the time the wait ends, counted from when the run began waiting."""
    monkeypatch.setattr(pixel_draw, "time", SimpleNamespace(monotonic=lambda: 100.0, sleep=lambda seconds: None))
    fake = claude({"c1-gen1": reply(SPRITE16)}, polls={"msgbatch_1": ["in_progress", "ended"]})
    assert draw(tmp_path / "run", "--subject", "a knight", "--size", "16", "--candidates", "1", "--batch",
                "--batch-wait", "90") == 0
    assert fake.deadlines == [("get", 190.0), ("get", 190.0), ("results", 190.0)]


def test_a_batch_cut_short_is_collected_on_resume_and_not_bought_twice(tmp_path, claude):
    script = {"c1-gen1": reply(SPRITE16)}
    claude(script, polls={"msgbatch_1": ["in_progress"]})
    out = tmp_path / "run"
    with pytest.raises(SystemExit) as caught:
        draw(out, "--subject", "a knight", "--size", "16", "--candidates", "1", "--batch", "--batch-wait", "0")
    message = str(caught.value)
    assert "batch msgbatch_1 has not ended after 0s; nothing is asked twice" in message
    assert f"`sprite-gen pixel-draw --out-dir {out.resolve()} --resume`" in message
    report = report_of(out)
    assert report["status"] == "unfinished" and report["unfinished"]["batch_id"] == "msgbatch_1"
    record = json.loads((out / "batches" / "msgbatch_1.json").read_text(encoding="utf-8"))
    assert record["collected"] is False and record["custom_ids"] == ["c1-gen1"]
    second = claude(script, known={"msgbatch_1": ["c1-gen1"]})
    assert pixel_draw.main(["--out-dir", str(out), "--resume"]) == 0
    assert second.submitted == [] and second.asked == []
    report = report_of(out)
    assert report["status"] == "ok" and report["batches"][0]["collected"] is True


def test_resume_reads_answered_calls_back(tmp_path, claude):
    claude({"c1-gen1": reply(ICON_ROW), "c1-gen1-fix1": reply(ICON_ROW_FIX)})
    out = tmp_path / "run"
    assert draw(out, "--subject", "a chest", "--kind", "icon", "--candidates", "1") == 0
    before = {name: (out / name).read_bytes() for name in ("grid.txt", "frame-icon.png")}
    again = claude({})
    assert pixel_draw.main(["--out-dir", str(out), "--resume"]) == 0
    assert again.asked == [] and {name: (out / name).read_bytes() for name in before} == before
    assert [c["id"] for c in report_of(out)["calls"]] == ["c1-gen1", "c1-gen1-fix1"]


def test_resume_takes_the_request_from_the_run(tmp_path, claude):
    claude({"c1-gen1": reply(SPRITE16)})
    out = tmp_path / "run"
    assert draw(out, "--subject", "a knight", "--size", "16", "--candidates", "1") == 0
    with pytest.raises(SystemExit, match=r"--resume reads the request from .*request.json; drop --size"):
        pixel_draw.main(["--out-dir", str(out), "--resume", "--size", "16"])
    request = json.loads((out / "request.json").read_text(encoding="utf-8"))
    (out / "request.json").write_text(json.dumps({**request, "subject": "a wizard"}), encoding="utf-8")
    with pytest.raises(SystemExit, match="was asked with another request"):
        pixel_draw.main(["--out-dir", str(out), "--resume"])


def test_a_used_folder_is_refused(tmp_path, claude):
    out = tmp_path / "run"
    out.mkdir()
    (out / "notes.txt").write_text("mine", encoding="utf-8")
    claude({})
    with pytest.raises(SystemExit, match="exists and is not an empty folder"):
        draw(out, "--subject", "a knight")


@pytest.mark.parametrize("args,message", [
    (["--size", "7"], "--size is 8..48 pixels, got 7"),
    (["--size", "49"], "--size is 8..48 pixels, got 49"),
    (["--frames", "a,b", "--duration-ms", "5"], "--duration-ms is at least 10, got 5"),
    (["--style", " "], "--style is a sentence of words, got ' '"),
    (["--motion", "a spin"], "--motion is two or more frames"),
    (["--frames", "a b"], "frame names are letters, digits"),
    (["--frames", "a,a"], "frame names must differ"),
    (["--frames", "a,b", "--walk-cycle"], "--walk-cycle is four frames"),
    (["--candidates", "0"], "--candidates is 1..6, got 0"),
    (["--candidates", "7"], "--candidates is 1..6, got 7"),
    (["--max-tokens", "100"], "--max-tokens is 1024..128000, got 100"),
    (["--max-tokens", "200000"], "--max-tokens is 1024..128000, got 200000"),
    (["--palette", "free:99"], "free:N takes 1..62 colours"),
])
def test_requests_refused_before_anything_is_asked(tmp_path, claude, args, message):
    fake = claude({})
    out = tmp_path / "run"
    with pytest.raises(SystemExit) as caught:
        draw(out, "--subject", "a knight", *args)
    assert message in str(caught.value) and fake.asked == [] and not out.exists()


def test_a_spec_file_holds_the_drawing(tmp_path, claude):
    spec = tmp_path / "spec.json"
    spec.write_text(json.dumps({"subject": "a slime", "size": 16, "frames": ["front"], "palette": ["#112233", "#445566"]}),
                    encoding="utf-8")
    claude({})
    bad = tmp_path / "bad.json"
    bad.write_text(json.dumps({"subject": "x", "effort": "high"}), encoding="utf-8")
    with pytest.raises(SystemExit, match=r"unknown key\(s\) effort"):
        draw(tmp_path / "b", "--spec", str(bad))
    with pytest.raises(SystemExit, match="nothing to draw"):
        draw(tmp_path / "c")
    two_colors = "```pixels\nPALETTE\n. transparent\na #112233\nb #445566\nFRAME front\n" + "\n".join(
        ["." * 16] + [".." + "ab" * 6 + ".."] * 14 + ["." * 16]) + "\nEND\n```"
    fake = claude({"c1-gen1": reply(two_colors)})
    assert draw(tmp_path / "d", "--spec", str(spec), "--candidates", "1") == 0
    prompt = fake.asked[0][1]["messages"][0]["content"]
    assert "Palette: use only these 2 colors and transparent, no others: #112233 #445566." in prompt
    assert report_of(tmp_path / "d")["candidates"][0]["gates"]["G2"]["ok"]


def test_a_json_answer_is_kept_as_a_chargrid(tmp_path, claude):
    fake = claude({"c1-gen1": reply(fixture("icon-16-json-pass.txt"))})
    out = tmp_path / "run"
    assert draw(out, "--subject", "a potion", "--kind", "icon", "--size", "16", "--format", "json", "--candidates", "1") == 0
    assert '{"palette": ["transparent", "#RRGGBB", ...]' in fake.asked[0][1]["messages"][0]["content"]
    lines = (out / "grid.txt").read_text(encoding="utf-8").splitlines()
    assert lines[:3] == ["PALETTE", ". transparent", "a #2b1b2e"]
    with Image.open(out / "frame-icon.png") as image:
        assert image.getpixel((5, 1)) == (0x2B, 0x1B, 0x2E, 255)


def test_a_walk_cycle_is_one_call_of_four_frames(tmp_path, claude):
    fake = claude({"c1-gen1": reply(WALK32)})
    out = tmp_path / "run"
    assert draw(out, "--subject", "a knight walking right", "--frames", "walk1,walk2,walk3,walk4", "--walk-cycle",
                "--candidates", "1") == 0
    body = fake.asked[0][1]
    assert body["max_tokens"] == 64000
    assert ("The frames are one looping walk cycle: walk1 = contact pose with the front leg forward"
            in body["messages"][0]["content"])
    report = report_of(out)
    assert any(w.startswith("G6 weak leg alternation") for w in report["warnings"])
    assert report["files"]["gif"] == "anim.gif"
    with Image.open(out / "anim.gif") as gif:
        assert gif.n_frames == 4
    with Image.open(out / "preview-x8.png") as preview:
        assert preview.size == (4 * 256 + 3 * 16, 256)


def test_an_edited_grid_is_checked_and_rendered_without_a_call(tmp_path, claude, monkeypatch):
    claude({"c1-gen1": reply(SPRITE16)})
    first = tmp_path / "first"
    assert draw(first, "--subject", "a knight", "--size", "16", "--candidates", "1") == 0
    monkeypatch.delenv("ANTHROPIC_API_KEY")
    edited = tmp_path / "edited.txt"
    edited.write_text((first / "grid.txt").read_text(encoding="utf-8").replace(
        "FRAME sprite\n................\n......orRo......", "FRAME sprite\n................\n......orRo...o.."),
        encoding="utf-8")  # a speck beside the plume, inside the safe area
    second = tmp_path / "second"
    assert pixel_draw.main(["--grid", str(edited), "--out-dir", str(second)]) == 0
    report = report_of(second)
    assert report["source"] == "grid" and report["calls"] == [] and report["cost_usd"] == 0.0
    assert report["status"] == "ok" and report["warnings"] == ["G5 1 stray pixel(s) with no opaque neighbour"]
    grid, issues = pg.read_grid_text(edited.read_text(encoding="utf-8"))
    assert (second / "frame-sprite.png").read_bytes() == pg.png_bytes(pg.frame_pixels(grid, "sprite"))
    broken = tmp_path / "broken.txt"
    broken.write_text(edited.read_text(encoding="utf-8").replace("......orRo...o..\n", "......orRo...o.\n"), encoding="utf-8")
    with pytest.raises(SystemExit, match=r"does not parse whole: row_width sprite row 2"):
        pixel_draw.main(["--grid", str(broken), "--out-dir", str(tmp_path / "third")])
    with pytest.raises(SystemExit, match=r"--grid checks and renders a grid as it is; drop --candidates"):
        pixel_draw.main(["--grid", str(edited), "--out-dir", str(tmp_path / "fourth"), "--candidates", "2"])


def test_no_credential_is_refused_before_the_folder_is_made(tmp_path, monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.setattr(claude_login, "login", lambda env=None, run=None: None)
    out = tmp_path / "run"
    with pytest.raises(SystemExit, match=r"no subscription login \(`claude auth status`\) and ANTHROPIC_API_KEY is not set"):
        draw(out, "--subject", "a knight")
    assert not out.exists()


class FakeLogin:
    """The subscription route: `claude -p` answers by call id; the API must not be reached."""

    def __init__(self, monkeypatch, script):
        self.script = dict(script)
        self.asked: list[tuple[str, dict]] = []
        monkeypatch.setattr(claude_login, "login", lambda env=None, run=None: claude_login.Login("claude.ai", "max"))
        monkeypatch.setattr(claude_login, "send_message", self.send)
        for name in ("stream_message", "submit_batch", "get_batch", "batch_results"):
            monkeypatch.setattr(api, name, lambda *a, **k: pytest.fail("the API was reached on a subscription run"))

    def send(self, body, *, label, env=None, run=None):
        call_id = label.split()[-1]
        self.asked.append((call_id, body))
        return replace(self.script[call_id], mode="subscription", request_id=None)


def test_a_signed_in_subscription_draws_with_no_charge_even_with_a_key_set(tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("ANTHROPIC_API_KEY", KEY)
    fake = FakeLogin(monkeypatch, {"c1-gen1": reply(ICON_ROW), "c1-gen1-fix1": reply(ICON_ROW_FIX)})
    out = tmp_path / "run"
    assert draw(out, "--subject", "a chest", "--kind", "icon", "--candidates", "1") == 0
    report = report_of(out)
    err = capsys.readouterr().err
    assert "per-call API charge" not in err and "subscription" in err  # the call lines say what it ran on
    assert asked(fake) == ["c1-gen1", "c1-gen1-fix1"]
    assert report["status"] == "ok" and report["auth_source"] == "claude-login" and report["cost_usd"] == 0.0
    assert [(c["mode"], c["auth_source"], c["cost_usd"]) for c in report["calls"]] == [
        ("subscription", "claude-login", 0.0)] * 2
    assert report["calls"][0]["thinking_tokens"] == 1000  # usage is kept: it counts against the plan


def test_a_batch_runs_on_the_key_even_when_signed_in(tmp_path, claude, monkeypatch, capsys):
    monkeypatch.setattr(claude_login, "login", lambda env=None, run=None: pytest.fail("a batch asked the login"))
    fake = claude({"c1-gen1": reply(SPRITE16)})
    out = tmp_path / "run"
    assert draw(out, "--subject", "a knight", "--size", "16", "--candidates", "1", "--batch") == 0
    assert "[gen] claude: running on ANTHROPIC_API_KEY — this is a per-call API charge" in capsys.readouterr().err
    assert [cid for cid, _ in fake.submitted[0][1]] == ["c1-gen1"]
    assert report_of(out)["auth_source"] == "ANTHROPIC_API_KEY"


def test_a_run_read_back_whole_asks_nothing_and_announces_no_charge(tmp_path, claude, capsys):
    claude({"c1-gen1": reply(SPRITE16)})
    out = tmp_path / "run"
    assert draw(out, "--subject", "a knight", "--size", "16", "--candidates", "1") == 0
    assert "per-call API charge" in capsys.readouterr().err
    again = claude({})
    assert pixel_draw.main(["--out-dir", str(out), "--resume"]) == 0
    assert again.asked == [] and "per-call API charge" not in capsys.readouterr().err


def test_the_cli_names_the_verb_and_its_flags():
    flags = help_options("-m", "sprite_gen.cli", "pixel-draw")
    assert {"--subject", "--spec", "--grid", "--size", "--kind", "--frames", "--walk-cycle", "--palette", "--candidates",
            "--effort", "--format", "--batch", "--batch-wait", "--max-tokens", "--pick", "--out-dir", "--resume",
            "--style", "--motion", "--duration-ms"} <= flags


def pixel_request(**changes) -> pixel_draw.PixelRequest:
    base = dict(subject="a knight", size=32, kind="sprite", frames=("sprite",), walk_cycle=False,
                palette=pg.palette_rule("free"), candidates=1, effort="high", answer_format="chargrid",
                batch=False, max_tokens=32000, pick="vision")
    return pixel_draw.PixelRequest(**{**base, **changes})


def test_the_prompt_keeps_every_frame_on_the_floor_row_and_icons_off_it():
    walk = pixel_draw.generation_prompt(pixel_request(frames=("walk1", "walk2", "walk3", "walk4"), walk_cycle=True))
    assert "stand on row 29 in every frame." in walk
    assert "the same bottom row" not in walk
    icon = pixel_draw.generation_prompt(pixel_request(kind="icon", frames=("icon",)))
    assert "draw the icon about the size of the central 26x26 pixels - rows 4-29 and columns 4-29" in icon
    assert "Floor:" not in icon
    tile = pixel_draw.generation_prompt(pixel_request(kind="tile", frames=("tile",)))
    assert "Safe area" not in tile and "Floor:" not in tile
    tiny = pixel_draw.generation_prompt(pixel_request(size=8))
    assert ("Safe area: at 8x8 there is no margin; the subject may use the whole canvas, with the four corner pixels "
            "transparent.") in tiny
    assert "Floor: row 8, the bottom row of the safe area, is the ground: the feet" in tiny


def test_the_prompt_takes_the_margin_from_prepare(monkeypatch):
    from sprite_gen.gen import prepare
    monkeypatch.setattr(prepare, "DEFAULT_SAFE_MARGIN_RATIO", 0.125)
    prompt = pixel_draw.generation_prompt(pixel_request())
    assert "inside a 4-pixel margin on every side" in prompt and "the central 24x24 pixels - rows 5-28" in prompt


def test_the_pick_knows_the_margin_is_meant():
    pick = pixel_draw.pick_prompt(pixel_request(), ["A", "B"])
    assert ("The request was: a knight Canvas 32x32 pixels per frame, the body about the size of the central 26x26, "
            "inside a 3-pixel margin a pose may reach into.") in pick
    tile = pixel_draw.pick_prompt(pixel_request(kind="tile", frames=("tile",), subject="grass"), ["A", "B"])
    assert "The request was: grass Canvas 32x32 pixels per frame." in tile


def test_an_edited_grid_goes_through_the_safe_area_check(tmp_path, capsys):
    grid, _ = pg.parse_answer(FULL16, "chargrid", 16, 16, ("front",))
    full = tmp_path / "full.txt"
    full.write_text(pg.to_text(grid), encoding="utf-8")  # drawn under the old prompt: rows 1 and 16 are used
    assert pixel_draw.main(["--grid", str(full), "--out-dir", str(tmp_path / "full")]) == 0
    report = report_of(tmp_path / "full")
    assert json.loads(capsys.readouterr().out) == report
    assert report["status"] == "ok" and report["gates"]["G8"]["over_cap"] == ["front"] and report["info"] == []
    assert report["warnings"] == ["G8: frames exceed the physical cap 16x15 (reroll candidates): front:14x16",
                                  "G8 the feet are not on the floor row (the safe area's bottom row): front 1 px below it"]
    inside = tmp_path / "inside.txt"
    rows = ["." * 16] + ["...." + "a" * 8 + "...."] * 14 + ["." * 16]
    inside.write_text("PALETTE\n. transparent\na #2a1f2e\nFRAME front\n" + "\n".join(rows) + "\nEND\n", encoding="utf-8")
    assert pixel_draw.main(["--grid", str(inside), "--out-dir", str(tmp_path / "inside")]) == 0
    report = report_of(tmp_path / "inside")
    assert report["status"] == "ok" and report["warnings"] == [] and report["info"] == []
    assert report["gates"]["G8"]["floor_row"] == 14 and report["gates"]["G8"]["safe_area"] == [14, 14]


def staff_answer() -> str:
    """A 32 px sprite whose staff reaches the canvas's top edge: 17x29, past the 26x26 safe area and within
    the 32x29 cap, the feet on the floor row."""
    rows = []
    for y in range(32):
        row = ["."] * 32
        if 3 <= y <= 28:
            row[8:24] = ["a"] * 16
        if y <= 28:
            row[24] = "b"
        rows.append("".join(row))
    return "```pixels\nPALETTE\n. transparent\na #2a1f2e\nb #8a5a30\nFRAME sprite\n" + "\n".join(rows) + "\nEND\n```"


# The knight's two warnings reach the report in test_an_edited_grid_goes_through_the_safe_area_check.
@pytest.mark.parametrize("answer,size,frame,warnings,info", [
    (staff_answer(), "32", "sprite", [],
     ["G8: frames exceed the safe area 26x26 but fit within the margin zone (informational, no action): sprite:17x29"]),
], ids=["staff-to-the-edge"])
def test_one_candidate_past_the_safe_area_is_the_pick(tmp_path, claude, answer, size, frame, warnings, info):
    """One candidate, as a caller that buys one drawing asks: a staff on the canvas edge, or a knight
    from helmet to boots on its edge rows, passes - its info lines and warnings in the report."""
    claude({"c1-gen1": reply(answer)})
    out = tmp_path / "run"
    assert draw(out, "--subject", "a figure", "--size", size, "--frames", frame, "--candidates", "1") == 0
    report = report_of(out)
    (candidate,) = report["candidates"]
    assert report["status"] == "ok" and report["chosen"] == "c1" and candidate["status"] == "passed"
    assert report["pick"]["by"] == "only" and (out / f"frame-{frame}.png").is_file()
    assert report["warnings"] == candidate["warnings"] == warnings
    assert report["info"] == candidate["info"] == info


def test_the_charge_is_said_before_any_request_leaves_even_from_another_thread(tmp_path):
    """Two candidates ask at once: the second must not send before the first has said the charge."""
    import threading
    said, order = threading.Event(), []

    def announce():
        order.append("announce-start")
        assert gate.wait(5)
        said.set()
        order.append("announced")

    gate = threading.Event()
    calls = pixel_draw.Calls(tmp_path, claude_login.Credential("ANTHROPIC_API_KEY", token=KEY), sleep=lambda s: None,
                             note=lambda line: None, announce=announce)
    first = threading.Thread(target=calls._leaving)
    first.start()
    while "announce-start" not in order:
        pass
    second = threading.Thread(target=lambda: (calls._leaving(), order.append(f"second-leaves said={said.is_set()}")))
    second.start()
    second.join(0.2)
    assert second.is_alive(), "the second request left before the charge was said"
    gate.set()
    first.join(5)
    second.join(5)
    assert order == ["announce-start", "announced", "second-leaves said=True"]


def test_a_resume_reports_the_route_its_calls_ran_on(tmp_path, claude, monkeypatch):
    claude({"c1-gen1": reply(SPRITE16)})
    out = tmp_path / "run"
    assert draw(out, "--subject", "a knight", "--size", "16", "--candidates", "1") == 0
    FakeLogin(monkeypatch, {})  # signed in now; every call is read back, none is asked
    assert pixel_draw.main(["--out-dir", str(out), "--resume"]) == 0
    report = report_of(out)
    assert report["auth_source"] == "ANTHROPIC_API_KEY" and "auth_sources" not in report
    assert [c["auth_source"] for c in report["calls"]] == ["ANTHROPIC_API_KEY"] and report["cost_usd"] > 0


def test_a_run_whose_calls_ran_on_both_routes_says_so():
    calls = [{"auth_source": "ANTHROPIC_API_KEY"}, {"auth_source": "claude-login"}, {"auth_source": "claude-login"}]
    assert pixel_draw.run_auth_source(calls, "claude-login") == {"auth_source": "mixed",
                                                                 "auth_sources": ["ANTHROPIC_API_KEY", "claude-login"]}
    assert pixel_draw.run_auth_source(calls[1:], "ANTHROPIC_API_KEY") == {"auth_source": "claude-login"}
    assert pixel_draw.run_auth_source([], "claude-login") == {"auth_source": "claude-login"}
