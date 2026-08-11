#!/usr/bin/env bash
# Remove the Claude-only suppressOutput response from the known OMC 4.15.7
# PostToolUse cache entries before Codex loads them.
set -euo pipefail

if [ -z "${HOME:-}" ]; then
  printf '[jeo-skill] Codex OMC PostToolUse repair skipped: HOME is unset\n'
  exit 0
fi

python3 <<'PY'
from __future__ import annotations

import hashlib
import os
import re
import secrets
import stat

PREFIX = "[jeo-skill] Codex OMC PostToolUse repair"
COMPONENTS = (
    ".codex",
    "plugins",
    "cache",
    "omc",
    "oh-my-claudecode",
    "4.15.7",
    "scripts",
)
TARGETS = (
    "post-tool-verifier.mjs",
    "project-memory-posttool.mjs",
    "post-tool-rules-injector.mjs",
)
COMPATIBLE_DIGESTS = {
    "post-tool-verifier.mjs": "14e055cc78dc0c4169852cc25da805d8cb8ff43d4661800e5efd69bdd501d08a",
    "project-memory-posttool.mjs": "28316ea28b3bd5657c552c9f90da46303e46a6f62a1acfdc3873456fb102e9c4",
    "post-tool-rules-injector.mjs": "d585172c0c2c8ab376b73024e5a8ae53fd0f80a53fa70395028eb10b853c806b",
}
QUIET_RESPONSE = re.compile(
    r"""
    console\.log\(JSON\.stringify\(\{\s*
    continue:\s*true,\s*
    suppressOutput:\s*true\s*
    \}\)\);
    """,
    re.VERBOSE,
)
VERIFIER_QUIET_BRANCH = re.compile(
    r"(?m)^(?P<indent>[ \t]*)\} else \{\n(?P=indent)  response\.suppressOutput\s*=\s*true;\n(?P=indent)\}\n"
)


def skip(reason: str) -> None:
    print(f"{PREFIX} skipped: {reason}")
    raise SystemExit(0)


def open_cache_directory() -> int:
    home = os.environ.get("HOME")
    if not home:
        skip("HOME is unset")
    flags = os.O_RDONLY | os.O_DIRECTORY
    no_follow = getattr(os, "O_NOFOLLOW", 0)
    try:
        directory_fd = os.open(home, flags)
    except OSError:
        skip("HOME is unavailable")

    try:
        for component in COMPONENTS:
            try:
                next_fd = os.open(component, flags | no_follow, dir_fd=directory_fd)
            except FileNotFoundError:
                skip("OMC 4.15.7 cache is absent")
            except OSError:
                skip(f"unsafe cache directory {component}")
            os.close(directory_fd)
            directory_fd = next_fd
        return directory_fd
    except BaseException:
        os.close(directory_fd)
        raise


def read_regular_target(directory_fd: int, filename: str) -> tuple[str, os.stat_result]:
    try:
        descriptor = os.open(
            filename,
            os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0),
            dir_fd=directory_fd,
        )
    except FileNotFoundError:
        skip(f"missing {filename}")
    except OSError:
        skip(f"unsafe target {filename}")

    with os.fdopen(descriptor, "r", encoding="utf-8") as source_file:
        metadata = os.fstat(source_file.fileno())
        if not stat.S_ISREG(metadata.st_mode):
            skip(f"unsafe target {filename}")
        return source_file.read(), metadata




def digest(source: str) -> str:
    return hashlib.sha256(source.encode("utf-8")).hexdigest()


def remove_quiet_response(match: re.Match[str]) -> str:
    return re.sub(r",\s*suppressOutput\s*:\s*true", "", match.group(0), count=1)


def remove_verifier_quiet_branch(match: re.Match[str]) -> str:
    return f"{match.group('indent')}}}\n"


def transform_verifier(source: str) -> str | None:
    quiet_responses = list(QUIET_RESPONSE.finditer(source))
    quiet_branches = list(VERIFIER_QUIET_BRANCH.finditer(source))
    if (
        source.count("suppressOutput") != 2
        or len(quiet_responses) != 1
        or len(quiet_branches) != 1
    ):
        return None
    updated = VERIFIER_QUIET_BRANCH.sub(remove_verifier_quiet_branch, source, count=1)
    return QUIET_RESPONSE.sub(remove_quiet_response, updated, count=1)


def transform_quiet_responses(source: str, *, expected_count: int) -> str | None:
    matches = list(QUIET_RESPONSE.finditer(source))
    if source.count("suppressOutput") != expected_count or len(matches) != expected_count:
        return None
    return QUIET_RESPONSE.sub(remove_quiet_response, source)


def transform(filename: str, source: str) -> str | None:
    expected_digest = COMPATIBLE_DIGESTS[filename]
    if digest(source) == expected_digest:
        return source

    if filename == "post-tool-verifier.mjs":
        updated = transform_verifier(source)
    elif filename == "project-memory-posttool.mjs":
        updated = transform_quiet_responses(source, expected_count=3)
    else:
        updated = transform_quiet_responses(source, expected_count=6)

    if updated is None or digest(updated) != expected_digest:
        return None
    return updated


def assert_unchanged_target(
    directory_fd: int, filename: str, expected: os.stat_result
) -> None:
    try:
        metadata = os.stat(filename, dir_fd=directory_fd, follow_symlinks=False)
    except OSError:
        skip(f"target changed during repair: {filename}")
    if (
        not stat.S_ISREG(metadata.st_mode)
        or metadata.st_dev != expected.st_dev
        or metadata.st_ino != expected.st_ino
    ):
        skip(f"target changed during repair: {filename}")


def replace_target(directory_fd: int, filename: str, content: str, mode: int) -> None:
    temporary = f".{filename}.jeo-{secrets.token_hex(12)}"
    try:
        descriptor = os.open(
            temporary,
            os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0),
            mode,
            dir_fd=directory_fd,
        )
        with os.fdopen(descriptor, "w", encoding="utf-8") as target_file:
            target_file.write(content)
            target_file.flush()
            os.fsync(target_file.fileno())
        os.chmod(temporary, mode, dir_fd=directory_fd)
        os.replace(
            temporary,
            filename,
            src_dir_fd=directory_fd,
            dst_dir_fd=directory_fd,
        )
    finally:
        try:
            os.unlink(temporary, dir_fd=directory_fd)
        except FileNotFoundError:
            pass


cache_fd = open_cache_directory()
try:
    sources: dict[str, tuple[str, os.stat_result]] = {
        filename: read_regular_target(cache_fd, filename) for filename in TARGETS
    }
    updates: dict[str, tuple[str, os.stat_result]] = {}
    for filename, (source, metadata) in sources.items():
        updated = transform(filename, source)
        if updated is None:
            skip(f"unrecognized {filename}")
        if updated != source:
            updates[filename] = (updated, metadata)

    if not updates:
        print(f"{PREFIX} hooks are already compatible")
        raise SystemExit(0)

    for filename, (_, metadata) in updates.items():
        assert_unchanged_target(cache_fd, filename, metadata)
    for filename, (updated, metadata) in updates.items():
        replace_target(cache_fd, filename, updated, stat.S_IMODE(metadata.st_mode))
finally:
    os.close(cache_fd)

print(f"{PREFIX} removed Codex-incompatible suppressOutput from OMC PostToolUse hooks")
PY
