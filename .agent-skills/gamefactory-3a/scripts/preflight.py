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
    fd = None
    try:
        flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
        fd = os.open(path.parts[0], flags)
        for part in path.parts[1:]:
            child = os.open(part, flags, dir_fd=fd)
            os.close(fd)
            fd = child
        return fd
    except OSError as error:
        if fd is not None:
            os.close(fd)
        if error.errno == errno.ELOOP:
            raise CheckError("symlink_components_forbidden") from None
        if error.errno == errno.ENOTDIR:
            raise CheckError("source_root_must_be_a_directory") from None
        raise CheckError("source_root_unsafe_or_unreadable") from None


def read_pinned_file(root_fd, parts):
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
    dir_fd = root_fd
    owned = []
    try:
        for part in parts[:-1]:
            child = os.open(part, flags, dir_fd=dir_fd)
            owned.append(child)
            dir_fd = child
        file_flags = os.O_RDONLY | os.O_NOFOLLOW
        if hasattr(os, "O_NONBLOCK"):
            file_flags |= os.O_NONBLOCK
        fd = os.open(parts[-1], file_flags, dir_fd=dir_fd)
        owned.append(fd)
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode):
            raise CheckError("pinned_entry_not_a_regular_file")
        if info.st_size > MAX_BYTES:
            raise CheckError("file_exceeds_size_limit")
        content = bytearray()
        while len(content) < info.st_size:
            chunk = os.read(fd, min(65536, info.st_size - len(content)))
            if not chunk:
                break
            content.extend(chunk)
        if len(content) != info.st_size:
            raise CheckError("file_size_changed_during_read")
        return hashlib.sha256(content).hexdigest()
    finally:
        for descriptor in reversed(owned):
            os.close(descriptor)


def safe_json_output(data):
    try:
        body = json.dumps(data, indent=2, ensure_ascii=False)
        return body + "\n"
    except (TypeError, ValueError):
        raise OutputError("cannot_serialize_json_output") from None


def load_manifest(path):
    try:
        raw = path.read_bytes()
    except OSError:
        raise CheckError("source_manifest_missing_or_unreadable") from None
    if len(raw) > MAX_MANIFEST_BYTES:
        raise CheckError("source_manifest_too_large")
    try:
        manifest = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise CheckError("source_manifest_malformed") from None
    if not isinstance(manifest, dict) or manifest.get("schema_version") != 1:
        raise CheckError("unsupported_manifest_schema")
    skill = manifest.get("skill")
    repo = manifest.get("repository")
    commit = manifest.get("commit")
    files = manifest.get("files")
    tools = manifest.get("tools")
    if not (isinstance(skill, str) and NAME.match(skill)):
        raise CheckError("invalid_manifest_skill")
    if not (isinstance(repo, str) and REPO.match(repo)):
        raise CheckError("invalid_manifest_repository")
    if not (isinstance(commit, str) and SHA.match(commit)):
        raise CheckError("invalid_manifest_commit")
    if not isinstance(files, list) or not files:
        raise CheckError("manifest_files_empty")
    seen_files = set()
    cleaned_files = []
    for item in files:
        if not isinstance(item, dict):
            raise CheckError("invalid_manifest_file_entry")
        target = item.get("path")
        expected_hash = item.get("sha256")
        url = item.get("url")
        parts = public_path(target)
        if target in seen_files:
            raise CheckError("duplicate_file_in_manifest")
        seen_files.add(target)
        if not (isinstance(expected_hash, str) and HASH.match(expected_hash)):
            raise CheckError("invalid_manifest_file_hash")
        quoted_path = quote(target, safe="/")
        expected_url = f"https://github.com/{repo}/blob/{commit}/{quoted_path}"
        if url != expected_url:
            raise CheckError("manifest_url_mismatch")
        cleaned_files.append({"path": target, "parts": parts, "sha256": expected_hash})
    if not isinstance(tools, list) or not tools:
        raise CheckError("manifest_tools_empty")
    seen_tools = set()
    cleaned_tools = []
    for item in tools:
        if not isinstance(item, dict):
            raise CheckError("invalid_manifest_tool_entry")
        cmd = item.get("name")
        purpose = item.get("purpose")
        if not (isinstance(cmd, str) and COMMAND.match(cmd)):
            raise CheckError("invalid_manifest_tool_name")
        if cmd in seen_tools:
            raise CheckError("duplicate_tool_in_manifest")
        seen_tools.add(cmd)
        if not isinstance(purpose, str) or not purpose.strip():
            raise CheckError("invalid_manifest_tool_purpose")
        cleaned_tools.append({"name": cmd, "purpose": purpose})
    return {
        "skill": skill,
        "repository": repo,
        "commit": commit,
        "license": manifest.get("license", "Apache-2.0"),
        "files": cleaned_files,
        "tools": cleaned_tools,
    }


def inspect_source(repo_root, manifest):
    root_fd = directory_fd(repo_root)
    results = []
    all_matched = True
    try:
        for entry in manifest["files"]:
            try:
                actual = read_pinned_file(root_fd, entry["parts"])
                matched = actual == entry["sha256"]
                results.append({"path": entry["path"], "status": "matched" if matched else "mismatched", "sha256": actual})
                if not matched:
                    all_matched = False
            except OSError as error:
                status_label = "missing" if error.errno == errno.ENOENT else "unreadable"
                results.append({"path": entry["path"], "status": status_label, "sha256": None})
                all_matched = False
            except CheckError as error:
                results.append({"path": entry["path"], "status": error.code, "sha256": None})
                all_matched = False
    finally:
        os.close(root_fd)
    return results, all_matched


def inventory_tools(tools):
    discovered = []
    for entry in tools:
        resolved = shutil.which(entry["name"])
        discovered.append({"name": entry["name"], "purpose": entry["purpose"], "available": resolved is not None, "path": resolved})
    return discovered


def main():
    parser = Parser(description="Offline inventory and selected-file verification.")
    parser.add_argument("--repo", help="Absolute nonsymlink path to source repository checkout.")
    parser.add_argument("--json", action="store_true", help="Print result as structured JSON.")
    args = parser.parse_args()

    script_path = Path(__file__).resolve()
    manifest_path = script_path.parents[1] / "references" / "source.json"
    manifest = load_manifest(manifest_path)

    tools_report = inventory_tools(manifest["tools"])
    report = {
        "schema_version": 1,
        "skill": manifest["skill"],
        "repository": manifest["repository"],
        "pinned_commit": manifest["commit"],
        "license": manifest["license"],
        "tools": tools_report,
        "runtime_verified": False,
        "whole_revision_verified": False,
        "tool_versions_verified": False,
        "source_comparison": None,
    }

    if args.repo:
        repo_path = Path(args.repo)
        if not repo_path.is_absolute():
            raise CheckError("absolute_repo_path_required")
        file_results, all_matched = inspect_source(repo_path, manifest)
        report["source_comparison"] = {
            "root": str(repo_path),
            "all_matched": all_matched,
            "checked_files": len(file_results),
            "results": file_results,
        }
        if not all_matched:
            if args.json:
                sys.stdout.write(safe_json_output(report))
            else:
                print("Source verification failed: not all pinned files matched.")
            sys.exit(1)

    if args.json:
        sys.stdout.write(safe_json_output(report))
    else:
        print(f"Skill: {manifest['skill']}")
        print(f"Repository: {manifest['repository']} @ {manifest['commit']}")
        for t in tools_report:
            status = "FOUND" if t["available"] else "MISSING"
            print(f"  Tool {t['name']:<12}: {status} ({t['purpose']})")
        if report["source_comparison"]:
            print(f"Source comparison: all {report['source_comparison']['checked_files']} files matched.")
    sys.exit(0)


if __name__ == "__main__":
    try:
        main()
    except CheckError as err:
        sys.stderr.write(f"Preflight error: {err.code}\n")
        sys.exit(err.exit_code)
    except OutputError as err:
        sys.stderr.write(f"Output error: {err}\n")
        sys.exit(2)
