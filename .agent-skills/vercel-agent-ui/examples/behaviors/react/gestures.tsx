import * as React from "react"
import {
  bindDrag,
  createChange,
  css,
  definePrimitive,
  dragThreshold,
  isRTL,
  live,
  type ChangeDetails,
} from "@ui-sdk/core"
import {
  createVelocityTracker,
  projectDistance,
  solveSpring,
} from "@ui-sdk/core/gesture"
import { createParts } from "@ui-sdk/react/primitive"

const speeds = ["Off", "Low", "Medium", "High"]
const last = speeds.length - 1

type FanState = {
  speed: number
  offset: number | null
}

type FanOptions = {
  defaultSpeed?: number
  onSpeedChange?: (
    speed: number,
    details: ChangeDetails<"drag" | "step-key">
  ) => void
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const fan = definePrimitive({
  name: "fan",
  options: { defaultSpeed: "number", onSpeedChange: "callback" },
  state: (options: FanOptions): FanState => ({
    speed: options.defaultSpeed ?? 0,
    offset: null,
  }),
  live: ["offset"],
  api: (context) => {
    const { store } = context
    const change = createChange(context)
    let stop: (() => void) | undefined
    let frame = 0
    const settle = () => {
      cancelAnimationFrame(frame)
      store.set({ offset: null })
    }
    context.onDestroy(() => {
      stop?.()
      cancelAnimationFrame(frame)
    })
    return {
      pointerdown(event: PointerEvent, thumb: HTMLElement) {
        const track = thumb.parentElement
        if (event.button !== 0 || !track) {
          return
        }
        settle()
        const span =
          (track.clientWidth - thumb.offsetWidth) * (isRTL(track) ? -1 : 1)
        const from = store.get().speed / last
        const velocity = createVelocityTracker()
        stop = bindDrag(thumb, event, {
          threshold: dragThreshold,
          cancelOnEscape: true,
          onMove: ({ x, event: move }) => {
            velocity.add(move.timeStamp, x)
            store.set({
              offset: clamp(from + (x - event.clientX) / span, 0, 1),
            })
          },
          onEnd: (end, canceled) => {
            stop = undefined
            const at = store.get().offset
            if (canceled || at === null) {
              return settle()
            }
            const v = velocity.velocity(end.timeStamp) / span
            const target = Math.round(
              clamp(at + projectDistance(v, 0.994), 0, 1) * last
            )
            change("speed", target, { reason: "drag", event: end })
            const spring = solveSpring(0.4, 0.8, at - target / last, v)
            const start = performance.now()
            const tick = () => {
              const t = performance.now() - start
              const done = t > 1000 || Math.abs(spring.position(t) * span) < 0.5
              if (done) {
                return settle()
              }
              store.set({ offset: target / last + spring.position(t) })
              frame = requestAnimationFrame(tick)
            }
            frame = requestAnimationFrame(tick)
          },
        })
      },
      keydown(event: KeyboardEvent, el: HTMLElement) {
        const step = { ArrowLeft: -1, ArrowRight: 1, Home: -last, End: last }[
          event.key
        ]
        if (!step) {
          return
        }
        event.preventDefault()
        settle()
        const flip = event.key.startsWith("Arrow") && isRTL(el) ? -1 : 1
        change("speed", clamp(store.get().speed + step * flip, 0, last), {
          reason: "step-key",
          event,
        })
      },
    }
  },
  slots: (slot) => ({
    root: slot<{}, { speed: number }>({
      state: (state) => ({ speed: state.speed }),
      attrs: () => ({ style: css({ position: "relative" }) }),
    }),
    thumb: slot({
      attrs: (state) => ({
        role: "slider",
        tabindex: "0",
        "aria-valuemin": "0",
        "aria-valuemax": String(last),
        "aria-valuenow": String(state.speed),
        "aria-valuetext": speeds[state.speed],
      }),
      live: live<FanState, any, {}>((state) => ({
        "data-dragging": state.offset === null ? undefined : "",
        style: css({
          position: "absolute",
          "inset-inline-start": `calc(${state.offset ?? state.speed / last} * (100% - var(--thumb-size)))`,
          "touch-action": "none",
        }),
      })),
      on: {
        pointerdown: (event, { el, api }) => api.pointerdown(event, el!),
        keydown: (event, { el, api }) => api.keydown(event, el!),
      },
    }),
  }),
})

const parts = createParts(fan, { root: "div", thumb: "div" })

const Fan = parts.Root

const FanThumb = parts.Thumb

function Example() {
  return (
    <div data-slot="stack">
      <Fan>
        {({ speed }) => (
          <FanThumb aria-label="Fan speed">{speeds[speed]}</FanThumb>
        )}
      </Fan>
      <div data-slot="gesture-scale">
        {speeds.map((speed) => (
          <span key={speed}>{speed}</span>
        ))}
      </div>
    </div>
  )
}

export { Example, fan, Fan, FanThumb, type FanOptions, type FanState }
