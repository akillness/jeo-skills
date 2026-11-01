#!/usr/bin/env python3
"""Offline inventory and selected-file pin check; never run upstream code."""
from __future__ import annotations

import argparse
import errno
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import sys
from urllib.parse import quote

MAX_BYTES = 8 * 1024 * 1024
MAX_MANIFEST_BYTES = 128 * 1024
NAME = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*\Z")
REPO = re.compile(r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?/[A-Za-z0-9_.-]{1,100}\Z")
COMMAND = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.+-]{0,63}\Z")
SHA = re.compile(r"[0-9a-f]{40}\Z")
HASH = re.compile(r"[0-9a-f]{64}\Z")
BLOCKED = {".git", ".ssh", ".aws", ".azure", ".config", ".netrc", ".npmrc", ".pypirc", ".git-credentials", "id_rsa", "id_ed25519"}
SENSITIVE_STEMS = {"credential", "credentials", "secret", "secrets", "password", "passwords", "token", "tokens", "api_key", "api-key", "apikey"}


class CheckError(Exception):
    def __init__(self, code: str, exit_code: int = 2):
        self.code, self.exit_code = code, exit_code


class OutputError(Exception):
    pass


class Parser(argparse.ArgumentParser):
    def error(self, message):
        raise CheckError("invalid_arguments")


def public_path(value):
    if not isinstance(value, str) or not value or len(value) > 240 or "\\" in value:
        raise CheckError("invalid_public_path")
    path = PurePosixPath(value)
    if not path.parts or path.is_absolute() or str(path) != value or any(p in (".", "..") for p in path.parts):
        raise CheckError("invalid_public_path")
    for part in path.parts:
        lower = part.lower()
        if lower in BLOCKED or lower.split(".", 1)[0] in SENSITIVE_STEMS or lower.startswith(".env") or lower.endswith((".pem", ".key", ".p12", ".pfx")):
            raise CheckError("sensitive_path_not_allowed")
        if not all(32 < ord(c) < 127 for c in part):
            raise CheckError("invalid_public_path")
    return path.parts


def directory_fd(absolute):
    """Open every directory from the filesystem root without following links."""
    path = Path(absolute)
    if not path.is_absolute() or ".." in path.parts:
        raise CheckError("absolute_nonsymlink_root_required")
    if not hasattr(os, "O_NOFOLLOW") or os.open not in os.supports_dir_fd:
        raise CheckError("secure_posix_traversal_unavailable")
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
    fd = os.open(path.anchor, flags)
    try:
        for part in path.parts[1:]:
            child = os.open(part, flags, dir_fd=fd)
            os.close(fd)
            fd = child
        return fd
    except OSError as exc:
        os.close(fd)
        if exc.errno == errno.ENOENT:
            raise CheckError("source_root_missing", 1) from None
        raise CheckError("source_root_unsafe_or_unreadable") from None


def read_public(root_fd, parts, limit):
    """Bounded regular-file read relative to an already trusted directory fd."""
    fd = os.dup(root_fd)
    try:
        for part in parts[:-1]:
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = child
        file_fd = os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=fd)
        try:
            info = os.fstat(file_fd)
            if not stat.S_ISREG(info.st_mode) or info.st_size > limit:
                raise CheckError("public_file_not_regular_or_too_large")
            chunks, total = [], 0
            while True:
                chunk = os.read(file_fd, min(65536, limit + 1 - total))
                if not chunk:
                    return b"".join(chunks)
                chunks.append(chunk)
                total += len(chunk)
                if total > limit:
                    raise CheckError("public_file_too_large")
        finally:
            os.close(file_fd)
    except OSError as exc:
        code = "public_file_missing" if exc.errno == errno.ENOENT else "public_file_unsafe_or_unreadable"
        raise CheckError(code, 1 if exc.errno == errno.ENOENT else 2) from None
    finally:
        os.close(fd)


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise CheckError("duplicate_manifest_key")
        result[key] = value
    return result


def load_manifest():
    root = Path(__file__).absolute().parent.parent
    fd = directory_fd(root)
    try:
        raw = read_public(fd, ("references", "source.json"), MAX_MANIFEST_BYTES)
    finally:
        os.close(fd)
    try:
        data = json.loads(raw, object_pairs_hook=unique_object)
    except (ValueError, UnicodeError, RecursionError):
        raise CheckError("invalid_source_manifest") from None
    if not isinstance(data, dict) or type(data.get("schema_version")) is not int or data["schema_version"] != 1:
        raise CheckError("invalid_source_manifest")
    if not isinstance(data.get("skill"), str) or not NAME.fullmatch(data["skill"]) or data["skill"] != root.name:
        raise CheckError("manifest_skill_mismatch")
    if not isinstance(data.get("repository"), str) or not REPO.fullmatch(data["repository"]) or data["repository"].split("/")[1] in (".", ".."):
        raise CheckError("invalid_repository")
    if not isinstance(data.get("commit"), str) or not SHA.fullmatch(data["commit"]):
        raise CheckError("invalid_source_pin")
    files, tools = data.get("files"), data.get("tools")
    if not isinstance(files, list) or not 1 <= len(files) <= 12 or not isinstance(tools, list) or len(tools) > 16:
        raise CheckError("invalid_manifest_inventory")
    seen = set()
    for item in files:
        if not isinstance(item, dict):
            raise CheckError("invalid_source_entry")
        public_path(item.get("path"))
        if item["path"] in seen:
            raise CheckError("duplicate_source_path")
        seen.add(item["path"])
        if not isinstance(item.get("sha256"), str) or not HASH.fullmatch(item["sha256"]):
            raise CheckError("invalid_source_hash")
        expected_url = f'https://github.com/{data["repository"]}/blob/{data["commit"]}/{quote(item["path"], safe="/")}'
        if item.get("url") != expected_url:
            raise CheckError("source_url_pin_mismatch")
    for tool in tools:
        if not isinstance(tool, dict) or not isinstance(tool.get("name"), str) or not COMMAND.fullmatch(tool["name"]):
            raise CheckError("invalid_tool_name")
    return data


def report(result, as_json):
    try:
        if as_json:
            print(json.dumps(result, sort_keys=True))
        else:
            print(f'{result["status"]}: offline checks only; runtime_verified=false')
            for check in result["checks"]:
                print(f'{check["name"]}: {check["status"]}')
            for warning in result.get("warnings", []):
                print(f"warning: {warning}")
        sys.stdout.flush()
    except OSError:
        raise OutputError from None


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    result = {"scope": "offline-selected-files", "status": "error", "runtime_verified": False,
              "source_checked": False, "whole_revision_verified": False, "tool_versions_verified": False,
              "checks": [], "warnings": []}
    as_json = "--json" in argv
    parser = Parser(description=__doc__, allow_abbrev=False)
    parser.add_argument("--repo", help="explicit absolute nonsymlink source directory; selected files only")
    parser.add_argument("--json", action="store_true", help="emit a structured report without local path values")
    try:
        args = parser.parse_args(argv)
        data = load_manifest()
        result.update(skill=data["skill"], repository=data["repository"], expected_commit=data["commit"])
        for tool in data["tools"]:
            present = shutil.which(tool["name"]) is not None
            result["checks"].append({"name": "tool:" + tool["name"], "status": "present" if present else "missing"})
        result["warnings"].append("Tool discovery is not a version, installation, service, or runtime test.")
        exit_code = 0
        if args.repo is None:
            result["warnings"].append("No source directory supplied; no upstream files were inspected.")
        else:
            root_fd = directory_fd(args.repo)
            try:
                for item in data["files"]:
                    try:
                        raw = read_public(root_fd, public_path(item["path"]), MAX_BYTES)
                        match = hashlib.sha256(raw).hexdigest() == item["sha256"]
                        check = {"name": "file:" + item["path"], "status": "match" if match else "mismatch"}
                        if not match:
                            exit_code = max(exit_code, 1)
                    except CheckError as exc:
                        check = {"name": "file:" + item["path"], "status": "blocked", "code": exc.code}
                        exit_code = max(exit_code, exc.exit_code)
                    result["checks"].append(check)
                result["source_checked"] = True
            finally:
                os.close(root_fd)
            result["warnings"].append("Only listed public file bytes were compared; Git HEAD and unlisted files were not verified.")
        result["status"] = "ok" if exit_code == 0 else "blocked" if exit_code == 1 else "error"
        report(result, args.json)
        return exit_code
    except CheckError as exc:
        result["status"] = "blocked" if exc.exit_code == 1 else "error"
        result["checks"].append({"name": "input", "status": "blocked", "code": exc.code})
        report(result, as_json)
        return exc.exit_code
    except OSError:
        result["checks"].append({"name": "filesystem", "status": "blocked", "code": "filesystem_unavailable"})
        report(result, as_json)
        return 2


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except OutputError:
        # A closed output stream cannot receive a report; avoid traceback/flush leaks.
        os._exit(2)
