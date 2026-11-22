#!/usr/bin/env bash
# get_fonts.sh <film folder>: fetch the three variable fonts the engine uses, with their SIL OFL licenses,
# into <film folder>/fonts from a pinned google/fonts commit, checking each file's sha256.
# Archivo (display type, weight and width axes), JetBrains Mono (code and HUD), Instrument Sans (captions).
# A file already there with the right hash is kept; any other is fetched again. A download or checksum
# failure removes the file and exits 1, so the film never boots on a wrong font.
set -euo pipefail
if [ $# -ne 1 ] || [ -z "$1" ]; then
  echo "usage: get_fonts.sh <film folder>" >&2
  exit 1
fi
DIR="$1/fonts"
COMMIT=a4c0b21f839d7ac65a7d8b49eb81bddd110774a3
BASE="https://raw.githubusercontent.com/google/fonts/$COMMIT/ofl"
# source path|file name|sha256
FONTS=(
  "archivo/Archivo%5Bwdth,wght%5D.ttf|Archivo.ttf|0e094a7d3c7c4c25cf1310c4b30014f1dae9332220b1c2c88f4fa996f0b05053"
  "jetbrainsmono/JetBrainsMono%5Bwght%5D.ttf|JetBrainsMono.ttf|48715a42ec242c21e9f02692891e147d022299a52e48d5e413e1a942193ffeda"
  "instrumentsans/InstrumentSans%5Bwdth,wght%5D.ttf|InstrumentSans.ttf|b24f1812584816958afcf22e22d08e44318c5e51651e25d2438efdde389b33b1"
  "archivo/OFL.txt|OFL-Archivo.txt|108b4e57c9c796d3d38d0428ca7ee39de47ad93187302718d9b2d8864b9b716b"
  "jetbrainsmono/OFL.txt|OFL-JetBrainsMono.txt|b2fe5e8987594e9ffd1d2ca52a2f5d73eb8335243893c5d6254b5ad69269591d"
  "instrumentsans/OFL.txt|OFL-InstrumentSans.txt|9e27a72ed30eb49a08678f6a5d6ed98ec7ba5368f541637ee0683ec9134ef966"
)

sha256() {
  if command -v sha256sum >/dev/null; then
    sha256sum "$1" | cut -d' ' -f1
  else
    shasum -a 256 "$1" | cut -d' ' -f1
  fi
}

mkdir -p "$DIR"
for entry in "${FONTS[@]}"; do
  IFS='|' read -r src name sum <<<"$entry"
  file="$DIR/$name"
  if [ -f "$file" ] && [ "$(sha256 "$file")" = "$sum" ]; then
    continue
  fi
  rm -f "$file" "$file.part"
  if ! curl -fsSL "$BASE/$src" -o "$file.part"; then
    rm -f "$file.part"
    echo "could not download $BASE/$src" >&2
    exit 1
  fi
  got=$(sha256 "$file.part")
  if [ "$got" != "$sum" ]; then
    rm -f "$file.part"
    echo "checksum mismatch for $name: expected $sum, got $got" >&2
    exit 1
  fi
  mv -f "$file.part" "$file"
done
echo "fonts ready in $DIR"
