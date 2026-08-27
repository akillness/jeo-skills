#!/usr/bin/env python3
"""Stream and verify a ZeroShot trace or semantic JSONL export.

The report never includes prompts, ledger message bodies, task ids, raw provider
output, or semantic event payloads. It reads one regular non-symlink file and
emits only bounded schema metadata, safe aggregate labels, issue codes, and a
digest.
"""

from __future__ import annotations

import argparse
import base64
import binascii
import hashlib
import hmac
import json
import os
import re
import stat
import sys
from collections import Counter
from pathlib import Path
from typing import Any, BinaryIO, Dict, Iterable, List, Mapping, Optional, Tuple

TRACE_SCHEMA = "zeroshot.trace.v1"
TRACE_MEDIA = "application/x-zeroshot-trace+jsonl"
SEMANTIC_SCHEMA = "zeroshot.semantic.v1"
SEMANTIC_MEDIA = "application/x-zeroshot-semantic+jsonl"
DEFAULT_MAX_LINE_BYTES = 16 * 1024 * 1024
SAFE_LABEL = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:/+-]{0,99}$")


class SummaryError(Exception):
    """A structural or safety error in the input export."""


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Summarize a ZeroShot trace or semantic JSONL export without exposing content."
    )
    parser.add_argument("file", help="Trace or semantic JSONL file")
    parser.add_argument(
        "--format", choices=("text", "json"), default="text", help="Output format"
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Exit 2 when the export is structurally valid but its footer is incomplete",
    )
    parser.add_argument(
        "--max-issue-codes",
        type=int,
        default=20,
        help="Maximum distinct footer issue codes to report (default: 20)",
    )
    parser.add_argument(
        "--max-line-bytes",
        type=int,
        default=DEFAULT_MAX_LINE_BYTES,
        help="Reject a JSONL line larger than this bound",
    )
    args = parser.parse_args(list(argv))
    if args.max_issue_codes < 0:
        parser.error("--max-issue-codes must be non-negative")
    if args.max_line_bytes < 1024:
        parser.error("--max-line-bytes must be at least 1024")
    return args


def open_regular_nofollow(path: Path) -> Tuple[BinaryIO, os.stat_result]:
    try:
        before = path.lstat()
    except OSError as exc:
        raise SummaryError(f"cannot stat input: {exc}") from exc
    if stat.S_ISLNK(before.st_mode):
        raise SummaryError("input must not be a symlink")
    if not stat.S_ISREG(before.st_mode):
        raise SummaryError("input must be a regular file")

    flags = os.O_RDONLY
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    try:
        fd = os.open(path, flags)
    except OSError as exc:
        raise SummaryError(f"cannot open input safely: {exc}") from exc
    try:
        opened = os.fstat(fd)
        if not stat.S_ISREG(opened.st_mode):
            raise SummaryError("opened input is not a regular file")
        if (before.st_dev, before.st_ino) != (opened.st_dev, opened.st_ino):
            raise SummaryError("input identity changed before open")
        return os.fdopen(fd, "rb", closefd=True), opened
    except Exception:
        os.close(fd)
        raise


def require_int(value: Any, label: str) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value < 0:
        raise SummaryError(f"{label} must be a non-negative integer")
    return value


def require_issues(value: Any) -> List[str]:
    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        raise SummaryError("footer.issues must be an array of strings")
    return value


def safe_label(value: Any) -> str:
    if isinstance(value, str) and SAFE_LABEL.fullmatch(value):
        return value
    return "other"


def issue_codes(issues: List[str], limit: int) -> Dict[str, int]:
    codes: Counter[str] = Counter()
    for issue in issues:
        raw_code = issue.rsplit(":", 1)[-1]
        codes[safe_label(raw_code)] += 1
    ordered = sorted(codes.items())[:limit]
    return dict(ordered)


def safe_counter(counter: Counter[str]) -> Dict[str, int]:
    return {key: counter[key] for key in sorted(counter)}


class ExportState:
    """Streaming state shared by the two export schemas."""

    expected_schema = ""
    expected_media = ""

    def __init__(self, max_issue_codes: int) -> None:
        self.max_issue_codes = max_issue_codes
        self.counts: Counter[str] = Counter()
        self.header: Optional[Mapping[str, Any]] = None
        self.footer: Optional[Mapping[str, Any]] = None

    def consume(self, index: int, record: Mapping[str, Any]) -> None:
        kind = record.get("record_type")
        if not isinstance(kind, str) or not kind:
            raise SummaryError(f"record {index} has no record_type")
        if safe_label(kind) == "other":
            raise SummaryError(f"record {index} has an unsafe record_type")
        self.counts[kind] += 1
        if kind == "header":
            if index != 1 or self.header is not None:
                raise SummaryError("header must be the unique first record")
            if record.get("schema_version") != self.expected_schema:
                raise SummaryError("header schema_version changed while reading")
            if record.get("media_type") != self.expected_media:
                raise SummaryError(
                    f"unexpected media_type; expected {self.expected_media}"
                )
            self.header = record
            return
        if kind == "footer":
            if self.footer is not None:
                raise SummaryError("export contains more than one footer")
            if not isinstance(record.get("complete"), bool):
                raise SummaryError("footer.complete must be boolean")
            require_issues(record.get("issues"))
            self.footer = record
            return
        self.consume_body(index, kind, record)

    def consume_body(self, index: int, kind: str, record: Mapping[str, Any]) -> None:
        raise NotImplementedError

    def common_summary(self, records: int, file_bytes: int, sha256: str) -> Dict[str, Any]:
        if self.header is None:
            raise SummaryError("first record must be header")
        if self.footer is None:
            raise SummaryError("last record must be footer")
        if self.counts["header"] != 1 or self.counts["footer"] != 1:
            raise SummaryError("export must contain exactly one header and one footer")
        issues = require_issues(self.footer.get("issues"))
        if self.footer["complete"] != (len(issues) == 0):
            raise SummaryError("footer.complete is inconsistent with footer.issues")
        return {
            "schema_version": self.expected_schema,
            "complete": self.footer["complete"],
            "records": records,
            "record_types": safe_counter(self.counts),
            "issues_count": len(issues),
            "issue_codes": issue_codes(issues, self.max_issue_codes),
            "file_bytes": file_bytes,
            "sha256": sha256,
        }

    def finish(self, records: int, file_bytes: int, sha256: str) -> Dict[str, Any]:
        raise NotImplementedError


class TraceState(ExportState):
    expected_schema = TRACE_SCHEMA
    expected_media = TRACE_MEDIA

    def __init__(self, max_issue_codes: int) -> None:
        super().__init__(max_issue_codes)
        self.task_ids: set[str] = set()
        self.chunk_task_ids: set[str] = set()
        self.output_end_ids: set[str] = set()
        self.output_hashes: Dict[str, Any] = {}
        self.output_bytes: Counter[str] = Counter()
        self.output_chunks: Counter[str] = Counter()
        self.decoded_bytes = 0
        self.statuses: Counter[str] = Counter()
        self.providers: Counter[str] = Counter()

    def consume_body(self, index: int, kind: str, record: Mapping[str, Any]) -> None:
        if kind == "task":
            task_id = record.get("task_id")
            if not isinstance(task_id, str) or not task_id:
                raise SummaryError(f"record {index} task_id must be a non-empty string")
            if task_id in self.task_ids:
                raise SummaryError(f"record {index} duplicates a task")
            self.task_ids.add(task_id)
            self.statuses[safe_label(record.get("status"))] += 1
            self.providers[safe_label(record.get("provider"))] += 1
        elif kind == "task_output_chunk":
            task_id = record.get("task_id")
            if not isinstance(task_id, str) or not task_id:
                raise SummaryError(f"record {index} output chunk has no task_id")
            if task_id in self.output_end_ids:
                raise SummaryError(f"record {index} appears after task_output_end")
            self.chunk_task_ids.add(task_id)
            if record.get("encoding") != "base64":
                raise SummaryError(f"record {index} output encoding must be base64")
            chunk_index = require_int(record.get("chunk_index"), f"record {index} chunk_index")
            if chunk_index != self.output_chunks[task_id]:
                raise SummaryError(f"record {index} chunk_index is not contiguous")
            encoded = record.get("data_base64")
            if not isinstance(encoded, str):
                raise SummaryError(f"record {index} data_base64 must be a string")
            try:
                decoded = base64.b64decode(encoded, validate=True)
            except (binascii.Error, ValueError) as exc:
                raise SummaryError(f"record {index} contains invalid base64 output") from exc
            self.output_hashes.setdefault(task_id, hashlib.sha256()).update(decoded)
            self.output_bytes[task_id] += len(decoded)
            self.output_chunks[task_id] += 1
            self.decoded_bytes += len(decoded)
        elif kind == "task_output_end":
            task_id = record.get("task_id")
            if not isinstance(task_id, str) or not task_id:
                raise SummaryError(f"record {index} output end has no task_id")
            if task_id in self.output_end_ids:
                raise SummaryError(f"record {index} duplicates task_output_end")
            self.output_end_ids.add(task_id)
            if not isinstance(record.get("available"), bool):
                raise SummaryError(f"record {index} available must be boolean")
            if not isinstance(record.get("complete"), bool):
                raise SummaryError(f"record {index} complete must be boolean")
            chunks = require_int(record.get("chunks"), f"record {index} chunks")
            if chunks != self.output_chunks[task_id]:
                raise SummaryError(f"record {index} chunk count does not match prior chunks")
            if record["available"]:
                byte_length = require_int(
                    record.get("byte_length"), f"record {index} byte_length"
                )
                if byte_length != self.output_bytes[task_id]:
                    raise SummaryError(f"record {index} byte_length does not match chunks")
                expected_hash = record.get("sha256")
                actual_hash = self.output_hashes.setdefault(
                    task_id, hashlib.sha256()
                ).hexdigest()
                if (
                    not isinstance(expected_hash, str)
                    or not re.fullmatch(r"[0-9a-f]{64}", expected_hash)
                    or not hmac.compare_digest(expected_hash, actual_hash)
                ):
                    raise SummaryError(f"record {index} output sha256 does not match chunks")
            elif (
                record.get("byte_length") is not None
                or chunks != 0
                or record.get("sha256") is not None
            ):
                raise SummaryError(f"record {index} unavailable output has inconsistent fields")

    def finish(self, records: int, file_bytes: int, sha256: str) -> Dict[str, Any]:
        summary = self.common_summary(records, file_bytes, sha256)
        assert self.footer is not None
        expected_ledger = require_int(
            self.footer.get("ledger_messages"), "footer.ledger_messages"
        )
        expected_tasks = require_int(self.footer.get("tasks"), "footer.tasks")
        expected_bytes = require_int(
            self.footer.get("task_output_bytes"), "footer.task_output_bytes"
        )
        if self.counts["ledger_message"] != expected_ledger:
            raise SummaryError("ledger message count does not match footer")
        if len(self.task_ids) != expected_tasks or self.counts["task"] != expected_tasks:
            raise SummaryError("task count does not match footer")
        if self.chunk_task_ids - self.task_ids:
            raise SummaryError("output chunks reference an unknown task")
        if self.output_end_ids != self.task_ids:
            raise SummaryError("task and task_output_end identities do not match")
        if self.counts["task_output_end"] != expected_tasks:
            raise SummaryError("task_output_end count does not match footer")
        if self.decoded_bytes != expected_bytes:
            raise SummaryError("decoded task output bytes do not match footer")
        summary.update(
            {
                "kind": "trace",
                "tasks": expected_tasks,
                "task_statuses": safe_counter(self.statuses),
                "providers": safe_counter(self.providers),
                "ledger_messages": expected_ledger,
                "task_output_bytes": expected_bytes,
            }
        )
        return summary


class SemanticState(ExportState):
    expected_schema = SEMANTIC_SCHEMA
    expected_media = SEMANTIC_MEDIA

    def __init__(self, max_issue_codes: int) -> None:
        super().__init__(max_issue_codes)
        self.task_ids: set[str] = set()
        self.task_end_ids: set[str] = set()
        self.referenced_task_ids: set[str] = set()
        self.event_types: Counter[str] = Counter()
        self.diagnostic_codes: Counter[str] = Counter()
        self.providers: Counter[str] = Counter()
        self.source_complete = 0
        self.semantic_complete = 0
        self.task_end_events = 0
        self.task_end_diagnostics = 0

    def body_task_id(self, index: int, kind: str, record: Mapping[str, Any]) -> str:
        task_id = record.get("task_id")
        if not isinstance(task_id, str) or not task_id:
            raise SummaryError(f"record {index} {kind} has no task_id")
        return task_id

    def consume_body(self, index: int, kind: str, record: Mapping[str, Any]) -> None:
        if kind == "task":
            task_id = self.body_task_id(index, kind, record)
            if task_id in self.task_ids:
                raise SummaryError(f"record {index} duplicates a task")
            self.task_ids.add(task_id)
            self.providers[safe_label(record.get("provider"))] += 1
        elif kind == "task_end":
            task_id = self.body_task_id(index, kind, record)
            if task_id in self.task_end_ids:
                raise SummaryError(f"record {index} duplicates a task_end")
            self.task_end_ids.add(task_id)
            if not isinstance(record.get("source_complete"), bool):
                raise SummaryError(f"record {index} source_complete must be boolean")
            if not isinstance(record.get("semantic_complete"), bool):
                raise SummaryError(f"record {index} semantic_complete must be boolean")
            self.source_complete += int(record["source_complete"])
            self.semantic_complete += int(record["semantic_complete"])
            self.task_end_events += require_int(
                record.get("events"), f"record {index} events"
            )
            self.task_end_diagnostics += require_int(
                record.get("diagnostics"), f"record {index} diagnostics"
            )
        elif kind == "event":
            self.referenced_task_ids.add(self.body_task_id(index, kind, record))
            event = record.get("event")
            if not isinstance(event, dict) or not isinstance(event.get("type"), str):
                raise SummaryError(f"record {index} event.type must be a string")
            self.event_types[safe_label(event["type"])] += 1
        elif kind == "diagnostic":
            self.referenced_task_ids.add(self.body_task_id(index, kind, record))
            code = record.get("code")
            if not isinstance(code, str) or not code:
                raise SummaryError(f"record {index} diagnostic.code must be a string")
            self.diagnostic_codes[safe_label(code)] += 1

    def finish(self, records: int, file_bytes: int, sha256: str) -> Dict[str, Any]:
        summary = self.common_summary(records, file_bytes, sha256)
        assert self.footer is not None
        expected_tasks = require_int(self.footer.get("tasks"), "footer.tasks")
        expected_events = require_int(self.footer.get("events"), "footer.events")
        expected_diagnostics = require_int(
            self.footer.get("diagnostics"), "footer.diagnostics"
        )
        if self.task_ids != self.task_end_ids:
            raise SummaryError("task and task_end identities do not match")
        if self.referenced_task_ids - self.task_ids:
            raise SummaryError("events or diagnostics reference an unknown task")
        if len(self.task_ids) != expected_tasks:
            raise SummaryError("task count does not match footer")
        if self.counts["task"] != expected_tasks or self.counts["task_end"] != expected_tasks:
            raise SummaryError("task record counts do not match footer")
        if self.counts["event"] != expected_events or self.task_end_events != expected_events:
            raise SummaryError("event counts do not match footer")
        if (
            self.counts["diagnostic"] != expected_diagnostics
            or self.task_end_diagnostics != expected_diagnostics
        ):
            raise SummaryError("diagnostic counts do not match footer")
        summary.update(
            {
                "kind": "semantic",
                "tasks": expected_tasks,
                "source_complete_tasks": self.source_complete,
                "semantic_complete_tasks": self.semantic_complete,
                "providers": safe_counter(self.providers),
                "events": expected_events,
                "event_types": safe_counter(self.event_types),
                "diagnostics": expected_diagnostics,
                "diagnostic_codes": safe_counter(self.diagnostic_codes),
            }
        )
        return summary


def state_from_header(record: Mapping[str, Any], max_issue_codes: int) -> ExportState:
    if record.get("record_type") != "header":
        raise SummaryError("first record must be header")
    schema = record.get("schema_version")
    if schema == TRACE_SCHEMA:
        return TraceState(max_issue_codes)
    if schema == SEMANTIC_SCHEMA:
        return SemanticState(max_issue_codes)
    raise SummaryError("unsupported or missing schema_version")


def scan_export(path: Path, max_line_bytes: int, max_issue_codes: int) -> Dict[str, Any]:
    stream, opened = open_regular_nofollow(path)
    digest = hashlib.sha256()
    preceding_digest = hashlib.sha256()
    total_bytes = 0
    records = 0
    state: Optional[ExportState] = None
    footer_seen = False
    with stream:
        while True:
            raw = stream.readline(max_line_bytes + 1)
            if not raw:
                break
            records += 1
            if len(raw) > max_line_bytes:
                raise SummaryError(f"line {records} exceeds --max-line-bytes")
            digest.update(raw)
            total_bytes += len(raw)
            try:
                text = raw.decode("utf-8")
            except UnicodeDecodeError as exc:
                raise SummaryError(f"line {records} is not valid UTF-8") from exc
            if not text.strip():
                raise SummaryError(f"line {records} is blank")
            try:
                record = json.loads(text)
            except json.JSONDecodeError as exc:
                raise SummaryError(f"line {records} is not valid JSON") from exc
            if not isinstance(record, dict):
                raise SummaryError(f"line {records} must be a JSON object")
            if footer_seen:
                raise SummaryError("footer must be the last record")
            if state is None:
                state = state_from_header(record, max_issue_codes)
            state.consume(records, record)
            if record.get("record_type") == "footer":
                footer_seen = True
            else:
                preceding_digest.update(raw)
        after = os.fstat(stream.fileno())

    if records == 0 or state is None:
        raise SummaryError("input contains no records")
    if (opened.st_dev, opened.st_ino, opened.st_size, opened.st_mtime_ns) != (
        after.st_dev,
        after.st_ino,
        after.st_size,
        after.st_mtime_ns,
    ):
        raise SummaryError("input changed while it was read")
    if state.footer is None:
        raise SummaryError("last record must be footer")
    expected_preceding = require_int(
        state.footer.get("preceding_records"), "footer.preceding_records"
    )
    if expected_preceding != records - 1:
        raise SummaryError("footer preceding_records does not match the stream")
    expected_digest = state.footer.get("records_sha256")
    if (
        not isinstance(expected_digest, str)
        or not re.fullmatch(r"[0-9a-f]{64}", expected_digest)
        or not hmac.compare_digest(expected_digest, preceding_digest.hexdigest())
    ):
        raise SummaryError("footer records_sha256 does not match preceding records")
    summary = state.finish(records, total_bytes, digest.hexdigest())
    summary["records_sha256_verified"] = True
    return summary


def print_text(summary: Mapping[str, Any]) -> None:
    scalar_keys = (
        "kind",
        "schema_version",
        "complete",
        "records",
        "tasks",
        "ledger_messages",
        "task_output_bytes",
        "source_complete_tasks",
        "semantic_complete_tasks",
        "events",
        "diagnostics",
        "issues_count",
        "file_bytes",
        "sha256",
        "records_sha256_verified",
    )
    for key in scalar_keys:
        if key in summary:
            print(f"{key}={summary[key]}")
    map_keys = (
        "record_types",
        "task_statuses",
        "providers",
        "event_types",
        "diagnostic_codes",
        "issue_codes",
    )
    for key in map_keys:
        value = summary.get(key)
        if isinstance(value, dict):
            encoded = ",".join(f"{name}:{value[name]}" for name in sorted(value))
            print(f"{key}={encoded or 'none'}")


def main(argv: Optional[Iterable[str]] = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    try:
        summary = scan_export(Path(args.file), args.max_line_bytes, args.max_issue_codes)
    except SummaryError as exc:
        print(f"INVALID {exc}", file=sys.stderr)
        return 1
    if args.format == "json":
        print(json.dumps(summary, indent=2, sort_keys=True))
    else:
        print_text(summary)
    if args.strict and not summary["complete"]:
        print("INCOMPLETE strict mode requires footer.complete=true", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
