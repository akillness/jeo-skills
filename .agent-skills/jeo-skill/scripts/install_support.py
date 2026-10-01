"""Shared Aside account selection and safe, additive skill copying."""

from __future__ import annotations

import hashlib
import os
import shutil
from pathlib import Path


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
        str(path.relative_to(root)): hashlib.sha256(path.read_bytes()).hexdigest()
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
