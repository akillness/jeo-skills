// Pointer gestures that sliders, scrubbers and steppers share: following one
// pointer until it lifts, and repeating an action while a press is held.
import { on } from "../kernel/events"

/**
 * Where the pointer is, and how far it moved since the last report. The same object every report, so read it, don't keep it.
 * @stable
 */
type PointerSample = {
  x: number
  y: number
  // Accumulated since the previous report. Under pointer lock, the only movement there is.
  movementX: number
  movementY: number
  // Whether the pointer is locked, so the real cursor is hidden and still.
  locked: boolean
  event: PointerEvent
}

/**
 * What `bindDrag` reports, and when.
 * @stable
 */
type BindDragOptions = {
  /** At most once per frame, with the latest position and the movement since the last call. */
  onMove: (sample: PointerSample) => void
  /**
   * The pointer lifted, or the browser took it over, like for a scroll. A move
   * still pending runs first, so the last position is never lost.
   */
  onEnd: (event: PointerEvent, canceled: boolean) => void
  /**
   * How far, in CSS pixels, the pointer moves along either axis before moves
   * are reported, so a press that barely moves stays a click. Defaults to 0.
   */
  threshold?: number
  /**
   * Runs once, on the first move past `threshold`, before its `onMove`.
   * Return `false` to stop following the pointer, like when a drag can't start.
   */
  onStart?: (event: PointerEvent) => boolean | void
  /**
   * Locks the pointer once it has moved past `dragThreshold`, so it can travel
   * without limit, like a scrub, while a plain click never hides the cursor.
   * Falls back to capture where the browser refuses, as Safari does.
   */
  lock?: boolean
  /**
   * Ends the gesture as canceled when Escape is pressed once it has started,
   * and keeps that press from reaching anything else, like a popup around it.
   * `onEnd` gets the last pointer event. Defaults to `false`.
   */
  cancelOnEscape?: boolean
}

/**
 * Follows the pointer that pressed `el` until it lifts, for a drag of your
 * own: a slider, a splitter, an item dragged to a new place. Uses pointer
 * capture, and listens on the document too, so the gesture keeps going
 * outside the element, outside the window, and when the element moves in the
 * document. With a `threshold`, the capture waits until the pointer passes
 * it. Moves arrive at most once per frame. A release after the pointer
 * moved past `dragThreshold` swallows the click it sends, so a drag never
 * presses what it ends on, like a link. Returns a cleanup that ends it
 * without calling `onEnd`; call it when the component is destroyed.
 *
 * ```ts
 * on: {
 *   pointerdown: (event, { el }) =>
 *     bindDrag(el!, event, {
 *       threshold: dragThreshold,
 *       onMove: ({ x, y }) => moveTo(x, y),
 *       onEnd: (_event, canceled) => (canceled ? putBack() : commit()),
 *     }),
 * }
 * ```
 * @stable
 */
function bindDrag(
  el: HTMLElement,
  down: PointerEvent,
  options: BindDragOptions
) {
  followed.add(down)
  const view = el.ownerDocument.defaultView ?? window
  const pointerId = down.pointerId
  let frame = 0
  let hasPending = false
  const pending: PointerSample = {
    x: 0,
    y: 0,
    movementX: 0,
    movementY: 0,
    locked: false,
    event: down,
  }
  let lastX = down.clientX
  let lastY = down.clientY
  let started = !options.threshold && !options.onStart
  let dragged = false

  const capture = () => {
    try {
      el.setPointerCapture(pointerId)
    } catch {
      // Synthetic events have no active pointer to capture.
    }
  }
  // A captured press sends its click to `el`, so with a threshold the capture
  // waits for the drag: a press that lifts first clicks what was pressed, like a handle.
  if (!options.threshold) {
    capture()
  }
  // Lock is granted later, or refused, so each move checks.
  const locked = () => el.ownerDocument.pointerLockElement === el

  const flush = () => {
    frame = 0
    if (!hasPending) {
      return
    }
    hasPending = false
    options.onMove(pending)
    pending.movementX = 0
    pending.movementY = 0
  }

  const onMove = (event: PointerEvent) => {
    if (event.pointerId !== pointerId) {
      return
    }
    // A mouse released outside a frame that missed the pointerup.
    if (event.pointerType === "mouse" && event.buttons === 0) {
      return end(event, false)
    }
    if (!started) {
      const threshold = options.threshold ?? 0
      const dx = Math.abs(event.clientX - down.clientX)
      const dy = Math.abs(event.clientY - down.clientY)
      if (threshold && dx < threshold && dy < threshold) {
        return
      }
      started = true
      if (options.onStart?.(event) === false) {
        return stop()
      }
      if (threshold) {
        capture()
      }
      if (options.cancelOnEscape) {
        el.ownerDocument.addEventListener("keydown", onEscape, true)
      }
    }
    if (
      !dragged &&
      isDrag(event.clientX - down.clientX, event.clientY - down.clientY)
    ) {
      dragged = true
      if (options.lock && down.pointerType === "mouse") {
        requestLock(el)
      }
    }
    const isLocked = locked()
    pending.movementX += isLocked ? event.movementX : event.clientX - lastX
    pending.movementY += isLocked ? event.movementY : event.clientY - lastY
    pending.x = lastX = event.clientX
    pending.y = lastY = event.clientY
    pending.locked = isLocked
    pending.event = event
    hasPending = true
    frame ||= view.requestAnimationFrame(flush)
  }

  const onUp = (event: PointerEvent) => {
    if (event.pointerId !== pointerId) {
      return
    }
    if (dragged) {
      swallowNextClick(el.ownerDocument)
    }
    end(event, false)
  }
  const onCancel = (event: PointerEvent) => {
    if (event.pointerId === pointerId) {
      end(event, true)
    }
  }
  const onEscape = (event: KeyboardEvent) => {
    if (event.key !== "Escape") {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    if (dragged) {
      swallowNextClick(el.ownerDocument, true, pointerId)
    }
    end(pending.event, true)
  }

  const listeners: [string, (event: PointerEvent) => void][] = [
    ["pointermove", onMove],
    ["pointerup", onUp],
    ["pointercancel", onCancel],
  ]
  // Listening on the document too covers pointers the element couldn't
  // capture, and the moves pointer lock sends to the locked element.
  for (const [type, listener] of listeners) {
    el.ownerDocument.addEventListener(type, listener as EventListener)
  }
  if (started && options.cancelOnEscape) {
    el.ownerDocument.addEventListener("keydown", onEscape, true)
  }

  function stop() {
    if (frame) {
      view.cancelAnimationFrame(frame)
    }
    frame = 0
    for (const [type, listener] of listeners) {
      el.ownerDocument.removeEventListener(type, listener as EventListener)
    }
    el.ownerDocument.removeEventListener("keydown", onEscape, true)
    if (el.hasPointerCapture?.(pointerId)) {
      el.releasePointerCapture(pointerId)
    }
    if (locked()) {
      el.ownerDocument.exitPointerLock()
    }
  }

  function end(event: PointerEvent, canceled: boolean) {
    flush()
    stop()
    options.onEnd(event, canceled)
  }

  return stop
}

// The presses a drag follows, so a gesture around one, like a sheet's swipe, leaves it alone.
const followed = new WeakSet<Event>()
const isDragPress = (event: Event) => followed.has(event)

// A mouse is always primary, and a synthetic event without a type says nothing.
const isSecondary = (event: PointerEvent) =>
  !event.isPrimary && event.pointerType !== "mouse" && event.pointerType !== ""

// One drag at a time for a component. A press starts one only with the main
// button, and not from a second finger or pen, while no other runs. A drag cut
// short, like by the component going away, ends as canceled, so its draft goes back.
function createDragSession(onDestroy?: (cleanup: () => void) => void) {
  let running: { down: PointerEvent; cancel: () => void } | undefined
  onDestroy?.(() => running?.cancel())
  const session = {
    /**
     * Whether a press can start a drag now. Check it first, before the
     * component's own guards: ending a stale drag can change what they read.
     */
    accepts(event: PointerEvent) {
      if (event.button !== 0 || isSecondary(event) || event.defaultPrevented) {
        return false
      }
      // A new primary press of the same kind means the running drag missed its release. The
      // press that started it, bubbling to a part around, like a handle's to its box, doesn't.
      if (
        running &&
        running.down !== event &&
        running.down.pointerType === event.pointerType
      ) {
        running.cancel()
      }
      return !running
    },
    /** Follows the press, like `bindDrag`, as this component's one drag. */
    start(el: HTMLElement, down: PointerEvent, options: BindDragOptions) {
      const finish = () => {
        if (running === drag) {
          running = undefined
        }
      }
      const onStart = options.onStart
      const stop = bindDrag(el, down, {
        ...options,
        // A drag that can't start leaves the way clear for the next press.
        onStart:
          onStart &&
          ((event) => {
            const started = onStart(event)
            if (started === false) {
              finish()
            }
            return started
          }),
        onEnd(event, canceled) {
          finish()
          options.onEnd(event, canceled)
        },
      })
      const drag = {
        down,
        cancel() {
          finish()
          stop()
          options.onEnd(down, true)
        },
      }
      running = drag
    },
    /**
     * Waits for the press to move until `pick` decides: `undefined` to keep
     * waiting, `false` to let it go, like a scroll, or `true` to follow it from
     * that move, like `start`. The pointer isn't captured while it waits, so
     * a press that lifts first stays a click, and `onTap` hears it.
     */
    startOnMove(
      el: HTMLElement,
      down: PointerEvent,
      {
        pick,
        onTap,
        ...options
      }: BindDragOptions & {
        pick: (move: PointerEvent) => boolean | undefined
        onTap?: (up: PointerEvent) => void
      }
    ) {
      const doc = el.ownerDocument
      const ours = (event: PointerEvent) => event.pointerId === down.pointerId
      const stopWaiting = () => {
        offs.forEach((off) => off())
        if (running === waiting) {
          running = undefined
        }
      }
      const offs = [
        on(doc, "pointermove", (move) => {
          if (!ours(move)) {
            return
          }
          const picked = pick(move)
          if (picked === undefined) {
            return
          }
          stopWaiting()
          if (!picked) {
            return
          }
          // The swipe follows from the move that picked it, but counts as a drag from the press.
          session.start(el, move, {
            ...options,
            onEnd(up, canceled) {
              const from = (event: PointerEvent) =>
                isDrag(up.clientX - event.clientX, up.clientY - event.clientY)
              if (!canceled && from(down) && !from(move)) {
                swallowNextClick(doc)
              }
              options.onEnd(up, canceled)
            },
          })
        }),
        on(doc, "pointerup", (up) => {
          if (!ours(up)) {
            return
          }
          stopWaiting()
          onTap?.(up)
        }),
        on(doc, "pointercancel", (cancel) => ours(cancel) && stopWaiting()),
      ]
      const waiting = { down, cancel: stopWaiting }
      running = waiting
    },
    /** Ends the running drag, if any, as canceled. */
    cancel: () => running?.cancel(),
  }
  return session
}

type DragSession = ReturnType<typeof createDragSession>

/**
 * How far a press moves, in CSS pixels, before it counts as a drag rather than a click.
 * @stable
 */
const dragThreshold = 3

/** Whether a movement from where the press started is a drag. */
function isDrag(dx: number, dy: number) {
  return Math.abs(dx) >= dragThreshold || Math.abs(dy) >= dragThreshold
}

// Pointer lock hides the cursor and frees it from the screen's edges. Safari
// shows a banner and can refuse, so failures fall back to plain movement.
function requestLock(el: HTMLElement) {
  if (typeof el.requestPointerLock !== "function") {
    return
  }
  try {
    const result = el.requestPointerLock() as unknown
    if (result instanceof Promise) {
      result.catch(() => {})
    }
  } catch {}
}

// Swallows the click a drag's release sends, so the drag doesn't press what
// it ends on, like a link. Call it in the release's task, or on the press with
// `untilRelease`. It stops after the release's task, or at the next press, so
// a later click goes through.
function swallowNextClick(
  doc: Document,
  untilRelease = false,
  pointerId?: number
) {
  const view = doc.defaultView ?? window
  // With `pointerId`, another pointer's press, release or click, like a second finger's, leaves it armed.
  const ours = (event: Event) =>
    pointerId === undefined ||
    !("pointerId" in event) ||
    event.pointerId === pointerId
  const swallow = (event: Event) => {
    if (!ours(event)) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    doc.removeEventListener("click", swallow, true)
  }
  const forget = () => {
    doc.removeEventListener("click", swallow, true)
    doc.removeEventListener("pointerdown", press, true)
    doc.removeEventListener("pointerup", release, true)
    doc.removeEventListener("pointercancel", release, true)
  }
  const press = (event: Event) => ours(event) && forget()
  const release = (event: Event) => ours(event) && view.setTimeout(forget)
  doc.addEventListener("click", swallow, true)
  doc.addEventListener("pointerdown", press, true)
  if (!untilRelease) {
    return view.setTimeout(forget)
  }
  doc.addEventListener("pointerup", release, true)
  doc.addEventListener("pointercancel", release, true)
}

/**
 * Runs `step` now, then again every `interval` ms after `delay` ms, until the
 * returned function stops it or `step` returns false, like at a bound.
 */
function repeatWhileHeld(
  step: () => boolean,
  { delay = 400, interval = 60 } = {}
) {
  let timer: ReturnType<typeof setTimeout> | undefined
  const tick = (wait: number) => {
    timer = setTimeout(() => {
      if (step()) {
        tick(interval)
      }
    }, wait)
  }
  if (step()) {
    tick(delay)
  }
  return () => clearTimeout(timer)
}

export {
  bindDrag,
  createDragSession,
  dragThreshold,
  isDrag,
  isDragPress,
  type PointerSample,
  repeatWhileHeld,
  swallowNextClick,
  type BindDragOptions,
  type DragSession,
}
