# SPDX-License-Identifier: Apache-2.0
"""Safe run-dir IO shared by the pipeline scripts.

Two concerns live together here because they answer the same question — "what
happens when two sprite-gen processes touch the same run dir at once?" (for
example Claude Code and the Codex app driving the skill in parallel):

- `acquire_run_dir_lock()` — single-writer lock per run dir. SKILL.md forbids
  two workers writing one character folder; this makes the rule enforced
  instead of documentation-only. Writers (extract / compose / export / unpack,
  and the webview's compose/export subprocesses through them) fail loudly with
  the holder's pid instead of silently interleaving output files. The lock is
  the entry `.sprite-gen.lock` itself: a link or a folder at that name is refused,
  never followed, read or removed. A process removes only the very entry it made,
  or judged stale to reclaim, and only while it still holds it; making, reclaiming
  and removing the entry queue on a kernel lock on the run dir itself (per host,
  where the file system locks folders). A lock belongs to the process that took
  it: a child it forks neither removes nor holds it (docs/run-contract.md §7
  names the boundaries — a C-fork child, a signal-handler fork child that returns
  into the interrupted code, an exception inside the fork hooks).
- `atomic_write_text()` / `atomic_save_image()` — temp file in the target dir
  + `os.replace`, so a concurrent reader never observes a half-written
  atlas/manifest/frame. `atomic_write_set()` extends the same mechanism to a
  set of files that only makes sense published together (a sheet, its manifest,
  and the report naming it).
- `same_folder()` / `inside_folder()` / `follow_path()` / `refuse_overlap()` /
  `new_stage()` — a writer never writes into, moves or deletes its inputs: inputs
  and outputs are compared by real path and file identity before anything is
  made — an input by every entry its path looks up, not only by where it ends —
  and a staging or working folder is a new one of the run's own, the only thing
  beside the output a run deletes.

`curation.json` is intentionally NOT under this pipeline write lock: the curation
surface writes it with the same atomic replace, and the compose scripts read one
consistent snapshot of it, so a curation edit never blocks on a running
compose/extract. Concurrent curation edits on one run dir remain last-write-wins
by design; the lock guards pipeline outputs, not human edit sessions. The curation
*write* IS serialized against a `--force` re-import publish through the separate
publish rwlock (`read_guard`/`publish_guard`), and the server rejects a curation
POST whose echoed run generation (`runRevision`) no longer matches — so a stale edit
can't apply old selections/transforms to a freshly re-imported run's frames.
"""

from __future__ import annotations

import atexit
import contextlib
import errno
import json
import os
import secrets
import stat
import sys
import tempfile
import threading
import time
from collections.abc import Callable, Collection, Mapping
from pathlib import Path, PurePath
from typing import NamedTuple

from PIL import Image

try:  # Unix advisory locks. Windows uses LockFileEx below.
    import fcntl
except ImportError:  # pragma: no cover - non-Unix
    fcntl = None


# Publish isolation requires a cross-process reader/writer lock. POSIX flock
# supplies shared/exclusive modes; Windows msvcrt.locking is exclusive-only and
# would silently serialize readers, so the native LockFileEx mapping is used.
# Both guards read this one availability switch and fail loud when it is absent.
_LOCK_IMPL: str | None = "fcntl" if fcntl is not None else None

if fcntl is None and os.name == "nt":  # pragma: no cover - Windows-only backend
    try:
        import ctypes
        import msvcrt
        from ctypes import wintypes

        _LOCKFILE_EXCLUSIVE_LOCK = 0x00000002
        _WIN_LOCK_BYTES = 1

        class _OVERLAPPED(ctypes.Structure):
            _fields_ = [
                ("Internal", wintypes.LPVOID),
                ("InternalHigh", wintypes.LPVOID),
                ("Offset", wintypes.DWORD),
                ("OffsetHigh", wintypes.DWORD),
                ("hEvent", wintypes.HANDLE),
            ]

        _kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        _LockFileEx = _kernel32.LockFileEx
        _LockFileEx.restype = wintypes.BOOL
        _LockFileEx.argtypes = [
            wintypes.HANDLE,
            wintypes.DWORD,
            wintypes.DWORD,
            wintypes.DWORD,
            wintypes.DWORD,
            ctypes.POINTER(_OVERLAPPED),
        ]
        _UnlockFileEx = _kernel32.UnlockFileEx
        _UnlockFileEx.restype = wintypes.BOOL
        _UnlockFileEx.argtypes = [
            wintypes.HANDLE,
            wintypes.DWORD,
            wintypes.DWORD,
            wintypes.DWORD,
            ctypes.POINTER(_OVERLAPPED),
        ]
        # LockFileEx 는 폴더를 잠그지 못하고 os.open 은 폴더를 열지 못한다 — 런 폴더 락 항목의 줄(`_entry_guard`)은
        # 폴더의 장치·파일 번호로 이름 붙인 커널 뮤텍스로 선다
        _CreateMutexW = _kernel32.CreateMutexW
        _CreateMutexW.restype = wintypes.HANDLE
        _CreateMutexW.argtypes = [wintypes.LPVOID, wintypes.BOOL, wintypes.LPCWSTR]
        _WaitForSingleObject = _kernel32.WaitForSingleObject
        _WaitForSingleObject.restype = wintypes.DWORD
        _WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
        _ReleaseMutex = _kernel32.ReleaseMutex
        _ReleaseMutex.restype = wintypes.BOOL
        _ReleaseMutex.argtypes = [wintypes.HANDLE]
        _CloseHandle = _kernel32.CloseHandle
        _CloseHandle.restype = wintypes.BOOL
        _CloseHandle.argtypes = [wintypes.HANDLE]
        _WAIT_INFINITE, _WAIT_OWNED = 0xFFFFFFFF, (0x00000000, 0x00000080)  # WAIT_OBJECT_0, WAIT_ABANDONED
        # 락 주인이 살았는지(`_pid_alive`)는 그 프로세스를 SYNCHRONIZE 로 열어 끝났는지 기다리지 않고 본다 — 신호를 보내지 않는다
        _OpenProcess = _kernel32.OpenProcess
        _OpenProcess.restype = wintypes.HANDLE
        _OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
        _SYNCHRONIZE, _WAIT_SIGNALED, _WAIT_TIMEOUT = 0x00100000, 0x00000000, 0x00000102
        _ERROR_ACCESS_DENIED, _ERROR_INVALID_PARAMETER = 5, 87
        # 락 항목은 이름에 놓인 링크를 따라가지 않고 만든다(`_make_entry`) — 이름 자체를 여는 FILE_FLAG_OPEN_REPARSE_POINT
        _CreateFileW = _kernel32.CreateFileW
        _CreateFileW.restype = wintypes.HANDLE
        _CreateFileW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, wintypes.LPVOID, wintypes.DWORD,
                                 wintypes.DWORD, wintypes.HANDLE]
        _GENERIC_WRITE, _FILE_SHARE_READ_WRITE, _CREATE_NEW = 0x40000000, 0x00000001 | 0x00000002, 1
        _FILE_ATTRIBUTE_NORMAL, _FILE_FLAG_OPEN_REPARSE_POINT = 0x00000080, 0x00200000
        _INVALID_HANDLE_VALUE = wintypes.HANDLE(-1).value
        _LOCK_IMPL = "LockFileEx"
    except (ImportError, OSError, AttributeError):
        _LOCK_IMPL = None


def _lock_fd(fd: int, *, exclusive: bool) -> None:
    """Block until this handle owns the requested shared/exclusive lock."""
    if fcntl is not None:
        fcntl.flock(fd, fcntl.LOCK_EX if exclusive else fcntl.LOCK_SH)
        return
    overlapped = _OVERLAPPED()
    flags = _LOCKFILE_EXCLUSIVE_LOCK if exclusive else 0
    handle = wintypes.HANDLE(msvcrt.get_osfhandle(fd))
    if not _LockFileEx(handle, flags, 0, _WIN_LOCK_BYTES, 0, ctypes.byref(overlapped)):
        raise ctypes.WinError(ctypes.get_last_error())


def _unlock_fd(fd: int) -> None:
    if fcntl is not None:
        fcntl.flock(fd, fcntl.LOCK_UN)
        return
    overlapped = _OVERLAPPED()
    handle = wintypes.HANDLE(msvcrt.get_osfhandle(fd))
    if not _UnlockFileEx(handle, 0, _WIN_LOCK_BYTES, 0, ctypes.byref(overlapped)):
        raise ctypes.WinError(ctypes.get_last_error())

LOCK_FILENAME = ".sprite-gen.lock"
# Sidecar (beside the run dir) reader/writer coordination lock for the publish swap.
# It lives outside the run dir so it survives content swaps and is never itself
# published; a run dir named `foo` uses `.foo.sg-rwlock` in the parent.
RWLOCK_SUFFIX = ".sg-rwlock"
# reclaim threshold for locks whose holder pid cannot be verified
# (unreadable lock file, or a writer on another host of a shared volume)
STALE_LOCK_SECONDS = 15 * 60
# a lock entry that keeps changing under the run dir's kernel lock is not one sprite-gen made, and a fork that lands
# every time that kernel lock is opened is not an ordinary fork
_LOCK_ROUNDS = 100


class _LockEntry(NamedTuple):
    """락 이름에 있던 바로 그 항목 — 장치·inode 와 내용(읽을 수 없으면 None). 지운 inode 번호를 곧 다시 쓰는 파일
    시스템이 있어 번호만으로는 같은 항목인지 모른다."""

    dev: int
    ino: int
    content: bytes | None


class _Held(NamedTuple):
    """쥔 락 하나 — 만든 항목, 그것을 잡은 프로세스(fork 자식은 이 기록을 물려받아도 그 프로세스가 아니다), 그 잡기의 종료 처리."""

    entry: _LockEntry
    pid: int
    at_exit: Callable[[], None]


# Lock paths held -> the hold. Re-entry from the same process (for example a long-lived
# MCP server invoking prepare -> extract -> compose against one run dir) must succeed;
# the single-writer rule is against other processes, a forked child included.
_HELD_LOCKS: dict[Path, _Held] = {}

# 런 폴더 커널 락(`_entry_guard`)에 이 프로세스가 연 폴더 fd — 파이썬 fork 훅이 도는 fork 자식이 닫을 사본. 순서 둘이 이 기록을
# 지킨다: 열고 나서 기록하고 빼고 나서 닫으니 기록은 늘 열린 fd 의 부분집합이고(자식이 닫는 번호는 부모가 연 그 fd 의 사본이다),
# 풀고 나서 빼니 기록에서 빠지는 fd 는 늘 풀린 것이다(그 뒤 기록 밖 사본을 가진 자식이 생겨도 잠긴 설명이 아니다).
_GUARD_FDS: set[int] = set()
# 이 프로세스의 파이썬 fork — before 훅을 지난 횟수와, 지났지만 부모에서 아직 돌아오지 않은 fork 의 진행 중 표시 (pid, 스레드).
# fd 를 열고 기록하는 사이에 fork 시스템 호출이 끼면 자식은 기록 밖 사본을 갖는다. 그런 fork 는 열기 전에 읽은 횟수를 바꾸거나(그
# 뒤에 before 훅을 지났다 — 같은 스레드의 시그널 처리기도), 열기 전에 이미 훅을 지나 돌아오지 않은 채였다(runio 의 훅 뒤에 도는
# 다른 before 훅이나 임포트 락을 기다리며 GIL 을 놓은 다른 스레드). `_entry_guard` 는 뒤의 것이 돌아오기를 기다려 열고, 앞의
# 것이면 잠그지 않고 새로 연다. 두 순서가 이 둘 중 하나로 반드시 보이게 한다 — 훅은 표시를 넣고 나서 횟수를 올리고
# (`_before_fork`), `_entry_guard` 는 횟수를 읽고 나서 표시를 본다. 뮤텍스가 없어 같은 스레드의 처리기가 fork 해도 막히지
# 않고, 훅을 거치지 않는 C fork 자식이 잡힌 채 물려받을 것도 없다.
_FORKS = 0
_FORKING: list[tuple[int, int]] = []
# 다른 스레드의 fork 가 훅을 지나고 이만큼 돌아오지 않으면 보통 fork 가 아니다 — 매달리지 않고 크게 실패한다
_FORK_WAIT_SECONDS = 10.0


def _before_fork() -> None:
    global _FORKS
    # 표시 → 횟수: 표시를 넣고 나서 횟수를 올린다. 올라간 횟수를 읽은 `_entry_guard` 는 이 표시도 본다 — 순서가 뒤집히면 이 훅이
    # 횟수를 올린 뒤 표시를 넣기 전에 `_entry_guard` 가 그 올라간 횟수를 읽고 표시를 보아(아직 없다) fd 를 열 수 있고, 이 fork 가
    # 기록 전의 그 fd 를 복사해도 읽은 횟수에 이미 들어 있고 표시는 늦어 어느 쪽으로도 보이지 않는다. 표시를 넣은 뒤 시그널 처리기의
    # 예외가 이 훅을 끊어도(CPython 은 훅의 예외를 알리기만 하고 fork 를 잇는다) 횟수는 올린다
    mark = (os.getpid(), threading.get_ident())
    try:
        _FORKING.append(mark)
    finally:
        _FORKS += 1


def _after_fork_in_parent() -> None:
    try:
        _FORKING.remove((os.getpid(), threading.get_ident()))
    except ValueError:  # 처리기에서 돌아와 부모의 fork 를 이어 간 자식에는 그 표시가 없다
        pass


def _forking_elsewhere() -> bool:
    """이 프로세스의 다른 스레드에 before 훅을 지났지만 부모에서 아직 돌아오지 않은 파이썬 fork 가 있나 — 그 fork 시스템 호출은
    지금 여는 fd 를 기록되기 전에 복사할 수 있다. 이 스레드의 것은 셈하지 않는다: 이 스레드가 이 코드를 도는 동안 그 fork 는
    일어나지 않는다(이 스레드의 시그널 처리기가 그 fork 의 훅 사이에서 락을 잡는 자리). 다른 pid 의 것은 훅을 거치지 않은 C fork
    자식이 물려받은 부모의 기록이다."""
    me, here = os.getpid(), threading.get_ident()
    return any(pid == me and thread != here for pid, thread in list(_FORKING))


def _after_fork_in_child() -> None:
    """fork 자식은 부모의 런 폴더 락을 하나도 쥐지 않는다 — 물려받은 보유 기록과 그 종료 처리를 버리고, 커널 락 fd 사본을
    닫는다. 닫기는 이 프로세스의 참조만 놓는다: 부모가 쥔 flock 은 그대로다(LOCK_UN 이면 부모의 것까지 풀린다). 부모의 다른
    스레드가 하던 fork 는 이 프로세스에 없다."""
    _FORKING.clear()
    for fd in _GUARD_FDS:
        with contextlib.suppress(OSError):
            os.close(fd)
    _GUARD_FDS.clear()
    for held in _HELD_LOCKS.values():
        atexit.unregister(held.at_exit)
    _HELD_LOCKS.clear()


if hasattr(os, "register_at_fork"):  # Unix — Windows 에는 fork 가 없다
    os.register_at_fork(before=_before_fork, after_in_parent=_after_fork_in_parent, after_in_child=_after_fork_in_child)


def relative_posix(path: PurePath, start: PurePath) -> str:
    """Return a manifest-safe relative path with POSIX separators."""

    return path.relative_to(start).as_posix()


def _identity(path: Path) -> tuple[int, int] | None:
    """`path` 를 열 때 닿는 항목의 장치·inode — 링크는 따라가고, 아직 없으면(`Path.exists` 가 없다고 하면) None."""
    if not path.exists():
        return None
    found = path.stat()
    return found.st_dev, found.st_ino


def _ancestors(path: Path, identity: Callable[[Path], tuple[int, int] | None] = _identity) -> set[tuple[int, int]]:
    """`path` 의 조상(`path.parents`) 가운데 있는 것들의 장치·inode."""
    return {found for parent in path.parents if (found := identity(parent)) is not None}


def same_folder(a: Path, b: Path) -> bool:
    """같은 폴더(또는 파일)인가 — 장치·inode 로 본다. 링크로 돌아 들어와도, 대소문자를 가리지 않는 볼륨에서 철자만
    달라도 같다. 둘 중 하나가 아직 없으면 같지 않다."""
    found = _identity(a)
    return found is not None and found == _identity(b)


def inside_folder(path: Path, folder: Path) -> bool:
    """`path` 가 `folder` 안에 드는가 — 조상 가운데 `folder` 와 같은 폴더가 있다. `path` 는 아직 없어도 된다."""
    found = _identity(folder)
    return found is not None and found in _ancestors(path)


_MAX_LINKS = 40  # 이보다 많은 링크를 지나면 고리다 (리눅스 커널의 한도, macOS 는 32)
# Windows 디렉터리 junction 의 표시 — os.lstat 은 3.8 부터 symlink 와 junction 을 따라가지 않고 그 자체를 열고,
# os.readlink 는 3.8 부터 junction 이 가리키는 경로를 돌려준다. 그래서 junction 도 링크로 따라간다.
_JUNCTION = getattr(stat, "IO_REPARSE_TAG_MOUNT_POINT", None)


def _is_link(entry: os.stat_result) -> bool:
    return stat.S_ISLNK(entry.st_mode) or (
        _JUNCTION is not None and getattr(entry, "st_reparse_tag", None) == _JUNCTION)


def follow_path(path: Path) -> tuple[list[Path], Path]:
    """`path` 를 운영체제가 열 때처럼 한 칸씩 따라간다. 찾아본 항목 전부(링크와 폴더, 각각 실경로 부모 + 이름 —
    뒤의 `..` 로 다시 나오는 폴더도)와 닿은 실경로를 돌려준다. 받은 경로는 절대화만 한다(resolve·normpath 로 `..`
    를 글자째 접으면 링크 뒤의 `..` 가 다른 폴더를 가리킨다). 상대 링크는 링크가 놓인 실폴더에서 읽고, `..` 는
    지금까지 닿은 실폴더의 부모로 간다. 없는 칸에서 멈추면 남은 칸을 붙여 돌려준다 — 읽는 쪽이 그 자리에서
    실패한다. 링크를 `_MAX_LINKS` 번 넘게 지나면 고리라 OSError(ELOOP)."""
    path = Path(path)
    if not path.is_absolute():
        path = Path.cwd() / path
    reached = Path(path.anchor)
    todo = list(reversed(path.parts[1:]))
    looked: list[Path] = []
    links = 0
    while todo:
        name = todo.pop()
        if name in ("", "."):
            continue
        if name == "..":
            reached = reached.parent
            continue
        entry = reached / name
        looked.append(entry)
        try:
            found = os.lstat(entry)
        except OSError:
            return looked, entry.joinpath(*reversed(todo))
        if not _is_link(found):
            reached = entry
            continue
        links += 1
        if links > _MAX_LINKS:
            raise OSError(errno.ELOOP, os.strerror(errno.ELOOP), str(path))
        target = Path(os.readlink(entry))
        if target.is_absolute():
            reached = Path(target.anchor)
            todo.extend(reversed(target.parts[1:]))
        else:
            todo.extend(reversed(target.parts))
    return looked, reached


def follow_input(flag: str, given: Path, *, verb: str | None = None) -> tuple[list[Path], Path]:
    """`follow_path` of an input named `flag`: a path that cannot be followed (a link loop) is refused by name
    (SystemExit, prefixed with `verb`) before anything is made."""
    try:
        return follow_path(given)
    except OSError as exc:
        raise SystemExit(f"{verb + ': ' if verb else ''}{flag} cannot be followed: {exc.filename}: {exc.strerror}") from None


def refuse_overlap(inputs: Mapping[str, Path | None], outputs: Mapping[str, Path], *, holds: Collection[str] = (),
                   replaces: str = "the run replaces it", verb: str | None = None) -> None:
    """입력을 쓰거나 옮기거나 지울 배치를 만들기 전에 거절한다(SystemExit, 문구 앞에 `verb`). `inputs` 는 이름 → 받은
    경로(None 은 건너뜀), `outputs` 는 이름 → 이 실행이 갈아 끼우거나 지우는 항목(파일이나 폴더 — 출력이 더해지기만
    하는 폴더는 넣지 않는다). 입력마다 `follow_path` 로 따라가, 닿은 실경로가 출력과 같거나(덮어씀), 출력 안에
    들거나(지움), 찾아본 항목 가운데 하나가 출력 안에 들면(그 항목이 지워져 길이 끊기거나 링크 너머가 지워짐)
    거절한다. `holds` 에 이름이 든 출력은 입력 안에 들어도 거절한다(입력 안에 씀). 출력은 받은 이름 그대로 연다 —
    그 자리에 이미 있는 링크는 따라간 곳이 출력이다. 실경로와 장치·inode 로 보므로 링크와 대소문자를 가리지 않는
    볼륨의 다른 철자도 같은 항목이다(`same_folder`, `inside_folder` 의 비교). 한 번의 호출 안에서 이미 본 항목은
    다시 재지 않고, 항목마다 장치·inode 도 한 번만 찾는다(찾은 입력이 많아도 공통 조상과 출력은 한 번). 따라갈 수
    없는 입력(링크 고리)은 이름을 대며 거절한다."""
    say = f"{verb}: " if verb else ""
    looked_at: set[Path] = set()
    known: dict[Path, tuple[int, int] | None] = {}

    def identity(entry: Path) -> tuple[int, int] | None:  # nothing is made or moved before the call ends
        if entry not in known:
            known[entry] = _identity(entry)
        return known[entry]

    places = {out: identity(place) for out, place in outputs.items()}
    held = {out: _ancestors(outputs[out], identity) for out in holds if out in outputs}
    for flag, given in inputs.items():
        if given is None:
            continue
        looked, path = follow_input(flag, Path(given).expanduser(), verb=verb)
        fresh = [entry for entry in looked if entry not in looked_at]
        looked_at.update(fresh)
        found, above = identity(path), _ancestors(path, identity)
        passed = [(entry, _ancestors(entry, identity)) for entry in fresh]
        for out, place in outputs.items():
            at = places[out]
            if at is not None and at == found:
                kind = "folder" if path.is_dir() else "file"
                raise SystemExit(f"{say}{flag} and {out} are the same {kind}: {path} (an input is never overwritten)")
            if at is not None and at in above:
                raise SystemExit(f"{say}{flag} lies inside {out}: {path} ({replaces}, never an input)")
            through = next((entry for entry, over in passed if at is not None and at in over), None)
            if through is not None:
                raise SystemExit(f"{say}{flag} goes through {through}, inside {out} ({replaces}, never an input)")
            if out in held and found is not None and found in held[out]:
                raise SystemExit(f"{say}{out} lies inside {flag}: {place} (a run is never written into its input)")


def new_stage(out: Path, suffix: str) -> Path:
    """`out` 옆에 이 실행만의 빈 임시 폴더 `.<out>.<pid>-<random><suffix>` — 같은 볼륨이라 다 쓴 뒤 rename 으로
    내놓는다. 이름이 이미 있으면(입력이든 다른 실행의 것이든) 그 폴더는 건드리지 않고 다른 이름을 고른다.
    mkdtemp(0700)가 아니라 mkdir 이라 내놓은 폴더가 보통 폴더 권한을 갖는다."""
    for _ in range(100):
        stage = out.parent / f".{out.name}.{os.getpid()}-{secrets.token_hex(4)}{suffix}"
        try:
            stage.mkdir()
        except FileExistsError:
            continue
        return stage
    raise SystemExit(f"{out.parent}: no free name for a staging folder beside {out.name}")


def _pid_alive(pid: int) -> bool:
    """락 주인 `pid` 가 이 호스트에 살아 있나 — 그 프로세스에 아무것도 보내지 않고 본다. 있는지 알 수 없는 것을 죽었다고 읽지
    않는다(거짓 '죽음'은 산 writer 의 락을 거둔다). POSIX 는 신호 0: 보내지 않고 찾기와 권한만 보며, 남의 프로세스(EPERM)는 살아
    있다. Windows 의 os.kill 은 신호 0 을 CTRL_C_EVENT 로 GenerateConsoleCtrlEvent 에 넘긴다 — 같은 콘솔의 프로세스들에
    Ctrl+C 가 가고(pid 0 이면 늘, 같은 콘솔의 다른 산 pid 면 늦게라도), 끝난 pid 에는 답 대신 OSError(WinError 87) 다. 그래서
    쓰지 않고, 그 프로세스를 SYNCHRONIZE 로만 열어 끝났는지(신호 상태) 기다리지 않고 본다 — 없는 pid 는 열리지 않고
    (ERROR_INVALID_PARAMETER) 죽은 것, 열 권한이 없는 것(시스템·남의 프로세스, ERROR_ACCESS_DENIED)은 살아 있는 것, 끝났지만
    핸들이 남은 프로세스는 열려도 신호 상태라 죽은 것이다(docs/run-contract.md §7)."""
    if os.name == "nt":  # pragma: no cover - Windows-only backend
        if not 0 < pid <= 0xFFFFFFFF:  # Windows pid 는 DWORD 이고 0 은 유휴 프로세스다 — ctypes 는 그 밖의 값을 잘라 다른 pid 로 넘긴다
            return False
        handle = _OpenProcess(_SYNCHRONIZE, False, pid)
        if not handle:
            error = ctypes.get_last_error()
            if error == _ERROR_INVALID_PARAMETER:
                return False
            if error == _ERROR_ACCESS_DENIED:
                return True
            raise ctypes.WinError(error)
        try:
            state = _WaitForSingleObject(handle, 0)
            if state not in (_WAIT_SIGNALED, _WAIT_TIMEOUT):
                raise ctypes.WinError(ctypes.get_last_error())
            return state == _WAIT_TIMEOUT
        finally:
            _CloseHandle(handle)
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


@contextlib.contextmanager
def _entry_guard(folder: Path):
    """런 폴더 자체에 거는 커널 락 — 락 항목을 만들고 지우는 일(만들기·회수·해제·종료 처리)이 모두 이 아래서 줄을 서서,
    판정과 지우기 사이에 다른 sprite-gen 이 그 이름에 만들거나 지우지 못한다. 폴더에 아무것도 만들지 않고, 쥔 프로세스가
    죽으면 커널이 놓는다. 줄은 한 호스트 안의 프로세스들이 선다(주인이 살았는지도 이 호스트의 pid 로 본다).
    macOS·리눅스는 폴더 fd 의 flock(`_lock_fd`) — 그 fd 는 `_GUARD_FDS` 에 있어 파이썬 fork 훅이 도는 fork 자식은 사본을
    닫는다. 다른 스레드의 파이썬 fork 가 진행 중이면 돌아올 때까지 열지 않고(`_FORK_WAIT_SECONDS` 를 넘으면 SystemExit),
    열고 기록하는 사이에 파이썬 fork 가 끼었을 수 있으면 그 설명은 잠그지 않고 새로 열고(`_LOCK_ROUNDS` 를 넘으면 SystemExit),
    기록에서 빼기 전에 한 번 더 푼다 — 기록 밖 사본을 가진 자식이 있어도 그 설명은 잠긴 적이 없거나 이미 풀렸다. 그래서 쥔
    프로세스가 그 안에서 죽거나 예외로 나가도 자식이 커널 락을 이어 쥐지 않는다. 경계 셋(docs/run-contract.md §7): 훅을
    거치지 않는 C fork 자식은 끝나거나 exec 할 때까지 사본을 갖고, 시그널 처리기에서 fork 한 뒤 처리기에서 돌아와 끊긴 코드를
    잇는 자식은 부모와 가려지지 않으며, 시그널 처리기의 예외가 runio 의 fork 훅을 끊으면 그 fork 는 보이지 않거나 진행 중
    표시가 남는다. Windows 는 폴더의 장치·파일 번호로 이름 붙인 커널 뮤텍스
    (`Global\\` 이름이라 로그온 세션이 달라도 한 줄 — LockFileEx 는 폴더를 잠그지 못한다). Windows 길은 아직 그 기기에서
    재지 않았다."""
    if fcntl is not None:
        for _ in range(_LOCK_ROUNDS):
            # 횟수 읽기 → 표시 보기: 횟수를 읽고 나서 진행 중 표시를 본다. 읽은 뒤에 훅을 지난 fork 는 횟수가 바뀌어 보이고, 읽기
            # 전에 훅을 지나 아직 돌아오지 않은 fork 는 표시로 보인다 — 순서가 뒤집히면 표시를 본 뒤 횟수를 읽기 전에 훅을 지난
            # fork 가 둘 다에 걸리지 않는다
            forks = _FORKS
            deadline = time.monotonic() + _FORK_WAIT_SECONDS
            while _forking_elsewhere():  # 그 fork 가 돌아올 때까지 — 지금 열면 기록되기 전의 사본이 자식에게 갈 수 있다
                if time.monotonic() > deadline:
                    raise SystemExit(
                        f"run dir lock in {folder}: another thread's fork is still marked in progress after "
                        f"{_FORK_WAIT_SECONDS:g}s, and sprite-gen will not open its kernel lock on the run dir while a fork "
                        f"may copy it\n  a fork of this process has not returned, or an exception cut its fork hook short; "
                        f"stop that before writing this run dir")
                time.sleep(0.001)  # GIL 을 놓고 기다린다 — 그 fork 의 스레드가 돌아야 돌아온다
            fd = os.open(folder, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
            _GUARD_FDS.add(fd)
            if _FORKS == forks:  # 열고 기록하는 사이에 fork 가 없었다 — 이 설명의 사본은 모두 기록돼 자식이 닫는다
                break
            _GUARD_FDS.discard(fd)  # 그 사이 fork 의 자식이 기록 밖 사본을 가졌을 수 있다 — 그 설명은 잠그지 않고 새로 연다
            os.close(fd)
        else:
            raise SystemExit(f"run dir lock in {folder}: a fork landed every time sprite-gen opened its kernel lock on the "
                             f"run dir\n  something keeps forking this process; stop that before writing this run dir")
        try:
            try:
                _lock_fd(fd, exclusive=True)
            except OSError as exc:  # 폴더 잠금을 받지 않는 파일 시스템
                raise OSError(exc.errno, f"the file system refuses a lock on the run dir ({exc.strerror}), which sprite-gen "
                                         f"needs to make or remove {LOCK_FILENAME}", str(folder)) from exc
            try:
                yield
            finally:
                _unlock_fd(fd)
        finally:
            with contextlib.suppress(OSError):  # 위의 풀기를 예외(Ctrl-C)가 건너뛰었어도 기록에서 빼기 전에 푼다
                _unlock_fd(fd)
            _GUARD_FDS.discard(fd)
            os.close(fd)
    elif _LOCK_IMPL == "LockFileEx":  # pragma: no cover - Windows-only backend
        found = os.stat(folder)
        mutex = _CreateMutexW(None, False, f"Global\\sprite-gen-run-dir-{found.st_dev:x}-{found.st_ino:x}")
        if not mutex:
            raise ctypes.WinError(ctypes.get_last_error())
        try:
            if _WaitForSingleObject(mutex, _WAIT_INFINITE) not in _WAIT_OWNED:
                raise ctypes.WinError(ctypes.get_last_error())
            try:
                yield
            finally:
                _ReleaseMutex(mutex)
        finally:
            _CloseHandle(mutex)
    else:
        raise SystemExit(f"run dir lock in {folder}: no kernel lock on this platform to queue its making and removal")


# 락 항목을 읽을 때: 이름의 링크를 따라가지 않고(O_NOFOLLOW — Windows 에는 없어 fstat 대조가 대신 잡는다), 그 자리에 들어선
# FIFO 에 막히지 않고(O_NONBLOCK), 바이트 그대로(O_BINARY, Windows).
_READ_ENTRY = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0) | getattr(os, "O_BINARY", 0)


def _read_entry(lock_path: Path) -> tuple[_LockEntry | None, float]:
    """락 이름에 있는 항목을 따라가지 않고 읽는다 — (그 항목, 바뀐 시각). 일반 파일이 아니면(링크·폴더) 열지 않고 None.
    lstat 한 그 항목을 열어 fstat 가 같은지 보고 그 fd 에서만 읽는다. 그 사이 이름에 다른 것이 들어섰으면 본 항목은 이미
    없으니, 이름에 아무것도 없을 때처럼 FileNotFoundError."""
    seen = os.lstat(lock_path)
    if not stat.S_ISREG(seen.st_mode):
        return None, seen.st_mtime
    try:
        fd = os.open(lock_path, _READ_ENTRY)
    except PermissionError:  # 읽을 수 없는 락 — 장치·inode 와 바뀐 시각으로만 본다
        return _LockEntry(seen.st_dev, seen.st_ino, None), seen.st_mtime
    except OSError as exc:
        if exc.errno not in (errno.ENOENT, errno.ELOOP, errno.EMLINK):  # 없어졌다, 링크가 들어섰다(BSD 는 EMLINK)
            raise
        raise FileNotFoundError(errno.ENOENT, "the lock entry changed while it was read", str(lock_path)) from exc
    try:
        got = os.fstat(fd)
        if (got.st_dev, got.st_ino) != (seen.st_dev, seen.st_ino):
            raise FileNotFoundError(errno.ENOENT, "the lock entry changed while it was read", str(lock_path))
        chunks = []
        while chunk := os.read(fd, 65536):
            chunks.append(chunk)
    finally:
        os.close(fd)
    return _LockEntry(got.st_dev, got.st_ino, b"".join(chunks)), got.st_mtime


def _make_entry(lock_path: Path) -> int:
    """락 이름에 새 일반 파일을 만들어 쓰기 fd 를 돌려준다 — 이름에 무엇이 있으면(링크·폴더도) 따라가지도 만들지도 않고
    FileExistsError. POSIX 는 O_CREAT|O_EXCL 이고 open(2) 은 이름의 링크를 따라가지 않는다. Windows 의 os.open 은 같은 플래그를
    CreateFileW 의 CREATE_NEW 로 넘기는데, 없는 이름에 닿는 링크는 따라가 그 자리에 파일을 만들고, 대상 글자를 읽을 수 없는
    링크(`/` 로 적힌 대상)는 EINVAL, 폴더는 EACCES 로 끝난다. 그래서 CreateFileW 를 FILE_FLAG_OPEN_REPARSE_POINT 로 불러 이름
    자체를 연다 — 링크는 어떤 것이든 ERROR_FILE_EXISTS 다. 폴더(폴더 링크·junction 도)는 그래도 ERROR_ACCESS_DENIED 라, 그
    이름에 일반 파일이 아닌 항목이 정말 있을 때만 FileExistsError 로 읽고 아니면(런 폴더에 쓸 수 없다) 그 오류 그대로다. 핸들은
    os.open 의 fd 처럼 상속되지 않고(보안 속성 없음) 쓰기만 되며, 바이너리 fd 로 넘긴다. 넘기지 못하면 핸들을 닫고 그 오류다 —
    만든 빈 항목은 os.fstat 이 실패할 때처럼 남는다(주인을 확인할 수 없는 락)."""
    if os.name == "nt":  # pragma: no cover - Windows-only backend
        handle = _CreateFileW(str(lock_path), _GENERIC_WRITE, _FILE_SHARE_READ_WRITE, None, _CREATE_NEW,
                              _FILE_ATTRIBUTE_NORMAL | _FILE_FLAG_OPEN_REPARSE_POINT, None)
        if handle == _INVALID_HANDLE_VALUE:
            error = ctypes.get_last_error()
            failed = OSError(0, ctypes.FormatError(error), str(lock_path), error)  # winerror 로 errno 와 하위 클래스가 정해진다
            if error == _ERROR_ACCESS_DENIED:
                try:
                    taken = not stat.S_ISREG(os.lstat(lock_path).st_mode)
                except OSError:
                    taken = False
                if taken:
                    raise FileExistsError(errno.EEXIST, "the lock name is not a file (a folder or a link)",
                                          str(lock_path)) from failed
            raise failed
        try:
            return msvcrt.open_osfhandle(handle, 0)  # O_TEXT 가 없으면 바이너리, 접근은 핸들의 것(쓰기)
        except BaseException:
            _CloseHandle(handle)
            raise
    return os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY | getattr(os, "O_BINARY", 0))


def _remove_if_same(lock_path: Path, entry: _LockEntry, by: int) -> bool:
    """락 이름에 있는 것이 `entry` — 프로세스 `by` 가 만들었거나 회수하려고 판정한 바로 그 항목(일반 파일, 같은 장치·inode,
    같은 내용)이고 `by` 가 지금 이 프로세스일 때만 지운다. 부모의 기록을 물려받은 fork 자식은(파이썬 fork 훅을 거치지 않는
    C fork 자식도) 같은 항목을 보아도 지우지 않는다. 락 항목을 지우는 길은 이것 하나다(해제·종료 처리·회수). 부르는 쪽이
    `_entry_guard` 를 쥐고 있어, 판정과 지우기 사이에 다른 sprite-gen 이 그 이름에 만들거나 지우지 못한다."""
    if by != os.getpid():
        return False
    try:
        if _read_entry(lock_path)[0] != entry:
            return False
        os.unlink(lock_path)
    except FileNotFoundError:
        return False
    return True


def _held_here(lock_path: Path) -> _Held | None:
    """이 프로세스가 쥔 `lock_path` 의 보유 — 기록이 다른 프로세스의 것이면(파이썬 fork 훅을 거치지 않은 C fork 자식이 부모의
    기록을 물려받았다) 쥔 것이 아니다."""
    held = _HELD_LOCKS.get(lock_path)
    return held if held is not None and held.pid == os.getpid() else None


def _let_go(lock_path: Path, at_exit: Callable[[], None]) -> None:
    """쥔 락을 놓는다 — `at_exit` 를 단 그 잡기를 이 프로세스가 아직 쥐고 있을 때만(명시 해제 뒤 남은 종료 처리, 다시 잡은
    뒤의 옛 종료 처리, fork 자식이 물려받은 부모의 종료 처리는 아무것도 하지 않는다). `_HELD_LOCKS` 에서 빼고, 이름에 있는
    것이 만든 그 항목일 때만 지운다. 지우지 못해도(런 폴더가 사라졌거나 폴더 잠금을 받지 않거나 다른 것이 들어섰다) 놓은 것이다.
    런 폴더 커널 락을 잡지 못하면(`_entry_guard` 의 SystemExit — 다른 스레드의 fork 가 돌아오지 않음 — 나 그 사이 Ctrl-C) 뺀 것을
    되돌려 쥔 그대로 두고 그 예외를 낸다 — 다시 놓거나 끝날 때 놓는다."""
    held = _held_here(lock_path)
    if held is None or held.at_exit is not at_exit:
        return
    if _HELD_LOCKS.pop(lock_path, None) is not held:  # 같은 프로세스의 다른 스레드가 먼저 놓았다
        return
    entered = False
    try:
        with _entry_guard(lock_path.parent):
            entered = True
            _remove_if_same(lock_path, held.entry, held.pid)
    except OSError:
        pass
    except BaseException:
        if not entered:
            _HELD_LOCKS.setdefault(lock_path, held)
        raise


def acquire_run_dir_lock(run_dir: Path, owner: str) -> Path:
    """Take the single-writer lock for `run_dir`, released automatically at exit.

    Create-exclusive lock file (`.sprite-gen.lock`) holding owner + pid. When
    another live process holds it, exit loudly instead of interleaving writes.
    A lock whose pid is dead — or unreadable and older than STALE_LOCK_SECONDS —
    is reclaimed, so a killed run never wedges the run dir.

    The lock is the entry at that name in the run dir itself, never resolved:
    a link or a folder there is refused before anything is read, and is never
    followed or removed — reclaiming it would delete whatever it points to. A
    stale lock is judged from a descriptor opened without following the name,
    and reclaiming removes only the entry so judged.

    Making and reclaiming the entry queue on a kernel lock on the run dir itself
    (`_entry_guard`), as release does: a writer on this host waits while another
    judges, removes or makes the entry, so a late reclaimer never removes a lock
    taken meanwhile.

    Re-entry from the same process is allowed: the MCP server / freeze binary
    runs many pipeline steps in one interpreter against the same run dir, and a
    writer must never block itself. The same process is the pid that took the
    lock: a child it forks is another writer, refused by the parent's live lock,
    and never re-enters, releases or removes it — where os.register_at_fork
    exists the child forgets its parent's holds and exit cleanups at the fork,
    and a child forked by C code that skips Python's fork hooks still has a pid
    of its own. docs/run-contract.md §7 names where this stops: a C-fork child
    keeps the run dir's kernel lock until it ends or execs, a child forked in a
    signal handler that returns into this code cannot be told from the parent,
    and an exception a signal handler raises inside runio's fork hooks can hide
    that fork or leave it marked in progress.

    While another thread's Python fork is in progress the kernel lock is not
    opened (a fork could copy it before it is recorded): taking or releasing the
    lock waits for that fork and exits loudly (SystemExit) if it is still marked
    in progress after ten seconds — taking leaves nothing behind, and releasing
    keeps the lock held, so it can be released again or at exit.

    Release runs via atexit (normal return, SystemExit, KeyboardInterrupt) while
    this process still holds the lock, and removes only the entry it made (same
    device, inode and content). A SIGKILL'd holder is covered by the dead-pid
    reclaim above.
    """
    lock_path = Path(run_dir).resolve() / LOCK_FILENAME
    if _held_here(lock_path) is not None:
        return lock_path
    me = os.getpid()
    with _entry_guard(lock_path.parent):
        for _ in range(_LOCK_ROUNDS):
            try:  # never follows a link at the name (`_make_entry`)
                fd = _make_entry(lock_path)
                break
            except FileExistsError:
                pass
            try:
                found, changed = _read_entry(lock_path)
            except FileNotFoundError:
                continue  # it went away while we looked; retry the create
            if found is None:
                raise SystemExit(
                    f"run dir lock {lock_path} is not a lock file (a link or a folder)\n"
                    f"  sprite-gen never follows or removes it; move it away if no sprite-gen process is running"
                )
            holder: dict = {}
            with contextlib.suppress(TypeError, ValueError):  # unreadable (None) or not JSON: holder unknown
                holder = json.loads(found.content)
            pid = holder.get("pid") if isinstance(holder, dict) else None
            if isinstance(pid, int) and _pid_alive(pid):
                raise SystemExit(
                    f"run dir is locked by {holder.get('owner', 'unknown')} (pid {pid}): {run_dir}\n"
                    f"  another sprite-gen process is writing this run dir; wait for it to finish,\n"
                    f"  or delete {lock_path} if you are sure that process is gone"
                )
            age = time.time() - changed
            if not (isinstance(pid, int) or age > STALE_LOCK_SECONDS):
                raise SystemExit(
                    f"run dir has a lock whose holder cannot be verified ({age:.0f}s old): {lock_path}\n"
                    f"  delete the lock file if no sprite-gen process is running"
                )
            # dead pid, or unverifiable and old: reclaim the entry judged here, then retry the exclusive create
            _remove_if_same(lock_path, found, me)
        else:
            raise SystemExit(
                f"run dir lock {lock_path} kept changing while sprite-gen read it\n"
                f"  something other than sprite-gen is replacing it; stop that before writing this run dir"
            )
        content = json.dumps({"owner": owner, "pid": me, "started": time.time()}).encode("utf-8")
        made, written = None, 0
        try:
            made = os.fstat(fd)
            while written < len(content):
                written += os.write(fd, content[written:])
        except BaseException:
            os.close(fd)
            if made is not None:  # 다 쓰지 못했다(디스크가 찼다) — 만들다 만 그 항목을 거둔다, 남으면 다음 writer 를 막는다
                with contextlib.suppress(OSError):
                    _remove_if_same(lock_path, _LockEntry(made.st_dev, made.st_ino, content[:written]), me)
            raise
        os.close(fd)

    def at_exit() -> None:
        _let_go(lock_path, at_exit)

    _HELD_LOCKS[lock_path] = _Held(_LockEntry(made.st_dev, made.st_ino, content), me, at_exit)
    atexit.register(at_exit)
    return lock_path


def release_run_dir_lock(run_dir: Path) -> None:
    """이 프로세스가 쥔 run-dir 락을 작업 완료 시점에 명시 해제한다.

    atexit 해제만 있으면 장수 프로세스(테스트 러너·MCP 서버·큐레이션 서버)가
    한 번의 in-process 추출 뒤 락을 영구 보유해, heal_run 의 서브프로세스
    재추출이 산 pid 락에 막힌다. 락은 세션 리스가 아니라 작업 단위 writer-writer
    상호배제고, 원자성은 스테이징 통짜 스왑이 보장하므로 작업이 끝나면 놓는 게
    맞다. 놓고 나서 그 잡기의 종료 처리를 거둔다 — 놓은 뒤 이름에 들어선 다음 writer 의
    락이나 링크를 이 프로세스가 끝날 때 지우지 않는다. 지우는 것은 이 프로세스가 만든
    바로 그 항목뿐이다(`_remove_if_same`). 쥐지 않은 락이면 — fork 자식에게는 부모의 락도 —
    아무것도 하지 않는다. 런 폴더 커널 락을 잡지 못해 크게 실패하면(다른 스레드의 fork 가
    진행 중 표시를 남긴 채다) 쥔 그대로라 다시 놓을 수 있고 종료 처리도 남는다."""
    lock_path = Path(run_dir).resolve() / LOCK_FILENAME
    held = _held_here(lock_path)
    if held is None:
        return
    _let_go(lock_path, held.at_exit)
    atexit.unregister(held.at_exit)


def _rwlock_path(run_dir: Path) -> Path:
    run_dir = Path(run_dir).resolve()
    return run_dir.parent / f".{run_dir.name}{RWLOCK_SUFFIX}"


class RWLockUnavailable(RuntimeError):
    """Publish reader/writer isolation could not be established on this platform.

    Raised (fail-loud) instead of degrading the guard to a no-op. A no-op guard would be a
    *failover that changes canonical truth*: a reader could observe a half-published run
    (old/new file mix or a missing file) mid-swap. The isolation contract permits an
    availability failover only when it stays observable AND does not change canonical truth
    — a silent old-or-new-abandoning no-op fails the second half, so we refuse to proceed
    without isolation rather than serve a partial run.
    """


def _rwlock_unavailable(run_dir: Path, why: str) -> "RWLockUnavailable":
    return RWLockUnavailable(
        f"publish reader/writer isolation unavailable ({why}) for {run_dir}: cannot "
        f"guarantee a reader the complete old-or-new snapshot across a --force re-import / "
        f"re-extract swap. Refusing to proceed rather than expose a partial run (a failover "
        f"must not change canonical truth). Locks use fcntl on macOS/Linux and LockFileEx "
        f"on Windows; ensure the run dir's parent is writable for the "
        f".<name>{RWLOCK_SUFFIX} sidecar."
    )


@contextlib.contextmanager
def read_guard(run_dir: Path):
    """Shared (reader) lock on the run dir's publish rwlock. While a publish holds the
    exclusive lock for its content swap, a reader inside this guard blocks — so it never
    observes a half-published run (no old/new file mix, no missing file). If the platform
    has no shared/exclusive backend or the sidecar cannot be created, the guard **fails
    loud** (`RWLockUnavailable`) rather than degrading to a no-op."""
    if _LOCK_IMPL is None:
        raise _rwlock_unavailable(run_dir, "no shared/exclusive file-lock backend")
    try:
        fd = os.open(_rwlock_path(run_dir), os.O_RDWR | os.O_CREAT, 0o644)
    except OSError as exc:
        raise _rwlock_unavailable(run_dir, f"cannot create rwlock sidecar: {exc}") from exc
    try:
        _lock_fd(fd, exclusive=False)
        try:
            yield
        finally:
            _unlock_fd(fd)
    finally:
        os.close(fd)


@contextlib.contextmanager
def publish_guard(run_dir: Path):
    """Exclusive (writer) lock on the run dir's publish rwlock — held only around the
    content swap so concurrent readers block briefly and never see a partial publish.
    Same sidecar file as read_guard. **Fails loud** (`RWLockUnavailable`, see read_guard)
    if no lock backend is available or the sidecar can't be created — never a no-op, because a
    no-op publish would swap canonical frames while readers are unguarded."""
    if _LOCK_IMPL is None:
        raise _rwlock_unavailable(run_dir, "no shared/exclusive file-lock backend")
    try:
        fd = os.open(_rwlock_path(run_dir), os.O_RDWR | os.O_CREAT, 0o644)
    except OSError as exc:
        raise _rwlock_unavailable(run_dir, f"cannot create rwlock sidecar: {exc}") from exc
    try:
        _lock_fd(fd, exclusive=True)
        try:
            yield
        finally:
            _unlock_fd(fd)
    finally:
        os.close(fd)


def _atomic_replace(target: Path, write_payload) -> None:
    fd, tmp_name = tempfile.mkstemp(dir=str(target.parent), prefix=f".{target.name}.", suffix=".tmp")
    try:
        write_payload(fd, tmp_name)
        os.replace(tmp_name, target)
    except BaseException:
        if os.path.exists(tmp_name):
            os.unlink(tmp_name)
        raise


def atomic_write_text(target: Path, text: str) -> None:
    """Write text via temp file + os.replace so readers never see a torn file."""

    def payload(fd: int, _tmp_name: str) -> None:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(text)

    _atomic_replace(target, payload)


def atomic_save_image(image: Image.Image, target: Path) -> None:
    """Save a PIL image via temp file + os.replace (format from target suffix)."""
    fmt = (target.suffix.lstrip(".") or "png").upper()
    fmt = {"JPG": "JPEG"}.get(fmt, fmt)

    def payload(fd: int, tmp_name: str) -> None:
        os.close(fd)
        image.save(tmp_name, format=fmt)

    _atomic_replace(target, payload)


def atomic_write_set(payloads: "dict[Path, bytes | str]") -> None:
    """Publish a whole set of files: stage every payload first, then rename them in.

    The single-file writers above make each artifact appear whole, which is all a
    stage that publishes one file needs. A stage that publishes a *set* — a sheet,
    its manifest, and the report that says which sheets are current — needs the
    set to appear together: a mid-loop `ENOSPC` on the second sheet would
    otherwise leave the first one published with no report naming it.

    Phase 1 writes each payload to a temp file beside its target and fsyncs it.
    That is the phase that allocates, so any failure there has published nothing
    and removes its own temps. Phase 2 is one `os.replace` per target — a rename
    inside a directory whose blocks are already allocated.

    This is not a filesystem transaction (POSIX has no multi-file commit): a
    power loss between two renames can still land a subset. What it removes is
    the failure this code can actually observe and act on — a write error partway
    through a publish reporting success over a half-published set.

    Parent directories must already exist; the caller owns the layout.
    """
    staged: list[tuple[str, Path]] = []
    try:
        for target, payload in payloads.items():
            data = payload.encode("utf-8") if isinstance(payload, str) else payload
            fd, tmp_name = tempfile.mkstemp(
                dir=str(target.parent), prefix=f".{target.name}.", suffix=".tmp")
            # Tracked before it is written: a failure mid-write must still clean
            # up this temp, not just the ones that completed.
            staged.append((tmp_name, target))
            with os.fdopen(fd, "wb") as handle:
                handle.write(data)
                handle.flush()
                os.fsync(handle.fileno())
    except BaseException:
        for tmp_name, _target in staged:
            with contextlib.suppress(OSError):
                os.unlink(tmp_name)
        raise
    for index, (tmp_name, target) in enumerate(staged):
        try:
            os.replace(tmp_name, target)
        except BaseException:
            for pending, _target in staged[index:]:
                with contextlib.suppress(OSError):
                    os.unlink(pending)
            raise


# --- sprite-request.json 단일 로드 게이트 ------------------------------------
# 18곳이 각자 `json.loads((run_dir / "sprite-request.json").read_text())` 하던 것을 하나로
# 모은다 (`load_curation` 이 큐레이션 사이드카에 대해 그렇게 하는 것과 같은 이유). 게이트가
# 하나면 스키마 이관을 걸 자리도 하나다 — 열여덟 곳에 같은 이관 코드를 흩뿌리면 그중 하나가
# 빠진 날 조용히 두 진실이 생긴다.
REQUEST_FILENAME = "sprite-request.json"
REQUEST_KIND = "sprite-gen-request"

# 은퇴한 키 -> 현행 키. "pixel perfect" 는 광의 통용어(UI 정합·충돌판정)의 오용이었고, 이
# 파이프라인이 실제로 하는 일의 정확한 명칭은 커뮤니티 속칭 "unfake"(unfake.js 유래)다
# — 격자 스냅/재양자화로 가짜 픽셀아트를 되돌린다
# domains/tools/spritefusion-pixel-snapper.md 용어 각주).
LEGACY_FIT_KEYS = {"pixel_perfect": "pixel_unfake"}

# 대신하는 키 없이 은퇴한 키. v3.0.0 에서 layer-tracks(`compose-layers`)가 빠지면서 최상위
# `rig`·`layers` 와 행마다의 `states.<state>.track` 을 읽는 코드가 없어졌다. 옛 런 파일에는
# 남아 있을 수 있어서 이름이 바뀐 키와 같은 길을 탄다: 읽기는 메모리에서 떼고 한 번 알리며,
# 파일에서 걷어 내는 것은 `migrate_request_file` 하나다.
RETIRED_REQUEST_KEYS = ("rig", "layers")
RETIRED_STATE_KEYS = ("track",)


def normalize_retired_keys(request: dict, where: str) -> list[str]:
    """은퇴 키를 현행 스키마로 옮긴다 (**메모리 in-place**, 디스크는 손대지 않는다).

    이름이 바뀐 키(`LEGACY_FIT_KEYS`)는 현행 키로 옮기고, 대신하는 키가 없는 키
    (`RETIRED_REQUEST_KEYS`, `RETIRED_STATE_KEYS`)는 뗀다. 옮긴 것을 한 줄씩 돌려준다
    (`fit.pixel_perfect -> fit.pixel_unfake`, `rig (not read)`, `states.walk.track (not read)`);
    빈 목록이면 은퇴 키가 없었다.

    같은 설정의 은퇴 키와 현행 키가 동시에 있으면 **hard fail** — 어느 쪽이 진실인지 코드가
    고를 수 없고, 고르는 순간 그게 조용한 폴백이다. 이건 읽기 정규화이지 이관이 아니다: 디스크
    스키마를 바꾸는 쪽은 `migrate_request_file` 하나뿐이고, 이 함수는 그 writer 도 같이 쓴다
    (키 매핑이 두 벌 생기지 않게)."""
    moved: list[str] = []
    fit = request.get("fit")
    if isinstance(fit, dict):
        for legacy, current in LEGACY_FIT_KEYS.items():
            if legacy not in fit:
                continue
            if current in fit:
                raise SystemExit(
                    f"{where}: both `fit.{legacy}` (retired) and "
                    f"`fit.{current}` are present — two truths for one setting. Delete the "
                    f"`fit.{legacy}` line (its value was {fit[legacy]!r}); the current key is "
                    f"`fit.{current}` = {fit[current]!r}.")
            fit[current] = fit.pop(legacy)
            moved.append(f"fit.{legacy} -> fit.{current}")
    for key in RETIRED_REQUEST_KEYS:
        if key in request:
            del request[key]
            moved.append(f"{key} (not read)")
    states = request.get("states")
    if isinstance(states, dict):
        for state, entry in states.items():
            if not isinstance(entry, dict):
                continue
            for key in RETIRED_STATE_KEYS:
                if key in entry:
                    del entry[key]
                    moved.append(f"states.{state}.{key} (not read)")
    return moved


# 은퇴 키를 안은 런을 한 프로세스에서 처음 읽을 때만 이관 안내를 낸다. `state_revision`
# 이 뷰 요청마다 로더를 부르므로 매번 찍으면 로그가 안내가 아니라 소음이 된다. 로그
# 중복 억제이지 진실 저장소가 아니다 — 여기 무엇이 들어 있든 판독 결과는 같다.
_RETIRED_KEY_NOTICED: set[str] = set()


def _read_request_document(run_dir: Path) -> tuple[Path, dict, list[str]]:
    """`sprite-request.json` 을 읽어 (경로, 정규화된 문서, 옮긴 은퇴 키) 를 돌려준다.

    request 파일을 실제로 여는 곳은 여기 하나다 — 읽기 게이트와 이관 writer 가 같은 판독
    (두 키 hard fail 포함)을 쓰게 하려면 파싱이 한 벌이어야 한다."""
    path = Path(run_dir) / REQUEST_FILENAME
    if not path.is_file():
        raise SystemExit(f"not a sprite-gen run dir (no {REQUEST_FILENAME}): {run_dir}")
    request = json.loads(path.read_text(encoding="utf-8"))
    return path, request, normalize_retired_keys(request, str(path))


def load_request(run_dir: Path) -> dict:
    """런의 numeric SSoT (`sprite-request.json`) 를 읽는 **유일한 게이트**. 읽기만 한다.

    은퇴한 키(`fit.pixel_perfect`)는 현행 키(`fit.pixel_unfake`)로, 대신하는 키가 없는 은퇴 키
    (`rig`, `layers`, `states.<state>.track`)는 떼어 **메모리에서만** 정규화되고 파일은 바이트
    그대로 남는다. 은퇴 키와 현행 키가 동시에 있으면 hard fail.

    합성 회귀는 이 함수가 정규화한 문서를 디스크에 다시 쓰면 조회만으로
    `sprite-request.json` 과 `run_revision` 이 움직여 큐레이션 사이드카를 stale 로
    떨어뜨리는 SRP 위반이 생김을 고정한다 (plan sprite-gen/state-revision-read-mutation).

    디스크 스키마 이관은 사용자가 명시적으로 부르는 단일 writer 에서만 원자적으로 한다:
    `migrate_request_file()` / `sprite-gen migrate-request <run-dir> --apply`."""
    path, request, retired = _read_request_document(run_dir)
    if retired and str(path) not in _RETIRED_KEY_NOTICED:
        _RETIRED_KEY_NOTICED.add(str(path))
        print(f"[request] retired key(s) in {path}: {', '.join(retired)}. They are read as "
              f"the current schema in memory and the file is unchanged; `sprite-gen "
              f"migrate-request {run_dir} --apply` moves the schema on disk.", file=sys.stderr)
    return request


def migrate_request_file(run_dir: Path, *, apply: bool = False) -> list[str]:
    """은퇴 키를 디스크에서 현행 스키마로 옮긴다 — request 스키마의 **유일한 이관 writer**.

    이름이 바뀐 키는 현행 키로 옮기고 대신하는 키가 없는 키는 걷어 낸다
    (`normalize_retired_keys`). 옮긴 것(또는 `apply=False` 인 dry run 에서 옮길 것)을 그 함수의
    줄로 돌려준다. 이미 현행 키뿐이면 빈 목록 (멱등 — 두 번째 실행은 아무것도 쓰지 않는다).

    Isolation: `sprite-request.json` 의 read-modify-write 는 **편집 writer 와 같은 격리
    도메인**(`publish_guard` 배타락) 안에서만 일어난다 — 락 획득 **후** fresh 재독하고
    원자 교체한다. 예전엔 락 **밖에서** 문서를 읽고 나서 `.sprite-gen.lock`(파이프라인 단계용
    단일 writer 락)을 잡았다. 그건 두 가지가 동시에 틀렸다: (a) read-then-lock 이라 읽은
    뒤 잡기 전 사이의 편집을 stale 문서로 덮고, (b) 편집 writer(`reroll.record_take` ·
    `interpolate.write_take` · 뷰 fps POST)는 `publish_guard` 를 쓰므로 **서로 배제하지 않는
    두 도메인**이었다 — 리롤이 기록한 테이크를 이관이 통째로 잃거나(반대 방향이면 이관이
    조용히 되돌아간다) 하는 lost update 가 가능했다. 한 자원에 격리 도메인은 하나다.

    파이프라인 락(`.sprite-gen.lock`)은 잡지 않는다: 그 락이 지키는 것은 프레임·아틀라스
    같은 파이프라인 산출물이고 request 파일이 아니다 (추출·굽기는 request 를 쓰지 않는다).
    안 만지는 자원의 락을 잡으면 보호받는다는 착시만 남고 실제 경쟁자는 그대로다.

    dry run(`apply=False`)은 판정만 하는 읽기라 락을 잡지 않는다 — 조회가 편집을 막지
    않아야 한다 (`load_request` 가 락을 안 보는 것과 같은 이유).
    """
    run_dir = Path(run_dir)
    if not apply:
        return _read_request_document(run_dir)[2]
    with publish_guard(run_dir):
        # 락 안 fresh 재독 — 여기서 읽은 문서와 아래 원자 교체 사이에 다른 writer 가 낄 수
        # 없다는 것이 이 함수의 lost-update 계약이다 (편집 writer 와 같은 배타락).
        path, request, retired = _read_request_document(run_dir)
        if not retired:
            return []
        atomic_write_text(path, json.dumps(request, ensure_ascii=False, indent=2) + "\n")
    _RETIRED_KEY_NOTICED.discard(str(path))
    return retired


def write_request(run_dir: Path, request: dict) -> None:
    """편집한 request 를 원자적으로 다시 쓴다 — **디스크의 키 형태를 보존한다**.

    take 기록·fps 편집처럼 스키마와 무관한 편집도 로더가 정규화해 준 문서를 통째로 되쓴다.
    그대로 쓰면 그 편집이 은퇴 키를 조용히 현행 키로 바꾸거나 떼어 내, 스키마 이관이 다시
    "아무 명령이나 하는 김에 하는 일" 이 된다. 로더가 메모리에서 편 것을 쓰기 직전에 되접으면
    (이름이 바뀐 키는 옛 이름으로, 뗀 키는 디스크의 값 그대로), 디스크 스키마를 바꾸는 곳은
    `migrate_request_file` 하나로 남는다.

    호출부의 dict 는 건드리지 않는다 (쓴 뒤에도 현행 키로 계속 쓰인다)."""
    path = Path(run_dir) / REQUEST_FILENAME
    try:
        on_disk = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        on_disk = {}   # 첫 발행이거나 읽을 수 없다 — 되접을 형태가 없으니 그대로 쓴다
    if not isinstance(on_disk, dict):
        on_disk = {}
    on_disk_fit = on_disk.get("fit") if isinstance(on_disk.get("fit"), dict) else {}
    fit = request.get("fit")
    if isinstance(fit, dict):
        restore = {current: legacy for legacy, current in LEGACY_FIT_KEYS.items()
                   if legacy in on_disk_fit and current in fit}
        if restore:
            # 되접는 것은 **키 이름뿐**이고, 순서는 로더가 정규화해 준 dict 의 순서를 그대로
            # 따른다 — 디스크의 원래 순서와 다를 수 있다. 정규화가 은퇴 키를 pop 해서 현행
            # 키로 다시 넣기 때문이다: 디스크 `{pixel_perfect, logical_height}` 는 편집 후
            # `{logical_height, pixel_perfect}` 로 쓰인다 (이름은 보존, 자리는 이동).
            request = {**request, "fit": {restore.get(key, key): value
                                          for key, value in fit.items()}}
    # 뗀 키는 디스크에 있던 값을 그대로 되돌린다 (자리는 끝으로 간다). 아무 코드도 쓰지 않는
    # 키라 이 편집의 값이 있을 수 없다 — 디스크에 있으면 그게 유일한 값이다.
    kept = {key: on_disk[key] for key in RETIRED_REQUEST_KEYS
            if key in on_disk and key not in request}
    if kept:
        request = {**request, **kept}
    states, disk_states = request.get("states"), on_disk.get("states")
    if isinstance(states, dict) and isinstance(disk_states, dict):
        kept_states = {}
        for state, entry in states.items():
            disk_entry = disk_states.get(state)
            if not (isinstance(entry, dict) and isinstance(disk_entry, dict)):
                continue
            kept_keys = {key: disk_entry[key] for key in RETIRED_STATE_KEYS
                         if key in disk_entry and key not in entry}
            if kept_keys:
                kept_states[state] = {**entry, **kept_keys}
        if kept_states:
            request = {**request, "states": {**states, **kept_states}}
    atomic_write_text(path, json.dumps(request, ensure_ascii=False, indent=2) + "\n")
