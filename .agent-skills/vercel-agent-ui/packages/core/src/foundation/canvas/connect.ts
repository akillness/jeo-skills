// Drawing a connection from one port to another: wiring nodes in an editor,
// linking cards on a board, joining steps of a flow. A pointer drags a loose
// line out of a port and it snaps to the nearest port that can take it; let
// go there to connect. The keyboard starts from a port, arrows go to the
// nearest port that can take it in their direction, Enter connects and
// Escape lets go. The loose line lives in state, so it renders like any part
// and costs no render as it moves.
import { elements } from "../kernel/elements"
import type { PrimitiveContext } from "../kernel/primitive-types"
import { announce } from "../platform/announce"
import { createDragSession } from "../drag-and-drop/pointer"
import { nearestInDirection } from "../focus/spatial"

/**
 * The connection being drawn: where it starts, the port it would land on, and its loose end in your units.
 * @experimental
 */
type ConnectDraft = {
  from: string
  to: string | null
  x: number
  y: number
  keyboard: boolean
}

/**
 * Why a connection was made: a pointer let go on a port, or a key.
 * @experimental
 */
type ConnectReason = "drag" | "connect-key"

/**
 * What screen readers hear, by step.
 * @experimental
 */
type ConnectMessage =
  | { type: "start"; from: string }
  | { type: "target"; from: string; to: string }
  | { type: "connect"; from: string; to: string }
  | { type: "cancel"; from: string }

/**
 * How `createConnect` finds ports and makes connections.
 * @experimental
 */
type ConnectOptions<State extends object> = {
  /** The slot whose parts are ports. */
  slot: string
  /** The state key that holds the `ConnectDraft` while one is drawn. Start it at `null`, and list it in `live`. */
  draft: keyof State & string
  /** Makes the connection and returns whether it went through. */
  connect: (
    from: string,
    to: string,
    details: { reason: ConnectReason; event?: Event }
  ) => boolean
  /** Whether `from` can connect to `to`. Defaults to any other port. */
  canConnect?: (from: string, to: string) => boolean
  /** Turns a point on screen into your units, like a canvas viewport's `toCanvas`. Defaults to client pixels. */
  point?: (clientX: number, clientY: number) => { x: number; y: number }
  /** How near, in screen pixels, a pointer must come to a port to snap to it. @defaultValue 28 */
  radius?: () => number
  /** A port's name for screen readers. Defaults to its key. */
  label?: (key: string) => string
  /** What screen readers hear. Defaults to English. */
  message?: (message: ConnectMessage, label: (key: string) => string) => string
}

/**
 * The English messages `createConnect` announces unless you pass `message`.
 * @experimental
 */
function connectMessage(
  message: ConnectMessage,
  label: (key: string) => string
) {
  if (message.type === "start") {
    return `Connecting from ${label(message.from)}. Arrows choose a port, Enter connects, Escape cancels.`
  }
  if (message.type === "target") {
    return `To ${label(message.to)}.`
  }
  if (message.type === "connect") {
    return `Connected ${label(message.from)} to ${label(message.to)}.`
  }
  return "Canceled."
}

const arrows: Record<string, readonly [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
}

const center = (el: Element) => {
  const box = el.getBoundingClientRect()
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
}

/**
 * Lets users connect a slot's parts, ports, by dragging from one to another
 * or with the keyboard. Call it once in `api` and keep it on the api:
 *
 * ```ts
 * port: slot<{ value: string }>({
 *   live: live((state, { api, key }) => ({ "data-connect": api.connect.role(state, key) })),
 *   on: { pointerdown: (event, { el, api, key }) => api.connect.pointerdown(event, key, el!) },
 * }),
 * ```
 *
 * `start(port)` begins from the keyboard; send keys to `keydown` while
 * `active()`. Draw the loose line from the `from` port to `{ x, y }` in the
 * draft. Port boxes are read when a connection starts, so dragging measures
 * nothing.
 * @experimental
 */
function createConnect<State extends object>(
  context: Pick<
    PrimitiveContext<any, State, any>,
    "store" | "onDestroy" | "parts"
  >,
  options: ConnectOptions<State>
) {
  const { store } = context
  const draft = () => store.get()[options.draft] as ConnectDraft | null
  const setDraft = (value: ConnectDraft | null) =>
    store.set({ [options.draft]: value } as Partial<State>)
  const point = (x: number, y: number) => options.point?.(x, y) ?? { x, y }
  const label = (key: string) => options.label?.(key) ?? key
  const say = (message: ConnectMessage) =>
    announce((options.message ?? connectMessage)(message, label), {
      priority: "assertive",
    })
  const can = (from: string, to: string) =>
    from !== to && (options.canConnect?.(from, to) ?? true)
  const ports = () => elements(context, options.slot)
  const drags = createDragSession(context.onDestroy)

  const api = {
    /** Whether a connection is being drawn. */
    active() {
      return !!draft()
    },
    /** Starts a connection from a port with the keyboard. Returns whether it started. */
    start(from: string) {
      const el = ports().find((port) => port.key === from)?.el
      if (!el || !ports().some((port) => can(from, port.key))) {
        return false
      }
      const at = center(el)
      setDraft({ from, to: null, ...point(at.x, at.y), keyboard: true })
      say({ type: "start", from })
      return true
    },
    /** Points the connection at a port, or at none. */
    target(to: string | null) {
      const current = draft()
      if (!current || (to && !can(current.from, to))) {
        return false
      }
      const el = to ? ports().find((port) => port.key === to)?.el : undefined
      const at = el ? center(el) : undefined
      setDraft({ ...current, to, ...(at ? point(at.x, at.y) : {}) })
      if (to) {
        say({ type: "target", from: current.from, to })
      }
      return true
    },
    /** Makes the connection the draft points at, and ends it. */
    commit(
      details: { reason: ConnectReason; event?: Event } = {
        reason: "connect-key",
      }
    ) {
      const current = draft()
      setDraft(null)
      if (!current?.to) {
        return false
      }
      const done = options.connect(current.from, current.to, details)
      if (done) {
        say({ type: "connect", from: current.from, to: current.to })
      }
      return done
    },
    /** Lets go of the connection without making it. */
    cancel() {
      const current = draft()
      drags.cancel()
      setDraft(null)
      if (current?.keyboard) {
        say({ type: "cancel", from: current.from })
      }
    },
    /**
     * While connecting from the keyboard: arrows go to the nearest port that
     * can take it in their direction, Enter or Space connects, Escape and Tab
     * let go. Returns whether it handled the key.
     */
    keydown(event: KeyboardEvent) {
      const current = draft()
      if (!current) {
        return false
      }
      const direction = arrows[event.key]
      if (direction) {
        event.preventDefault()
        const all = ports()
        const fromEl = all.find(
          (port) => port.key === (current.to ?? current.from)
        )?.el
        if (!fromEl) {
          return true
        }
        const candidates = all
          .filter(
            (port) => port.key !== current.to && can(current.from, port.key)
          )
          .map((port) => ({
            key: port.key,
            rect: port.el.getBoundingClientRect(),
          }))
        const next = nearestInDirection(
          fromEl.getBoundingClientRect(),
          candidates,
          direction
        )
        if (next) {
          api.target(next)
        }
        return true
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault()
        if (current.to) {
          api.commit({ reason: "connect-key", event })
        }
        return true
      }
      if (event.key === "Escape" || event.key === "Tab") {
        if (event.key === "Escape") {
          event.preventDefault()
        }
        api.cancel()
        return true
      }
      return false
    },
    /** Drags a loose line out of a port; letting go near a port that can take it connects. */
    pointerdown(event: PointerEvent, from: string, el: HTMLElement) {
      if (!drags.accepts(event)) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      const radius = options.radius?.() ?? 28
      const targets = ports()
        .filter((port) => can(from, port.key))
        .map((port) => ({ key: port.key, at: center(port.el) }))
      const nearest = (x: number, y: number) => {
        let best: { key: string; distance: number } | undefined
        for (const target of targets) {
          const distance = Math.hypot(target.at.x - x, target.at.y - y)
          if (distance <= radius && (!best || distance < best.distance)) {
            best = { key: target.key, distance }
          }
        }
        return best
          ? targets.find((target) => target.key === best.key)!
          : undefined
      }
      setDraft({
        from,
        to: null,
        ...point(event.clientX, event.clientY),
        keyboard: false,
      })
      drags.start(el, event, {
        cancelOnEscape: true,
        onMove: ({ x, y }) => {
          const near = nearest(x, y)
          // Near a port, the loose end snaps onto it.
          setDraft({
            from,
            to: near?.key ?? null,
            ...(near ? point(near.at.x, near.at.y) : point(x, y)),
            keyboard: false,
          })
        },
        onEnd: (end, canceled) => {
          if (canceled) {
            api.cancel()
          } else {
            api.commit({ reason: "drag", event: end })
          }
        },
      })
    },
    /** A port's part in the connection being drawn, for a data attribute: `source`, `target`, `candidate`, or `undefined`. */
    role(state: State, key: string) {
      const current = state[options.draft] as ConnectDraft | null
      if (!current) {
        return undefined
      }
      if (current.from === key) {
        return "source"
      }
      if (current.to === key) {
        return "target"
      }
      return can(current.from, key) ? "candidate" : undefined
    },
  }
  return api
}

export {
  type ConnectDraft,
  connectMessage,
  type ConnectMessage,
  type ConnectOptions,
  type ConnectReason,
  createConnect,
}
