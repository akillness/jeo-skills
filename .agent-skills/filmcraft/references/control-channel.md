# Desktop control channel

Source: [`docs/control-protocol.md`](https://raw.githubusercontent.com/storytold/filmcraft/1fdfd8324db4aa23b08c69f518b086e632f75f84/docs/control-protocol.md) and [`docs/agents.md`](https://raw.githubusercontent.com/storytold/filmcraft/1fdfd8324db4aa23b08c69f518b086e632f75f84/docs/agents.md), pinned to `1fdfd8324db4aa23b08c69f518b086e632f75f84` (inspected 2026-10-12).

## Transport and safety

`filmcraft --control 9876` (or `FILMCRAFT_CONTROL_PORT=9876`) listens on `127.0.0.1:<port>`. It has no authentication; use it only while needed and never treat loopback as an authorization boundary. The server accepts one JSON object with a string `method` per line and returns one JSON reply per line. Blank lines are skipped. A malformed/non-object line, missing/non-string method, invalid UTF-8, or line over 4 MiB produces one error and closes that connection. At most 16 connections are served concurrently.

The channel is not an HTTP endpoint. A browser-style HTTP request line is rejected before any body can be interpreted as a command. Clients should reconnect after a connection-closing protocol error.

## Useful methods

```json
{"id":1,"method":"engine.commands"}
{"id":2,"method":"engine.execute","params":{"command":"sequence.inspect"}}
{"id":3,"method":"ui.elements","params":{"prefix":"tools."}}
{"id":4,"method":"ui.screenshot","params":{"path":"/approved/timeline.png","panel":"Timeline"}}
```

`engine.execute` routes engine or UI command ids; `engine.commands` returns the command registry. `ui.inspect` reports current UI state. `ui.elements` returns interactive element ids, labels, and rectangles. `ui.click`, `ui.drag`, `ui.scroll`, `ui.key`, and `ui.type` inject interaction. `ui.timeline.hit`/`ui.timeline.locate` help locate edits. `ui.playback` controls playback. `ui.screenshot` captures the window or a panel and fails after 10 seconds if no frame is presented.

`ui.set` can merge monitored view, panel, export, dialog, project panel, and media browser state. `ui.focus` is explicit: driving the app does not steal the user's keyboard, and screenshots/requests may bring a window forward without activating it. For unattended validation, `--control-input-only` excludes native keyboard, pointer, file-drop, and menu input while retaining control requests, close, and screenshots.

## Mutation discipline

Treat `engine.execute`, `ui.menu.invoke`, `ui.set`, pointer/key/type actions, and `app.quit` as potentially mutating. Inspect command enablement, backend, current project, media paths, and current selection first; resolve any target mismatch before mutation. If the user has already authorized the exact edit/save/export operation and path, do not ask again. Otherwise ask only when consent is missing, the destination is unclear, or the action is newly destructive. If an edit is wrong, use the documented undo command (`edit.undo`/`shortcuts.undo`) and re-inspect; do not blindly replay a failed request.

Time is integer ticks (`254016000000` per second); commands also accept `seconds`, `frame`, or `timecode`. Selection-dependent commands can be unavailable with no selection; explicit target params may override selection when the command documents them. The full method and command tables remain upstream; this reference intentionally summarizes rather than copying them.
