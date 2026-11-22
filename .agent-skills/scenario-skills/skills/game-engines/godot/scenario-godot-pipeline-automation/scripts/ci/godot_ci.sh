#!/usr/bin/env bash
# godot_ci.sh (scenario-godot-pipeline-automation 0.1, Godot 4.7.2): import, test, export. Same script locally and in CI,
# so the workflow YAML stays a thin wrapper and every step is testable on a laptop first.
#   GODOT=/path/to/godot PROJECT_DIR=. PRESETS="Linux" OUT_DIR=build tools/ci/godot_ci.sh
# Exit: 0 ok; 10 import failed; 11 tests failed; 12 export produced no file.
set -u
GODOT="${GODOT:-godot}"
PROJECT_DIR="${PROJECT_DIR:-.}"
PRESETS="${PRESETS:-Linux}"
OUT_DIR="${OUT_DIR:-build}"
GAME="${GAME_NAME:-game}"
P="$(cd "$PROJECT_DIR" && pwd)"
case "$OUT_DIR" in /*) OUT="$OUT_DIR" ;; *) OUT="$(pwd)/$OUT_DIR" ;; esac
mkdir -p "$OUT/logs"
"$GODOT" --version

echo "== import"
# --import exits after the first scan and import (4.x); the class cache and .godot/imported now exist
"$GODOT" --headless --path "$P" --import > "$OUT/logs/import.log" 2>&1
code=$?
if [ $code -ne 0 ] || grep -q "SCRIPT ERROR\|Parse Error" "$OUT/logs/import.log"; then
  tail -40 "$OUT/logs/import.log"; echo "import failed (exit $code)"; exit 10
fi

if [ -f "$P/addons/gdUnit4/bin/GdUnitCmdTool.gd" ] && [ -d "$P/test" ]; then
  echo "== gdUnit4"
  # -rd must be res:// (an absolute path is nested under the project, verified gdUnit4 6.2.1)
  "$GODOT" --headless --path "$P" -s res://addons/gdUnit4/bin/GdUnitCmdTool.gd --ignoreHeadlessMode \
      -a res://test -rd res://.ci_reports -c > "$OUT/logs/gdunit4.log" 2>&1
  code=$?
  mkdir -p "$OUT/reports"; cp -R "$P/.ci_reports/." "$OUT/reports/" 2>/dev/null
  # 0 pass, 101 orphan warnings only; 100 failures, 103 headless refused, 105 script errors
  if [ $code -ne 0 ] && [ $code -ne 101 ]; then tail -60 "$OUT/logs/gdunit4.log"; echo "tests failed (exit $code)"; exit 11; fi
elif [ -f "$P/addons/gut/gut_cmdln.gd" ] && [ -d "$P/test" ]; then
  echo "== GUT"
  "$GODOT" --headless --path "$P" -s addons/gut/gut_cmdln.gd -gdir=res://test -ginclude_subdirs -gexit \
      -gjunit_xml_file="$OUT/reports/junit.xml" > "$OUT/logs/gut.log" 2>&1 || { tail -60 "$OUT/logs/gut.log"; exit 11; }
fi

for preset in $PRESETS; do
  preset="${preset//_/ }"   # "Windows_Desktop" in PRESETS means "Windows Desktop"
  slug="$(echo "$preset" | tr 'A-Z ' 'a-z_')"
  case "$preset" in
    Linux) f="$GAME.x86_64" ;; "Windows Desktop") f="$GAME.exe" ;; macOS) f="$GAME.zip" ;; Web) f="index.html" ;; *) f="$GAME.pck" ;;
  esac
  mkdir -p "$OUT/$slug"
  echo "== export $preset -> $OUT/$slug/$f"
  "$GODOT" --headless --path "$P" --export-release "$preset" "$OUT/$slug/$f" > "$OUT/logs/export_$slug.log" 2>&1
  code=$?
  # judge by the output, not only the exit code: Godot can crash at shutdown after a complete export
  if [ ! -s "$OUT/$slug/$f" ]; then tail -40 "$OUT/logs/export_$slug.log"; echo "export $preset failed (exit $code)"; exit 12; fi
  [ $code -ne 0 ] && echo "warning: export $preset exit $code but output present; see logs/export_$slug.log"
  [ "$preset" = "Linux" ] && chmod +x "$OUT/$slug/$f"
  # tar keeps the executable bit, which upload-artifact zips drop
  tar -C "$OUT" -czf "$OUT/$slug.tar.gz" "$slug"
done
echo "== done"; ls -la "$OUT"
