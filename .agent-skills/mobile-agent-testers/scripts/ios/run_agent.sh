#!/usr/bin/env bash
# Simulator booted: checks blocked hosts, applies the persona's settings,
# installs and launches the app, then hands the simulator to Claude Code.
set -uo pipefail
: "${UDID:?}"
mkdir -p "results/$PERSONA"
for h in $BLOCK_HOSTS; do
  if curl -s -m 6 -o /dev/null "https://$h/"; then echo "$h reachable: aborting"; exit 1; fi
done
xcrun simctl ui "$UDID" appearance "${THEME:-light}"
xcrun simctl ui "$UDID" content_size "${TEXT_SIZE:-large}"
xcrun simctl location "$UDID" set "$GEO" 2>/dev/null || true
APP=$(find app -maxdepth 2 -name '*.app' -type d | head -1)
xcrun simctl install "$UDID" "$APP" || { echo "install failed"; exit 1; }
# The bundle id inside the app wins: it often differs from the Android package
# (a new Flutter app is com.example.myApp on iOS, com.example.my_app on Android)
BID=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$APP/Info.plist" 2>/dev/null)
if [ -n "$BID" ] && [ "$BID" != "$APP_ID" ]; then echo "Bundle id read from the app (differs from app_id)"; APP_ID=$BID; fi
export APP_ID
xcrun simctl launch "$UDID" "$APP_ID"; sleep 8
# First capture stores the screen width in points for gesture.sh
python3 scripts/ios/screen.py "$RUNNER_TEMP/warmup" 00 >/dev/null 2>&1 || true
# Optional screen recording, kept in results/ (encrypted like the rest)
REC=""
if [ "${RECORD_VIDEO:-false}" = true ]; then
  mkdir -p "results/$PERSONA/video"
  set -m   # own process group: a background job of a script would ignore the SIGINT that ends the file
  xcrun simctl io "$UDID" recordVideo --codec=h264 --force "results/$PERSONA/video/rec_01.mp4" > "$RUNNER_TEMP/rec.log" 2>&1 &
  REC=$!; set +m; sleep 2
fi
# The agent (another model API if llm_base_url is set)
source scripts/llm_env.sh || exit 1
claude -p "Read $BRIEF and personas.json, then do the mission until the final report. PERSONA=$PERSONA PLATFORM=ios APP_ID=$APP_ID. Device: $DEVICE, text size ${TEXT_SIZE:-large}, theme ${THEME:-light}, language $LOCALE. The simulator is already booted and the tools find it on their own (UDID is set): use the commands of the brief directly. Report anything that does not fit this screen (cut text, off-screen buttons, under the notch or home bar, broken layout)." \
  --model "${MODEL:-sonnet}" --max-turns 400 --output-format json \
  --allowedTools "Bash(bash scripts/ios/gesture.sh:*),Bash(python3 scripts/ios/screen.py:*),Bash(python3 scripts/ios/type.py:*),Bash(sleep:*),Bash(ls:*),Bash(cat:*),Bash(mkdir:*),Read,Write,Edit" \
  > results/agent-output.json 2> results/agent-errors.txt
CODE=$?
python3 scripts/agent_status.py results/agent-output.json results/agent-errors.txt "$PERSONA" || true
if [ -n "$REC" ]; then
  kill -INT "$REC" 2>/dev/null
  for _ in $(seq 1 30); do kill -0 "$REC" 2>/dev/null || break; sleep 1; done
  cat "$RUNNER_TEMP/rec.log"; ls -l "results/$PERSONA/video"
fi
echo "Agent finished (exit $CODE), $(ls "results/$PERSONA" | wc -l) files"
