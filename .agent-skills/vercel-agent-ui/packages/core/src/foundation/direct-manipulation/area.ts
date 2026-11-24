// A value in two dimensions picked on a surface: a color's saturation and
// brightness, a point on an equalizer, a crop's focal point, an XY pad. A
// press jumps the thumb under the pointer and a drag follows it; arrows step
// each axis, Shift steps ten times as far, Page Up and Page Down, Home and
// End jump. There is no WAI-ARIA pattern for two axes, so the thumb is a
// slider for the x axis whose text names both.
import type { PrimitiveContext } from "../kernel/primitive-types"
import { isRTL } from "../platform/env"
import { createDragSession } from "../drag-and-drop/pointer"
import { snapToStep } from "../number/steps"
import { isDestroying } from "../kernel/keep"

/**
 * A point in an area, in its own units.
 * @experimental
 */
type AreaValue = { x: number; y: number }

/**
 * Why the value changed: a press on the surface, a drag, a key, or a call
 * from code, with the names a slider reports.
 * @experimental
 */
type AreaReason = "track-press" | "drag" | "step-key" | "imperative"

/**
 * One axis's range and step.
 * @experimental
 */
type AreaAxis = { min?: number; max?: number; step?: number; label?: string }

/**
 * How `createArea` reads and changes its value.
 * @experimental
 */
type AreaOptions<State extends object> = {
  /**
   * Reads the point from state, like `(state) => state.value`, or one made
   * from other state, like a color's saturation and brightness.
   */
  value: (state: State) => AreaValue
  /**
   * Asks for a new value and returns whether it went through. Pass the
   * primitive's change: `set: (value, details) => change("value", value, details)`.
   */
  set: (
    value: AreaValue,
    details: { reason: AreaReason; event?: Event }
  ) => boolean
  /** The x axis, left to right. @defaultValue `{ min: 0, max: 1, step: 0.01 }` */
  x?: () => AreaAxis
  /** The y axis, bottom to top, like a chart: a higher value sits higher. @defaultValue `{ min: 0, max: 1, step: 0.01 }` */
  y?: () => AreaAxis
  /** The text screen readers hear for the value. Defaults to each axis's label and percentage. */
  valueText?: (value: AreaValue) => string
  /** Runs when a press or a drag ends, or a key changed the value, with the value it ended on, like Slider's `onValueCommit`. */
  onCommit?: (
    value: AreaValue,
    details: { reason: AreaReason; event?: Event }
  ) => void
  /** Whether it can't change. */
  disabled?: () => boolean
}

const axisOf = (axis: AreaAxis | undefined) => ({
  min: axis?.min ?? 0,
  max: axis?.max ?? 1,
  step: axis?.step ?? 0.01,
  label: axis?.label,
})

/**
 * Lets users pick a point on a surface. Call it once in `api`, keep it on
 * the api, and wire the surface and its thumb:
 *
 * ```ts
 * area: slot({ on: { pointerdown: (event, { el, api }) => api.area.pointerdown(event, el!) } }),
 * thumb: slot({
 *   attrs: (state, { api }) => ({ ...api.area.thumbAttrs(state), style: api.area.thumbStyle(state) }),
 *   on: { keydown: (event, { api }) => api.area.keydown(event) },
 * })
 * ```
 *
 * The thumb's style sets `inset-inline-start` and `top` in percentages and `--area-x` and
 * `--area-y` from 0 to 1, for a gradient or a crosshair.
 * @experimental
 */
function createArea<State extends object>(
  context: Pick<PrimitiveContext<any, State, any>, "store" | "onDestroy">,
  options: AreaOptions<State>
) {
  const { store } = context
  const x = () => axisOf(options.x?.())
  const y = () => axisOf(options.y?.())
  const value = () => options.value(store.get())
  const drags = createDragSession(context.onDestroy)

  const fraction = (n: number, axis: ReturnType<typeof axisOf>) =>
    axis.max === axis.min ? 0 : (n - axis.min) / (axis.max - axis.min)

  function set(
    next: AreaValue,
    details: { reason: AreaReason; event?: Event }
  ) {
    const snapped = { x: snapToStep(next.x, x()), y: snapToStep(next.y, y()) }
    const current = value()
    if (snapped.x === current.x && snapped.y === current.y) {
      return false
    }
    return options.set(snapped, details)
  }

  // The value under a point on the surface.
  function at(el: HTMLElement, clientX: number, clientY: number) {
    const rect = el.getBoundingClientRect()
    let fx = rect.width ? (clientX - rect.left) / rect.width : 0
    if (isRTL(el)) {
      fx = 1 - fx
    }
    const fy = rect.height ? 1 - (clientY - rect.top) / rect.height : 0
    const ax = x()
    const ay = y()
    return {
      x: ax.min + Math.min(1, Math.max(0, fx)) * (ax.max - ax.min),
      y: ay.min + Math.min(1, Math.max(0, fy)) * (ay.max - ay.min),
    }
  }

  const api = {
    /** Sets the value, snapped to each axis's step. Returns whether it changed. */
    set: (next: AreaValue) => set(next, { reason: "imperative" }),
    /** Jumps the thumb under the pointer and follows it until it lifts. Call from the surface's `pointerdown`. */
    pointerdown(event: PointerEvent, el: HTMLElement) {
      if (!drags.accepts(event) || options.disabled?.()) {
        return
      }
      event.preventDefault()
      set(at(el, event.clientX, event.clientY), {
        reason: "track-press",
        event,
      })
      // Focus goes to the thumb, so the keyboard picks up where the pointer left off.
      const thumb = el.querySelector<HTMLElement>("[data-area-thumb]")
      thumb?.focus({ preventScroll: true })
      // The commit names what changed the value last, as a slider's does.
      let reason: "track-press" | "drag" = "track-press"
      // Disabling it mid-drag ends the drag, like a slider's.
      const unsubscribe = store.subscribe(
        () => options.disabled?.() && drags.cancel()
      )
      drags.start(el, event, {
        onMove: (sample) => {
          if (
            set(at(el, sample.x, sample.y), {
              reason: "drag",
              event: sample.event,
            })
          ) {
            reason = "drag"
          }
        },
        // A teardown cut the drag short, so nobody ended it to commit.
        onEnd: (end) => {
          unsubscribe()
          if (!isDestroying()) {
            options.onCommit?.(value(), { reason, event: end })
          }
        },
      })
    },
    /**
     * Handles a key on the thumb and returns whether it did. Arrows step an
     * axis, Shift ten steps; Page Up and Page Down step y by a tenth of its
     * range; Home and End go to x's ends.
     */
    keydown(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        options.disabled?.() ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      ) {
        return false
      }
      const ax = x()
      const ay = y()
      const current = value()
      const times = event.shiftKey ? 10 : 1
      const rtl = event.target instanceof Element && isRTL(event.target)
      let next: AreaValue | undefined
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        const sign = (event.key === "ArrowRight" ? 1 : -1) * (rtl ? -1 : 1)
        next = { ...current, x: current.x + sign * ax.step * times }
      } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        next = {
          ...current,
          y: current.y + (event.key === "ArrowUp" ? 1 : -1) * ay.step * times,
        }
      } else if (event.key === "PageUp" || event.key === "PageDown") {
        next = {
          ...current,
          y:
            current.y +
            ((event.key === "PageUp" ? 1 : -1) * (ay.max - ay.min)) / 10,
        }
      } else if (event.key === "Home") {
        next = { ...current, x: ax.min }
      } else if (event.key === "End") {
        next = { ...current, x: ax.max }
      }
      if (!next) {
        return false
      }
      event.preventDefault()
      if (set(next, { reason: "step-key", event })) {
        options.onCommit?.(value(), { reason: "step-key", event })
      }
      return true
    },
    /** Where the value sits, from 0 to 1 on each axis, with y from the bottom. */
    fractions(state: State) {
      const current = options.value(state)
      return { x: fraction(current.x, x()), y: fraction(current.y, y()) }
    },
    /** The thumb's position, as a `style` attribute. */
    thumbStyle(state: State) {
      const { x: fx, y: fy } = api.fractions(state)
      const percent = (n: number) => Math.round(n * 1e4) / 100
      return `position:absolute;inset-inline-start:${percent(fx)}%;top:${percent(1 - fy)}%;--area-x:${fx};--area-y:${fy}`
    },
    /** The thumb's role and value for screen readers, and `data-area-thumb` for the surface to find it. */
    thumbAttrs(state: State) {
      const current = options.value(state)
      const ax = x()
      const ay = y()
      const percent = (n: number, axis: ReturnType<typeof axisOf>) =>
        `${Math.round(fraction(n, axis) * 100)}%`
      const text =
        options.valueText?.(current) ??
        `${ax.label ?? "X"} ${percent(current.x, ax)}, ${ay.label ?? "Y"} ${percent(current.y, ay)}`
      return {
        role: "slider",
        tabindex: options.disabled?.() ? "-1" : "0",
        "aria-roledescription": "2D slider",
        "aria-valuemin": String(ax.min),
        "aria-valuemax": String(ax.max),
        "aria-valuenow": String(current.x),
        "aria-valuetext": text,
        "aria-disabled": options.disabled?.() ? "true" : undefined,
        "data-area-thumb": "",
      }
    },
  }
  return api
}

/**
 * What `createArea` returns.
 * @experimental
 */
type Area = ReturnType<typeof createArea>

export {
  type Area,
  type AreaAxis,
  type AreaOptions,
  type AreaReason,
  type AreaValue,
  createArea,
}
