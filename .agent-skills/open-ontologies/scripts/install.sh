#!/usr/bin/env bash
# Build the pinned Open Ontologies revision from source and verify the result.
#
# Side effects (run only after the user approved them): clones the upstream
# repository, downloads crates and the pinned Oxigraph Git patch, compiles with
# cargo, copies one binary into BIN_DIR, and runs scripts/smoke.py against it.
# Nothing is registered with an editor and no server is started.
set -euo pipefail

skill_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repo="${UPSTREAM_REPO:-https://github.com/fabio-rovai/open-ontologies.git}"
ref="${REF:-dfb09bf815326913d7d7822fa7228f2602fb4976}"
source_dir="${SOURCE_DIR:-$HOME/.local/share/open-ontologies/src}"
target_dir="${TARGET_DIR:-$HOME/.local/share/open-ontologies/target}"
bin_dir="${BIN_DIR:-$HOME/.local/bin}"
profile="${PROFILE:-release}"
toolchain="${RUST_TOOLCHAIN:-}"
# Highest rust-version in the pinned Cargo.lock (darling 0.23.0 -> 1.88; the Oxigraph
# patch -> 1.87). cargo 1.87 refuses the locked set before compiling anything.
min_rust="1.88"
force=false
skip_smoke=false

usage() {
  cat <<'EOF'
usage: install.sh [--force] [--skip-smoke]

Environment (all optional):
  REF             upstream commit to build   (default: pinned commit in SKILL.md)
  SOURCE_DIR      checkout location          (default: ~/.local/share/open-ontologies/src)
  TARGET_DIR      cargo target directory     (default: ~/.local/share/open-ontologies/target)
  BIN_DIR         where the binary is copied (default: ~/.local/bin)
  PROFILE         cargo profile: release|dev (default: release)
  RUST_TOOLCHAIN  rustup toolchain name, e.g. 1.99.1 (default: the active cargo)
  UPSTREAM_REPO   git URL                    (default: fabio-rovai/open-ontologies)

--force       overwrite an existing BIN_DIR/open-ontologies or re-use a SOURCE_DIR
              whose HEAD differs from REF (it is reset to REF).
--skip-smoke  do not run scripts/smoke.py after the build.
EOF
}
while (($#)); do
  case "$1" in
    --force) force=true; shift ;;
    --skip-smoke) skip_smoke=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

[[ "$ref" =~ ^[0-9a-f]{40}$ ]] || { echo "REF must be a full 40-hex commit: $ref" >&2; exit 2; }
case "$profile" in release|dev) ;; *) echo "PROFILE must be release or dev: $profile" >&2; exit 2 ;; esac

step() { printf '\n==> %s\n' "$*"; }
version_ok() { [[ "$(printf '%s\n%s\n' "$min_rust" "$1" | sort -V | head -1)" == "$min_rust" ]]; }
cargo_version_of() { "$@" --version 2>/dev/null | awk '{print $2}'; }

step "checking prerequisites"
for tool in git python3 cc; do
  command -v "$tool" >/dev/null || { echo "missing required tool: $tool" >&2; exit 2; }
done
cargo_cmd=(cargo)
[[ -n "$toolchain" ]] && cargo_cmd=(cargo "+$toolchain")
cargo_version="$(cargo_version_of "${cargo_cmd[@]}")" || cargo_version=""
[[ -n "$cargo_version" ]] || { echo "cargo not usable: ${cargo_cmd[*]}" >&2; exit 2; }
if ! version_ok "$cargo_version" && [[ -z "$toolchain" ]] && command -v rustup >/dev/null; then
  # The active toolchain is too old; use the newest installed rustup toolchain that qualifies.
  best=""; best_v=""
  while read -r name _; do
    v="$(cargo_version_of cargo "+$name")" || v=""
    # skip unusable toolchains, pre-release versions (1.100.0-nightly), and too-old ones
    if [[ -z "$v" || "$v" == *-* ]] || ! version_ok "$v"; then continue; fi
    [[ -z "$best" || "$(printf '%s\n%s\n' "$best_v" "$v" | sort -V | tail -1)" == "$v" ]] && { best="$name"; best_v="$v"; }
  done < <(rustup toolchain list)
  if [[ -n "$best" ]]; then
    echo "active cargo $cargo_version < $min_rust; using installed toolchain $best ($best_v)"
    cargo_cmd=(cargo "+$best"); cargo_version="$best_v"
  fi
fi
if ! version_ok "$cargo_version"; then
  echo "cargo $cargo_version is older than the required $min_rust (rustup update, or set RUST_TOOLCHAIN)" >&2
  exit 2
fi
# oxrocksdb-sys (via the pinned Oxigraph) runs bindgen + cc: it needs a C/C++ compiler and libclang.
if ! command -v clang >/dev/null && [[ -z "${LIBCLANG_PATH:-}" ]]; then
  echo "warning: no clang on PATH and LIBCLANG_PATH unset; bindgen for oxrocksdb-sys may fail" >&2
fi
echo "cargo $cargo_version (${cargo_cmd[*]}), profile=$profile"

step "preparing source at $source_dir (ref $ref)"
if [[ -d "$source_dir/.git" ]]; then
  head="$(git -C "$source_dir" rev-parse HEAD)"
  if [[ "$head" != "$ref" ]]; then
    $force || { echo "existing checkout is at $head, not $ref (use --force to reset it)" >&2; exit 1; }
    git -C "$source_dir" fetch --depth 1 origin "$ref"
    git -C "$source_dir" checkout --detach "$ref"
  fi
else
  [[ -e "$source_dir" ]] && { echo "SOURCE_DIR exists and is not a git checkout: $source_dir" >&2; exit 1; }
  mkdir -p "$(dirname "$source_dir")"
  git clone --no-checkout --filter=blob:none "$repo" "$source_dir"
  git -C "$source_dir" checkout --detach "$ref"
fi
echo "HEAD $(git -C "$source_dir" rev-parse HEAD)"

step "offline selected-file check (scripts/preflight.py)"
python3 "$skill_dir/scripts/preflight.py" --repo "$source_dir" --json

step "building with cargo (first build downloads crates; several minutes)"
build_args=(build --locked --manifest-path "$source_dir/Cargo.toml" --target-dir "$target_dir")
[[ "$profile" == release ]] && build_args+=(--release)
"${cargo_cmd[@]}" "${build_args[@]}"
built="$target_dir/$([[ "$profile" == release ]] && echo release || echo debug)/open-ontologies"
[[ -x "$built" ]] || { echo "build finished but binary missing: $built" >&2; exit 1; }

step "installing to $bin_dir/open-ontologies"
dest="$bin_dir/open-ontologies"
if [[ -e "$dest" ]] && ! $force; then
  echo "destination exists (use --force to overwrite): $dest" >&2
  exit 1
fi
mkdir -p "$bin_dir"
install -m 0755 "$built" "$dest"
"$dest" --help | head -1

if $skip_smoke; then
  echo "smoke test skipped; run: python3 \"$skill_dir/scripts/smoke.py\" --binary \"$dest\""
  exit 0
fi
step "runtime smoke test (scripts/smoke.py)"
python3 "$skill_dir/scripts/smoke.py" --binary "$dest"
echo
echo "installed: $dest (source $ref, profile $profile)"
case ":$PATH:" in *":$bin_dir:"*) ;; *) echo "note: $bin_dir is not on PATH" ;; esac
