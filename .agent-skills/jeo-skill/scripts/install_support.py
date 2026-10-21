"""Shared Aside account selection and safe, additive skill copying."""

from __future__ import annotations

import hashlib
import os
import shutil
from pathlib import Path
def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            chunk = handle.read(1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
            if len(chunk) < 1024 * 1024:
                break
    return digest.hexdigest()


def require_safe_tree(path: Path) -> None:
    """Refuse linked destinations, including any existing descendants."""
    if path.is_symlink():
        raise ValueError(f"Refusing symlink destination: {path}")
    if path.exists() and not path.is_dir():
        raise ValueError(f"Expected a directory: {path}")
    if path.is_dir():
        for child in path.rglob("*"):
            if child.is_symlink():
                raise ValueError(f"Refusing symlink in skill tree: {child}")


def require_safe_path(path: Path, boundary: Path) -> None:
    current = boundary
    for part in ("", *path.relative_to(boundary).parts):
        current = current / part
        if current.is_symlink():
            raise ValueError(f"Refusing symlink destination: {current}")
        if current.exists() and not current.is_dir():
            raise ValueError(f"Expected a directory: {current}")


def resolve_aside_user(aside_home: Path, account: str | None) -> Path:
    aside_home = Path(os.path.abspath(aside_home.expanduser()))
    users = aside_home / "u"
    require_safe_path(users, aside_home)
    if account is None:
        accounts = sorted(
            p.name for p in users.iterdir()
            if not p.name.startswith(".") and p.is_dir() and not p.is_symlink()
        ) if users.is_dir() else []
        if len(accounts) != 1:
            raise ValueError("Aside requires --aside-account when zero or multiple accounts exist")
        account = accounts[0]
    if not account or account in {".", ".."} or any(c in account for c in "/\\"):
        raise ValueError("Aside account must be a single directory name")
    account_root = users / account
    require_safe_path(account_root, aside_home)
    if not account_root.is_dir():
        raise ValueError(f"Aside account does not exist: {account_root}")
    target = account_root / "skills" / "user"
    require_safe_path(target, aside_home)
    return target


def dir_manifest(root: Path) -> dict[str, str]:
    return {
        str(path.relative_to(root)): _sha256_file(path)
        for path in root.rglob("*")
        if path.is_file() and path.name != ".DS_Store"
        and "__pycache__" not in path.parts and path.suffix != ".pyc"
    }



def copy_tree(src: Path, dst: Path) -> int:
    """Copy selected contents additively without following source/destination links."""
    require_safe_tree(src)
    require_safe_tree(dst)
    copied = 0
    dst.mkdir(parents=True, exist_ok=True)
    for path in src.rglob("*"):
        if path.name == ".DS_Store" or "__pycache__" in path.parts or path.suffix == ".pyc":
            continue
        target = dst / path.relative_to(src)
        if path.is_dir():
            target.mkdir(parents=True, exist_ok=True)
        elif path.is_file():
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, target)
            copied += 1
    source_manifest = dir_manifest(src)
    destination_manifest = dir_manifest(dst)
    if not source_manifest or any(destination_manifest.get(p) != digest for p, digest in source_manifest.items()):
        raise ValueError(f"Copy verification failed: {dst}")
    return copied


# Skills removed from the jeo-skills catalog: name -> (replacement, first H1 line of the
# catalog's own SKILL.md). A copy is removed only when its frontmatter name and first H1
# both match, so a same-named skill from another source (for example revfactory/harness,
# whose H1 differs) is preserved.
RETIRED_INSTALLS: dict[str, tuple[str, str]] = {
    "jeo": ("ooo", "# JEO — Integrated Agent Orchestration"),
    "harness": ("harness2", "# harness - Agent Team & Skill Architect"),
}
MAX_FINGERPRINT_BYTES = 256 * 1024


def _retired_reason(candidate: Path, name: str, heading: str) -> str | None:
    """None when `candidate` is a catalog copy of retired `name`; otherwise why it is kept."""
    if not os.path.lexists(candidate):
        return "absent"
    if os.path.islink(candidate):
        return "symlink kept"
    if not candidate.is_dir():
        return "not a directory"
    skill = candidate / "SKILL.md"
    try:
        skill_info = os.lstat(skill)
    except FileNotFoundError:
        return "no SKILL.md"
    if os.path.islink(skill) or not skill.is_file() or skill_info.st_size > MAX_FINGERPRINT_BYTES:
        return "SKILL.md is not a bounded regular file"
    text = skill.read_text(encoding="utf-8", errors="replace")
    parts = text.split("---", 2) if text.startswith("---") else []
    frontmatter, body = (parts[1], parts[2]) if len(parts) == 3 else ("", text)
    names = [line.split(":", 1)[1].strip().strip("'\"") for line in frontmatter.splitlines()
             if line.startswith("name:")]
    first_h1 = next((line.rstrip() for line in body.splitlines() if line.startswith("# ")), None)
    if names != [name] or first_h1 != heading:
        return "fingerprint differs from the retired catalog skill"
    for child in candidate.rglob("*"):
        if child.is_symlink():
            return "tree contains a symlink"
    return None


def _checked_root(root: Path, boundary: Path) -> tuple[Path, dict[str, str] | None]:
    root = Path(os.path.abspath(root))
    boundary = Path(os.path.abspath(boundary))
    if root != boundary and boundary not in root.parents:
        return root, {"path": str(root), "action": "skipped", "reason": f"root is outside boundary {boundary}"}
    try:
        require_safe_path(root, boundary)
    except ValueError as error:
        return root, {"path": str(root), "action": "skipped", "reason": str(error)}
    if not root.is_dir():
        return root, {"path": str(root), "action": "skipped", "reason": "root is not a directory"}
    return root, None


def remove_retired_installs(roots: list[tuple[Path, Path]], *, dry_run: bool,
                            link_roots: list[tuple[Path, Path]] = ()) -> list[dict[str, str]]:
    """Remove (or, with dry_run, report) catalog copies of retired skills under each root.

    `roots`/`link_roots` hold (root, boundary) pairs; every path component from the boundary
    (HOME or the project directory) down to a root must be a real directory, so a linked
    ancestor such as `~/.config -> elsewhere` skips that root. Pass 1 removes
    fingerprint-matched directories in `roots` only. Pass 2 inspects retired-name symlinks in
    `roots` and `link_roots` and unlinks one only when its resolved target is a directory
    pass 1 removed (or would remove) in this same call; every other link is kept. No state
    is persisted between calls.
    """
    report: list[dict[str, str]] = []

    def usable_roots(pairs: list[tuple[Path, Path]], *, quiet: bool) -> list[Path]:
        out: list[Path] = []
        for root, boundary in pairs:
            if not os.path.lexists(root):
                continue
            checked, problem = _checked_root(root, boundary)
            if problem:
                if not quiet:
                    report.append(problem)
            else:
                out.append(checked)
        return out

    removal_roots = usable_roots(list(roots), quiet=False)
    removed: set[str] = set()
    for root in removal_roots:
        for name, (replacement, heading) in RETIRED_INSTALLS.items():
            candidate = root / name
            reason = _retired_reason(candidate, name, heading)
            if reason in {"absent", "symlink kept"}:
                continue
            if reason is not None:
                report.append({"path": str(candidate), "action": "kept", "reason": reason})
                continue
            removed.add(os.path.realpath(candidate))
            if not dry_run:
                shutil.rmtree(candidate)
            report.append({"path": str(candidate), "action": "would-remove" if dry_run else "removed",
                           "reason": f"retired catalog skill {name}; use {replacement}"})
    scan = list(removal_roots)
    for extra in usable_roots(list(link_roots), quiet=True):
        if extra not in scan:
            scan.append(extra)
    in_removal_scope = set(removal_roots)
    for root in scan:
        for name, (replacement, _heading) in RETIRED_INSTALLS.items():
            link = root / name
            if not os.path.islink(link):
                continue
            target = os.path.realpath(link)
            if target in removed and (dry_run or not os.path.exists(link)):
                if not dry_run:
                    os.unlink(link)
                report.append({"path": str(link), "action": "would-remove" if dry_run else "removed",
                               "reason": f"link to a removed retired catalog copy; use {replacement}"})
            elif root in in_removal_scope:
                report.append({"path": str(link), "action": "kept", "reason": "symlink kept"})
    return report
