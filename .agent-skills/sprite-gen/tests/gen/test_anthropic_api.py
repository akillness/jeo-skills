# SPDX-License-Identifier: Apache-2.0
"""The Anthropic transport of `pixel-draw`, over a real local socket: the streamed message read
event by event, what is asked again (a refused request made nothing) and what never is (a stream
that broke after it began), Message Batches, and the price of a call. No key, no network."""
from __future__ import annotations

import http.server
import json
import threading

import pytest

from sprite_gen.gen import anthropic_api as api

KEY = "sk-ant-api03-" + "Synthetic0Key1For2Tests" * 2


class Script(http.server.BaseHTTPRequestHandler):
    """Answers each request with the next scripted response and records what was asked."""

    def log_message(self, *args):
        pass

    def _answer(self):
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length else b""
        self.server.asked.append({"method": self.command, "path": self.path,
                                  "headers": {k.lower(): v for k, v in self.headers.items()},
                                  "body": json.loads(body) if body else None})
        kind, status, headers, payload = self.server.script.pop(0)
        self.send_response(status)
        for name, value in headers.items():
            self.send_header(name, value)
        if kind == "sse":
            self.send_header("Content-Type", "text/event-stream")
            self.end_headers()
            for event in payload:
                self.wfile.write(f"event: {event['type']}\ndata: {json.dumps(event)}\n\n".encode())
                self.wfile.flush()
        else:
            data = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

    do_GET = do_POST = _answer


@pytest.fixture
def server(monkeypatch):
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Script)
    srv.script, srv.asked = [], []
    thread = threading.Thread(target=srv.serve_forever, daemon=True)
    thread.start()
    monkeypatch.setenv("SPRITE_GEN_ANTHROPIC_BASE_URL", f"http://127.0.0.1:{srv.server_address[1]}/v1")
    yield srv
    srv.shutdown()
    srv.server_close()


def events(text="```pixels\n...\n```", thinking="Planning the rows.", stop="end_turn", details=None, end=True):
    usage_end = {"output_tokens": 8294, "output_tokens_details": {"thinking_tokens": 7564}}
    out = [
        {"type": "message_start", "message": {"id": "msg_01", "type": "message", "role": "assistant", "model": api.MODEL,
                                              "content": [], "stop_reason": None,
                                              "usage": {"input_tokens": 509, "output_tokens": 1,
                                                        "cache_creation_input_tokens": 0, "cache_read_input_tokens": 0}}},
        {"type": "ping"},
        {"type": "content_block_start", "index": 0, "content_block": {"type": "thinking", "thinking": ""}},
        {"type": "content_block_delta", "index": 0, "delta": {"type": "thinking_delta", "thinking": thinking}},
        {"type": "content_block_delta", "index": 0, "delta": {"type": "signature_delta", "signature": "c2ln"}},
        {"type": "content_block_stop", "index": 0},
        {"type": "content_block_start", "index": 1, "content_block": {"type": "text", "text": ""}},
        {"type": "content_block_delta", "index": 1, "delta": {"type": "text_delta", "text": text[:5]}},
        {"type": "content_block_delta", "index": 1, "delta": {"type": "text_delta", "text": text[5:]}},
        {"type": "content_block_stop", "index": 1},
        {"type": "message_delta", "delta": {"stop_reason": stop, "stop_sequence": None,
                                            **({"stop_details": details} if details else {})}, "usage": usage_end},
    ]
    return out + ([{"type": "message_stop"}] if end else [])


def body(effort="high"):
    return api.message_body(system="sys", content="Draw: a slime", effort=effort, max_tokens=32000)


def test_a_streamed_message_is_read_event_by_event(server):
    server.script.append(("sse", 200, {"request-id": "req_011abc"}, events()))
    reply = api.stream_message(KEY, body(), sleep=lambda s: pytest.fail("nothing to wait for"))
    assert (reply.text, reply.thinking, reply.stop_reason) == ("```pixels\n...\n```", "Planning the rows.", "end_turn")
    assert (reply.request_id, reply.message_id, reply.model, reply.mode) == ("req_011abc", "msg_01", api.MODEL, "realtime")
    assert reply.usage["input_tokens"] == 509 and reply.usage["output_tokens"] == 8294  # message_delta is cumulative
    assert api.thinking_tokens(reply.usage) == 7564
    (asked,) = server.asked
    assert asked["path"] == "/v1/messages" and asked["headers"]["x-api-key"] == KEY
    assert asked["headers"]["anthropic-version"] == "2023-06-01"
    sent = asked["body"]
    assert sent["stream"] is True and sent["model"] == "claude-opus-5-5" and sent["max_tokens"] == 32000
    assert sent["thinking"] == {"type": "adaptive", "display": "summarized"} and sent["output_config"] == {"effort": "high"}


def test_a_refused_request_is_asked_again_and_said(server, capsys):
    server.script.append(("json", 529, {}, {"type": "error", "error": {"type": "overloaded_error", "message": "Overloaded"}}))
    server.script.append(("json", 429, {"retry-after": "3"}, {"type": "error", "error": {"type": "rate_limit_error"}}))
    server.script.append(("sse", 200, {"request-id": "req_2"}, events()))
    waits = []
    reply = api.stream_message(KEY, body(), sleep=waits.append, label="pixel-draw c1-gen1")
    assert reply.request_id == "req_2" and len(server.asked) == 3
    assert waits == [8.0, 3.0]  # the doubling wait (gen.retry.backoff), then the server's retry-after
    err = capsys.readouterr().err
    assert "[pixel-draw c1-gen1] claude refused the request (529 overloaded_error); nothing was made" in err
    assert "(1 of 2)" in err and "(2 of 2)" in err


def test_refusals_past_the_retries_end_the_call(server):
    server.script += [("json", 529, {}, {"type": "error", "error": {"type": "overloaded_error"}})] * 3
    waits = []
    with pytest.raises(api.ApiError) as caught:
        api.stream_message(KEY, body(), sleep=waits.append)
    assert caught.value.status == 529 and caught.value.billed is False and len(server.asked) == 3
    assert waits == [8.0, 16.0]


# Which statuses are asked again is tests/gen/test_retry.py's table; the spend cap shows the body reaches it.
@pytest.mark.parametrize(("status", "error"), [
    (429, {"type": "rate_limit_error", "details": {"error_code": "enforced_spend_limit_reached"}}),  # the spend cap
])
def test_a_refusal_anthropic_does_not_document_as_not_taken_is_not_asked_again(server, status, error):
    """Only 429 (but the spend cap, which "fails until access resumes"), 500 and 529 are (gen.retry,
    the errors and rate-limits pages read 2026-10-13)."""
    server.script.append(("json", status, {}, {"type": "error", "error": error}))
    with pytest.raises(api.ApiError) as caught:
        api.stream_message(KEY, body(), sleep=lambda s: pytest.fail(f"a {status} is not asked again"))
    assert caught.value.status == status and len(server.asked) == 1


def test_a_batch_read_refused_on_the_providers_side_is_read_again(server):
    """A GET buys nothing: a 502 on a batch's status is asked again, where the same answer to a POST is not."""
    server.script += [("json", 502, {}, b"<html>bad gateway</html>"), ("json", 200, {}, {"id": "msgbatch_1"})]
    waits = []
    assert api.get_batch(KEY, "msgbatch_1", sleep=waits.append) == {"id": "msgbatch_1"}
    assert waits == [8.0] and [asked["method"] for asked in server.asked] == ["GET", "GET"]


def test_a_bad_request_is_not_asked_again_and_the_key_is_masked(server):
    server.script.append(("json", 400, {"request-id": "req_bad"},
                          {"type": "error", "error": {"type": "invalid_request_error", "message": f"bad key {KEY}"}}))
    with pytest.raises(api.ApiError) as caught:
        api.stream_message(KEY, body(), sleep=lambda s: pytest.fail("a 400 is not asked again"))
    line = caught.value.line
    assert line.startswith("pixel-draw: claude request failed (HTTP 400) code=invalid_request_error; not asked again: ")
    assert "Synthetic0Key1For2Tests" not in line and caught.value.request_id == "req_bad"
    assert len(server.asked) == 1


def test_a_rejected_key_names_the_variable(server):
    server.script.append(("json", 401, {}, {"type": "error", "error": {"type": "authentication_error"}}))
    with pytest.raises(api.ApiError, match=r"credential ANTHROPIC_API_KEY rejected \(HTTP 401\) code=authentication_error"):
        api.stream_message(KEY, body(), sleep=lambda s: None)


def test_an_error_event_mid_stream_is_not_asked_again(server):
    cut = events()[:8] + [{"type": "error", "error": {"type": "overloaded_error", "message": "Overloaded"}}]
    server.script.append(("sse", 200, {"request-id": "req_cut"}, cut))
    with pytest.raises(api.ApiError) as caught:
        api.stream_message(KEY, body(), sleep=lambda s: pytest.fail("never asked again"))
    error = caught.value
    assert "ended in an error code=overloaded_error" in error.line and "may be billed" in error.line
    assert error.partial.text == "```pi" and error.partial.usage["input_tokens"] == 509
    assert error.request_id == "req_cut" and len(server.asked) == 1


def test_a_stream_that_stops_before_message_stop_is_an_error(server):
    server.script.append(("sse", 200, {}, events(end=False)[:9]))
    with pytest.raises(api.ApiError, match="ended before message_stop"):
        api.stream_message(KEY, body(), sleep=lambda s: None)


def test_a_refusal_comes_back_as_a_reply_with_its_details(server):
    server.script.append(("sse", 200, {}, events(text="", stop="refusal",
                                                 details={"type": "refusal", "category": "cyber", "explanation": "x"})))
    reply = api.stream_message(KEY, body(), sleep=lambda s: None)
    assert reply.stop_reason == "refusal" and reply.stop_details["category"] == "cyber"


def test_message_batches(server):
    server.script.append(("json", 200, {}, {"id": "msgbatch_01", "processing_status": "in_progress"}))
    batch = api.submit_batch(KEY, [("c1-gen1", body()), ("c2-gen1", body("medium"))], sleep=lambda s: None)
    sent = server.asked[0]
    assert sent["path"] == "/v1/messages/batches"
    assert [r["custom_id"] for r in sent["body"]["requests"]] == ["c1-gen1", "c2-gen1"]
    assert all("stream" not in r["params"] for r in sent["body"]["requests"])
    # The results file is Anthropic's own URL; with the base pointed here it is fetched through it (`address.fetched`).
    results_url = "https://api.anthropic.com/v1/messages/batches/msgbatch_01/results"
    server.script.append(("json", 200, {}, {"id": "msgbatch_01", "processing_status": "ended", "results_url": results_url}))
    status = api.get_batch(KEY, batch["id"], sleep=lambda s: None)
    message = {"id": "msg_b1", "model": api.MODEL, "stop_reason": "end_turn", "content": [
        {"type": "thinking", "thinking": "rows", "signature": "x"}, {"type": "text", "text": "```pixels\n```"}],
        "usage": {"input_tokens": 500, "output_tokens": 9000}}
    lines = [{"custom_id": "c1-gen1", "result": {"type": "succeeded", "message": message}},
             {"custom_id": "c2-gen1", "result": {"type": "errored", "error": {"type": "error", "error": {
                 "type": "invalid_request_error", "message": "nope"}}}},
             {"custom_id": "c3-gen1", "result": {"type": "expired"}}]
    server.script.append(("raw", 200, {}, "\n".join(json.dumps(l) for l in lines).encode() + b"\n"))
    results = api.batch_results(KEY, status, sleep=lambda s: None)
    assert server.asked[-1]["path"] == ("/v1/sprite-gen/fetch?url="
                                        "https%3A%2F%2Fapi.anthropic.com%2Fv1%2Fmessages%2Fbatches%2Fmsgbatch_01%2Fresults")
    assert server.asked[-1]["headers"]["x-api-key"] == KEY
    ok = results["c1-gen1"]
    assert (ok.text, ok.thinking, ok.mode, ok.batch_id, ok.message_id) == ("```pixels\n```", "rows", "batch", "msgbatch_01", "msg_b1")
    assert isinstance(results["c2-gen1"], api.ApiError) and "code=invalid_request_error" in results["c2-gen1"].line
    assert results["c2-gen1"].billed is False and "expired" in results["c3-gen1"].line


def test_price_of_a_call():
    usage = {"input_tokens": 509, "output_tokens": 8294, "cache_creation_input_tokens": 0, "cache_read_input_tokens": 0,
             "cache_creation": {"ephemeral_5m_input_tokens": 0, "ephemeral_1h_input_tokens": 0}}
    assert api.cost_usd(usage, batch=False) == 0.167916  # 509 x $4 + 8294 x $20 per million
    assert api.cost_usd(usage, batch=True) == 0.083958
    cached = {"input_tokens": 0, "output_tokens": 0, "cache_read_input_tokens": 1_000_000,
              "cache_creation": {"ephemeral_5m_input_tokens": 1_000_000, "ephemeral_1h_input_tokens": 1_000_000}}
    assert api.cost_usd(cached, batch=False) == pytest.approx(0.20 + 5.00 + 8.00)
    unsplit = {"input_tokens": 0, "output_tokens": 0, "cache_creation_input_tokens": 1_000_000}
    assert api.cost_usd(unsplit, batch=False) == 5.00  # a write the reply does not split is a five-minute one


@pytest.mark.parametrize("usage, tokens", [
    # The reply splits its cache writes by lifetime: each at its own price, the total beside it not read.
    ({"input_tokens": 9, "output_tokens": 7, "cache_read_input_tokens": 5, "cache_creation_input_tokens": 99,
      "cache_creation": {"ephemeral_5m_input_tokens": 3, "ephemeral_1h_input_tokens": 4}},
     {"input": 9, "cache_write_5m": 3, "cache_write_1h": 4, "cache_read": 5, "output": 7}),
    # One lifetime given: the other is what the reply says of it, nothing.
    ({"input_tokens": 9, "output_tokens": 7, "cache_creation": {"ephemeral_1h_input_tokens": 4}},
     {"input": 9, "cache_write_5m": None, "cache_write_1h": 4, "cache_read": None, "output": 7}),
    # No split: every written token is a five-minute one.
    ({"input_tokens": 9, "output_tokens": 7, "cache_creation_input_tokens": 6},
     {"input": 9, "cache_write_5m": 6, "cache_write_1h": 0, "cache_read": None, "output": 7}),
    ({"input_tokens": 9, "output_tokens": 7, "cache_creation_input_tokens": 6, "cache_creation": None},
     {"input": 9, "cache_write_5m": 6, "cache_write_1h": 0, "cache_read": None, "output": 7}),
    # Counts are as the reply gave them: a missing or odd one is the caller's to read.
    ({"output_tokens": "7"}, {"input": None, "cache_write_5m": None, "cache_write_1h": 0, "cache_read": None,
                              "output": "7"}),
])
def test_billed_tokens_are_a_calls_tokens_by_the_price_each_is_billed_at(usage, tokens):
    assert api.billed_tokens(usage) == tokens
    assert list(api.billed_tokens(usage)) == list(api.PRICE_PER_MTOK[api.MODEL])


def test_the_price_of_a_call_is_its_billed_tokens_at_the_published_prices(monkeypatch):
    """`cost_usd` asks `billed_tokens` how a call's tokens split by price: one rule, one place."""
    asked = []

    def split(usage):
        asked.append(usage)
        return {"input": 0, "cache_write_5m": 0, "cache_write_1h": 1_000_000, "cache_read": 0, "output": 0}

    monkeypatch.setattr(api, "billed_tokens", split)
    usage = {"input_tokens": 1}
    assert api.cost_usd(usage, batch=False) == 8.00
    assert asked == [usage]
