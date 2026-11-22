# SPDX-License-Identifier: Apache-2.0
"""The release body is derived from CHANGELOG.md, or the release fails.

These pin the four answers the release workflow depends on: which section belongs to the
tag, what happens when there is none, which GIFs get attached, and which references become
URLs. Fixtures are synthetic changelogs written in the test; the one test that reads the
repository's own CHANGELOG is the regression that keeps the next release renderable.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

import release_notes  # noqa: E402

# The smallest thing that is a GIF; these tests only care that the path is a file.
GIF_BYTES = bytes.fromhex("474946383961010001008000000000ffffff21f90401000000002c00000000010001000002024401003b")

CHANGELOG = """\
# Changelog

Prose above the first section is not part of any release.

## v1.3.0 - Newest

- A line in the newest section.
- A showcase clip: `docs/assets/wave-cube.gif`

## v1.2.0 - Middle

- The middle section stops before the next heading.

## v1.1.0 - Oldest

- The last section runs to the end of the file.
"""


def _repo(tmp_path: Path, changelog: str = CHANGELOG, gifs: tuple[str, ...] = ()) -> Path:
    (tmp_path / "CHANGELOG.md").write_text(changelog, encoding="utf-8")
    assets = tmp_path / "docs" / "assets"
    assets.mkdir(parents=True, exist_ok=True)
    for name in gifs:
        (assets / name).write_bytes(GIF_BYTES)
    return tmp_path


def _render(tmp_path: Path, tag: str, changelog: str = CHANGELOG, gifs: tuple[str, ...] = (), **kw):
    root = _repo(tmp_path, changelog, gifs)
    return release_notes.render((root / "CHANGELOG.md").read_text(encoding="utf-8"), tag, root, **kw)


# --- which section belongs to the tag -------------------------------------------------

def test_the_section_for_the_tag_is_the_body(tmp_path: Path) -> None:
    page = _render(tmp_path, "v1.2.0", with_footer=False)
    assert page["title"] == "v1.2.0 - Middle"
    assert page["body"] == "- The middle section stops before the next heading."


def test_the_last_section_runs_to_the_end_of_the_file(tmp_path: Path) -> None:
    """The oldest section has no heading after it; it must not come back empty."""
    page = _render(tmp_path, "v1.1.0", with_footer=False)
    assert page["body"] == "- The last section runs to the end of the file."


def test_a_tag_with_no_section_fails(tmp_path: Path) -> None:
    with pytest.raises(release_notes.ReleaseNotesError) as err:
        _render(tmp_path, "v9.9.9")
    assert "v9.9.9" in str(err.value) and "v1.3.0" in str(err.value), "say what is missing and what exists"


def test_a_section_with_no_content_fails(tmp_path: Path) -> None:
    empty = "# Changelog\n\n## v1.4.0 - Nothing written yet\n\n## v1.3.0 - Newest\n\n- A line.\n"
    with pytest.raises(release_notes.ReleaseNotesError, match="empty"):
        _render(tmp_path, "v1.4.0", empty)


def test_a_version_is_not_matched_by_a_longer_one(tmp_path: Path) -> None:
    """`## v1.3.01` must not answer for tag v1.3.0."""
    longer = "# Changelog\n\n## v1.3.01 - Not this one\n\n- A line.\n"
    with pytest.raises(release_notes.ReleaseNotesError):
        _render(tmp_path, "v1.3.0", longer)


def test_a_version_is_not_matched_by_a_pre_release_of_itself(tmp_path: Path) -> None:
    """`## v1.3.0-rc1` must not answer for tag v1.3.0 — a tag may carry a `-` suffix too."""
    rc = "# Changelog\n\n## v1.3.0-rc1 - Release candidate\n\n- Not the release's notes.\n"
    with pytest.raises(release_notes.ReleaseNotesError) as err:
        _render(tmp_path, "v1.3.0", rc)
    assert "v1.3.0-rc1" in str(err.value), "name the section that was refused, suffix included"
    page = _render(tmp_path, "v1.3.0-rc1", rc, with_footer=False)
    assert page["title"] == "v1.3.0-rc1 - Release candidate", "the rc tag still gets its own section"


@pytest.mark.parametrize("opener,closer", [
    ("```sh", "```"),
    # Quoted markdown uses `~~~` so its own backticks stay readable; it is still a fence.
    ("~~~md", "~~~"),
])
def test_a_heading_inside_a_fenced_block_is_code_not_a_section(
    tmp_path: Path, opener: str, closer: str
) -> None:
    """A `## v1.2.0` line inside a code fence must not cut the section short or answer for a tag."""
    fenced = (
        "# Changelog\n\n## v1.3.0 - Newest\n\n"
        "- What the old command printed:\n\n"
        f"{opener}\n## v1.2.0 - not a heading\n{closer}\n\n"
        "- A line after the fence.\n\n"
        "## v1.2.0 - Middle\n\n- The real middle section.\n"
    )
    newest = _render(tmp_path, "v1.3.0", fenced, with_footer=False)
    assert "A line after the fence." in str(newest["body"])
    middle = _render(tmp_path, "v1.2.0", fenced, with_footer=False)
    assert middle["body"] == "- The real middle section."


def test_a_tag_that_is_not_a_release_tag_is_refused(tmp_path: Path) -> None:
    for tag in ("main", "1.3.0", "release-1.3.0"):
        with pytest.raises(release_notes.ReleaseNotesError, match="release tag"):
            _render(tmp_path, tag)


# --- which GIFs get attached ----------------------------------------------------------

def test_a_section_with_no_gif_reference_attaches_nothing(tmp_path: Path) -> None:
    page = _render(tmp_path, "v1.2.0")
    assert page["assets"] == []


def test_every_named_gif_is_attached_once_in_order(tmp_path: Path) -> None:
    """Both spellings the CHANGELOG uses: an explicit path, then bare continuation names."""
    section = (
        "# Changelog\n\n## v1.3.0 - Showcase\n\n"
        "- Clips: `docs/assets/wave-cube.gif`, `spin-cube.gif` and `hop-cube.gif`.\n"
        "- The same clip again: `docs/assets/wave-cube.gif`.\n"
    )
    page = _render(tmp_path, "v1.3.0", section,
                   gifs=("wave-cube.gif", "spin-cube.gif", "hop-cube.gif"))
    assert page["assets"] == [
        "docs/assets/wave-cube.gif",
        "docs/assets/spin-cube.gif",
        "docs/assets/hop-cube.gif",
    ]


def test_a_bare_name_that_is_not_in_docs_assets_is_prose(tmp_path: Path) -> None:
    section = "# Changelog\n\n## v1.3.0 - Prose\n\n- The writer mentioned readme.gif in a sentence.\n"
    page = _render(tmp_path, "v1.3.0", section)
    assert page["assets"] == []


def test_an_explicit_path_that_is_not_in_the_checkout_fails(tmp_path: Path) -> None:
    """A dead image on a published release page is the failure; refuse before publishing."""
    section = "# Changelog\n\n## v1.3.0 - Showcase\n\n- Clip: `docs/assets/gone.gif`.\n"
    with pytest.raises(release_notes.ReleaseNotesError, match="gone.gif"):
        _render(tmp_path, "v1.3.0", section)


# --- which references become URLs -----------------------------------------------------

def test_link_targets_become_raw_urls_and_prose_paths_stay_paths(tmp_path: Path) -> None:
    section = (
        "# Changelog\n\n## v1.3.0 - Showcase\n\n"
        '- <img src="docs/assets/wave-cube.gif" height="160" alt="wave">\n'
        "- ![hop](docs/assets/hop-cube.gif)\n"
        "- Produced as `docs/assets/wave-cube.gif`.\n"
    )
    page = _render(tmp_path, "v1.3.0", section, gifs=("wave-cube.gif", "hop-cube.gif"),
                   repo="example/example", branch="main", with_footer=False)
    raw = "https://raw.githubusercontent.com/example/example/main/docs/assets/"
    body = str(page["body"])
    assert f'src="{raw}wave-cube.gif"' in body
    assert f"![hop]({raw}hop-cube.gif)" in body
    assert "Produced as `docs/assets/wave-cube.gif`." in body, "a path in a sentence is not a link"


# --- the closing block ----------------------------------------------------------------

def test_the_footer_links_the_anchor_github_generates(tmp_path: Path) -> None:
    page = _render(tmp_path, "v1.2.0", repo="example/example")
    body = str(page["body"])
    assert 'pip install --upgrade "sprite-gen @ git+https://github.com/example/example.git@v1.2.0"' in body
    assert "CHANGELOG.md#v120---middle)" in body, "GitHub drops the dots and joins on hyphens"


def test_no_footer_leaves_the_section_exactly_as_written(tmp_path: Path) -> None:
    page = _render(tmp_path, "v1.2.0", with_footer=False)
    assert "pip install" not in str(page["body"])


def test_the_anchor_matches_githubs_slug_rules() -> None:
    assert release_notes.changelog_anchor("v2.5.3 - Reference facing controls") == \
        "v253---reference-facing-controls"
    assert release_notes.changelog_anchor("v2.2.1") == "v221"


# --- the command line the workflow calls ----------------------------------------------

def _cli(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run([sys.executable, str(ROOT / "scripts" / "release_notes.py"), *args],
                          capture_output=True, encoding="utf-8")


def test_the_cli_writes_title_body_and_assets(tmp_path: Path) -> None:
    root = _repo(tmp_path, gifs=("wave-cube.gif",))
    out = tmp_path / "out"
    proc = _cli("--tag", "v1.3.0", "--changelog", str(root / "CHANGELOG.md"),
                "--out-dir", str(out), "--json")
    assert proc.returncode == 0, proc.stderr
    assert (out / "title.txt").read_text(encoding="utf-8").strip() == "v1.3.0 - Newest"
    assert (out / "assets.txt").read_text(encoding="utf-8").split() == ["docs/assets/wave-cube.gif"]
    assert json.loads(proc.stdout)["title"] == "v1.3.0 - Newest"


def test_the_cli_exits_nonzero_when_the_section_is_missing(tmp_path: Path) -> None:
    root = _repo(tmp_path)
    proc = _cli("--tag", "v9.9.9", "--changelog", str(root / "CHANGELOG.md"))
    assert proc.returncode != 0
    assert "v9.9.9" in proc.stderr


# --- the repository's own changelog ---------------------------------------------------

def test_this_repositorys_current_version_renders(tmp_path: Path) -> None:
    """The release commit's own notes must be renderable before the tag is pushed.

    `pyproject.toml`'s version is the one about to be released; if its CHANGELOG section is
    missing, misnamed or names a GIF that is not committed, the release workflow would fail
    after the tag is already public. It fails here instead.
    """
    version = re.search(r'(?m)^version\s*=\s*"([^"]+)"\s*$',
                        (ROOT / "pyproject.toml").read_text(encoding="utf-8"))
    assert version, "pyproject.toml is missing [project] version"
    page = release_notes.render((ROOT / "CHANGELOG.md").read_text(encoding="utf-8"),
                                f"v{version.group(1)}", ROOT)
    assert str(page["title"]).startswith(f"v{version.group(1)}")
    assert str(page["body"]).strip()
    for asset in page["assets"]:
        assert (ROOT / asset).is_file(), asset
