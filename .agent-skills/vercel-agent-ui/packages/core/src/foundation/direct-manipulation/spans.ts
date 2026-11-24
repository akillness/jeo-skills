// Ranges laid on tracks: events in a week calendar's days, bars in a Gantt
// chart's rows, clips on a video editor's layers, bookings on a room's
// timeline. A drag on an empty stretch of a track draws a range, a drag on a
// range moves it, along its track and to other tracks, and a drag on one of
// its edges resizes it. Every value snaps to a step. Like `createTransfer`,
// the ranges live in a draft while a pointer drags, which renders as it
// changes, and only the drop commits, so a drag is one change and one undo.
// From the keyboard each arrow commits at once, as a slider's does.
import { deriveState } from "../kernel/derive"
import { settleDraft } from "../kernel/draft"
import type { PrimitiveContext } from "../kernel/primitive-types"
import { announce } from "../platform/announce"
import {
  createAutoScroll,
  type AutoScrollOptions,
} from "../drag-and-drop/auto-scroll"
import { isRTL } from "../platform/env"
import { keepFocus } from "../focus/keep-focus"
import { documentOrder } from "../kernel/order"
import { createDragSession, dragThreshold } from "../drag-and-drop/pointer"
import { onGrid } from "../number/steps"

/**
 * A range on a track, from `start` to `end` in the track's own units, like minutes from midnight.
 * @experimental
 */
type Span = { id: string; track: string; start: number; end: number }

/**
 * What changed a span: drawn, moved, resized or deleted.
 * @experimental
 */
type SpanAction = "draw" | "move" | "resize" | "delete"

/**
 * Why the spans changed: a pointer drag, an arrow key that moved or resized a
 * span, Delete or Backspace, or a call from code.
 * @experimental
 */
type SpansReason = "drag" | "move-key" | "remove-press" | "imperative"

/**
 * The spans as they show while a pointer drags, kept in state under `SpansOptions.draft`.
 * @experimental
 */
type SpansDraft<S extends Span = Span> = {
  /** The span being drawn, moved or resized. */
  id: string
  action: SpanAction
  /** Every span as it shows now. */
  spans: S[]
}

/**
 * What happened, for the message screen readers hear.
 * @experimental
 */
type SpansMessage<S extends Span = Span> = {
  /** `cancel` when a drag put the span back. */
  type: SpanAction | "cancel"
  span: S
  /** What the span is, from `label`. */
  label: string
}

/**
 * How `createSpans` reads, renders and changes the spans.
 * @experimental
 */
type SpansOptions<State extends object, S extends Span = Span> = {
  /** The state key that holds the spans, an array of `Span`. */
  key: keyof State & string
  /** The state key that holds the `SpansDraft` while a pointer drags. Start it at `null`. */
  draft: keyof State & string
  /**
   * Asks for the new spans and returns whether they went through. Pass the
   * primitive's change: `set: (value, details) => change("spans", value, details)`.
   */
  set: (
    value: S[],
    details: {
      reason: SpansReason
      event?: Event
      id: string
      action: SpanAction
    }
  ) => boolean
  /** Where tracks start, in their units. @defaultValue 0 */
  min?: () => number
  /** Where tracks end. @defaultValue 100 */
  max?: () => number
  /** What every start and end snaps to, and what arrows move by. @defaultValue 1 */
  step?: () => number
  /** The shortest a span can be. @defaultValue the step */
  minSize?: () => number
  /** The longest a span can be. */
  maxSize?: () => number
  /** The direction tracks run: `y` down, like a calendar's days, or `x` across, like a Gantt chart's rows. @defaultValue "y" */
  axis?: "x" | "y"
  /** The tracks in the order the arrows across them go through. Defaults to the bound tracks in document order. */
  tracks?: () => string[]
  /** Whether spans on one track can overlap. When they can't, a drag stops where it would. @defaultValue true */
  overlap?: boolean
  /**
   * Makes the span a press on a track starts to draw, with a new `id` and
   * anything else it needs, like a title, or returns `null` to not draw. Runs
   * on every press on an empty stretch of track. Without it, nothing is drawn.
   */
  create?: (span: Span) => S | null
  /** How long a span a click on an empty track makes. Without it, a click makes none. */
  size?: () => number | undefined
  /** Whether a span can't change. */
  disabled?: (span: S) => boolean
  /** What screen readers call a span, like `"Standup, Tuesday 9:00 to 9:30"`. Defaults to its track and range. */
  label?: (span: S) => string
  /** The text screen readers hear for each change. Defaults to English. */
  message?: (message: SpansMessage<S>) => string
  /** How a drag near a scroller's edge scrolls it, or `false` not to. */
  createAutoScroll?: Omit<AutoScrollOptions, "onScroll" | "ignore"> | false
}

/**
 * The English messages `createSpans` announces unless you pass `message`.
 * @experimental
 */
function spansMessage({ type, label }: SpansMessage) {
  if (type === "draw") {
    return `Added ${label}.`
  }
  if (type === "delete") {
    return `Deleted ${label}.`
  }
  if (type === "cancel") {
    return `Put back ${label}.`
  }
  return `${label}.`
}

/**
 * Where each span sits beside the spans it overlaps on its track: lane
 * `lane` of `lanes`, so overlapping events share their day's width. Spans
 * that only touch don't overlap.
 * @experimental
 */
function stackSpans(spans: readonly Span[]) {
  const result = new Map<string, { lane: number; lanes: number }>()
  const byTrack = new Map<string, Span[]>()
  for (const span of spans) {
    byTrack.set(span.track, [...(byTrack.get(span.track) ?? []), span])
  }
  for (const track of byTrack.values()) {
    track.sort((a, b) => a.start - b.start || b.end - a.end)
    // Spans that overlap one another, directly or through others, share a lane count.
    let group: Span[] = []
    let lanes: number[] = []
    let groupEnd = -Infinity
    const close = () => {
      for (const span of group) {
        result.get(span.id)!.lanes = lanes.length
      }
      group = []
      lanes = []
    }
    for (const span of track) {
      if (span.start >= groupEnd) {
        close()
      }
      let lane = lanes.findIndex((end) => end <= span.start)
      if (lane === -1) {
        lane = lanes.push(span.end) - 1
      } else {
        lanes[lane] = span.end
      }
      result.set(span.id, { lane, lanes: 0 })
      group.push(span)
      groupEnd = Math.max(
        groupEnd === -Infinity ? span.end : groupEnd,
        span.end
      )
    }
    close()
  }
  return result
}

/**
 * Whether `span` overlaps no other span on its track.
 * @experimental
 */
function isSpanFree(spans: readonly Span[], span: Span) {
  return spans.every(
    (other) =>
      other.id === span.id ||
      other.track !== span.track ||
      other.end <= span.start ||
      other.start >= span.end
  )
}

/**
 * Lets users draw, move and resize spans on tracks, by dragging and with the
 * keyboard. Call it once in `api`, keep it on the api, render each track's
 * spans from `spans(state)`, and wire both slots:
 *
 * ```ts
 * track: slot<{ value: string }>({
 *   bind: (el, { api, key }) => api.spans.bindTrack(el, key),
 *   on: { pointerdown: (event, { api, key }) => api.spans.trackPointerdown(event, key) },
 * }),
 * span: slot<{ value: string }>({
 *   attrs: (state, { api, key }) => api.spans.spanAttrs(state, key),
 *   bind: (el, { api, key }) => api.spans.bindSpan(el, key),
 *   on: {
 *     pointerdown: (event, { api, key }) => api.spans.spanPointerdown(event, key),
 *     keydown: (event, { api, key }) => api.spans.keydown(event, key),
 *   },
 * })
 * ```
 *
 * Put an element with `data-span-edge="start"` or `"end"` inside a span for
 * each edge it resizes from. A track's element runs the whole range, from
 * `min` to `max`, and spans sit in it at `spanStyle`.
 * @experimental
 */
function createSpans<State extends object, S extends Span = Span>(
  context: Pick<PrimitiveContext<any, State, any>, "store" | "onDestroy">,
  options: SpansOptions<State, S>
) {
  const { store } = context
  const tracks = new Map<string, HTMLElement>()
  const elements = new Map<string, HTMLElement>()
  const value = () => store.get()[options.key] as S[]
  const draft = () => store.get()[options.draft] as SpansDraft<S> | null
  const setDraft = (next: SpansDraft<S> | null) =>
    store.set({ [options.draft]: next } as Partial<State>)
  const min = () => options.min?.() ?? 0
  const max = () => options.max?.() ?? 100
  const step = () => options.step?.() ?? 1
  const minSize = () => Math.max(options.minSize?.() ?? step(), step())
  const axis = () => options.axis ?? "y"

  const snap = (n: number, round: (steps: number) => number = Math.round) =>
    onGrid(n, { min: min(), max: max(), step: step() }, round)

  // The span's start and end held in range and size, keeping the edge that didn't move.
  function fit(span: S, keep: "start" | "end" | "size") {
    let { start, end } = span
    const lo = min()
    const hi = max()
    const longest = options.maxSize?.() ?? hi - lo
    if (keep === "size") {
      const size = end - start
      start = Math.min(Math.max(start, lo), hi - size)
      end = start + size
    } else if (keep === "start") {
      end = Math.min(hi, start + longest, Math.max(end, start + minSize()))
    } else {
      start = Math.max(lo, end - longest, Math.min(start, end - minSize()))
    }
    return { ...span, start, end } as S
  }

  const label = (span: S) =>
    options.label?.(span) ?? `${span.track}, ${span.start} to ${span.end}`
  const say = (type: SpansMessage["type"], span: S) =>
    announce(
      (options.message ?? spansMessage)({ type, span, label: label(span) })
    )

  const order = () => {
    const given = options.tracks?.()
    if (given) {
      return given
    }
    return [...tracks.entries()]
      .filter(([, el]) => el.isConnected)
      .sort(([, a], [, b]) => documentOrder(a, b))
      .map(([track]) => track)
  }

  // The value under a point on a track, along its axis, unsnapped.
  function valueAt(track: string, x: number, y: number) {
    const el = tracks.get(track)
    if (!el) {
      return min()
    }
    const rect = el.getBoundingClientRect()
    let fraction =
      axis() === "y"
        ? rect.height
          ? (y - rect.top) / rect.height
          : 0
        : rect.width
          ? (x - rect.left) / rect.width
          : 0
    if (axis() === "x" && isRTL(el)) {
      fraction = 1 - fraction
    }
    return min() + Math.min(1, Math.max(0, fraction)) * (max() - min())
  }

  // The track under a point across the axis: the one containing it, else the nearest.
  function trackAt(x: number, y: number) {
    let best: { track: string; distance: number } | undefined
    for (const [track, el] of tracks) {
      if (!el.isConnected) {
        continue
      }
      const rect = el.getBoundingClientRect()
      const [at, from, to] =
        axis() === "y" ? [x, rect.left, rect.right] : [y, rect.top, rect.bottom]
      const distance = at < from ? from - at : at > to ? at - to : 0
      if (!best || distance < best.distance) {
        best = { track, distance }
      }
    }
    return best?.track
  }

  // The spans with `span` in place of the one with its id, or added.
  const replaced = (spans: S[], span: S) =>
    spans.some((other) => other.id === span.id)
      ? spans.map((other) => (other.id === span.id ? span : other))
      : [...spans, span]

  const allowed = (spans: S[], span: S) =>
    options.overlap !== false || isSpanFree(spans, span)

  // A span that moves to another track renders as a new element there; focus follows it.
  const focusLater = (id: string) => keepFocus(() => elements.get(id))

  function commit(
    spans: S[],
    details: {
      reason: SpansReason
      event?: Event
      id: string
      action: SpanAction
    }
  ) {
    const span =
      spans.find((other) => other.id === details.id) ??
      value().find((other) => other.id === details.id)
    if (!options.set(spans, details)) {
      return false
    }
    if (span) {
      say(details.action, span)
    }
    return true
  }

  let held = false
  let moved = false

  // The owner can change the spans mid-drag. The draft takes the spans they
  // have now, with the held one where the drag put it, or ends when it's gone
  // or would overlap one the owner put there.
  deriveState(context, [options.draft], (state) => {
    const current = state[options.draft] as SpansDraft<S> | null
    const now = state[options.key] as S[]
    if (!current || !held) {
      return
    }
    if (
      current.action !== "draw" &&
      !now.some((span) => span.id === current.id)
    ) {
      return { [options.draft]: null } as Partial<State>
    }
    const span = moved
      ? current.spans.find((other) => other.id === current.id)
      : undefined
    const spans = span ? replaced(now, span) : now
    if (span && !allowed(spans, span)) {
      return { [options.draft]: null } as Partial<State>
    }
    if (
      spans.length === current.spans.length &&
      spans.every((other, i) => other === current.spans[i])
    ) {
      return
    }
    return { [options.draft]: { ...current, spans } } as Partial<State>
  })

  const drags = createDragSession(context.onDestroy)

  // Follows a pointer that pressed `el`, building the draft from `next` on each move.
  function drag(
    el: HTMLElement,
    event: PointerEvent,
    id: string,
    action: SpanAction,
    next: (x: number, y: number) => S | undefined,
    click?: () => void
  ) {
    const before = value()
    let dragging = false
    let last: PointerEvent | undefined
    let point = { x: event.clientX, y: event.clientY }
    const update = () => {
      const span = next(point.x, point.y)
      const current = draft()
      if (!span || !current) {
        return
      }
      const spans = replaced(current.spans, span)
      if (!allowed(spans, span)) {
        return
      }
      moved = true
      setDraft({ id, action, spans })
    }
    const scroller =
      options.createAutoScroll === false
        ? undefined
        : createAutoScroll({
            ...options.createAutoScroll,
            ignore: () => elements.get(id),
            onScroll: update,
          })
    drags.start(el, event, {
      threshold: dragThreshold,
      cancelOnEscape: true,
      onStart: () => {
        if (draft()) {
          return false
        }
        dragging = true
        held = true
        moved = false
        setDraft({ id, action, spans: value() })
      },
      onMove: ({ x, y, event: moveEvent }) => {
        moveEvent.preventDefault()
        last = moveEvent
        point = { x, y }
        scroller?.update(x, y)
        update()
      },
      onEnd: (endEvent, canceled) => {
        const dragged = dragging
        scroller?.stop()
        dragging = false
        held = false
        if (!dragged) {
          return canceled ? undefined : click?.()
        }
        const current = draft()
        if (canceled && action !== "draw") {
          const span = before.find((other) => other.id === id)
          if (span) {
            say("cancel", span)
          }
        }
        if (!current || canceled || !moved) {
          return setDraft(null)
        }
        const base = value()
        if (
          !commit(current.spans, {
            reason: "drag",
            event: last ?? endEvent,
            id,
            action,
          })
        ) {
          setDraft(null)
        }
        // Keeps the draft until a controlled value's new spans arrive.
        else {
          settleDraft(store, value, base, () => {
            if (draft() === current) {
              setDraft(null)
            }
          })
        }
      },
    })
  }

  const spans = {
    /** Joins a track's element, so drags find it. Return its cleanup from the track slot's `bind`. */
    bindTrack(el: HTMLElement, track: string) {
      tracks.set(track, el)
      return () => {
        if (tracks.get(track) === el) {
          tracks.delete(track)
        }
      }
    },
    /** Joins a span's element. Return its cleanup from the span slot's `bind`. */
    bindSpan(el: HTMLElement, id: string) {
      elements.set(id, el)
      return () => {
        if (elements.get(id) === el) {
          elements.delete(id)
        }
      }
    },
    /** The spans to render: the draft's while a pointer drags, else the value. Pure, so `state` and `attrs` can call it. */
    spans(state: State) {
      return (
        (state[options.draft] as SpansDraft<S> | null)?.spans ??
        (state[options.key] as S[])
      )
    },
    /** One track's spans, from `spans(state)`. */
    spansOn(state: State, track: string) {
      return spans.spans(state).filter((span) => span.track === track)
    },
    /** What a pointer is doing to a span, if anything. */
    action(state: State, id: string) {
      const current = state[options.draft] as SpansDraft<S> | null
      return current?.id === id ? current.action : undefined
    },
    /**
     * A span's place in its track, as a `style` attribute: its start and
     * length in percentages along the axis, and its lane across it from
     * `stackSpans`, if passed. Also `--span-start` and `--span-size`, from 0 to 1.
     */
    spanStyle(span: Span, lane?: { lane: number; lanes: number }) {
      const range = max() - min() || 1
      const from = (span.start - min()) / range
      const size = (span.end - span.start) / range
      const percent = (n: number) => `${Math.round(n * 1e4) / 100}%`
      const [along, length, across, breadth] =
        axis() === "y"
          ? ["top", "height", "inset-inline-start", "width"]
          : ["inset-inline-start", "width", "top", "height"]
      const lanes = lane
        ? `;${across}:${percent(lane.lane / lane.lanes)};${breadth}:${percent(1 / lane.lanes)}`
        : ""
      return `position:absolute;${along}:${percent(from)};${length}:${percent(size)}${lanes};--span-start:${from};--span-size:${size}`
    },
    /** A span's attributes: `data-span-id` for drags to find it, and `data-dragging`, `data-resizing` or `data-drawing` while a pointer does. */
    spanAttrs(state: State, id: string) {
      const action = spans.action(state, id)
      return {
        "data-span-id": id,
        "data-dragging": action === "move" ? "" : undefined,
        "data-resizing": action === "resize" ? "" : undefined,
        "data-drawing": action === "draw" ? "" : undefined,
      }
    },
    /** The value under a point on a track, snapped. For a hover line or a "new event at" menu. */
    valueAt: (track: string, x: number, y: number) =>
      snap(valueAt(track, x, y)),
    /**
     * Draws a span from where a track was pressed, once the pointer moves a
     * few pixels; a click makes one `size` long, if `size` is set. Presses
     * on a span are left to `spanPointerdown`.
     */
    trackPointerdown(event: PointerEvent, track: string) {
      const el = tracks.get(track)
      const target = event.target as Element | null
      if (
        !el ||
        !drags.accepts(event) ||
        !options.create ||
        target?.closest("[data-span-id]")
      ) {
        return
      }
      const at = snap(valueAt(track, event.clientX, event.clientY), Math.floor)
      const base = options.create({
        id: "",
        track,
        start: at,
        end: at + step(),
      })
      if (!base) {
        return
      }
      const made = (start: number, end: number) =>
        fit({ ...base, track, start, end } as S, "start")
      drag(
        el,
        event,
        base.id,
        "draw",
        (x, y) => {
          const v = valueAt(track, x, y)
          return v >= at
            ? made(at, snap(v, Math.ceil))
            : fit(
                { ...base, start: snap(v, Math.floor), end: at + step() },
                "end"
              )
        },
        () => {
          const size = options.size?.()
          if (size === undefined) {
            return
          }
          const span = fit({ ...base, start: at, end: at + size }, "size")
          const next = replaced(value(), span)
          if (allowed(next, span)) {
            commit(next, { reason: "drag", event, id: span.id, action: "draw" })
          }
        }
      )
      event.preventDefault()
    },
    /**
     * Moves a span, or resizes it from an edge marked `data-span-edge`, once
     * the pointer moves a few pixels, so a click stays a click.
     */
    spanPointerdown(event: PointerEvent, id: string) {
      const el = elements.get(id)
      const span = value().find((other) => other.id === id)
      if (!el || !span || !drags.accepts(event) || options.disabled?.(span)) {
        return
      }
      const edge = (event.target as Element | null)?.closest<HTMLElement>(
        "[data-span-edge]"
      )?.dataset.spanEdge
      const grabbed =
        valueAt(span.track, event.clientX, event.clientY) - span.start
      if (edge === "start" || edge === "end") {
        drag(el, event, id, "resize", (x, y) => {
          const v = snap(valueAt(span.track, x, y))
          return edge === "start"
            ? fit({ ...span, start: v }, "end")
            : fit({ ...span, end: v }, "start")
        })
      } else {
        drag(el, event, id, "move", (x, y) => {
          const track = trackAt(x, y) ?? span.track
          const start = snap(valueAt(track, x, y) - grabbed)
          return fit(
            { ...span, track, start, end: start + span.end - span.start },
            "size"
          )
        })
      }
    },
    /**
     * Handles a key on a span and returns whether it did. Arrows along the
     * axis move it a step, with Shift they move its end; arrows across move
     * it to the next track; Delete and Backspace delete it. Each change
     * commits, and screen readers hear the span's new place.
     */
    keydown(event: KeyboardEvent, id: string) {
      const span = value().find((other) => other.id === id)
      if (
        !span ||
        event.defaultPrevented ||
        draft() ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      ) {
        return false
      }
      // Keys typed in a field inside the span, like its title, are the field's.
      const target = event.target as HTMLElement | null
      if (
        options.disabled?.(span) ||
        target?.isContentEditable ||
        /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName ?? "")
      ) {
        return false
      }
      const rtl = event.target instanceof Element && isRTL(event.target)
      const keys =
        axis() === "y"
          ? {
              back: "ArrowUp",
              forward: "ArrowDown",
              before: rtl ? "ArrowRight" : "ArrowLeft",
              after: rtl ? "ArrowLeft" : "ArrowRight",
            }
          : {
              back: rtl ? "ArrowRight" : "ArrowLeft",
              forward: rtl ? "ArrowLeft" : "ArrowRight",
              before: "ArrowUp",
              after: "ArrowDown",
            }
      let next: S | undefined
      let action: SpanAction = "move"
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault()
        return commit(
          value().filter((other) => other.id !== id),
          { reason: "remove-press", event, id, action: "delete" }
        )
      } else if (event.key === keys.back || event.key === keys.forward) {
        const by = event.key === keys.forward ? step() : -step()
        if (event.shiftKey) {
          action = "resize"
          next = fit({ ...span, end: span.end + by }, "start")
        } else {
          next = fit(
            { ...span, start: span.start + by, end: span.end + by },
            "size"
          )
        }
      } else if (
        (event.key === keys.before || event.key === keys.after) &&
        !event.shiftKey
      ) {
        const names = order()
        const track =
          names[names.indexOf(span.track) + (event.key === keys.after ? 1 : -1)]
        if (track !== undefined) {
          next = { ...span, track }
        }
      }
      if (!next) {
        return false
      }
      event.preventDefault()
      const result = replaced(value(), next)
      if (
        next.start === span.start &&
        next.end === span.end &&
        next.track === span.track
      ) {
        return true
      }
      if (
        allowed(result, next) &&
        commit(result, { reason: "move-key", event, id, action }) &&
        next.track !== span.track
      ) {
        focusLater(id)
      }
      return true
    },
    /** Changes a span at once, like from a form. Returns whether it went through. */
    update(id: string, patch: Partial<Omit<S, "id">>) {
      const span = value().find((other) => other.id === id)
      if (!span) {
        return false
      }
      const keep =
        patch.start === undefined
          ? "start"
          : patch.end === undefined
            ? "end"
            : "size"
      const next = fit({ ...span, ...patch }, keep)
      const result = replaced(value(), next)
      return (
        allowed(result, next) &&
        commit(result, { reason: "imperative", id, action: "move" })
      )
    },
    /** Deletes a span. Returns whether it went through. */
    remove(id: string) {
      if (!value().some((other) => other.id === id)) {
        return false
      }
      return commit(
        value().filter((other) => other.id !== id),
        { reason: "imperative", id, action: "delete" }
      )
    },
    /** Ends a pointer drag and puts its span back. */
    cancel() {
      drags.cancel()
      setDraft(null)
    },
  }
  return spans
}

/**
 * What `createSpans` returns.
 * @experimental
 */
type Spans = ReturnType<typeof createSpans>

export {
  createSpans,
  type Span,
  type SpanAction,
  isSpanFree,
  type Spans,
  type SpansDraft,
  spansMessage,
  type SpansMessage,
  type SpansOptions,
  type SpansReason,
  stackSpans,
}
