/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/*
 * Pyodide host worker for in-browser Python execution.
 *
 * Runs on its own thread so a runaway snippet cannot freeze the UI — the main
 * thread stops it by terminating this worker. The interpreter is kept alive
 * across messages so cells in the same notebook share kernel state. Served with
 * its own permissive CSP (see proxy.ts: script-src allows cdn.jsdelivr.net +
 * 'wasm-unsafe-eval', connect-src cdn.jsdelivr.net) so the app origin's CSP does
 * not need those grants.
 *
 * Protocol:
 *   run:     postMessage({ id, code, stream? }) -> postMessage({ id, logs, logStreams?, result?, error?, images?, html? })
 *            (logStreams[i] is "stdout"|"stderr" for logs[i]; absent ⇒ all stdout)
 *            When stream:true, ALSO posts incremental { id, type:"stream", stream:"stdout"|"stderr", chunk }
 *            messages AS the kernel produces output (progressive rendering — Jupyter
 *            streaming parity), before the final aggregate message above. The final
 *            message still carries the complete logs and is the source of truth.
 *   inspect: postMessage({ id, op: "inspect" }) -> postMessage({ id, variables: [{name,type,preview}] })
 *   lint:    postMessage({ id, op: "lint", code }) -> postMessage({ id, lint: { ok, lineno?, offset?, endLineno?, endOffset?, msg? } })
 *            Parse-only `compile(code, "<lint>", "exec")` — never executes the snippet, so it
 *            cannot freeze the kernel; reports the first SyntaxError (1-based lineno/offset) or
 *            { ok: true }. Runs in a throwaway scope so it never touches kernel globals.
 *   hover:   postMessage({ id, op: "hover", code, line, column }) ->
 *            postMessage({ id, hover: { found, name?, kind?, signature?, doc? } })
 *            jedi help()/infer() at the position against the LIVE kernel namespace —
 *            type signature + docstring for the editor's hover tooltip.
 *   signature: postMessage({ id, op: "signature", code, line, column }) ->
 *            postMessage({ id, signature: { found, label?, params?, activeParameter? } })
 *            jedi get_signatures() at the position against the LIVE kernel namespace —
 *            the enclosing call's signature + active argument index for parameter hints.
 *   definition: postMessage({ id, op: "definition", code, line, column }) ->
 *            postMessage({ id, definition: { found, line?, column?, inBuffer? } })
 *            jedi goto() at the position against the LIVE kernel namespace — the
 *            symbol's definition location. `inBuffer` is true when it resolves to
 *            THIS source (navigable in a single-buffer editor); false ⇒ out of file.
 *   references: postMessage({ id, op: "references", code, line, column }) ->
 *            postMessage({ id, references: { found, refs: [{line,column,length}] } })
 *            jedi get_references() at the position against the LIVE kernel namespace,
 *            FILTERED to this buffer — every in-buffer usage of the symbol (for rename).
 *   format:    postMessage({ id, op: "format", code }) -> postMessage({ id, formatted: string, error?: string })
 *            Format Python source via autopep8 (lazily installed via micropip on first use).
 *            Exact `error: "mrnote.format.ok.v1"` is the bounded success receipt;
 *            failures carry the ORIGINAL code with no such receipt.
 *   debug-run: postMessage({ id, op: "debug-run", code, breakpoints, stdin?, stream? }) ->
 *            postMessage({ id, logs, logStreams, result?, error?, images?, html?,
 *                          debugEvents, debugTruncated, debugConditionNote? })
 *            Each breakpoint is { line, condition?, hit? }: `condition` is a
 *            Python expression eval'd in the frame (a raising condition is
 *            skipped — not a hit — and surfaced once via debugConditionNote);
 *            `hit` is a normalized hit-count predicate { op, value, rem? } that
 *            stops only on matching conditional-reach counts.
 *            RECORDED breakpoint debugging via sys.settrace: the code runs to
 *            completion (same stdout/stderr/stdin/auto-package behaviour as a
 *            normal run) while every breakpoint hit — plus a bounded window of
 *            line-steps after each hit — is recorded with locals previews and
 *            the user-frame call stack. The editor replays the recording with
 *            Continue/Step semantics. A worker cannot truly block mid-Python
 *            (no JSPI/SharedArrayBuffer guarantees), so recording is the
 *            correct-everywhere design: breakpoints work INSIDE functions
 *            (which JS instrumentation cannot do) and a paused kernel can
 *            never wedge. Only frames from the user's own source are traced.
 */

(function () {
  const WORKER_PROTOCOL_MARKER = "mrnote.execution-worker.v1";
  const PYTHON_FORMAT_SUCCESS_RECEIPT = "mrnote.format.ok.v1";
  const trustedPostMessage = self.postMessage.bind(self);
  // Authored Python can mutate Worker globals and JavaScript prototypes through
  // Pyodide's `js` FFI. Capture every intrinsic used by a resource/security
  // boundary before the interpreter exists; later checks must not dynamically
  // consult attacker-writable `Array`, `String`, `Number`, `Math`, `Object`, or
  // `JSON` properties.
  const trustedArrayIsArray = Array.isArray;
  const trustedArrayPush = Function.prototype.call.bind(Array.prototype.push);
  const trustedStringSlice = Function.prototype.call.bind(
    String.prototype.slice,
  );
  const trustedStringTrim = Function.prototype.call.bind(String.prototype.trim);
  const trustedStringSplit = Function.prototype.call.bind(String.prototype.split);
  const trustedArrayJoin = Function.prototype.call.bind(Array.prototype.join);
  const trustedRegExpTest = Function.prototype.call.bind(RegExp.prototype.test);
  const trustedNumberIsSafeInteger = Number.isSafeInteger;
  const trustedNumberIsFinite = Number.isFinite;
  const trustedNumber = Number;
  const trustedMathMin = Math.min;
  const trustedMathMax = Math.max;
  const trustedString = String;
  const trustedObjectFromEntries = Object.fromEntries;
  const trustedJsonStringify = JSON.stringify;
  const protocolWords = new Uint32Array(4);
  crypto.getRandomValues(protocolWords);
  const workerProtocolToken = Array.from(protocolWords, (word) =>
    word.toString(16).padStart(8, "0"),
  ).join("");

  // Python can reach WorkerGlobalScope through Pyodide's `js` FFI. Keep the
  // protocol capability in this closure, capture the native sender before any
  // authored code runs, and never expose either value on `self`.
  function postProtocolMessage(payload) {
    const isNonExecution =
      payload &&
      typeof payload === "object" &&
      ("variables" in payload ||
        "lint" in payload ||
        "formatted" in payload ||
        "completions" in payload ||
        "hover" in payload ||
        "signature" in payload ||
        "definition" in payload ||
        "references" in payload);
    const bounded =
      payload && payload.type === "protocol-ready"
        ? { type: "protocol-ready" }
        : isNonExecution
          ? boundNonExecutionResult(payload)
          : payload;
    if (!bounded) return;
    trustedPostMessage([WORKER_PROTOCOL_MARKER, workerProtocolToken, bounded]);
  }

  postProtocolMessage({ type: "protocol-ready" });

  
  // The program draws on a plain Surface (lib/code-runner/python-game/
  // mrai_game.py, embedded below); each frame comes out as raw RGBA through
  // this channel and the page's keys and mouse come back in. Authored Python
  // can call the host functions itself, so every frame is checked, copied and
  // rate-limited here with intrinsics captured before any Python ran.
  const GAME_MAX_SIDE = 2048;
  const GAME_MIN_FRAME_GAP_MS = 8;
  const GAME_MAX_CAPTION_CHARS = 200;
  const GAME_MAX_EVENTS_PER_MESSAGE = 200;
  const GAME_MAX_QUEUED_EVENTS = 1000;
  const GAME_MAX_KEY_CHARS = 32;
  const GAME_EVENT_KINDS = new Set(["kd", "ku", "mm", "md", "mu", "wheel", "blur", "quit"]);
  const trustedSetHas = Function.prototype.call.bind(Set.prototype.has);
  const TrustedUint8Array = Uint8Array;
  const trustedIsView = ArrayBuffer.isView;
  const trustedTypedArraySet = Function.prototype.call.bind(Uint8Array.prototype.set);
  const trustedTypedArrayByteLength = Function.prototype.call.bind(
    Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(Uint8Array.prototype),
      "byteLength",
    ).get,
  );
  const trustedNow =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now.bind(performance)
      : Date.now;
  /** The run that is a game now: { id, queue, lastFrameAt }. */
  let gameRun = null;

  function postGameFrame(id, width, height, caption, pixels) {
    trustedPostMessage(
      [
        WORKER_PROTOCOL_MARKER,
        workerProtocolToken,
        { id, type: "game-frame", width, height, caption, pixels },
      ],
      [pixels],
    );
  }

  function gameHostFor(run) {
    return {
      frame(width, height, data, caption) {
        if (gameRun !== run) return false;
        if (
          !trustedNumberIsSafeInteger(width) ||
          !trustedNumberIsSafeInteger(height) ||
          width < 1 ||
          height < 1 ||
          width > GAME_MAX_SIDE ||
          height > GAME_MAX_SIDE ||
          !trustedIsView(data)
        ) {
          return false;
        }
        const now = trustedNow();
        if (now - run.lastFrameAt < GAME_MIN_FRAME_GAP_MS) return false;
        const expected = width * height * 4;
        let length;
        try {
          length = trustedTypedArrayByteLength(data);
        } catch {
          return false;
        }
        if (length !== expected) return false;
        const copy = new TrustedUint8Array(expected);
        try {
          trustedTypedArraySet(copy, data);
        } catch {
          return false;
        }
        run.lastFrameAt = now;
        postGameFrame(
          run.id,
          width,
          height,
          trustedStringSlice(trustedString(caption ?? ""), 0, GAME_MAX_CAPTION_CHARS),
          copy.buffer,
        );
        return true;
      },
      take_input() {
        const queue = gameRun === run ? run.queue : [];
        if (gameRun === run) run.queue = [];
        return trustedJsonStringify(queue);
      },
    };
  }

  function boundedGameText(value) {
    return typeof value === "string"
      ? trustedStringSlice(value, 0, GAME_MAX_KEY_CHARS)
      : "";
  }

  function boundedGameNumber(value) {
    return typeof value === "number" && trustedNumberIsFinite(value)
      ? trustedMathMax(-1e6, trustedMathMin(1e6, value))
      : 0;
  }

  /** The page's keys and mouse for the running game, as plain bounded data. */
  function acceptGameInput(data) {
    const run = gameRun;
    if (!run || data.id !== run.id || !trustedArrayIsArray(data.events)) return;
    const events = data.events;
    const count = trustedMathMin(events.length, GAME_MAX_EVENTS_PER_MESSAGE);
    for (let index = 0; index < count; index += 1) {
      if (run.queue.length >= GAME_MAX_QUEUED_EVENTS) return;
      const raw = events[index];
      if (!raw || typeof raw !== "object") continue;
      const kind = raw.t;
      if (typeof kind !== "string" || !trustedSetHas(GAME_EVENT_KINDS, kind)) continue;
      trustedArrayPush(run.queue, {
        t: kind,
        key: boundedGameText(raw.key),
        code: boundedGameText(raw.code),
        x: boundedGameNumber(raw.x),
        y: boundedGameNumber(raw.y),
        dy: boundedGameNumber(raw.dy),
        button: boundedGameNumber(raw.button),
        shift: raw.shift === true,
        ctrl: raw.ctrl === true,
        alt: raw.alt === true,
        meta: raw.meta === true,
        repeat: raw.repeat === true,
      });
    }
  }

  /** A program that imports pygame runs as a game (its display is the page's). */
  const PYGAME_IMPORT = /^[ \t]*(?:import|from)[ \t][^\n#]*\bpygame\b/m;
  function usesPygame(code) {
    return trustedRegExpTest(PYGAME_IMPORT, code);
  }
  /** turtle draws on the same window (mrai_turtle.py over the game shim). */
  const TURTLE_IMPORT = /^[ \t]*(?:import|from)[ \t][^\n#]*\bturtle\b/m;
  function usesTurtle(code) {
    return trustedRegExpTest(TURTLE_IMPORT, code);
  }
  function runsInWindow(code) {
    return usesPygame(code) || usesTurtle(code);
  }

  // The driver: the shim module from its source once per kernel, the run's
  // host, then the program (its own lines, rewritten) in the kernel's globals.
  const GAME_DRIVER = [
    "async def __mrai_run_game__():",
    "    import sys, types",
    "    module = sys.modules.get('_mrai_game')",
    "    source = globals().pop('__mrai_game_module_src__', None)",
    "    if module is None:",
    "        module = types.ModuleType('_mrai_game')",
    "        module.__file__ = '<mrai-game>'",
    "        exec(compile(source, '<mrai-game>', 'exec'), module.__dict__)",
    "        sys.modules['_mrai_game'] = module",
    "    import _mrai_game_host",
    "    module.install(_mrai_game_host)",
    "    turtle_source = globals().pop('__mrai_turtle_module_src__', None)",
    "    if turtle_source is not None:",
    "        turtle = types.ModuleType('turtle')",
    "        turtle.__file__ = '<mrai-turtle>'",
    "        exec(compile(turtle_source, '<mrai-turtle>', 'exec'), turtle.__dict__)",
    "        sys.modules['turtle'] = turtle",
    "    program = globals().pop('__mrai_game_src__')",
    "    await module.run_source(program, globals())",
    "try:",
    "    await __mrai_run_game__()",
    "finally:",
    "    globals().pop('__mrai_run_game__', None)",
  ].join("\n");

  // lib/code-runner/python-game/mrai_game.py, embedded (a test keeps them equal).
  const MRAI_GAME_SOURCE = /* <mrai-game-source> */ "\"\"\"A pygame program played in the code page (owner, 2026-11-17).\n\nThe page's Python is Pyodide in a Web Worker: pygame-ce draws on its\nsurfaces there, but its display needs a screen (``pygame.init()`` reaches for\nthe browser's ``screen`` and kills the interpreter) and a game's\n``while running:`` loop never lets the worker hear a key. So, before the\nprogram runs:\n\n* pygame's display, events, keys, mouse, timers and sound are this module's:\n  the window is a plain Surface whose frames go to the page's canvas, and the\n  canvas's keys and mouse come back as pygame events;\n* the source is rewritten (its lines kept): each loop that draws or reads\n  events gives the page a turn every frame (``await``), each function on the\n  way to such a loop becomes ``async`` and is awaited, and ``.convert()`` of\n  a Surface (which wants a display) is a copy.\n\"\"\"\n\nimport ast\nimport asyncio\nimport importlib\nimport json\nimport sys\nimport time\nimport warnings\n\nimport pygame\n\nHOST = None\n_MAX_SIDE = 2048\n_MIN_FRAME_GAP = 1 / 60\n_FRAME_BYTES_PER_SECOND = 120_000_000\n_TURN_GAP = 1 / 60\n\n\nclass _State:\n    def __init__(self):\n        self.screen = None\n        self.caption = \"pygame window\"\n        self.queue = []\n        self.pressed = set()\n        self.mods = 0\n        self.mouse_pos = (0, 0)\n        self.mouse_buttons = [False, False, False, False, False]\n        self.mouse_rel = (0, 0)\n        self.timers = {}\n        self.frame_due = 0.0\n        self.extra_sleep = 0.0\n        self.last_sent = 0.0\n        self.dirty = False\n        self.quit_asked = False\n        self.tasks = []\n        self.last_turn = 0.0\n\n\n_state = _State()\n\n\n# --- frames to the page ------------------------------------------------------------\n\n\ndef _send_frame(force=False):\n    screen = _state.screen\n    if screen is None or HOST is None:\n        return\n    now = time.perf_counter()\n    width, height = screen.get_size()\n    gap = max(_MIN_FRAME_GAP, width * height * 4 / _FRAME_BYTES_PER_SECOND)\n    if not force and now - _state.last_sent < gap:\n        _state.dirty = True\n        return\n    from pyodide.ffi import to_js\n\n    data = pygame.image.tobytes(screen, \"RGBA\")\n    HOST.frame(width, height, to_js(data), _state.caption)\n    _state.last_sent = now\n    _state.dirty = False\n\n\n# --- input from the page --------------------------------------------------------------\n\n_NAMED_KEYS = {\n    \"ArrowLeft\": \"K_LEFT\", \"ArrowRight\": \"K_RIGHT\", \"ArrowUp\": \"K_UP\", \"ArrowDown\": \"K_DOWN\",\n    \"Enter\": \"K_RETURN\", \"Escape\": \"K_ESCAPE\", \"Backspace\": \"K_BACKSPACE\", \"Tab\": \"K_TAB\",\n    \"Delete\": \"K_DELETE\", \"Insert\": \"K_INSERT\", \"Home\": \"K_HOME\", \"End\": \"K_END\",\n    \"PageUp\": \"K_PAGEUP\", \"PageDown\": \"K_PAGEDOWN\", \"CapsLock\": \"K_CAPSLOCK\",\n    \"F1\": \"K_F1\", \"F2\": \"K_F2\", \"F3\": \"K_F3\", \"F4\": \"K_F4\", \"F5\": \"K_F5\", \"F6\": \"K_F6\",\n    \"F7\": \"K_F7\", \"F8\": \"K_F8\", \"F9\": \"K_F9\", \"F10\": \"K_F10\", \"F11\": \"K_F11\", \"F12\": \"K_F12\",\n}\n_CODE_KEYS = {\n    \"ShiftLeft\": \"K_LSHIFT\", \"ShiftRight\": \"K_RSHIFT\", \"ControlLeft\": \"K_LCTRL\",\n    \"ControlRight\": \"K_RCTRL\", \"AltLeft\": \"K_LALT\", \"AltRight\": \"K_RALT\",\n    \"MetaLeft\": \"K_LGUI\", \"MetaRight\": \"K_RGUI\", \"Space\": \"K_SPACE\",\n    \"NumpadEnter\": \"K_KP_ENTER\",\n}\n\n\ndef _key_of(event):\n    code = str(event.get(\"code\") or \"\")\n    name = _CODE_KEYS.get(code)\n    if name is None:\n        name = _NAMED_KEYS.get(str(event.get(\"key\") or \"\"))\n    if name is not None and hasattr(pygame, name):\n        return getattr(pygame, name)\n    if code.startswith(\"Key\") and len(code) == 4:\n        return ord(code[3].lower())\n    if code.startswith(\"Digit\") and len(code) == 6:\n        return ord(code[5])\n    key = str(event.get(\"key\") or \"\")\n    if len(key) == 1:\n        return ord(key.lower())\n    return 0\n\n\ndef _mods_of(event):\n    mods = 0\n    if event.get(\"shift\"):\n        mods |= pygame.KMOD_SHIFT\n    if event.get(\"ctrl\"):\n        mods |= pygame.KMOD_CTRL\n    if event.get(\"alt\"):\n        mods |= pygame.KMOD_ALT\n    if event.get(\"meta\"):\n        mods |= pygame.KMOD_META\n    return mods\n\n\ndef _point(event):\n    try:\n        return (int(event.get(\"x\", 0)), int(event.get(\"y\", 0)))\n    except (TypeError, ValueError):\n        return _state.mouse_pos\n\n\ndef _take_input():\n    if HOST is None:\n        return\n    try:\n        events = json.loads(str(HOST.take_input()))\n    except Exception:  # noqa: BLE001 - a malformed batch is no input\n        return\n    if not isinstance(events, list):\n        return\n    Event = pygame.event.Event\n    for event in events[:500]:\n        if not isinstance(event, dict):\n            continue\n        kind = event.get(\"t\")\n        if kind in (\"kd\", \"ku\"):\n            key = _key_of(event)\n            mods = _mods_of(event)\n            _state.mods = mods\n            text = event.get(\"key\") if isinstance(event.get(\"key\"), str) and len(event.get(\"key\")) == 1 else \"\"\n            if kind == \"kd\":\n                if not event.get(\"repeat\"):\n                    _state.pressed.add(key)\n                _state.queue.append(Event(pygame.KEYDOWN, key=key, mod=mods, unicode=text, scancode=0))\n                if text and not (mods & (pygame.KMOD_CTRL | pygame.KMOD_META)):\n                    _state.queue.append(Event(pygame.TEXTINPUT, text=text))\n            else:\n                _state.pressed.discard(key)\n                _state.queue.append(Event(pygame.KEYUP, key=key, mod=mods, unicode=\"\", scancode=0))\n        elif kind == \"mm\":\n            pos = _point(event)\n            rel = (pos[0] - _state.mouse_pos[0], pos[1] - _state.mouse_pos[1])\n            _state.mouse_rel = (_state.mouse_rel[0] + rel[0], _state.mouse_rel[1] + rel[1])\n            _state.mouse_pos = pos\n            _state.queue.append(Event(pygame.MOUSEMOTION, pos=pos, rel=rel, buttons=tuple(_state.mouse_buttons[:3])))\n        elif kind in (\"md\", \"mu\"):\n            pos = _point(event)\n            button = max(1, min(5, int(event.get(\"button\", 1) or 1)))\n            _state.mouse_pos = pos\n            down = kind == \"md\"\n            _state.mouse_buttons[button - 1] = down\n            _state.queue.append(Event(pygame.MOUSEBUTTONDOWN if down else pygame.MOUSEBUTTONUP, pos=pos, button=button))\n        elif kind == \"wheel\":\n            dy = -1 if float(event.get(\"dy\", 0) or 0) > 0 else 1\n            _state.queue.append(Event(pygame.MOUSEWHEEL, x=0, y=dy, flipped=False, precise_x=0.0, precise_y=float(dy)))\n            button = 4 if dy > 0 else 5\n            _state.queue.append(Event(pygame.MOUSEBUTTONDOWN, pos=_state.mouse_pos, button=button))\n            _state.queue.append(Event(pygame.MOUSEBUTTONUP, pos=_state.mouse_pos, button=button))\n        elif kind == \"blur\":\n            for key in list(_state.pressed):\n                _state.queue.append(Event(pygame.KEYUP, key=key, mod=0, unicode=\"\", scancode=0))\n            _state.pressed.clear()\n            _state.mods = 0\n        elif kind == \"quit\":\n            _state.quit_asked = True\n            _state.queue.append(Event(pygame.QUIT))\n\n\ndef _fire_timers():\n    now = time.perf_counter()\n    for key, timer in list(_state.timers.items()):\n        due, interval, event, loops = timer\n        if now < due:\n            continue\n        _state.queue.append(event)\n        loops -= 1\n        if loops == 0:\n            del _state.timers[key]\n        else:\n            _state.timers[key] = (now + interval, interval, event, loops)\n\n\ndef _pump():\n    _take_input()\n    _fire_timers()\n\n\n# --- the modules a program calls ------------------------------------------------------\n\n\ndef _types(eventtype):\n    if eventtype is None:\n        return None\n    if isinstance(eventtype, int):\n        return {eventtype}\n    return set(eventtype)\n\n\nclass _Display:\n    def init(self):\n        return None\n\n    def quit(self):\n        return None\n\n    def get_init(self):\n        return True\n\n    def set_mode(self, size=(0, 0), flags=0, depth=0, display=0, vsync=0):\n        try:\n            width, height = int(size[0]), int(size[1])\n        except Exception:  # noqa: BLE001 - pygame's own default\n            width, height = 0, 0\n        if width <= 0 or height <= 0:\n            width, height = 800, 600\n        width, height = min(width, _MAX_SIDE), min(height, _MAX_SIDE)\n        _state.screen = pygame.Surface((width, height))\n        _state.screen.fill((0, 0, 0))\n        _send_frame(force=True)\n        return _state.screen\n\n    def get_surface(self):\n        return _state.screen\n\n    def flip(self):\n        _send_frame()\n\n    def update(self, *args, **kwargs):\n        _send_frame()\n\n    def set_caption(self, title, icontitle=None):\n        _state.caption = str(title)[:200]\n\n    def get_caption(self):\n        return (_state.caption, _state.caption)\n\n    def set_icon(self, *args, **kwargs):\n        return None\n\n    def get_window_size(self):\n        return _state.screen.get_size() if _state.screen is not None else (0, 0)\n\n    def get_active(self):\n        return True\n\n    def toggle_fullscreen(self):\n        return 0\n\n    def mode_ok(self, *args, **kwargs):\n        return 32\n\n    def list_modes(self, *args, **kwargs):\n        return [(1920, 1080), (1280, 720), (800, 600)]\n\n    def get_desktop_sizes(self):\n        return [(1920, 1080)]\n\n    def get_num_displays(self):\n        return 1\n\n    def Info(self):\n        width, height = self.get_window_size() if _state.screen is not None else (1920, 1080)\n        return type(\"VidInfo\", (), {\"current_w\": width, \"current_h\": height, \"hw\": False, \"wm\": True, \"bitsize\": 32})()\n\n    def get_wm_info(self):\n        return {}\n\n    def iconify(self):\n        return False\n\n    def set_gamma(self, *args, **kwargs):\n        return False\n\n    def is_fullscreen(self):\n        return False\n\n\nclass _Event:\n    Event = pygame.event.Event\n    event_name = staticmethod(pygame.event.event_name)\n    custom_type = staticmethod(pygame.event.custom_type)\n\n    def __getattr__(self, name):\n        return getattr(_real_event, name)\n\n    def pump(self):\n        _pump()\n\n    def get(self, eventtype=None, pump=True, exclude=None):\n        if pump:\n            _pump()\n        wanted, unwanted = _types(eventtype), _types(exclude)\n        taken, kept = [], []\n        for event in _state.queue:\n            if (wanted is None or event.type in wanted) and not (unwanted and event.type in unwanted):\n                taken.append(event)\n            else:\n                kept.append(event)\n        _state.queue = kept\n        return taken\n\n    def poll(self):\n        _pump()\n        if _state.queue:\n            return _state.queue.pop(0)\n        return pygame.event.Event(pygame.NOEVENT)\n\n    def wait(self, timeout=0):\n        return self.poll()\n\n    def peek(self, eventtype=None, pump=True):\n        if pump:\n            _pump()\n        wanted = _types(eventtype)\n        if wanted is None:\n            return bool(_state.queue)\n        return any(event.type in wanted for event in _state.queue)\n\n    def clear(self, eventtype=None, pump=True):\n        if pump:\n            _pump()\n        wanted = _types(eventtype)\n        _state.queue = [] if wanted is None else [e for e in _state.queue if e.type not in wanted]\n\n    def post(self, event):\n        _state.queue.append(event)\n        return True\n\n    def set_allowed(self, *args, **kwargs):\n        return None\n\n    def set_blocked(self, *args, **kwargs):\n        return None\n\n    def get_blocked(self, *args, **kwargs):\n        return False\n\n    def set_grab(self, *args, **kwargs):\n        return None\n\n    def get_grab(self):\n        return False\n\n\nclass _Pressed:\n    def __getitem__(self, key):\n        return key in _state.pressed\n\n    def __len__(self):\n        return 512\n\n    def __iter__(self):\n        return (key in _state.pressed for key in range(512))\n\n\nclass _Key:\n    def __getattr__(self, name):\n        return getattr(_real_key, name)\n\n    def get_pressed(self):\n        return _Pressed()\n\n    def get_mods(self):\n        return _state.mods\n\n    def set_mods(self, mods):\n        _state.mods = mods\n\n    def get_focused(self):\n        return True\n\n    def set_repeat(self, *args, **kwargs):\n        return None\n\n    def get_repeat(self):\n        return (0, 0)\n\n    def start_text_input(self):\n        return None\n\n    def stop_text_input(self):\n        return None\n\n    def set_text_input_rect(self, *args, **kwargs):\n        return None\n\n\nclass _Mouse:\n    def get_pos(self):\n        return _state.mouse_pos\n\n    def get_pressed(self, num_buttons=3):\n        return tuple(_state.mouse_buttons[: 5 if num_buttons == 5 else 3])\n\n    def get_rel(self):\n        rel, _state.mouse_rel = _state.mouse_rel, (0, 0)\n        return rel\n\n    def set_pos(self, *args):\n        pos = args[0] if len(args) == 1 else args\n        _state.mouse_pos = (int(pos[0]), int(pos[1]))\n\n    def set_visible(self, visible):\n        return True\n\n    def get_visible(self):\n        return True\n\n    def get_focused(self):\n        return True\n\n    def set_cursor(self, *args, **kwargs):\n        return None\n\n    def get_cursor(self):\n        return None\n\n    def set_system_cursor(self, *args, **kwargs):\n        return None\n\n\nclass _Silent:\n    \"\"\"Sound: the page plays none; every call answers quietly.\"\"\"\n\n    def __init__(self, *args, **kwargs):\n        pass\n\n    def __call__(self, *args, **kwargs):\n        return _Silent()\n\n    def __getattr__(self, name):\n        if name in (\"get_busy\", \"get_init\"):\n            return lambda *a, **k: False\n        if name in (\"get_length\", \"get_volume\", \"get_num_channels\", \"get_pos\"):\n            return lambda *a, **k: 0\n        return _Silent()\n\n    def __bool__(self):\n        return False\n\n\nclass _Mixer(_Silent):\n    Sound = _Silent\n    Channel = _Silent\n    music = _Silent()\n\n\nclass Clock:\n    def __init__(self):\n        self._last = None\n        self._time = 0\n        self._raw = 0\n        self._dts = []\n\n    def tick(self, framerate=0):\n        now = time.perf_counter()\n        if self._last is None:\n            self._last = now\n            return 0\n        raw = now - self._last\n        end = now\n        if framerate and framerate > 0:\n            end = max(now, self._last + 1 / framerate)\n            _state.frame_due = max(_state.frame_due, end)\n        dt = end - self._last\n        self._last = end\n        self._time = int(dt * 1000)\n        self._raw = int(raw * 1000)\n        self._dts = (self._dts + [dt])[-10:]\n        return self._time\n\n    tick_busy_loop = tick\n\n    def get_time(self):\n        return self._time\n\n    def get_rawtime(self):\n        return self._raw\n\n    def get_fps(self):\n        total = sum(self._dts)\n        return len(self._dts) / total if total > 0 else 0.0\n\n\ndef _wait(milliseconds):\n    _state.extra_sleep += max(0, int(milliseconds)) / 1000\n    return int(milliseconds)\n\n\ndef _set_timer(event, millis, loops=0):\n    key = event if isinstance(event, int) else getattr(event, \"type\", event)\n    if not millis or millis <= 0:\n        _state.timers.pop(key, None)\n        return\n    real = event if not isinstance(event, int) else pygame.event.Event(event)\n    interval = millis / 1000\n    _state.timers[key] = (time.perf_counter() + interval, interval, real, loops or -1)\n\n\ndef _init(*args, **kwargs):\n    pygame.font.init()\n    return (6, 0)\n\n\ndef _quit():\n    _send_frame(force=True)\n\n\n_real_event = pygame.event\n_real_key = pygame.key\n\n\ndef install(host):\n    \"\"\"Make pygame this module's (idempotent within a run).\"\"\"\n    global HOST\n    HOST = host\n    _state.__init__()\n    # pygame's SysFont looks for a font cache the page's Python has none of.\n    warnings.filterwarnings(\"ignore\", message=\"no fc_cache\")\n    display, event, key, mouse = _Display(), _Event(), _Key(), _Mouse()\n    pygame.init = _init\n    pygame.quit = _quit\n    pygame.display = display\n    pygame.event = event\n    pygame.key = key\n    pygame.mouse = mouse\n    pygame.mixer = _Mixer()\n    pygame.time.Clock = Clock\n    pygame.time.wait = _wait\n    pygame.time.delay = _wait\n    pygame.time.set_timer = _set_timer\n    for name, module in ((\"display\", display), (\"event\", event), (\"key\", key), (\"mouse\", mouse), (\"mixer\", pygame.mixer)):\n        sys.modules[\"pygame.\" + name] = module\n    try:\n        importlib.import_module(\"pygame.locals\")  # constants stay pygame's\n    except Exception:  # noqa: BLE001\n        pass\n\n\n# --- the turn each frame gives the page -----------------------------------------------\n\n\nclass _Game:\n    \"\"\"What the rewritten source calls (``__mrai_game__``).\"\"\"\n\n    async def frame(self):\n        now = time.perf_counter()\n        delay = max(0.0, _state.frame_due - now) + _state.extra_sleep\n        # A loop with nothing to wait for (a fast drawing loop) gives the page\n        # a turn about sixty times a second, not on every pass.\n        if delay <= 0 and now - _state.last_turn < _TURN_GAP:\n            return\n        if _state.dirty:\n            _send_frame(force=True)\n        _state.extra_sleep = 0.0\n        await asyncio.sleep(min(delay, 1.0) if delay > 0 else 0)\n        _state.last_turn = time.perf_counter()\n\n    async def sleep(self, seconds):\n        if _state.dirty:\n            _send_frame(force=True)\n        try:\n            seconds = float(seconds)\n        except (TypeError, ValueError):\n            seconds = 0.0\n        await asyncio.sleep(max(0.0, seconds))\n\n    async def wait_ms(self, milliseconds):\n        await self.sleep(max(0, int(milliseconds)) / 1000)\n        return int(milliseconds)\n\n    async def call(self, value):\n        if asyncio.iscoroutine(value) or isinstance(value, asyncio.Future):\n            return await value\n        return value\n\n    def spawn(self, value):\n        if asyncio.iscoroutine(value):\n            task = asyncio.ensure_future(value)\n            _state.tasks.append(task)\n            return None\n        return value\n\n    def convert(self, target, name, *args, **kwargs):\n        if isinstance(target, pygame.Surface):\n            return target.copy()\n        return getattr(target, name)(*args, **kwargs)\n\n\nGAME = _Game()\n\n\n# --- the source, rewritten -------------------------------------------------------------\n\n_FRAME_ATTRS = {\"tick\", \"tick_busy_loop\"}\n#: turtle's drawing calls: a loop of them is drawn as it goes (mrai_turtle).\n_TURTLE_MOVES = {\n    \"forward\", \"fd\", \"back\", \"bk\", \"backward\", \"left\", \"lt\", \"right\", \"rt\", \"goto\", \"setpos\",\n    \"setposition\", \"setx\", \"sety\", \"circle\", \"dot\", \"stamp\", \"write\", \"begin_fill\", \"end_fill\",\n}\n#: turtle's window loop: awaited, it answers keys, clicks and timers.\n_TURTLE_LOOPS = {\"mainloop\", \"done\", \"exitonclick\"}\n_DISPLAY_CALLS = {\"flip\", \"update\"}\n_EVENT_CALLS = {\"get\", \"poll\", \"wait\", \"pump\"}\n_SLEEP_CALLS = {(\"time\", \"sleep\"), (\"pygame.time\", \"wait\"), (\"pygame.time\", \"delay\"), (\"time\", \"wait\"), (\"time\", \"delay\")}\n#: Ends in \"__\" so a class body does not mangle it.\n_MARK = \"__mrai_game__\"\n\n\ndef _dotted(node):\n    parts = []\n    while isinstance(node, ast.Attribute):\n        parts.append(node.attr)\n        node = node.value\n    if isinstance(node, ast.Name):\n        parts.append(node.id)\n        return \".\".join(reversed(parts))\n    return None\n\n\ndef _is_frame_call(call):\n    func = call.func\n    if isinstance(func, ast.Name):\n        return func.id in _TURTLE_MOVES\n    if not isinstance(func, ast.Attribute):\n        return False\n    if func.attr in _FRAME_ATTRS or func.attr in _TURTLE_MOVES:\n        return True\n    owner = _dotted(func.value) or \"\"\n    tail = owner.rsplit(\".\", 1)[-1]\n    if func.attr in _DISPLAY_CALLS and tail == \"display\":\n        return True\n    if func.attr in _EVENT_CALLS and tail == \"event\":\n        return True\n    return False\n\n\ndef _walk_own(node):\n    \"\"\"The nodes of ``node``'s own body: not into nested functions or classes.\"\"\"\n    stack = list(ast.iter_child_nodes(node))\n    while stack:\n        child = stack.pop()\n        yield child\n        if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda, ast.ClassDef)):\n            continue\n        stack.extend(ast.iter_child_nodes(child))\n\n\ndef _called_name(call):\n    func = call.func\n    if isinstance(func, ast.Name):\n        return func.id\n    if isinstance(func, ast.Attribute):\n        return func.attr\n    return None\n\n\ndef _is_generator(fn):\n    return any(isinstance(node, (ast.Yield, ast.YieldFrom)) for node in _walk_own(fn))\n\n\nclass _Rewriter:\n    def __init__(self, tree):\n        self.tree = tree\n        self.functions = [node for node in ast.walk(tree) if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))]\n\n    def frame_functions(self):\n        direct = {fn for fn in self.functions if any(isinstance(n, ast.Call) and _is_frame_call(n) for n in _walk_own(fn))}\n        names = {fn.name for fn in direct}\n        changed = True\n        while changed:\n            changed = False\n            for fn in self.functions:\n                if fn.name in names:\n                    continue\n                if any(isinstance(n, ast.Call) and _called_name(n) in names for n in _walk_own(fn)):\n                    names.add(fn.name)\n                    changed = True\n        return names\n\n    def run(self):\n        frame_names = self.frame_functions()\n\n        def needs_turn(loop):\n            for node in _walk_own_loop(loop):\n                if isinstance(node, ast.Call) and (_is_frame_call(node) or _called_name(node) in frame_names):\n                    return True\n            return False\n\n        # 1. Each loop that draws or reads events gives the page a turn per pass.\n        async_fns = set()\n        top_level_turn = False\n        for parent in [self.tree] + self.functions:\n            for node in _walk_own(parent):\n                if isinstance(node, (ast.While, ast.For)) and needs_turn(node):\n                    turn = ast.Expr(ast.Await(_game_call(\"frame\", [])))\n                    ast.copy_location(turn, node.body[0])\n                    ast.fix_missing_locations(turn)\n                    node.body.insert(0, turn)\n                    if parent is self.tree:\n                        top_level_turn = True\n                    else:\n                        async_fns.add(parent)\n\n        # 2. Every function that reaches one (or turtle's window loop) is\n        # async, awaited where it is called.\n        unasyncable = {fn for fn in self.functions if _is_generator(fn) or fn.name.startswith(\"__\")}\n        for fn in self.functions:\n            if any(isinstance(n, ast.Call) and _called_name(n) in _TURTLE_LOOPS for n in _walk_own(fn)):\n                async_fns.add(fn)\n        names = {fn.name for fn in async_fns} | _TURTLE_LOOPS\n        changed = True\n        while changed:\n            changed = False\n            for fn in self.functions:\n                if fn in async_fns or fn in unasyncable:\n                    continue\n                if any(isinstance(n, ast.Call) and _called_name(n) in names for n in _walk_own(fn)):\n                    async_fns.add(fn)\n                    names.add(fn.name)\n                    changed = True\n        async_fns -= unasyncable\n        names = {fn.name for fn in async_fns} | _TURTLE_LOOPS\n\n        transformer = _CallRewriter(names, async_fns, unasyncable)\n        tree = transformer.visit(self.tree)\n        for fn in list(async_fns):\n            fn.__class__ = ast.AsyncFunctionDef\n        ast.fix_missing_locations(tree)\n        return tree, bool(async_fns) or top_level_turn\n\n\ndef _walk_own_loop(loop):\n    \"\"\"A loop's body (and a while's test): a ``for`` over ``event.get()`` is\n    one frame's events, not the frame loop.\"\"\"\n    parts = list(loop.body)\n    if isinstance(loop, ast.While):\n        parts.append(loop.test)\n    for part in parts:\n        yield part\n        yield from _walk_own(part)\n\n\ndef _game_call(name, args):\n    return ast.Call(func=ast.Attribute(value=ast.Name(id=_MARK, ctx=ast.Load()), attr=name, ctx=ast.Load()), args=args, keywords=[])\n\n\nclass _CallRewriter(ast.NodeTransformer):\n    def __init__(self, names, async_fns, unasyncable):\n        self.names = names\n        self.async_fns = async_fns\n        self.unasyncable = unasyncable\n        self.scope = [None]\n\n    def _in_async(self):\n        scope = self.scope[-1]\n        return scope is None or scope in self.async_fns or isinstance(scope, ast.AsyncFunctionDef)\n\n    def visit_FunctionDef(self, node):\n        self.scope.append(node)\n        self.generic_visit(node)\n        self.scope.pop()\n        return node\n\n    visit_AsyncFunctionDef = visit_FunctionDef\n\n    def visit_Lambda(self, node):\n        self.scope.append(node)\n        self.generic_visit(node)\n        self.scope.pop()\n        return node\n\n    def visit_ListComp(self, node):\n        self.scope.append(node)\n        self.generic_visit(node)\n        self.scope.pop()\n        return node\n\n    visit_SetComp = visit_DictComp = visit_GeneratorExp = visit_ListComp\n\n    def visit_Call(self, node):\n        self.generic_visit(node)\n        func = node.func\n        # A Surface's convert wants a display: a copy is the same picture.\n        if isinstance(func, ast.Attribute) and func.attr in (\"convert\", \"convert_alpha\"):\n            return ast.copy_location(\n                _game_call(\"convert\", [func.value, ast.Constant(func.attr), *node.args]) if not node.keywords\n                else ast.Call(func=ast.Attribute(value=ast.Name(id=_MARK, ctx=ast.Load()), attr=\"convert\", ctx=ast.Load()),\n                              args=[func.value, ast.Constant(func.attr), *node.args], keywords=node.keywords),\n                node,\n            )\n        dotted = _dotted(func) or \"\"\n        in_async = self._in_async() and not isinstance(self.scope[-1], (ast.Lambda, ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp))\n        if in_async:\n            # asyncio.run(main()) is main() awaited: the page's loop is running.\n            if dotted in (\"asyncio.run\",) and node.args:\n                return ast.copy_location(ast.Await(_game_call(\"call\", [node.args[0]])), node)\n            head, _, tail = dotted.rpartition(\".\")\n            if (head, tail) in _SLEEP_CALLS and node.args:\n                which = \"sleep\" if tail == \"sleep\" else \"wait_ms\"\n                return ast.copy_location(ast.Await(_game_call(which, list(node.args))), node)\n        name = _called_name(node)\n        if name in self.names:\n            if in_async:\n                return ast.copy_location(ast.Await(_game_call(\"call\", [node])), node)\n            return ast.copy_location(_game_call(\"spawn\", [node]), node)\n        return node\n\n\ndef rewrite(source, filename=\"<exec>\"):\n    tree = ast.parse(source, filename)\n    return _Rewriter(tree).run()\n\n\nasync def run_source(source, namespace, filename=\"<exec>\"):\n    tree, _ = rewrite(source, filename)\n    namespace[_MARK] = GAME\n    code = compile(tree, filename, \"exec\", flags=ast.PyCF_ALLOW_TOP_LEVEL_AWAIT, dont_inherit=True)\n    try:\n        result = eval(code, namespace)\n        if asyncio.iscoroutine(result):\n            await result\n        while _state.tasks:\n            task = _state.tasks.pop(0)\n            await task\n    except SystemExit:\n        pass\n    finally:\n        turtle = sys.modules.get(\"turtle\")\n        screen = getattr(turtle, \"_screen\", None) if getattr(turtle, \"_MRAI\", False) else None\n        if screen is not None:\n            screen._present(force=True)\n        _send_frame(force=True)\n" /* </mrai-game-source> */;

  // lib/code-runner/python-game/mrai_turtle.py, embedded: `turtle` in the page.
  const MRAI_TURTLE_SOURCE = /* <mrai-turtle-source> */ "\"\"\"turtle, drawn in the code page (owner, 2026-11-17).\n\nThe standard turtle needs tkinter, which the page's Python (Pyodide) does\nnot have. This module is ``turtle`` there: the same calls, drawn with pygame\non a Surface whose frames go to the page's canvas through the game channel\n(_mrai_game), keys and clicks coming back. Lines appear as a loop draws them\n(each pass gives the page a turn, paced by ``speed``); ``done()``,\n``mainloop()`` and ``exitonclick()`` keep the window answering keys, clicks\nand timers until the reader stops it.\n\"\"\"\n\nimport asyncio\nimport math\nimport time\n\nimport pygame\n\nimport _mrai_game as game\n\n#: Marks this module as the page's turtle (_mrai_game.run_source).\n_MRAI = True\n_DEFAULT_SIZE = (640, 480)\n_SHAPES = {\n    \"classic\": [(0, 0), (-10, 5), (-7, 0), (-10, -5)],\n    \"arrow\": [(10, 0), (-10, 10), (-10, -10)],\n    \"triangle\": [(10, 0), (-5, 8.66), (-5, -8.66)],\n    \"square\": [(10, 10), (-10, 10), (-10, -10), (10, -10)],\n    \"circle\": [(10 * math.cos(a / 10 * 2 * math.pi), 10 * math.sin(a / 10 * 2 * math.pi)) for a in range(10)],\n    \"turtle\": [(16, 0), (14, 2), (10, 1), (7, 4), (9, 7), (8, 9), (5, 6), (1, 7), (-3, 5), (-6, 8), (-8, 6),\n               (-5, 4), (-7, 0), (-5, -4), (-8, -6), (-6, -8), (-3, -5), (1, -7), (5, -6), (8, -9), (9, -7),\n               (7, -4), (10, -1), (14, -2)],\n}\n\n\nclass Terminator(Exception):\n    pass\n\n\nclass TurtleGraphicsError(Exception):\n    pass\n\n\ndef _rgb(value, mode):\n    if isinstance(value, str):\n        try:\n            color = pygame.Color(value.strip())\n            return (color.r, color.g, color.b)\n        except ValueError as error:\n            raise TurtleGraphicsError(f\"bad color string: {value}\") from error\n    if isinstance(value, (tuple, list)) and len(value) >= 3:\n        r, g, b = value[:3]\n        if mode == 1.0:\n            return tuple(max(0, min(255, int(round(float(c) * 255)))) for c in (r, g, b))\n        return tuple(max(0, min(255, int(c))) for c in (r, g, b))\n    raise TurtleGraphicsError(f\"bad color arguments: {value!r}\")\n\n\ndef _color_args(args):\n    if len(args) == 1:\n        return args[0]\n    if len(args) == 3:\n        return tuple(args)\n    raise TurtleGraphicsError(f\"bad color arguments: {args!r}\")\n\n\nclass _Screen:\n    def __init__(self):\n        self._mode = 1.0\n        self._title = \"Python Turtle Graphics\"\n        self._bg = (255, 255, 255)\n        self._turtles = []\n        self._keys = {}\n        self._release = {}\n        self._clicks = []\n        self._timers = []\n        self._tracer = 1\n        self._delay = 10\n        self._canvas = None\n        self._size = _DEFAULT_SIZE\n\n    # --- the picture ---------------------------------------------------------------\n\n    def _ensure(self):\n        if self._canvas is None:\n            self.setup(*self._size)\n        return self._canvas\n\n    def _point(self, x, y):\n        width, height = self._size\n        return (width / 2 + x, height / 2 - y)\n\n    def _present(self, force=False):\n        canvas = self._ensure()\n        if not force and self._tracer == 0:\n            return\n        frame = canvas.copy()\n        for turtle in self._turtles:\n            if turtle._visible:\n                turtle._draw_shape(frame)\n        screen = game._state.screen\n        if screen is not None and screen.get_size() == frame.get_size():\n            screen.blit(frame, (0, 0))\n        game._state.caption = self._title\n        game._send_frame(force=force)\n\n    # --- the calls ----------------------------------------------------------------\n\n    def setup(self, width=_DEFAULT_SIZE[0], height=_DEFAULT_SIZE[1], startx=None, starty=None):\n        if isinstance(width, float) and width <= 1:\n            width = int(_DEFAULT_SIZE[0] * width / 0.5)\n        if isinstance(height, float) and height <= 1:\n            height = int(_DEFAULT_SIZE[1] * height / 0.75)\n        self._size = (max(50, min(2048, int(width))), max(50, min(2048, int(height))))\n        old = self._canvas\n        self._canvas = pygame.Surface(self._size)\n        self._canvas.fill(self._bg)\n        if old is not None:\n            self._canvas.blit(old, ((self._size[0] - old.get_width()) // 2, (self._size[1] - old.get_height()) // 2))\n        pygame.display.set_mode(self._size)\n\n    def screensize(self, canvwidth=None, canvheight=None, bg=None):\n        if canvwidth is None and canvheight is None and bg is None:\n            return self._size\n        if canvwidth and canvheight:\n            self.setup(canvwidth, canvheight)\n        if bg is not None:\n            self.bgcolor(bg)\n\n    def title(self, text):\n        self._title = str(text)\n\n    def bgcolor(self, *args):\n        if not args:\n            return self._bg\n        self._bg = _rgb(_color_args(args), self._mode)\n        canvas = self._ensure()\n        canvas.fill(self._bg)\n        for turtle in self._turtles:\n            turtle._redraw_lines(canvas)\n        self._present()\n\n    def colormode(self, mode=None):\n        if mode is None:\n            return 255 if self._mode == 255 else 1.0\n        self._mode = 255 if mode == 255 else 1.0\n\n    def tracer(self, n=None, delay=None):\n        if n is None:\n            return self._tracer\n        self._tracer = int(n)\n        if delay is not None:\n            self._delay = delay\n        if self._tracer:\n            self._present()\n\n    def update(self):\n        self._present(force=True)\n\n    def delay(self, delay=None):\n        if delay is None:\n            return self._delay\n        self._delay = delay\n\n    def window_width(self):\n        return self._size[0]\n\n    def window_height(self):\n        return self._size[1]\n\n    def clear(self):\n        self._turtles = []\n        self._keys, self._release, self._clicks, self._timers = {}, {}, [], []\n        canvas = self._ensure()\n        canvas.fill(self._bg)\n        self._present()\n\n    clearscreen = clear\n\n    def reset(self):\n        for turtle in list(self._turtles):\n            turtle.reset()\n\n    resetscreen = reset\n\n    def turtles(self):\n        return list(self._turtles)\n\n    def getcanvas(self):\n        return self._canvas\n\n    def register_shape(self, name, shape=None):\n        if isinstance(shape, (tuple, list)):\n            _SHAPES[name] = [(float(y), float(x)) for x, y in shape]\n\n    addshape = register_shape\n\n    def getshapes(self):\n        return sorted(_SHAPES)\n\n    def mode(self, mode=None):\n        return \"standard\"\n\n    def setworldcoordinates(self, *args):\n        return None\n\n    def listen(self, xdummy=None, ydummy=None):\n        return None\n\n    def onkey(self, fun, key=None):\n        self._keys[_keyname(key)] = fun\n\n    onkeyrelease = onkey\n\n    def onkeypress(self, fun, key=None):\n        self._keys[_keyname(key)] = fun\n\n    def onclick(self, fun, btn=1, add=None):\n        if fun is None:\n            self._clicks = []\n        elif add:\n            self._clicks.append((fun, btn))\n        else:\n            self._clicks = [(fun, btn)]\n\n    onscreenclick = onclick\n\n    def ontimer(self, fun, t=0):\n        self._timers.append((time.perf_counter() + max(0, t) / 1000, fun))\n\n    def textinput(self, title, prompt):\n        return None\n\n    def numinput(self, title, prompt, default=None, minval=None, maxval=None):\n        return default\n\n    def bye(self):\n        game._state.quit_asked = True\n\n    def _dispatch(self):\n        for event in pygame.event.get():\n            if event.type == pygame.QUIT:\n                game._state.quit_asked = True\n            elif event.type == pygame.KEYDOWN:\n                handler = self._keys.get(pygame.key.name(event.key).lower()) or self._keys.get(None)\n                if handler is not None:\n                    handler()\n            elif event.type == pygame.MOUSEBUTTONDOWN:\n                x = event.pos[0] - self._size[0] / 2\n                y = self._size[1] / 2 - event.pos[1]\n                for fun, btn in list(self._clicks):\n                    if btn == event.button:\n                        fun(x, y)\n                for turtle in list(self._turtles):\n                    if turtle._click and math.hypot(turtle._x - x, turtle._y - y) <= 12 * turtle._stretch:\n                        turtle._click(x, y)\n        now = time.perf_counter()\n        due = [timer for timer in self._timers if timer[0] <= now]\n        self._timers = [timer for timer in self._timers if timer[0] > now]\n        for _, fun in due:\n            fun()\n\n    async def mainloop(self, until_click=False):\n        self._present(force=True)\n        if until_click:\n            self._clicks = [(lambda x, y: self.bye(), 1)]\n        while not game._state.quit_asked:\n            self._dispatch()\n            if game._state.dirty or self._tracer:\n                self._present(force=True)\n            await asyncio.sleep(1 / 60)\n\n    async def exitonclick(self):\n        await self.mainloop(until_click=True)\n\n    done = mainloop\n\n\ndef _keyname(key):\n    if key is None:\n        return None\n    key = str(key)\n    aliases = {\"Up\": \"up\", \"Down\": \"down\", \"Left\": \"left\", \"Right\": \"right\", \"Return\": \"return\",\n               \"Escape\": \"escape\", \"space\": \"space\", \"BackSpace\": \"backspace\", \"Tab\": \"tab\"}\n    return aliases.get(key, key).lower()\n\n\n_screen = None\n\n\ndef Screen():\n    global _screen\n    if _screen is None:\n        _screen = _Screen()\n        _screen._ensure()\n    return _screen\n\n\nclass Turtle:\n    def __init__(self, shape=\"classic\", undobuffersize=1000, visible=True):\n        self.screen = Screen()\n        self.screen._turtles.append(self)\n        self._shape = shape if shape in _SHAPES else \"classic\"\n        self._visible = visible\n        self._click = None\n        self._lines = []\n        self.reset()\n\n    # --- state --------------------------------------------------------------------\n\n    def reset(self):\n        self._x, self._y, self._heading = 0.0, 0.0, 0.0\n        self._down = True\n        self._pensize = 1\n        self._pen = (0, 0, 0)\n        self._fill = (0, 0, 0)\n        self._filling = None\n        self._speed = 3\n        self._stretch = 1.0\n        self._lines = []\n        canvas = self.screen._ensure()\n        canvas.fill(self.screen._bg)\n        for turtle in self.screen._turtles:\n            if turtle is not self:\n                turtle._redraw_lines(canvas)\n        self.screen._present()\n\n    def clear(self):\n        self._lines = []\n        canvas = self.screen._ensure()\n        canvas.fill(self.screen._bg)\n        for turtle in self.screen._turtles:\n            if turtle is not self:\n                turtle._redraw_lines(canvas)\n        self.screen._present()\n\n    def _redraw_lines(self, canvas):\n        for kind, args in self._lines:\n            _paint(canvas, kind, args)\n\n    def _record(self, kind, *args):\n        self._lines.append((kind, args))\n        _paint(self.screen._ensure(), kind, args)\n\n    def _pace(self):\n        if self.screen._tracer == 0 or self._speed == 0:\n            return\n        game._state.extra_sleep = min(game._state.extra_sleep + (11 - self._speed) * 0.008, 0.25)\n        self.screen._present()\n\n    # --- motion --------------------------------------------------------------------\n\n    def _move_to(self, x, y):\n        start = self.screen._point(self._x, self._y)\n        self._x, self._y = float(x), float(y)\n        end = self.screen._point(self._x, self._y)\n        if self._down:\n            self._record(\"line\", self._pen, start, end, self._pensize)\n        if self._filling is not None:\n            self._filling.append(end)\n        self._pace()\n\n    def forward(self, distance):\n        rad = math.radians(self._heading)\n        self._move_to(self._x + distance * math.cos(rad), self._y + distance * math.sin(rad))\n\n    fd = forward\n\n    def back(self, distance):\n        self.forward(-distance)\n\n    bk = backward = back\n\n    def left(self, angle):\n        self._heading = (self._heading + angle) % 360\n        self._pace()\n\n    lt = left\n\n    def right(self, angle):\n        self.left(-angle)\n\n    rt = right\n\n    def goto(self, x, y=None):\n        if y is None:\n            x, y = x\n        self._move_to(x, y)\n\n    setpos = setposition = goto\n\n    def teleport(self, x=None, y=None, *, fill_gap=False):\n        self._x = float(self._x if x is None else x)\n        self._y = float(self._y if y is None else y)\n\n    def setx(self, x):\n        self._move_to(x, self._y)\n\n    def sety(self, y):\n        self._move_to(self._x, y)\n\n    def setheading(self, to_angle):\n        self._heading = float(to_angle) % 360\n\n    seth = setheading\n\n    def home(self):\n        self._move_to(0, 0)\n        self._heading = 0.0\n\n    def circle(self, radius, extent=None, steps=None):\n        extent = 360 if extent is None else extent\n        frac = abs(extent) / 360\n        if steps is None:\n            steps = 1 + int(min(11 + abs(radius) / 6.0, 59.0) * frac)\n        w = extent / steps\n        w2 = 0.5 * w\n        length = 2.0 * radius * math.sin(math.radians(w2))\n        if radius < 0:\n            length, w, w2 = -length, -w, -w2\n        speed, self._speed = self._speed, 0\n        self.left(w2)\n        for _ in range(steps):\n            self.forward(length)\n            self.left(w)\n        self.left(-w2)\n        self._speed = speed\n        self._pace()\n\n    def dot(self, size=None, *color):\n        color = _rgb(_color_args(color), self.screen._mode) if color else self._pen\n        size = size or max(self._pensize + 4, 2 * self._pensize)\n        self._record(\"dot\", color, self.screen._point(self._x, self._y), size)\n        self._pace()\n\n    def stamp(self):\n        self._record(\"polygon\", self._fill, self._shape_points(), 0)\n        return len(self._lines)\n\n    def clearstamp(self, stampid):\n        return None\n\n    def clearstamps(self, n=None):\n        return None\n\n    def undo(self):\n        return None\n\n    def speed(self, speed=None):\n        if speed is None:\n            return self._speed\n        names = {\"fastest\": 0, \"fast\": 10, \"normal\": 6, \"slow\": 3, \"slowest\": 1}\n        speed = names.get(speed, speed)\n        speed = int(speed)\n        self._speed = speed if 0 < speed <= 10 else 0\n\n    # --- what it tells -------------------------------------------------------------\n\n    def position(self):\n        return Vec2D(self._x, self._y)\n\n    pos = position\n\n    def xcor(self):\n        return self._x\n\n    def ycor(self):\n        return self._y\n\n    def heading(self):\n        return self._heading\n\n    def towards(self, x, y=None):\n        if y is None:\n            x, y = x\n        return math.degrees(math.atan2(y - self._y, x - self._x)) % 360\n\n    def distance(self, x, y=None):\n        if y is None:\n            if isinstance(x, Turtle):\n                x, y = x._x, x._y\n            else:\n                x, y = x\n        return math.hypot(x - self._x, y - self._y)\n\n    # --- pen -----------------------------------------------------------------------\n\n    def pendown(self):\n        self._down = True\n\n    pd = down = pendown\n\n    def penup(self):\n        self._down = False\n\n    pu = up = penup\n\n    def isdown(self):\n        return self._down\n\n    def pensize(self, width=None):\n        if width is None:\n            return self._pensize\n        self._pensize = max(1, int(round(width)))\n\n    width = pensize\n\n    def pencolor(self, *args):\n        if not args:\n            return self._pen\n        self._pen = _rgb(_color_args(args), self.screen._mode)\n\n    def fillcolor(self, *args):\n        if not args:\n            return self._fill\n        self._fill = _rgb(_color_args(args), self.screen._mode)\n\n    def color(self, *args):\n        if not args:\n            return (self._pen, self._fill)\n        if len(args) == 2:\n            self.pencolor(args[0])\n            self.fillcolor(args[1])\n        else:\n            self.pencolor(*args)\n            self.fillcolor(*args)\n\n    def pen(self, pen=None, **kwargs):\n        return {\"shown\": self._visible, \"pendown\": self._down, \"pencolor\": self._pen,\n                \"fillcolor\": self._fill, \"pensize\": self._pensize, \"speed\": self._speed}\n\n    def filling(self):\n        return self._filling is not None\n\n    def begin_fill(self):\n        self._filling = [self.screen._point(self._x, self._y)]\n\n    def end_fill(self):\n        points, self._filling = self._filling, None\n        if points and len(points) > 2:\n            self._record(\"polygon\", self._fill, points, 0)\n            if self._down:\n                self._record(\"lines\", self._pen, points, self._pensize)\n        self._pace()\n\n    def write(self, arg, move=False, align=\"left\", font=(\"Arial\", 8, \"normal\")):\n        size = 8\n        bold = italic = False\n        if isinstance(font, (tuple, list)) and len(font) >= 2:\n            size = int(font[1])\n            style = str(font[2]) if len(font) > 2 else \"\"\n            bold, italic = \"bold\" in style, \"italic\" in style\n        text = str(arg)\n        x, y = self.screen._point(self._x, self._y)\n        self._record(\"text\", self._pen, (x, y), text, max(6, int(size * 1.35)), str(align), bold, italic)\n        self._pace()\n\n    # --- how it looks ------------------------------------------------------------\n\n    def showturtle(self):\n        self._visible = True\n        self.screen._present()\n\n    st = showturtle\n\n    def hideturtle(self):\n        self._visible = False\n        self.screen._present()\n\n    ht = hideturtle\n\n    def isvisible(self):\n        return self._visible\n\n    def shape(self, name=None):\n        if name is None:\n            return self._shape\n        if name in _SHAPES:\n            self._shape = name\n\n    def shapesize(self, stretch_wid=None, stretch_len=None, outline=None):\n        if stretch_wid is None and stretch_len is None:\n            return (self._stretch, self._stretch, 1)\n        self._stretch = float(stretch_wid or stretch_len or 1)\n\n    turtlesize = shapesize\n\n    def _shape_points(self):\n        rad = math.radians(self._heading)\n        cos, sin = math.cos(rad), math.sin(rad)\n        points = []\n        for px, py in _SHAPES[self._shape]:\n            px, py = px * self._stretch, py * self._stretch\n            x = self._x + px * cos - py * sin\n            y = self._y + px * sin + py * cos\n            points.append(self.screen._point(x, y))\n        return points\n\n    def _draw_shape(self, surface):\n        points = self._shape_points()\n        if len(points) >= 3:\n            pygame.draw.polygon(surface, self._fill, points)\n            pygame.draw.polygon(surface, self._pen, points, 1)\n\n    # --- events ------------------------------------------------------------------\n\n    def onclick(self, fun, btn=1, add=None):\n        self._click = fun\n\n    def onrelease(self, fun, btn=1, add=None):\n        return None\n\n    def ondrag(self, fun, btn=1, add=None):\n        return None\n\n    def getscreen(self):\n        return self.screen\n\n    def clone(self):\n        twin = Turtle(self._shape, visible=self._visible)\n        for name in (\"_x\", \"_y\", \"_heading\", \"_down\", \"_pensize\", \"_pen\", \"_fill\", \"_speed\", \"_stretch\"):\n            setattr(twin, name, getattr(self, name))\n        return twin\n\n    def getturtle(self):\n        return self\n\n    getpen = getturtle\n\n    def __getattr__(self, name):\n        raise AttributeError(f\"'Turtle' object has no attribute '{name}'\")\n\n\nPen = RawTurtle = RawPen = Turtle\n\n\nclass Vec2D(tuple):\n    def __new__(cls, x, y):\n        return tuple.__new__(cls, (x, y))\n\n    def __add__(self, other):\n        return Vec2D(self[0] + other[0], self[1] + other[1])\n\n    def __sub__(self, other):\n        return Vec2D(self[0] - other[0], self[1] - other[1])\n\n    def __mul__(self, other):\n        if isinstance(other, Vec2D):\n            return self[0] * other[0] + self[1] * other[1]\n        return Vec2D(self[0] * other, self[1] * other)\n\n    __rmul__ = __mul__\n\n    def __neg__(self):\n        return Vec2D(-self[0], -self[1])\n\n    def __abs__(self):\n        return math.hypot(*self)\n\n    def __repr__(self):\n        return f\"({self[0]:.2f},{self[1]:.2f})\"\n\n\ndef _paint(canvas, kind, args):\n    if kind == \"line\":\n        color, start, end, width = args\n        pygame.draw.line(canvas, color, start, end, width)\n        if width > 2:\n            pygame.draw.circle(canvas, color, start, width // 2)\n            pygame.draw.circle(canvas, color, end, width // 2)\n    elif kind == \"lines\":\n        color, points, width = args\n        pygame.draw.lines(canvas, color, True, points, width)\n    elif kind == \"polygon\":\n        color, points, width = args\n        pygame.draw.polygon(canvas, color, points, width)\n    elif kind == \"dot\":\n        color, center, size = args\n        pygame.draw.circle(canvas, color, center, max(1, size / 2))\n    elif kind == \"text\":\n        color, (x, y), text, size, align, bold, italic = args\n        font = pygame.font.SysFont(None, size, bold=bold, italic=italic)\n        rendered = font.render(text, True, color)\n        width, height = rendered.get_size()\n        left = x if align == \"left\" else x - width / 2 if align == \"center\" else x - width\n        canvas.blit(rendered, (left, y - height))\n\n\n# --- the module's own functions: the first turtle's and the screen's ---------------\n\n_anonymous = None\n\n\ndef getturtle():\n    global _anonymous\n    if _anonymous is None:\n        _anonymous = Turtle()\n    return _anonymous\n\n\ngetpen = getturtle\n\n_TURTLE_FUNCTIONS = [\n    \"forward\", \"fd\", \"back\", \"bk\", \"backward\", \"left\", \"lt\", \"right\", \"rt\", \"goto\", \"setpos\",\n    \"setposition\", \"teleport\", \"setx\", \"sety\", \"setheading\", \"seth\", \"home\", \"circle\", \"dot\", \"stamp\",\n    \"clearstamp\", \"clearstamps\", \"undo\", \"speed\", \"position\", \"pos\", \"xcor\", \"ycor\", \"heading\",\n    \"towards\", \"distance\", \"pendown\", \"pd\", \"down\", \"penup\", \"pu\", \"up\", \"isdown\", \"pensize\", \"width\",\n    \"pencolor\", \"fillcolor\", \"color\", \"pen\", \"filling\", \"begin_fill\", \"end_fill\", \"write\",\n    \"showturtle\", \"st\", \"hideturtle\", \"ht\", \"isvisible\", \"shape\", \"shapesize\", \"turtlesize\",\n    \"onrelease\", \"ondrag\", \"clone\",\n]\n_SCREEN_FUNCTIONS = [\n    \"setup\", \"screensize\", \"title\", \"bgcolor\", \"colormode\", \"tracer\", \"update\", \"delay\",\n    \"window_width\", \"window_height\", \"clearscreen\", \"resetscreen\", \"turtles\", \"register_shape\",\n    \"addshape\", \"getshapes\", \"mode\", \"setworldcoordinates\", \"listen\", \"onkey\", \"onkeyrelease\",\n    \"onkeypress\", \"onscreenclick\", \"ontimer\", \"textinput\", \"numinput\", \"bye\", \"mainloop\", \"done\",\n    \"exitonclick\", \"getcanvas\",\n]\n\n\ndef _turtle_function(name):\n    def call(*args, **kwargs):\n        return getattr(getturtle(), name)(*args, **kwargs)\n\n    call.__name__ = name\n    return call\n\n\ndef _screen_function(name):\n    def call(*args, **kwargs):\n        return getattr(Screen(), name)(*args, **kwargs)\n\n    call.__name__ = name\n    return call\n\n\nfor _name in _TURTLE_FUNCTIONS:\n    globals()[_name] = _turtle_function(_name)\nfor _name in _SCREEN_FUNCTIONS:\n    globals()[_name] = _screen_function(_name)\n\n\ndef clear():\n    getturtle().clear()\n\n\ndef reset():\n    getturtle().reset()\n\n\ndef onclick(fun, btn=1, add=None):\n    getturtle().onclick(fun, btn, add)\n\n\n__all__ = (\n    [\"Screen\", \"Turtle\", \"Pen\", \"RawTurtle\", \"RawPen\", \"Vec2D\", \"Terminator\", \"TurtleGraphicsError\",\n     \"getturtle\", \"getpen\", \"clear\", \"reset\", \"onclick\"]\n    + _TURTLE_FUNCTIONS\n    + _SCREEN_FUNCTIONS\n)\n\n\ndef _fresh():\n    \"\"\"A new run starts with a new window.\"\"\"\n    global _screen, _anonymous\n    _screen = None\n    _anonymous = None\n" /* </mrai-turtle-source> */;

  async function runGame(py, id, code) {
    const run = { id, queue: [], lastFrameAt: -GAME_MIN_FRAME_GAP_MS };
    gameRun = run;
    try {
      py.registerJsModule("_mrai_game_host", gameHostFor(run));
      py.globals.set("__mrai_game_module_src__", MRAI_GAME_SOURCE);
      if (usesTurtle(code)) {
        // A new window per run; turtle draws with pygame, which `import
        // turtle` alone does not load.
        await py.loadPackage("pygame-ce");
        py.globals.set("__mrai_turtle_module_src__", MRAI_TURTLE_SOURCE);
      }
      py.globals.set("__mrai_game_src__", code);
      return await py.runPythonAsync(GAME_DRIVER, { filename: "<mrai-driver>" });
    } finally {
      if (gameRun === run) gameRun = null;
    }
  }

  const PYODIDE_VERSION = "0.26.2";
  // MRNote Classic serves this worker from its local Python sandbox host with
  // the Pyodide the app ships beside it, and binds `__mrnoteLocalPyodide`
  // ahead of this script (apps/web/desktop-sandbox.mjs): the runtime, its
  // packages and the lint/format helpers' wheels are then read from that
  // host, and nothing else is fetched. The site's worker has no binding and
  // loads the pinned CDN build. Read once, before any Python exists.
  const LOCAL_RUNTIME = (function () {
    const binding = self.__mrnoteLocalPyodide;
    try {
      delete self.__mrnoteLocalPyodide;
    } catch {
      /* non-configurable: still read once below */
    }
    if (!binding || typeof binding !== "object") return null;
    const sameOrigin = (path) => {
      if (typeof path !== "string" || path[0] !== "/") return null;
      const url = new URL(path, self.location.origin);
      return url.origin === self.location.origin ? url.href : null;
    };
    const indexURL = sameOrigin(binding.indexPath);
    if (!indexURL || indexURL[indexURL.length - 1] !== "/") return null;
    const wheels = Object.create(null);
    const listed =
      binding.wheels && typeof binding.wheels === "object" ? binding.wheels : {};
    for (const name of ["pyflakes", "autopep8"]) {
      const paths = trustedArrayIsArray(listed[name]) ? listed[name] : [];
      const urls = paths.map(sameOrigin);
      if (urls.length > 0 && urls.every(Boolean)) wheels[name] = urls;
    }
    return { indexURL, wheels };
  })();
  const PYODIDE_CDN = LOCAL_RUNTIME
    ? LOCAL_RUNTIME.indexURL
    : "https://cdn.jsdelivr.net/pyodide/v" + PYODIDE_VERSION + "/full/";
  /** The micropip call that installs a lint/format helper (pyflakes, autopep8). */
  function helperInstallSource(name) {
    const local = LOCAL_RUNTIME && LOCAL_RUNTIME.wheels[name];
    // The shipped wheels, dependencies listed alongside: no index is asked.
    if (local) {
      return (
        "import micropip; await micropip.install(" +
        trustedJsonStringify(local) +
        ", deps=False)"
      );
    }
    return "import micropip; await micropip.install('" + name + "')";
  }
  const MAX_OUTPUT_LINES = 2000;
  const MAX_OUTPUT_LINE_CHARS = 20000;
  const MAX_OUTPUT_LOG_CHARS = 300000;
  const MAX_OUTPUT_TEXT_CHARS = 50000;
  const MAX_OUTPUT_HTML_CHARS = 200000;
  const MAX_RICH_IMAGES = 20;
  const MAX_RICH_IMAGE_BASE64_CHARS = 1000000;
  const MAX_RICH_IMAGE_BYTES = Math.floor(
    (MAX_RICH_IMAGE_BASE64_CHARS * 3) / 4,
  );
  const MAX_RICH_FIGURE_EDGE = 4096;
  const MAX_RICH_FIGURE_PIXELS = 4000000;
  const MAX_PROTOCOL_ITEMS = 500;
  const MAX_PROTOCOL_COMPLETIONS = 80;
  const MAX_PROTOCOL_TOTAL_CHARS = 100000;
  const MAX_PROTOCOL_NAME_CHARS = 256;
  const MAX_PROTOCOL_TYPE_CHARS = 128;
  const MAX_PROTOCOL_PREVIEW_CHARS = 120;
  const MAX_PROTOCOL_FIELD_CHARS = 4096;
  const MAX_PROTOCOL_DOC_CHARS = 1500;
  const MAX_PROTOCOL_FORMATTED_CHARS = 2000000;
  const MAX_PROTOCOL_COORDINATE = 10000000;
  const OUTPUT_TRUNCATION_MARKER =
    "… [output truncated: execution budget reached]";

  function protocolString(value, maxChars, budget, allowEmpty) {
    if (typeof value !== "string" || budget.remaining <= 0) return null;
    const bounded = trustedStringSlice(
      value,
      0,
      trustedMathMin(maxChars, budget.remaining),
    );
    if (allowEmpty === false && bounded.length === 0) return null;
    budget.remaining -= bounded.length;
    return bounded;
  }

  function protocolError(data, target, budget) {
    if (typeof data.error !== "string") return;
    const error = protocolString(
      data.error,
      MAX_PROTOCOL_FIELD_CHARS,
      budget,
      true,
    );
    if (error !== null) target.error = error;
  }

  function protocolInteger(value, min, max) {
    return trustedNumberIsSafeInteger(value) && value >= min && value <= max
      ? value
      : null;
  }

  /**
   * Treat every Python-derived IDE reply as hostile even after it is wrapped in
   * the worker-owned capability. The persistent interpreter can be poisoned by
   * authored code; this fixed schema/count/string/aggregate budget prevents that
   * interpreter from using a trusted helper as a large-message confused deputy.
   */
  function boundNonExecutionResult(data) {
    if (!data || typeof data !== "object") return null;
    const id = protocolInteger(data.id, 0, Number.MAX_SAFE_INTEGER);
    if (id === null) return null;
    const budget = { remaining: MAX_PROTOCOL_TOTAL_CHARS };

    if (trustedArrayIsArray(data.variables)) {
      const variables = [];
      for (
        let index = 0;
        index < data.variables.length && index < MAX_PROTOCOL_ITEMS;
        index += 1
      ) {
        const candidate = data.variables[index];
        if (
          !candidate ||
          typeof candidate !== "object" ||
          trustedArrayIsArray(candidate)
        )
          continue;
        const name = protocolString(
          candidate.name,
          MAX_PROTOCOL_NAME_CHARS,
          budget,
          false,
        );
        if (name === null) continue;
        const type = protocolString(
          candidate.type,
          MAX_PROTOCOL_TYPE_CHARS,
          budget,
          true,
        );
        const preview = protocolString(
          candidate.preview,
          MAX_PROTOCOL_PREVIEW_CHARS,
          budget,
          true,
        );
        if (type === null || preview === null) break;
        trustedArrayPush(variables, { name, type, preview });
      }
      const result = { id, variables };
      protocolError(data, result, budget);
      return result;
    }

    if (
      data.lint &&
      typeof data.lint === "object" &&
      !trustedArrayIsArray(data.lint)
    ) {
      const rawLint = data.lint;
      const lint = rawLint.ok === false ? { ok: false } : { ok: true };
      if (lint.ok === false) {
        for (const key of ["lineno", "offset", "endLineno", "endOffset"]) {
          const value = protocolInteger(
            rawLint[key],
            0,
            MAX_PROTOCOL_COORDINATE,
          );
          if (value !== null) lint[key] = value;
        }
        const msg = protocolString(
          rawLint.msg,
          MAX_PROTOCOL_FIELD_CHARS,
          budget,
          true,
        );
        if (msg !== null) lint.msg = msg;
      }
      const warnings = [];
      const rawWarnings = trustedArrayIsArray(data.warnings)
        ? data.warnings
        : [];
      for (
        let index = 0;
        index < rawWarnings.length && index < MAX_PROTOCOL_ITEMS;
        index += 1
      ) {
        const candidate = rawWarnings[index];
        if (
          !candidate ||
          typeof candidate !== "object" ||
          trustedArrayIsArray(candidate)
        )
          continue;
        const row = protocolInteger(candidate.row, 1, MAX_PROTOCOL_COORDINATE);
        const col = protocolInteger(candidate.col, 1, MAX_PROTOCOL_COORDINATE);
        if (row === null || col === null) continue;
        const message = protocolString(
          candidate.message,
          MAX_PROTOCOL_FIELD_CHARS,
          budget,
          false,
        );
        const type = protocolString(
          candidate.type,
          MAX_PROTOCOL_TYPE_CHARS,
          budget,
          false,
        );
        if (message === null || type === null) break;
        trustedArrayPush(warnings, { row, col, message, type });
      }
      const result = { id, lint, warnings };
      protocolError(data, result, budget);
      return result;
    }

    if (typeof data.formatted === "string") {
      const result = {
        id,
        formatted:
          data.formatted.length <= MAX_PROTOCOL_FORMATTED_CHARS
            ? data.formatted
            : "",
      };
      protocolError(data, result, budget);
      return result;
    }

    if (trustedArrayIsArray(data.completions)) {
      const completions = [];
      for (
        let index = 0;
        index < data.completions.length && index < MAX_PROTOCOL_COMPLETIONS;
        index += 1
      ) {
        const candidate = data.completions[index];
        if (
          !candidate ||
          typeof candidate !== "object" ||
          trustedArrayIsArray(candidate)
        )
          continue;
        const name = protocolString(
          candidate.name,
          MAX_PROTOCOL_NAME_CHARS,
          budget,
          false,
        );
        if (name === null) continue;
        const kind =
          candidate.kind === null || candidate.kind === undefined
            ? null
            : protocolString(
                candidate.kind,
                MAX_PROTOCOL_TYPE_CHARS,
                budget,
                true,
              );
        if (candidate.kind != null && kind === null) break;
        trustedArrayPush(completions, { name, kind });
      }
      const result = { id, completions };
      protocolError(data, result, budget);
      return result;
    }

    if (
      data.hover &&
      typeof data.hover === "object" &&
      !trustedArrayIsArray(data.hover)
    ) {
      let hover = { found: false };
      if (data.hover.found === true) {
        const name = protocolString(
          data.hover.name,
          MAX_PROTOCOL_NAME_CHARS,
          budget,
          false,
        );
        if (name !== null) {
          const kind =
            data.hover.kind == null
              ? null
              : protocolString(
                  data.hover.kind,
                  MAX_PROTOCOL_TYPE_CHARS,
                  budget,
                  true,
                );
          const signature =
            data.hover.signature == null
              ? null
              : protocolString(
                  data.hover.signature,
                  MAX_PROTOCOL_FIELD_CHARS,
                  budget,
                  true,
                );
          const doc =
            data.hover.doc == null
              ? null
              : protocolString(
                  data.hover.doc,
                  MAX_PROTOCOL_DOC_CHARS,
                  budget,
                  true,
                );
          if (
            (data.hover.kind == null || kind !== null) &&
            (data.hover.signature == null || signature !== null) &&
            (data.hover.doc == null || doc !== null)
          ) {
            hover = { found: true, name, kind, signature, doc };
          }
        }
      }
      const result = { id, hover };
      protocolError(data, result, budget);
      return result;
    }

    if (
      data.signature &&
      typeof data.signature === "object" &&
      !trustedArrayIsArray(data.signature)
    ) {
      let signature = { found: false };
      if (
        data.signature.found === true &&
        trustedArrayIsArray(data.signature.params)
      ) {
        const label = protocolString(
          data.signature.label,
          MAX_PROTOCOL_FIELD_CHARS,
          budget,
          false,
        );
        if (label !== null) {
          const params = [];
          for (
            let index = 0;
            index < data.signature.params.length && index < MAX_PROTOCOL_ITEMS;
            index += 1
          ) {
            const candidate = data.signature.params[index];
            const param = protocolString(
              candidate,
              MAX_PROTOCOL_NAME_CHARS,
              budget,
              true,
            );
            if (param === null) break;
            trustedArrayPush(params, param);
          }
          const requested = protocolInteger(
            data.signature.activeParameter,
            0,
            MAX_PROTOCOL_ITEMS,
          );
          signature = {
            found: true,
            label,
            params,
            activeParameter: trustedMathMin(
              requested === null ? 0 : requested,
              trustedMathMax(params.length - 1, 0),
            ),
          };
        }
      }
      const result = { id, signature };
      protocolError(data, result, budget);
      return result;
    }

    if (
      data.definition &&
      typeof data.definition === "object" &&
      !trustedArrayIsArray(data.definition)
    ) {
      const line = protocolInteger(
        data.definition.line,
        1,
        MAX_PROTOCOL_COORDINATE,
      );
      const column = protocolInteger(
        data.definition.column,
        0,
        MAX_PROTOCOL_COORDINATE,
      );
      const definition =
        data.definition.found === true && line !== null && column !== null
          ? {
              found: true,
              line,
              column,
              inBuffer: data.definition.inBuffer === true,
            }
          : { found: false };
      const result = { id, definition };
      protocolError(data, result, budget);
      return result;
    }

    if (
      data.references &&
      typeof data.references === "object" &&
      !trustedArrayIsArray(data.references)
    ) {
      const refs = [];
      const rawRefs = trustedArrayIsArray(data.references.refs)
        ? data.references.refs
        : [];
      for (
        let index = 0;
        index < rawRefs.length && index < MAX_PROTOCOL_ITEMS;
        index += 1
      ) {
        const candidate = rawRefs[index];
        if (
          !candidate ||
          typeof candidate !== "object" ||
          trustedArrayIsArray(candidate)
        )
          continue;
        const line = protocolInteger(
          candidate.line,
          1,
          MAX_PROTOCOL_COORDINATE,
        );
        const column = protocolInteger(
          candidate.column,
          0,
          MAX_PROTOCOL_COORDINATE,
        );
        const length = protocolInteger(
          candidate.length,
          1,
          MAX_PROTOCOL_FIELD_CHARS,
        );
        if (line === null || column === null || length === null) continue;
        trustedArrayPush(refs, { line, column, length });
      }
      const result = {
        id,
        references: { found: refs.length > 0, refs },
      };
      protocolError(data, result, budget);
      return result;
    }

    return null;
  }

  /** Convert a PyProxy result to plain structured-clone data, then release it. */
  function pythonResultToJs(value) {
    if (!value || typeof value.toJs !== "function") return value;
    try {
      return value.toJs({
        dict_converter: trustedObjectFromEntries,
        create_pyproxies: false,
      });
    } finally {
      try {
        value.destroy();
      } catch {
        /* already released */
      }
    }
  }

  /**
   * A run's traceback opens with the frames of Pyodide's own runner
   * (`/lib/python3xx.zip/_pyodide/_base.py`, eval_code_async / run_async)
   * before the person's `<exec>` frames: noise that read as the first place
   * the error happened. Drop those frames (each with its source and caret
   * lines); every other frame, the standard library's included, stays.
   */
  const TRACEBACK_FRAME_START = /^  File "/;
  // A game's driver and shim (runGame) are the runner's too.
  const RUNNER_FRAME_START =
    /^  File "(?:\/lib\/python\d+\.zip\/_pyodide\/|<mrai-game>"|<mrai-turtle>"|<mrai-driver>")/;
  const FRAME_DETAIL_LINE = /^    /;
  function withoutRunnerFrames(value) {
    const lines = trustedStringSplit(trustedString(value), "\n");
    const kept = [];
    let skipping = false;
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (trustedRegExpTest(TRACEBACK_FRAME_START, line)) {
        skipping = trustedRegExpTest(RUNNER_FRAME_START, line);
        if (skipping) continue;
      } else if (skipping && trustedRegExpTest(FRAME_DETAIL_LINE, line)) {
        continue;
      } else {
        skipping = false;
      }
      trustedArrayPush(kept, line);
    }
    return trustedArrayJoin(kept, "\n");
  }

  function truncateOutput(value, maxChars) {
    value = trustedString(value);
    if (value.length <= maxChars) return value;
    if (maxChars <= OUTPUT_TRUNCATION_MARKER.length) {
      return trustedStringSlice(OUTPUT_TRUNCATION_MARKER, 0, maxChars);
    }
    return (
      trustedStringSlice(value, 0, maxChars - OUTPUT_TRUNCATION_MARKER.length) +
      OUTPUT_TRUNCATION_MARKER
    );
  }

  /**
   * Bound stdout/stderr at production time, before it grows a worker array or is
   * cloned over postMessage. The returned aggregate and streamed chunks are kept
   * identical, including the one visible truncation marker.
   */
  function createOutputCapture(id, stream) {
    const logs = [];
    const logStreams = [];
    let chars = 0;
    let sealed = false;
    function marker() {
      if (sealed) return null;
      sealed = true;
      const remaining = MAX_OUTPUT_LOG_CHARS - chars;
      if (remaining <= 0 || logs.length >= MAX_OUTPUT_LINES) return null;
      const kept = trustedStringSlice(OUTPUT_TRUNCATION_MARKER, 0, remaining);
      trustedArrayPush(logs, kept);
      trustedArrayPush(logStreams, "stderr");
      chars += kept.length;
      if (stream) {
        postProtocolMessage({
          id,
          type: "stream",
          stream: "stderr",
          chunk: kept,
        });
      }
      return kept;
    }
    return {
      logs,
      logStreams,
      push(text, streamName) {
        if (sealed) return null;
        if (logs.length >= MAX_OUTPUT_LINES - 1) return marker();
        let kept;
        try {
          kept = truncateOutput(text, MAX_OUTPUT_LINE_CHARS);
        } catch {
          kept = "<unprintable>";
        }
        const remaining =
          MAX_OUTPUT_LOG_CHARS - chars - OUTPUT_TRUNCATION_MARKER.length;
        if (kept.length > remaining) {
          if (remaining <= 0) return marker();
          kept = truncateOutput(kept, remaining);
          sealed = true;
        }
        const tag = streamName === "stderr" ? "stderr" : "stdout";
        trustedArrayPush(logs, kept);
        trustedArrayPush(logStreams, tag);
        chars += kept.length;
        if (stream)
          postProtocolMessage({ id, type: "stream", stream: tag, chunk: kept });
        return kept;
      },
    };
  }

  function boundRichImages(value) {
    if (!trustedArrayIsArray(value)) return undefined;
    const images = [];
    let chars = 0;
    for (let index = 0; index < value.length; index += 1) {
      const image = value[index];
      if (images.length >= MAX_RICH_IMAGES) break;
      if (
        typeof image !== "string" ||
        image.length > MAX_RICH_IMAGE_BASE64_CHARS ||
        chars + image.length > MAX_RICH_IMAGE_BASE64_CHARS
      ) {
        continue;
      }
      trustedArrayPush(images, image);
      chars += image.length;
    }
    return images.length > 0 ? images : undefined;
  }

  // After running a cell, collect Jupyter-style rich outputs: any open matplotlib
  // figures rendered to PNG (headless Agg backend) and returned as base64. Runs in
  // the kernel namespace; failures are swallowed so they never mask the cell run.
  const COLLECT_RICH = [
    "import sys as _sys, io as _io, base64 as _b64, math as _math",
    '__rich = {"images": []}',
    `_MAX_IMAGES = ${MAX_RICH_IMAGES}`,
    `_MAX_IMAGE_BYTES = ${MAX_RICH_IMAGE_BYTES}`,
    `_MAX_FIGURE_EDGE = ${MAX_RICH_FIGURE_EDGE}`,
    `_MAX_FIGURE_PIXELS = ${MAX_RICH_FIGURE_PIXELS}`,
    "_image_bytes = 0",
    "if 'matplotlib' in _sys.modules:",
    "    try:",
    "        import matplotlib.pyplot as _plt",
    "        for _n in _plt.get_fignums()[:_MAX_IMAGES]:",
    "            _fig = _plt.figure(_n)",
    "            _size = _fig.get_size_inches()",
    "            _dpi = float(_fig.dpi)",
    "            _width = float(_size[0]) * _dpi",
    "            _height = float(_size[1]) * _dpi",
    "            if not (_math.isfinite(_width) and _math.isfinite(_height)):",
    "                continue",
    "            if _width <= 0 or _height <= 0:",
    "                continue",
    "            if _width > _MAX_FIGURE_EDGE or _height > _MAX_FIGURE_EDGE:",
    "                continue",
    "            if _width * _height > _MAX_FIGURE_PIXELS:",
    "                continue",
    "            _buf = _io.BytesIO()",
    "            _fig.savefig(_buf, format='png')",
    "            _payload = _buf.getvalue()",
    "            if len(_payload) > _MAX_IMAGE_BYTES:",
    "                continue",
    "            if _image_bytes + len(_payload) > _MAX_IMAGE_BYTES:",
    "                break",
    "            __rich['images'].append(_b64.b64encode(_payload).decode())",
    "            _image_bytes += len(_payload)",
    "        _plt.close('all')",
    "    except Exception:",
    "        pass",
    "__rich",
  ].join("\n");

  // Build the inspector once, before authored code runs, and keep the callable only
  // in this JavaScript closure. Its closure captures pristine builtins/type methods;
  // previews never invoke arbitrary __repr__/__str__, iterate user containers, or
  // import a user-mutable JSON serializer.
  const SAFE_INSPECT_FACTORY = [
    "def _mrai_make_safe_inspector():",
    "    import builtins as _b, types as _types",
    "    _safe_type = type",
    "    _safe_len = len",
    "    _safe_dict_items = dict.items",
    "    _safe_dict_get = dict.get",
    "    _safe_type_name = type.__getattribute__",
    "    _safe_str_repr = str.__repr__",
    "    _safe_int_repr = int.__repr__",
    "    _safe_float_repr = float.__repr__",
    "    _builtin_values = dict(vars(_b))",
    "    _skip_types = (_types.ModuleType, _types.FunctionType, _types.BuiltinFunctionType)",
    "    def _type_name(_value):",
    "        try:",
    "            _name = _safe_type_name(_safe_type(_value), '__name__')",
    "            return _name[:128] if _safe_type(_name) is str else '?'",
    "        except BaseException:",
    "            return '?'",
    "    def _preview(_value, _type_value):",
    "        try:",
    "            if _type_value is str:",
    "                _text = _safe_str_repr(_value)",
    "            elif _type_value is bool:",
    "                _text = 'True' if _value else 'False'",
    "            elif _type_value is int:",
    "                _text = _safe_int_repr(_value)",
    "            elif _type_value is float:",
    "                _text = _safe_float_repr(_value)",
    "            elif _value is None:",
    "                _text = 'None'",
    "            else:",
    "                return '<' + _type_name(_value) + '>'",
    "            return _text if _safe_len(_text) <= 120 else _text[:119] + '\\u2026'",
    "        except BaseException:",
    "            return '<' + _type_name(_value) + '>'",
    "    def _inspect(_user_globals):",
    "        _out = []",
    "        for _name, _value in _safe_dict_items(_user_globals):",
    "            if _safe_type(_name) is not str or not _name or _name[:1] == '_':",
    "                continue",
    "            _value_type = _safe_type(_value)",
    "            if _value_type in _skip_types:",
    "                continue",
    "            if _safe_dict_get(_builtin_values, _name, None) is _value:",
    "                continue",
    "            _out.append({'name': _name[:256], 'type': _type_name(_value), 'preview': _preview(_value, _value_type)})",
    "            if _safe_len(_out) >= 500:",
    "                break",
    "        return _out",
    "    return _inspect",
    "_mrai_make_safe_inspector()",
  ].join("\n");

  // Parse-only syntax check. `compile(..., "exec")` builds the AST/bytecode but
  // NEVER runs it, so timers / loops / network in the snippet never fire — this is
  // a pure syntax gate. Reports the first SyntaxError (1-based lineno/offset, plus
  // 3.10+ end positions) as a native record, or {"ok": true}. The user source is passed in a
  // dedicated builtin (`__mrnote_lint_src`) and the check runs in a throwaway dict
  // so it can never read or clobber kernel globals.
  const LINT_CHECK = [
    "def _mrnote_lint(_src):",
    "    try:",
    "        compile(_src, '<lint>', 'exec')",
    "        return {'ok': True}",
    "    except SyntaxError as _e:",
    "        return {",
    "            'ok': False,",
    "            'lineno': getattr(_e, 'lineno', None),",
    "            'offset': getattr(_e, 'offset', None),",
    "            'endLineno': getattr(_e, 'end_lineno', None),",
    "            'endOffset': getattr(_e, 'end_offset', None),",
    "            'msg': getattr(_e, 'msg', None) or str(_e),",
    "        }",
    "    except Exception:",
    "        return {'ok': True}",
    // The source is injected via pyodide's `globals` map (set from JS as data, not
    // code), so arbitrary text — including quotes/newlines/unicode — round-trips
    // safely without string-escaping pitfalls. Read it, then drop it.
    "_mrnote_lint_result = _mrnote_lint(globals().get('__mrnote_lint_src', ''))",
    "globals().pop('__mrnote_lint_src', None)",
    "_mrnote_lint_result",
  ].join("\n");

  // jedi-powered semantic completion at a (1-based line, 0-based column). The
  // source is injected as DATA via globals (same pattern as LINT_CHECK) so any
  // text round-trips; jedi sees the LIVE kernel namespace via Interpreter, so
  // `df.<cursor>` completes pandas members after the user ran `import pandas`.
  const COMPLETE_CHECK = [
    "def _mrnote_complete(_src, _line, _col):",
    "    try:",
    "        import jedi",
    "    except Exception:",
    "        return []",
    "    try:",
    "        _script = jedi.Interpreter(_src, [globals()])",
    "        _comps = _script.complete(int(_line), int(_col))",
    "        _out = []",
    "        for _c in _comps[:80]:",
    "            try:",
    "                _out.append({'name': _c.name, 'kind': _c.type or None})",
    "            except Exception:",
    "                continue",
    "        return _out",
    "    except Exception:",
    "        return []",
    "_mrnote_complete_result = _mrnote_complete(",
    "    globals().get('__mrnote_complete_src', ''),",
    "    globals().get('__mrnote_complete_line', 1),",
    "    globals().get('__mrnote_complete_col', 0),",
    ")",
    "globals().pop('__mrnote_complete_src', None)",
    "globals().pop('__mrnote_complete_line', None)",
    "globals().pop('__mrnote_complete_col', None)",
    "_mrnote_complete_result",
  ].join("\n");

  // jedi hover info at a (1-based line, 0-based column): help() resolves names,
  // keywords and call targets; infer() is the fallback for plain expressions.
  // Same data-injection pattern as COMPLETE_CHECK; returns native None when there
  // is nothing under the cursor so the editor shows no tooltip.
  const HOVER_CHECK = [
    "def _mrnote_hover(_src, _line, _col):",
    "    try:",
    "        import jedi",
    "    except Exception:",
    "        return None",
    "    try:",
    "        _script = jedi.Interpreter(_src, [globals()])",
    "        try:",
    "            _names = _script.help(int(_line), int(_col))",
    "        except Exception:",
    "            _names = []",
    "        if not _names:",
    "            try:",
    "                _names = _script.infer(int(_line), int(_col))",
    "            except Exception:",
    "                _names = []",
    "        for _n in _names[:1]:",
    "            _sig = None",
    "            try:",
    "                _sigs = _n.get_signatures()",
    "                if _sigs:",
    "                    _sig = _sigs[0].to_string()",
    "            except Exception:",
    "                pass",
    "            if not _sig:",
    "                try:",
    "                    _sig = _n.description or None",
    "                except Exception:",
    "                    pass",
    "            _doc = None",
    "            try:",
    "                _raw = _n.docstring(raw=True)",
    "                if _raw:",
    "                    _doc = _raw.strip()[:1500] or None",
    "            except Exception:",
    "                pass",
    "            try:",
    "                _kind = _n.type or None",
    "            except Exception:",
    "                _kind = None",
    "            try:",
    "                _name = _n.name or ''",
    "            except Exception:",
    "                _name = ''",
    "            return {'name': _name, 'kind': _kind, 'signature': _sig, 'doc': _doc}",
    "        return None",
    "    except Exception:",
    "        return None",
    "_mrnote_hover_result = _mrnote_hover(",
    "    globals().get('__mrnote_hover_src', ''),",
    "    globals().get('__mrnote_hover_line', 1),",
    "    globals().get('__mrnote_hover_col', 0),",
    ")",
    "globals().pop('__mrnote_hover_src', None)",
    "globals().pop('__mrnote_hover_line', None)",
    "globals().pop('__mrnote_hover_col', None)",
    "_mrnote_hover_result",
  ].join("\n");

  // jedi parameter hints at a (1-based line, 0-based column): get_signatures()
  // resolves the enclosing call's signature(s). The first signature's to_string()
  // is the label (e.g. `foo(a, b, *, c=1)`), its .params give the parameter names,
  // and .index is the active argument slot at that position (None outside any
  // param). Same data-injection pattern as HOVER_CHECK; returns {found:false} when
  // the cursor is not inside a call so the editor shows no hint.
  const SIGNATURE_CHECK = [
    "def _mrnote_signature(_src, _line, _col):",
    "    try:",
    "        import jedi",
    "    except Exception:",
    "        return {'found': False}",
    "    try:",
    "        _script = jedi.Interpreter(_src, [globals()])",
    "        try:",
    "            _sigs = _script.get_signatures(int(_line), int(_col))",
    "        except Exception:",
    "            _sigs = []",
    "        for _s in _sigs[:1]:",
    "            try:",
    "                _label = _s.to_string()",
    "            except Exception:",
    "                _label = None",
    "            if not _label:",
    "                return {'found': False}",
    "            _params = []",
    "            try:",
    "                for _p in _s.params:",
    "                    try:",
    "                        _params.append(_p.name)",
    "                    except Exception:",
    "                        _params.append('')",
    "            except Exception:",
    "                _params = []",
    "            _active = None",
    "            try:",
    "                _active = _s.index",
    "            except Exception:",
    "                _active = None",
    "            if not isinstance(_active, int):",
    "                _active = 0",
    "            return {'found': True, 'label': _label, 'params': _params, 'activeParameter': _active}",
    "        return {'found': False}",
    "    except Exception:",
    "        return {'found': False}",
    "_mrnote_signature_result = _mrnote_signature(",
    "    globals().get('__mrnote_signature_src', ''),",
    "    globals().get('__mrnote_signature_line', 1),",
    "    globals().get('__mrnote_signature_col', 0),",
    ")",
    "globals().pop('__mrnote_signature_src', None)",
    "globals().pop('__mrnote_signature_line', None)",
    "globals().pop('__mrnote_signature_col', None)",
    "_mrnote_signature_result",
  ].join("\n");

  // jedi go-to-definition at a (1-based line, 0-based column): goto() resolves the
  // name under the cursor to its definition. Each resolved Name has .line/.column
  // (the definition's position) and .module_path (the file it lives in). For a
  // single-buffer editor only WITHIN-buffer definitions are navigable, so the
  // result carries `inBuffer`: True when jedi resolved the def to THIS source
  // (module_path is None ⇒ the in-memory buffer, the common local-symbol case) so
  // the editor can jump there; False (stdlib / another module) ⇒ the editor shows
  // the same "not found / out of file" notice the TS path uses. Same data-
  // injection pattern as SIGNATURE_CHECK; always answers {found:false} on failure.
  const DEFINITION_CHECK = [
    "def _mrnote_definition(_src, _line, _col):",
    "    try:",
    "        import jedi",
    "    except Exception:",
    "        return {'found': False}",
    "    try:",
    "        _script = jedi.Interpreter(_src, [globals()])",
    "        try:",
    "            _names = _script.goto(int(_line), int(_col), follow_imports=True)",
    "        except Exception:",
    "            _names = []",
    "        for _n in _names[:1]:",
    "            try:",
    "                _dline = _n.line",
    "            except Exception:",
    "                _dline = None",
    "            try:",
    "                _dcol = _n.column",
    "            except Exception:",
    "                _dcol = None",
    "            if not isinstance(_dline, int) or not isinstance(_dcol, int):",
    "                return {'found': False}",
    // module_path is None for the in-memory buffer we passed to Interpreter; any
    // real path (stdlib / another module) means the definition is out of buffer
    // and not navigable in this single-buffer editor.
    "            try:",
    "                _path = _n.module_path",
    "            except Exception:",
    "                _path = None",
    "            _in_buffer = _path is None",
    "            return {'found': True, 'line': _dline, 'column': _dcol, 'inBuffer': _in_buffer}",
    "        return {'found': False}",
    "    except Exception:",
    "        return {'found': False}",
    "_mrnote_definition_result = _mrnote_definition(",
    "    globals().get('__mrnote_definition_src', ''),",
    "    globals().get('__mrnote_definition_line', 1),",
    "    globals().get('__mrnote_definition_col', 0),",
    ")",
    "globals().pop('__mrnote_definition_src', None)",
    "globals().pop('__mrnote_definition_line', None)",
    "globals().pop('__mrnote_definition_col', None)",
    "_mrnote_definition_result",
  ].join("\n");

  // jedi find-references at a (1-based line, 0-based column): get_references()
  // resolves every usage of the symbol under the cursor (the declaration plus all
  // reads/writes). Uses jedi.Script (NOT Interpreter): references is a buffer-local
  // syntactic query, and Interpreter.get_references() is unsupported (it raises on
  // the synthetic interpreter module). For a single-buffer rename only references
  // WITHIN this buffer are actionable, so we FILTER to refs whose .module_path is
  // None (the in-memory source) and emit each as {line, column, length} — length is
  // the identifier's text width (name end column minus start column) so the editor
  // can build the per-occurrence edit spans. Same data-injection pattern as
  // DEFINITION_CHECK; always answers {found:false, refs:[]} on failure.
  const REFERENCES_CHECK = [
    "def _mrnote_references(_src, _line, _col):",
    "    try:",
    "        import jedi",
    "    except Exception:",
    "        return {'found': False, 'refs': []}",
    "    try:",
    "        _script = jedi.Script(_src)",
    "        try:",
    "            _refs = _script.get_references(int(_line), int(_col), include_builtins=False)",
    "        except Exception:",
    "            _refs = []",
    "        _out = []",
    "        for _r in _refs:",
    "            try:",
    "                if _r.module_path is not None:",
    "                    continue",
    "            except Exception:",
    "                continue",
    "            try:",
    "                _rline = _r.line",
    "                _rcol = _r.column",
    "            except Exception:",
    "                continue",
    "            if not isinstance(_rline, int) or not isinstance(_rcol, int):",
    "                continue",
    // Prefer the precise name span (end - start); fall back to len(name).
    "            _len = None",
    "            try:",
    "                _end = _r.get_definition_end_position()",
    "            except Exception:",
    "                _end = None",
    "            try:",
    "                if _end is not None and _end[0] == _rline:",
    "                    _len = _end[1] - _rcol",
    "            except Exception:",
    "                _len = None",
    "            if not isinstance(_len, int) or _len <= 0:",
    "                try:",
    "                    _len = len(_r.name or '')",
    "                except Exception:",
    "                    _len = 0",
    "            if _len <= 0:",
    "                continue",
    "            _out.append({'line': _rline, 'column': _rcol, 'length': _len})",
    "        return {'found': len(_out) > 0, 'refs': _out}",
    "    except Exception:",
    "        return {'found': False, 'refs': []}",
    "_mrnote_references_result = _mrnote_references(",
    "    globals().get('__mrnote_references_src', ''),",
    "    globals().get('__mrnote_references_line', 1),",
    "    globals().get('__mrnote_references_col', 0),",
    ")",
    "globals().pop('__mrnote_references_src', None)",
    "globals().pop('__mrnote_references_line', None)",
    "globals().pop('__mrnote_references_col', None)",
    "_mrnote_references_result",
  ].join("\n");

  // Recorded breakpoint debugging. Runs the user source under sys.settrace in
  // the KERNEL globals (state parity with normal runs), recording each breakpoint
  // hit + a bounded step window after it: 1-based line, capped locals previews,
  // and the user-frame stack. Library/internal frames are never traced (the
  // callback returns None for any frame from another file — keeps pandas-sized
  // imports at full speed). Conditions are eval'd in the frame scope; a raising
  // condition records the hit with `conditionError` (VSCode semantics). The user
  // exception (if any) is re-formatted with driver frames stripped so the
  // renderer sees a normal-looking traceback. Source + breakpoints are injected
  // as DATA via globals (same pattern as the other ops).
  const DEBUG_RUN = [
    "import json as _json, sys as _sys, types as _types, traceback as _traceback, ast as _ast, inspect as _inspect",
    "async def _mrnote_debug_run(_src, _bp_json, _pause_uncaught):",
    "    _FILENAME = '<mrnote-debug>'",
    "    _MAX_EVENTS = 300",
    "    _STEP_WINDOW = 120",
    "    _safe_type = type",
    "    _safe_len = len",
    "    _safe_type_name = type.__getattribute__",
    "    _safe_str_repr = str.__repr__",
    "    _safe_int_repr = int.__repr__",
    "    _safe_float_repr = float.__repr__",
    "    _safe_skip_types = (_types.ModuleType, _types.FunctionType, _types.BuiltinFunctionType)",
    "    _bps = {}",
    "    try:",
    "        for _b in _json.loads(_bp_json):",
    "            try:",
    "                _line = int(_b.get('line'))",
    "            except Exception:",
    "                continue",
    "            _cond = _b.get('condition')",
    "            _cond = _cond if isinstance(_cond, str) and _cond.strip() else None",
    "            _hit = _b.get('hit')",
    "            _hit = _hit if isinstance(_hit, dict) else None",
    "            _bps[_line] = (_cond, _hit)",
    "    except Exception:",
    "        _bps = {}",
    "    _events = []",
    "    _counts = {}",
    "    _state = {'steps_left': 0, 'truncated': False, 'note': None}",
    "    def _hit_ok(_spec, _n):",
    "        if not _spec:",
    "            return True",
    "        _op = _spec.get('op')",
    "        try:",
    "            _val = int(_spec.get('value'))",
    "        except Exception:",
    "            return True",
    "        if _op == '>=':",
    "            return _n >= _val",
    "        if _op == '>':",
    "            return _n > _val",
    "        if _op == '<=':",
    "            return _n <= _val",
    "        if _op == '<':",
    "            return _n < _val",
    "        if _op == '==':",
    "            return _n == _val",
    "        if _op == '%':",
    "            if _val == 0:",
    "                return True",
    "            try:",
    "                _rem = int(_spec.get('rem') or 0)",
    "            except Exception:",
    "                _rem = 0",
    "            return (_n % _val) == _rem",
    "        return True",
    "    def _type_name(_v):",
    "        try:",
    "            _name = _safe_type_name(_safe_type(_v), '__name__')",
    "            return _name[:128] if _safe_type(_name) is str else '?'",
    "        except BaseException:",
    "            return '?'",
    "    def _preview(_v):",
    "        try:",
    "            _kind = _safe_type(_v)",
    "            if _kind is str:",
    "                _s = _safe_str_repr( _v )",
    "            elif _kind is bool:",
    "                _s = 'True' if _v else 'False'",
    "            elif _kind is int:",
    "                _s = _safe_int_repr( _v )",
    "            elif _kind is float:",
    "                _s = _safe_float_repr( _v )",
    "            elif _v is None:",
    "                _s = 'None'",
    "            else:",
    "                return '<' + _type_name(_v) + '>'",
    "            return _s if _safe_len(_s) <= 120 else _s[:119] + '\\u2026'",
    "        except BaseException:",
    "            return '<' + _type_name(_v) + '>'",
    "    def _exception_preview(_exc):",
    "        try:",
    "            _text = ''.join(_traceback.format_exception_only(_safe_type(_exc), _exc)).strip()",
    "            if _safe_type(_text) is not str or not _text:",
    "                return _type_name(_exc)",
    "            return _text if _safe_len(_text) <= 500 else _text[:499] + '\u2026'",
    "        except BaseException:",
    "            return _type_name(_exc)",
    "    def _locals_of(_frame):",
    "        _out = {}",
    "        for _name, _val in list(_frame.f_locals.items()):",
    "            if _name.startswith('_'):",
    "                continue",
    "            if _safe_type(_val) in _safe_skip_types:",
    "                continue",
    "            _out[_name] = _preview(_val)",
    "            if len(_out) >= 50:",
    "                break",
    "        return _out",
    "    def _stack_of(_frame):",
    "        _out = []",
    "        _f = _frame",
    "        while _f is not None and len(_out) < 20:",
    "            if _f.f_code.co_filename != _FILENAME:",
    "                break",
    "            _out.append({'name': _f.f_code.co_name, 'line': _f.f_lineno})",
    "            _f = _f.f_back",
    "        return _out",
    "    def _depth_of(_frame):",
    "        _n = 0",
    "        _f = _frame",
    "        while _f is not None:",
    "            if _f.f_code.co_filename != _FILENAME:",
    "                break",
    "            _n += 1",
    "            _f = _f.f_back",
    "        return _n",
    "    def _record(_frame, _kind, _exception=None):",
    "        if len(_events) >= _MAX_EVENTS:",
    "            _state['truncated'] = True",
    "            return False",
    "        _ev = {'kind': _kind, 'line': _frame.f_lineno,",
    "               'locals': _locals_of(_frame), 'stack': _stack_of(_frame),",
    "               'depth': _depth_of(_frame)}",
    "        if _exception is not None:",
    "            _ev['exception'] = _exception",
    "        _events.append(_ev)",
    "        return True",
    "    def _trace(_frame, _event, _arg):",
    "        if _frame.f_code.co_filename != _FILENAME:",
    "            return None",
    "        if _event != 'line':",
    "            return _trace",
    "        if _state['truncated']:",
    "            return _trace",
    "        _line = _frame.f_lineno",
    "        if _line in _bps:",
    "            _cond, _hitspec = _bps[_line]",
    "            if _cond is None:",
    "                _ok = True",
    "            else:",
    "                try:",
    "                    _ok = bool(eval(_cond, _frame.f_globals, _frame.f_locals))",
    "                except Exception as _e:",
    "                    _ok = False",
    "                    if _state['note'] is None:",
    "                        _state['note'] = _preview(_e)",
    "            if _ok:",
    "                _counts[_line] = _counts.get(_line, 0) + 1",
    "                if _hit_ok(_hitspec, _counts[_line]):",
    "                    if _record(_frame, 'breakpoint'):",
    "                        _state['steps_left'] = _STEP_WINDOW",
    "                return _trace",
    "        if _state['steps_left'] > 0:",
    "            if _record(_frame, 'step'):",
    "                _state['steps_left'] -= 1",
    "        return _trace",
    "    _g = globals()",
    "    _g.pop('__mrnote_debug_selected_test_awaitable__', None)",
    "    _result_repr = None",
    "    _html = None",
    "    _error = None",
    "    try:",
    "        _tree = _ast.parse(_src, _FILENAME, 'exec')",
    "        _last_code = None",
    "        if _tree.body and isinstance(_tree.body[-1], _ast.Expr):",
    "            _last_expr = _ast.Expression(_tree.body[-1].value)",
    "            _ast.copy_location(_last_expr.body, _tree.body[-1])",
    "            _tree.body = _tree.body[:-1]",
    "            _last_code = compile(_ast.fix_missing_locations(_last_expr), _FILENAME, 'eval')",
    "        _code = compile(_tree, _FILENAME, 'exec')",
    "        _sys.settrace(_trace)",
    "        try:",
    "            exec(_code, _g)",
    "            _v = eval(_last_code, _g) if _last_code is not None else None",
    "            _test_awaitable = _g.pop('__mrnote_debug_selected_test_awaitable__', None)",
    "            if _test_awaitable is not None:",
    "                if not _inspect.isawaitable(_test_awaitable):",
    "                    raise TypeError('Async test did not return an awaitable')",
    "                _v = await _test_awaitable",
    "        finally:",
    "            _sys.settrace(None)",
    "            _g.pop('__mrnote_debug_selected_test_awaitable__', None)",
    "        if _v is not None:",
    "            try:",
    "                _r = getattr(_v, '_repr_html_', None)",
    "                if callable(_r):",
    "                    _h = _r()",
    "                    if isinstance(_h, str) and _h:",
    "                        _html = _h[:524288]",
    "            except Exception:",
    "                pass",
    "            if _html is None:",
    "                try:",
    "                    _result_repr = str(_v)[:10000]",
    "                except Exception:",
    "                    _result_repr = '<unrepr>'",
    "    except BaseException as _exc:",
    "        _tb = _exc.__traceback__",
    "        _user_tb = None",
    "        _exception_frame = None",
    "        while _tb is not None:",
    "            if _tb.tb_frame.f_code.co_filename == _FILENAME:",
    "                if _user_tb is None:",
    "                    _user_tb = _tb",
    "                _exception_frame = _tb.tb_frame",
    "            _tb = _tb.tb_next",
    "        if _pause_uncaught and _exception_frame is not None:",
    "            if len(_events) >= _MAX_EVENTS:",
    "                _events.pop()",
    "                _state['truncated'] = True",
    "            _record(_exception_frame, 'exception', _exception_preview(_exc))",
    "        try:",
    "            _error = ''.join(_traceback.format_exception(type(_exc), _exc, _user_tb))",
    "        except Exception:",
    "            _error = repr(_exc)",
    "    return {'events': _events, 'truncated': _state['truncated'],",
    "            'conditionNote': _state['note'],",
    "            'result': _result_repr, 'html': _html, 'error': _error}",
    "_mrnote_debug_result = await _mrnote_debug_run(",
    "    globals().get('__mrnote_debug_src', ''),",
    "    globals().get('__mrnote_debug_bps', '[]'),",
    "    globals().get('__mrnote_debug_pause_uncaught', False) is True,",
    ")",
    "globals().pop('__mrnote_debug_src', None)",
    "globals().pop('__mrnote_debug_bps', None)",
    "globals().pop('__mrnote_debug_pause_uncaught', None)",
    "_mrnote_debug_result",
  ].join("\n");

  // pyflakes static-analysis snippet: runs over the source WITHOUT executing it
  // (AST-only pass) and reports undefined-name, unused-import, and unused/shadowed-
  // variable warnings. Each warning is { row, col, message, type } where row and col
  // are 1-based. pyflakes is a pure-Python stdlib-only package (no C extensions), so
  // it loads cleanly in Pyodide via micropip. The source is injected as DATA via
  // globals (same data-injection pattern as LINT_CHECK) so any text round-trips safely.
  const PYFLAKES_CHECK = [
    "def _mrnote_pyflakes(_src):",
    "    try:",
    "        import pyflakes.api as _pf_api",
    "        import pyflakes.reporter as _pf_rep",
    "        import io as _io",
    "    except Exception:",
    "        return []",
    "    try:",
    "        _warnings = []",
    "        class _Collector(_pf_rep.Reporter):",
    "            def unexpectedError(self, filename, msg):",
    "                pass",
    "            def syntaxError(self, filename, msg, lineno, offset, text):",
    "                pass",
    "            def flake(self, message):",
    "                _warnings.append({",
    "                    'row': message.lineno,",
    "                    'col': message.col + 1,",
    "                    'message': str(message),",
    "                    'type': type(message).__name__,",
    "                })",
    "        _pf_api.check(_src, '<pyflakes>', reporter=_Collector())",
    "        return _warnings",
    "    except Exception:",
    "        return []",
    "_mrnote_pyflakes_result = _mrnote_pyflakes(globals().get('__mrnote_pyflakes_src', ''))",
    "globals().pop('__mrnote_pyflakes_src', None)",
    "_mrnote_pyflakes_result",
  ].join("\n");

  // autopep8 formatter snippet: formats Python source with autopep8 (PEP 8 style).
  // autopep8 is a pure-Python package; loaded once via micropip. The source is
  // injected as DATA via globals so any text (including quotes/newlines) round-trips
  // safely. On success returns the formatted source; on any failure returns the
  // ORIGINAL text unchanged so the buffer is never corrupted.
  const AUTOPEP8_FORMAT = [
    "def _mrnote_autopep8(_src):",
    "    try:",
    "        import autopep8 as _ap8",
    "    except Exception:",
    "        return {'ok': False, 'formatted': _src}",
    "    try:",
    "        _out = _ap8.fix_code(_src, options={'max_line_length': 88})",
    "        return {'ok': True, 'formatted': _out}",
    "    except Exception:",
    "        return {'ok': False, 'formatted': _src}",
    "_mrnote_ap8_result = _mrnote_autopep8(globals().get('__mrnote_ap8_src', ''))",
    "globals().pop('__mrnote_ap8_src', None)",
    "_mrnote_ap8_result",
  ].join("\n");

  let pyodideReady = null;
  // Created before the first authored cell and retained only in this JS closure.
  let safeInspect = null;
  // jedi loads once per kernel, lazily on the first completion request; a load
  // failure (offline CDN) caches as null so we never re-attempt per keystroke.
  let jediReady = null;
  // pyflakes loads once per kernel, lazily on the first lint request that needs
  // semantic warnings; a load failure caches as false so we never re-attempt.
  let pyflakesReady = null;
  // autopep8 loads once per kernel, lazily on the first format request; a load
  // failure caches as false so we never re-attempt per keystroke.
  let autopep8Ready = null;

  async function getPyodide() {
    if (!pyodideReady) {
      if (typeof self.loadPyodide !== "function") {
        importScripts(PYODIDE_CDN + "pyodide.js");
      }
      pyodideReady = self
        .loadPyodide({ indexURL: PYODIDE_CDN })
        .then(async (py) => {
          // Force a headless matplotlib backend before any pyplot import so figures
          // can be saved to PNG without a DOM canvas (there is none in a worker).
          try {
            await py.runPythonAsync(
              "import os; os.environ.setdefault('MPLBACKEND', 'AGG')",
            );
          } catch {
            /* non-fatal */
          }
          safeInspect = await py.runPythonAsync(SAFE_INSPECT_FACTORY);
          return py;
        })
        .catch((error) => {
          // A CDN/runtime bootstrap failure is not permanent authority. Keep
          // this worker alive so the next explicit request can retry without a
          // page reload; successful kernels remain memoized as before.
          pyodideReady = null;
          throw error;
        });
    }
    return pyodideReady;
  }

  self.addEventListener("message", async (event) => {
    // Authored Python can synthesize MessageEvents via `js.self.dispatchEvent`.
    // Only browser-delivered requests from the worker owner are authoritative.
    if (event.isTrusted !== true) return;
    const data = event.data || {};
    const id = data.id;
    // The running game's keys and mouse: queued for its next frame, never
    // behind the run itself.
    if (data.op === "game-input") {
      acceptGameInput(data);
      return;
    }
    // Inspect op: snapshot user-defined globals without running a cell.
    if (data.op === "inspect") {
      try {
        const py = await getPyodide();
        let variables = [];
        try {
          const parsed = pythonResultToJs(safeInspect(py.globals));
          if (trustedArrayIsArray(parsed)) variables = parsed;
        } catch {
          /* non-fatal: report an empty snapshot */
        }
        postProtocolMessage({ id, variables });
      } catch (err) {
        const message =
          err && err.message ? trustedString(err.message) : trustedString(err);
        postProtocolMessage({ id, variables: [], error: message });
      }
      return;
    }
    // Lint op: parse-check the source WITHOUT executing it (anti-freeze) and report
    // the first SyntaxError, plus pyflakes semantic warnings (undefined names,
    // unused imports, unused/shadowed variables). Both checks run in throwaway scopes
    // so they never touch or corrupt the live kernel namespace.
    if (data.op === "lint") {
      const src = typeof data.code === "string" ? data.code : "";
      try {
        const py = await getPyodide();
        // Step 1: syntax check (compile() only; never executes).
        // Inject the source as DATA via the globals map so any text round-trips
        // without escaping pitfalls; the snippet pops the key afterwards.
        py.globals.set("__mrnote_lint_src", src);
        let lint = { ok: true };
        try {
          const out = await py.runPythonAsync(LINT_CHECK);
          const parsed = pythonResultToJs(out);
          if (parsed && typeof parsed === "object") lint = parsed;
        } catch {
          /* non-fatal: a check failure reports "no syntax error" */
        } finally {
          try {
            if (py.globals.has("__mrnote_lint_src"))
              py.globals.delete("__mrnote_lint_src");
          } catch {
            /* ignore cleanup failure */
          }
        }
        // Step 2: semantic warnings via pyflakes (AST-only, never executes code).
        // Only run when the syntax check passed — pyflakes on broken syntax duplicates
        // the SyntaxError we already surfaced and adds noise. Load pyflakes lazily
        // once; a load failure caches as false so we never retry per keystroke.
        let warnings = [];
        if (lint.ok) {
          if (pyflakesReady === null) {
            pyflakesReady = py
              .loadPackage("micropip")
              .then(() =>
                py.runPythonAsync(helperInstallSource("pyflakes")),
              )
              .then(() => true)
              .catch(() => false);
          }
          const hasPyflakes = await pyflakesReady;
          if (hasPyflakes) {
            py.globals.set("__mrnote_pyflakes_src", src);
            try {
              const out = await py.runPythonAsync(PYFLAKES_CHECK);
              const parsed = pythonResultToJs(out);
              if (trustedArrayIsArray(parsed)) warnings = parsed;
            } catch {
              /* non-fatal: report no warnings */
            } finally {
              try {
                if (py.globals.has("__mrnote_pyflakes_src"))
                  py.globals.delete("__mrnote_pyflakes_src");
              } catch {
                /* ignore cleanup failure */
              }
            }
          }
        }
        postProtocolMessage({ id, lint, warnings });
      } catch (err) {
        const message =
          err && err.message ? trustedString(err.message) : trustedString(err);
        postProtocolMessage({
          id,
          lint: { ok: true },
          warnings: [],
          error: message,
        });
      }
      return;
    }
    // Format op: format Python source via autopep8 (PEP 8 style).
    // autopep8 is a pure-Python package, loaded lazily via micropip on first use.
    // TOTAL: returns the ORIGINAL source unchanged on any failure so the buffer is
    // never corrupted (matches the never-throw contract of the TS formatCode helper).
    if (data.op === "format") {
      const src = typeof data.code === "string" ? data.code : "";
      try {
        const py = await getPyodide();
        // Load autopep8 lazily once; a load failure caches as false.
        if (autopep8Ready === null) {
          autopep8Ready = py
            .loadPackage("micropip")
            .then(() =>
              py.runPythonAsync(helperInstallSource("autopep8")),
            )
            .then(() => true)
            .catch(() => false);
        }
        const hasAutopep8 = await autopep8Ready;
        if (!hasAutopep8) {
          postProtocolMessage({ id, formatted: src });
          return;
        }
        py.globals.set("__mrnote_ap8_src", src);
        let formatted = src;
        let formatSucceeded = false;
        try {
          const out = await py.runPythonAsync(AUTOPEP8_FORMAT);
          const parsed = pythonResultToJs(out);
          if (
            parsed &&
            typeof parsed === "object" &&
            parsed.ok === true &&
            typeof parsed.formatted === "string" &&
            parsed.formatted.length <= MAX_PROTOCOL_FORMATTED_CHARS &&
            (trustedStringTrim(src).length === 0 ||
              trustedStringTrim(parsed.formatted).length > 0)
          ) {
            formatted = parsed.formatted;
            formatSucceeded = true;
          }
        } catch {
          /* non-fatal: return original */
        } finally {
          try {
            if (py.globals.has("__mrnote_ap8_src"))
              py.globals.delete("__mrnote_ap8_src");
          } catch {
            /* ignore cleanup failure */
          }
        }
        postProtocolMessage(
          formatSucceeded
            ? {
                id,
                formatted,
                error: PYTHON_FORMAT_SUCCESS_RECEIPT,
              }
            : { id, formatted: src },
        );
      } catch {
        // The `error` field carries the authenticated success receipt. Never
        // copy an ambient exception string into it: a forged matching message
        // must not turn a failed format into an idempotent success.
        postProtocolMessage({ id, formatted: src });
      }
      return;
    }
    // Complete op: jedi semantic completions against the live kernel namespace.
    // Always answers (possibly []) so the editor's completion source never hangs.
    if (data.op === "complete") {
      const src = typeof data.code === "string" ? data.code : "";
      const line = trustedNumberIsFinite(data.line)
        ? trustedNumber(data.line)
        : 1;
      const column = trustedNumberIsFinite(data.column)
        ? trustedNumber(data.column)
        : 0;
      try {
        const py = await getPyodide();
        if (jediReady === null) {
          jediReady = py
            .loadPackage("jedi")
            .then(() => true)
            .catch(() => false);
        }
        const hasJedi = await jediReady;
        if (!hasJedi) {
          postProtocolMessage({ id, completions: [] });
          return;
        }
        py.globals.set("__mrnote_complete_src", src);
        py.globals.set("__mrnote_complete_line", line);
        py.globals.set("__mrnote_complete_col", column);
        let completions = [];
        try {
          const out = await py.runPythonAsync(COMPLETE_CHECK);
          const parsed = pythonResultToJs(out);
          if (trustedArrayIsArray(parsed)) completions = parsed;
        } catch {
          /* non-fatal: report no completions */
        }
        postProtocolMessage({ id, completions });
      } catch (err) {
        const message =
          err && err.message ? trustedString(err.message) : trustedString(err);
        postProtocolMessage({ id, completions: [], error: message });
      }
      return;
    }
    // Hover op: jedi type/doc info against the live kernel namespace. Always
    // answers ({found:false} on any failure) so the editor tooltip never hangs.
    if (data.op === "hover") {
      const src = typeof data.code === "string" ? data.code : "";
      const line = trustedNumberIsFinite(data.line)
        ? trustedNumber(data.line)
        : 1;
      const column = trustedNumberIsFinite(data.column)
        ? trustedNumber(data.column)
        : 0;
      try {
        const py = await getPyodide();
        if (jediReady === null) {
          jediReady = py
            .loadPackage("jedi")
            .then(() => true)
            .catch(() => false);
        }
        const hasJedi = await jediReady;
        if (!hasJedi) {
          postProtocolMessage({ id, hover: { found: false } });
          return;
        }
        py.globals.set("__mrnote_hover_src", src);
        py.globals.set("__mrnote_hover_line", line);
        py.globals.set("__mrnote_hover_col", column);
        let hover = { found: false };
        try {
          const out = await py.runPythonAsync(HOVER_CHECK);
          const parsed = pythonResultToJs(out);
          if (parsed && typeof parsed === "object")
            hover = { found: true, ...parsed };
        } catch {
          /* non-fatal: report nothing to show */
        }
        postProtocolMessage({ id, hover });
      } catch (err) {
        const message =
          err && err.message ? trustedString(err.message) : trustedString(err);
        postProtocolMessage({ id, hover: { found: false }, error: message });
      }
      return;
    }
    // Signature op: jedi parameter hints (the enclosing call's signature + active
    // arg index) against the live kernel namespace. Always answers ({found:false}
    // on any failure) so the editor's parameter-hint tooltip never hangs.
    if (data.op === "signature") {
      const src = typeof data.code === "string" ? data.code : "";
      const line = trustedNumberIsFinite(data.line)
        ? trustedNumber(data.line)
        : 1;
      const column = trustedNumberIsFinite(data.column)
        ? trustedNumber(data.column)
        : 0;
      try {
        const py = await getPyodide();
        if (jediReady === null) {
          jediReady = py
            .loadPackage("jedi")
            .then(() => true)
            .catch(() => false);
        }
        const hasJedi = await jediReady;
        if (!hasJedi) {
          postProtocolMessage({ id, signature: { found: false } });
          return;
        }
        py.globals.set("__mrnote_signature_src", src);
        py.globals.set("__mrnote_signature_line", line);
        py.globals.set("__mrnote_signature_col", column);
        let signature = { found: false };
        try {
          const out = await py.runPythonAsync(SIGNATURE_CHECK);
          const parsed = pythonResultToJs(out);
          if (parsed && typeof parsed === "object") signature = parsed;
        } catch {
          /* non-fatal: report nothing to show */
        }
        postProtocolMessage({ id, signature });
      } catch (err) {
        const message =
          err && err.message ? trustedString(err.message) : trustedString(err);
        postProtocolMessage({
          id,
          signature: { found: false },
          error: message,
        });
      }
      return;
    }
    // Definition op: jedi go-to-definition against the live kernel namespace. Always
    // answers ({found:false} on any failure) so the editor's jump never hangs. The
    // reply's `inBuffer` tells the editor whether the resolved definition lives in
    // THIS buffer (navigable) or out of file (show a notice).
    if (data.op === "definition") {
      const src = typeof data.code === "string" ? data.code : "";
      const line = trustedNumberIsFinite(data.line)
        ? trustedNumber(data.line)
        : 1;
      const column = trustedNumberIsFinite(data.column)
        ? trustedNumber(data.column)
        : 0;
      try {
        const py = await getPyodide();
        if (jediReady === null) {
          jediReady = py
            .loadPackage("jedi")
            .then(() => true)
            .catch(() => false);
        }
        const hasJedi = await jediReady;
        if (!hasJedi) {
          postProtocolMessage({ id, definition: { found: false } });
          return;
        }
        py.globals.set("__mrnote_definition_src", src);
        py.globals.set("__mrnote_definition_line", line);
        py.globals.set("__mrnote_definition_col", column);
        let definition = { found: false };
        try {
          const out = await py.runPythonAsync(DEFINITION_CHECK);
          const parsed = pythonResultToJs(out);
          if (parsed && typeof parsed === "object") definition = parsed;
        } catch {
          /* non-fatal: report nothing to jump to */
        }
        postProtocolMessage({ id, definition });
      } catch (err) {
        const message =
          err && err.message ? trustedString(err.message) : trustedString(err);
        postProtocolMessage({
          id,
          definition: { found: false },
          error: message,
        });
      }
      return;
    }
    // References op: jedi find-references against the live kernel namespace, filtered
    // to THIS buffer (rename only edits the current source). Always answers
    // ({found:false, refs:[]} on any failure) so the editor's rename never hangs.
    if (data.op === "references") {
      const src = typeof data.code === "string" ? data.code : "";
      const line = trustedNumberIsFinite(data.line)
        ? trustedNumber(data.line)
        : 1;
      const column = trustedNumberIsFinite(data.column)
        ? trustedNumber(data.column)
        : 0;
      try {
        const py = await getPyodide();
        if (jediReady === null) {
          jediReady = py
            .loadPackage("jedi")
            .then(() => true)
            .catch(() => false);
        }
        const hasJedi = await jediReady;
        if (!hasJedi) {
          postProtocolMessage({ id, references: { found: false, refs: [] } });
          return;
        }
        py.globals.set("__mrnote_references_src", src);
        py.globals.set("__mrnote_references_line", line);
        py.globals.set("__mrnote_references_col", column);
        let references = { found: false, refs: [] };
        try {
          const out = await py.runPythonAsync(REFERENCES_CHECK);
          const parsed = pythonResultToJs(out);
          if (parsed && typeof parsed === "object") references = parsed;
        } catch {
          /* non-fatal: report no references */
        }
        postProtocolMessage({ id, references });
      } catch (err) {
        const message =
          err && err.message ? trustedString(err.message) : trustedString(err);
        postProtocolMessage({
          id,
          references: { found: false, refs: [] },
          error: message,
        });
      }
      return;
    }
    // Debug-run op: recorded breakpoint debugging (see protocol note above).
    // Mirrors the normal run path's I/O behaviour, then returns the recording.
    if (data.op === "debug-run") {
      const src = typeof data.code === "string" ? data.code : "";
      const breakpoints = trustedArrayIsArray(data.breakpoints)
        ? data.breakpoints
        : [];
      const stream = data.stream === true;
      const output = createOutputCapture(id, stream);
      const logs = output.logs;
      const logStreams = output.logStreams;
      try {
        const py = await getPyodide();
        py.setStdout({
          batched: (text) => {
            output.push(text, "stdout");
          },
        });
        py.setStderr({
          batched: (text) => {
            output.push(text, "stderr");
          },
        });
        if (typeof py.setStdin === "function") {
          const stdinText = typeof data.stdin === "string" ? data.stdin : "";
          if (stdinText !== "") {
            const lines = stdinText.split("\n");
            let lineIndex = 0;
            py.setStdin({
              stdin: () =>
                lineIndex < lines.length ? lines[lineIndex++] : null,
            });
          } else {
            py.setStdin({ stdin: () => null });
          }
        }
        if (typeof py.loadPackagesFromImports === "function") {
          try {
            // Scan the USER source (not the driver) for auto-installable imports.
            await py.loadPackagesFromImports(src);
          } catch {
            /* non-fatal: a truly missing import raises during execution */
          }
        }
        py.globals.set("__mrnote_debug_src", src);
        py.globals.set("__mrnote_debug_bps", trustedJsonStringify(breakpoints));
        py.globals.set(
          "__mrnote_debug_pause_uncaught",
          data.pauseOnUncaughtExceptions === true,
        );
        let debugEvents = [];
        let debugTruncated = false;
        let debugConditionNote;
        let result;
        let html;
        let error;
        try {
          const out = await py.runPythonAsync(DEBUG_RUN);
          const parsed = pythonResultToJs(out);
          if (parsed && typeof parsed === "object") {
            if (trustedArrayIsArray(parsed.events)) debugEvents = parsed.events;
            debugTruncated = parsed.truncated === true;
            if (
              typeof parsed.conditionNote === "string" &&
              parsed.conditionNote
            ) {
              debugConditionNote = parsed.conditionNote;
            }
            if (typeof parsed.result === "string") {
              result = truncateOutput(parsed.result, MAX_OUTPUT_TEXT_CHARS);
            }
            if (typeof parsed.html === "string" && parsed.html) {
              html = truncateOutput(parsed.html, MAX_OUTPUT_HTML_CHARS);
            }
            if (typeof parsed.error === "string" && parsed.error) {
              error = truncateOutput(parsed.error, MAX_OUTPUT_TEXT_CHARS);
            }
          }
        } catch (err) {
          // The driver itself failed (it never lets user errors escape) — report
          // like a normal run failure so the editor shows the message.
          error = truncateOutput(
            err && err.message
              ? trustedString(err.message)
              : trustedString(err),
            MAX_OUTPUT_TEXT_CHARS,
          );
        }
        let images;
        try {
          const rich = pythonResultToJs(await py.runPythonAsync(COLLECT_RICH));
          images = boundRichImages(rich.images);
        } catch {
          /* non-fatal */
        }
        postProtocolMessage({
          id,
          logs,
          logStreams,
          result: html ? undefined : result,
          html,
          error,
          images,
          debugEvents,
          debugTruncated,
          debugConditionNote,
        });
      } catch (err) {
        const message = truncateOutput(
          err && err.message ? trustedString(err.message) : trustedString(err),
          MAX_OUTPUT_TEXT_CHARS,
        );
        postProtocolMessage({
          id,
          logs,
          logStreams,
          error: message,
          debugEvents: [],
          debugTruncated: false,
        });
      }
      return;
    }
    const code = typeof data.code === "string" ? data.code : "";
    // When the caller opted into progressive output, mirror each captured chunk to
    // the main thread immediately so the cell renders live (Jupyter streaming).
    // The `batched` callback fires during runPythonAsync (which yields to the
    // event loop on awaits), so chunks pump out mid-run for typical output.
    const stream = data.stream === true;
    const output = createOutputCapture(id, stream);
    const logs = output.logs;
    // Parallel per-line stream tags ("stdout" | "stderr"), aligned to `logs` by
    // index, so the renderer can style stderr distinctly. `logs` stays string[].
    const logStreams = output.logStreams;
    try {
      const py = await getPyodide();
      py.setStdout({
        batched: (text) => {
          output.push(text, "stdout");
        },
      });
      py.setStderr({
        batched: (text) => {
          output.push(text, "stderr");
        },
      });
      // Pre-supplied stdin (the run panel's 输入 box): input() reads it line by
      // line; past the end returns EOF, which Python surfaces as EOFError with
      // its normal message. Reset per run so lines never leak across runs.
      if (typeof py.setStdin === "function") {
        const stdinText = typeof data.stdin === "string" ? data.stdin : "";
        if (stdinText !== "") {
          const lines = stdinText.split("\n");
          let lineIndex = 0;
          py.setStdin({
            stdin: () => (lineIndex < lines.length ? lines[lineIndex++] : null),
          });
        } else {
          py.setStdin({ stdin: () => null });
        }
      }
      if (typeof py.loadPackagesFromImports === "function") {
        try {
          // Auto-install imported stdlib-adjacent packages (numpy, pandas, …).
          await py.loadPackagesFromImports(code);
        } catch {
          /* non-fatal: a truly missing import raises during execution */
        }
      }
      const ret = runsInWindow(code)
        ? await runGame(py, id, code)
        : await py.runPythonAsync(code);
      // Capture a rich HTML repr (e.g. a pandas DataFrame) of the last value.
      let html;
      try {
        if (ret && typeof ret._repr_html_ === "function") {
          const reprHtml = ret._repr_html_();
          // Cap the rich repr so a pathological object can't bloat the message/DOM.
          if (typeof reprHtml === "string" && reprHtml) {
            html = truncateOutput(reprHtml, MAX_OUTPUT_HTML_CHARS);
          }
        }
      } catch {
        /* non-fatal: fall back to the text repr */
      }
      const result =
        ret === undefined || ret === null
          ? undefined
          : truncateOutput(ret, MAX_OUTPUT_TEXT_CHARS);
      let images;
      try {
        const rich = pythonResultToJs(await py.runPythonAsync(COLLECT_RICH));
        images = boundRichImages(rich.images);
      } catch {
        /* non-fatal */
      }
      // When a rich HTML repr exists, suppress the redundant text repr.
      postProtocolMessage({
        id,
        logs,
        logStreams,
        result: html ? undefined : result,
        html,
        images,
      });
    } catch (err) {
      // Pyodide errors carry the full Python traceback in `.message` (it includes
      // the "Traceback (most recent call last):" frames + the final
      // "ErrorType: message" line), which the renderer parses into a styled block.
      const message = truncateOutput(
        withoutRunnerFrames(
          err && err.message ? trustedString(err.message) : trustedString(err),
        ),
        MAX_OUTPUT_TEXT_CHARS,
      );
      postProtocolMessage({ id, logs, logStreams, error: message });
    }
  });
})();
