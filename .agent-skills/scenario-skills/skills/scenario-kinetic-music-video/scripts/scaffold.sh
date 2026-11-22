#!/usr/bin/env bash
# Scaffold a kinetic music-video project in the CURRENT directory.
# usage: bash <skill>/scripts/scaffold.sh /path/to/master.mp3
# Needs: node >= 20, python3.11 via uv, ffmpeg/ffprobe, Google Chrome (Playwright drives it headless with GPU).
# macOS: Xcode command-line tools (swiftc) to build the Apple Vision matte tool. Elsewhere mattes come from another source.
set -euo pipefail
SKILL="$(cd "$(dirname "$0")/.." && pwd)"
MASTER_SRC="${1:?give the path to the song master}"
# Python dependencies come from a hashed, wheels-only lock per platform (assets/python/), transitives
# included. Building an sdist would fetch unpinned toolchains, so other platforms stop here.
case "$(uname -s)-$(uname -m)" in
  Darwin-arm64) PY_LOCK=macos-arm64 ;;
  Linux-x86_64) PY_LOCK=linux-x86_64 ;;
  *)
    echo "No locked Python environment for $(uname -s) $(uname -m): use macOS on Apple Silicon or Linux x86_64 (glibc 2.28+)." >&2
    exit 1
    ;;
esac
if { [ -f package.json ] && [ ! -f package-lock.json ]; } ||
  { [ -f package-lock.json ] && [ ! -f package.json ]; }; then
  echo "Keep both package.json and package-lock.json, or use a new project folder." >&2
  exit 1
fi
mkdir -p audio engine/scenes engine/data assets/fonts assets/refs assets/gen assets/clips assets/video assets/audio_slices assets/brand analysis out tools
# the song may already sit at audio/master.<ext> (cp refuses identical files and set -e would abort)
[ "$MASTER_SRC" -ef "audio/master.${MASTER_SRC##*.}" ] || cp "$MASTER_SRC" "audio/master.${MASTER_SRC##*.}"
cp -R "$SKILL/assets/engine/." engine/
cp "$SKILL/scripts/"*.py "$SKILL/scripts/"*.mjs "$SKILL/scripts/"*.swift "$SKILL/scripts/prep_clip.sh" tools/
[ -f engine/timeline.js ] || cp "$SKILL/assets/timeline.template.js" engine/timeline.js
cp -n "$SKILL/assets/scene.template.js" engine/scenes/_template.js || true
cp -n "$SKILL/references/engine_api.md" ENGINE_API.md || true
cp -n "$SKILL/references/agent_brief_template.md" AGENTS_BRIEF.md || true

# subject matte tool (Apple Vision foreground instance mask, ~0.1 s/frame, free)
if [ "$(uname -s)" = "Darwin" ] && command -v swiftc >/dev/null; then
  [ -x tools/matte ] || swiftc -O tools/matte.swift -o tools/matte || echo "note: swiftc failed (an unaccepted Xcode license is the usual cause: sudo xcodebuild -license accept). Mattes: Scenario background removal + tools/matte_keyed.py, or tools/matte_fallback.py."
else
  echo "note: no swiftc/macOS, so tools/matte was not built. Provide mattes as assets/video/<clip>/m_#####.png another way."
fi

# fonts (OFL), pinned to one google/fonts commit and checked against SHA-256 before use. Each family's
# license lands in assets/fonts/licenses/. The engine's index.html declares these families. Add
# project fonts the same way, with their own checksum.
FONTS_REV=58466038e19d5a14053e0c9f863715e74af0fe0e
sha256() { if command -v sha256sum >/dev/null; then sha256sum "$1"; else shasum -a 256 "$1"; fi | cut -c1-64; }
fetch_font() { # <path under ofl/> <sha256> <destination>
  [ -f "$3" ] && return 0
  curl -fsSL "https://raw.githubusercontent.com/google/fonts/$FONTS_REV/ofl/$1" -o "$3.part" || {
    rm -f "$3.part"
    return 1
  }
  if [ "$(sha256 "$3.part")" != "$2" ]; then
    rm -f "$3.part"
    echo "Checksum mismatch for $1 at google/fonts $FONTS_REV: nothing installed under $3." >&2
    return 1
  fi
  mv "$3.part" "$3"
}
mkdir -p assets/fonts/licenses
while read -r path sum dest; do
  fetch_font "$path" "$sum" "assets/fonts/$dest"
done <<'FONTS'
archivo/Archivo%5Bwdth,wght%5D.ttf 0e094a7d3c7c4c25cf1310c4b30014f1dae9332220b1c2c88f4fa996f0b05053 Archivo-VF.ttf
archivoblack/ArchivoBlack-Regular.ttf dd9a89a019b4849f66ab75455fe7bdf931311042cbb0f0f97acc061539703180 ArchivoBlack.ttf
anton/Anton-Regular.ttf a4ba3a92350ebb031da0cb47630ac49eb265082ca1bc0450442f4a83ab947cab Anton.ttf
jetbrainsmono/JetBrainsMono%5Bwght%5D.ttf 48715a42ec242c21e9f02692891e147d022299a52e48d5e413e1a942193ffeda JetBrainsMono-VF.ttf
doto/Doto%5BROND,wght%5D.ttf 6f4fe7d37853b91df3698daa84cde2dbe1c9695d88c986e6510134910337d426 Doto-VF.ttf
blackhansans/BlackHanSans-Regular.ttf 31960809284026681774a8e52dc19ebcad26cf69b0ad9d560f288296fbb52739 BlackHanSans.ttf
unbounded/Unbounded%5Bwght%5D.ttf 323b511be380c8d474ef030686b71aedde501f8d9cd46da558b7c40454372c3f Unbounded-VF.ttf
instrumentserif/InstrumentSerif-Italic.ttf 08939b8bdf534afec24ae0ef5e03f948940cd9a8fe08e7fecbad040e62327385 InstrumentSerif-Italic.ttf
instrumentserif/InstrumentSerif-Regular.ttf 498efd461f6ddfcb7a111bf9a565709d2085d48201d501ead960d93e84ffbb88 InstrumentSerif.ttf
archivo/OFL.txt 108b4e57c9c796d3d38d0428ca7ee39de47ad93187302718d9b2d8864b9b716b licenses/Archivo-OFL.txt
archivoblack/OFL.txt 3173acd82f8c6159b5b1037b539fcbd4edff68e65c2ea8b9412b5a5ca97b08ff licenses/ArchivoBlack-OFL.txt
anton/OFL.txt ee67e6ee22790b7929f1a3769ca2801d565c64b5a9096942c1adf5596de9c9e4 licenses/Anton-OFL.txt
jetbrainsmono/OFL.txt b2fe5e8987594e9ffd1d2ca52a2f5d73eb8335243893c5d6254b5ad69269591d licenses/JetBrainsMono-OFL.txt
doto/OFL.txt 26a7b58bdba6cda8a78ca6e8b3791d8013b8abc6d5e6519f84193893aee02020 licenses/Doto-OFL.txt
blackhansans/OFL.txt c324192c8b3a988bae45a9a7e4ac1258b684739003bda114e0523423440457c9 licenses/BlackHanSans-OFL.txt
unbounded/OFL.txt 31e5d4e83955e7103c34570dd49b0570ef490800bd65b42923c0dd02445263b3 licenses/Unbounded-OFL.txt
instrumentserif/OFL.txt 129ed7618959716959f2941fdd5b49e0ad6e6c1d78726761786a00253d865521 licenses/InstrumentSerif-OFL.txt
FONTS

# Keep a project's customized dependency pair on repeat runs.
if [ ! -f package.json ]; then
  cp "$SKILL/assets/npm/package.json" "$SKILL/assets/npm/package-lock.json" .
fi
npm ci --ignore-scripts --no-audit --no-fund >/dev/null

# Python env (audio analysis, lyric alignment, footage prep, tracking, sync checks)
export UV_NATIVE_TLS=1 # uv ignores the system certificate store by default and fails behind a TLS-inspecting proxy
# Rebuilt from the lock on every run: uv refuses an existing .venv without a prompt, and leftovers would survive.
UV_VENV_CLEAR=1 uv venv .venv -q --python 3.11
uv pip install -q --require-hashes --only-binary :all: --python .venv/bin/python -r "$SKILL/assets/python/$PY_LOCK.txt"
echo "scaffolded. master: audio/master.${MASTER_SRC##*.}"
echo "next: .venv/bin/python tools/audio_analysis.py audio/master.${MASTER_SRC##*.}"
