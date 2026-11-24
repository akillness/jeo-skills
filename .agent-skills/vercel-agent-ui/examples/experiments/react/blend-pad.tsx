import * as React from "react"
import {
  bindDrag,
  createChange,
  css,
  definePrimitive,
  dragThreshold,
  isRTL,
  type ChangeDetails,
} from "@ui-sdk/core"
import {
  createVelocityTracker,
  projectDistance,
  solveSpring,
} from "@ui-sdk/core/gesture"
import { createParts } from "@ui-sdk/react/primitive"

type BlendPoint = { x: number; y: number }
type BlendAnchor = { value: string; label: string; x: number; y: number }
type BlendWeights = Record<string, number>

type BlendPadState = {
  value: BlendPoint
  anchors: BlendAnchor[]
  dragging: boolean
  gliding: boolean
}

type BlendPadValueChangeReason =
  "drag" | "track-press" | "step-key" | "item-press" | "imperative"

type BlendPadOptions = {
  anchors: BlendAnchor[]
  value?: BlendPoint
  defaultValue?: BlendPoint
  onValueChange?: (
    value: BlendPoint,
    details: ChangeDetails<BlendPadValueChangeReason> & {
      weights: BlendWeights
    }
  ) => void
}

type BlendPadRootState = { dragging: boolean; gliding: boolean }
type BlendPadPuckState = { weights: BlendWeights; x: number; y: number }
type BlendPadAnchorState = { share: number; whole: boolean }

const snap = 0.05

function blendWeights(
  point: BlendPoint,
  anchors: readonly BlendAnchor[]
): BlendWeights {
  const weights: BlendWeights = {}
  const on = anchors.find(
    (anchor) => Math.hypot(anchor.x - point.x, anchor.y - point.y) < 1e-6
  )
  let total = 0
  for (const anchor of anchors) {
    const weight = on
      ? anchor === on
        ? 1
        : 0
      : 1 / ((anchor.x - point.x) ** 2 + (anchor.y - point.y) ** 2)
    weights[anchor.value] = weight
    total += weight
  }
  for (const key in weights) {
    weights[key] = weights[key] / total
  }
  return weights
}

function blendNumber(weights: BlendWeights, values: Record<string, number>) {
  let result = 0
  for (const key in weights) {
    result += weights[key] * (values[key] ?? 0)
  }
  return result
}

function describeBlend(weights: BlendWeights, anchors: readonly BlendAnchor[]) {
  return anchors
    .map((anchor) => ({
      label: anchor.label,
      share: Math.round(weights[anchor.value] * 100),
    }))
    .filter((part) => part.share > 0)
    .sort((a, b) => b.share - a.share)
    .map((part) => `${part.share}% ${part.label}`)
    .join(", ")
}

const clamp = (n: number) => Math.min(1, Math.max(0, n))

const blendPad = /* @__PURE__ */ definePrimitive({
  name: "blend-pad",
  options: {
    anchors: "value",
    value: "value",
    defaultValue: "value",
    onValueChange: "callback",
  },
  state: (options: BlendPadOptions): BlendPadState => ({
    value: options.value ?? options.defaultValue ?? { x: 0.5, y: 0.5 },
    anchors: options.anchors,
    dragging: false,
    gliding: false,
  }),
  sync: (options) => ({
    anchors: options.anchors,
    ...(options.value === undefined ? {} : { value: options.value }),
  }),
  api: (context) => {
    const { store, onDestroy } = context
    const change = createChange(context)
    let stopDrag: (() => void) | undefined
    let frame = 0
    const stopGlide = () => {
      cancelAnimationFrame(frame)
      if (store.get().gliding) {
        store.set({ gliding: false })
      }
    }
    onDestroy(() => {
      stopDrag?.()
      cancelAnimationFrame(frame)
    })
    const nearest = (point: BlendPoint) =>
      store
        .get()
        .anchors.find(
          (anchor) => Math.hypot(anchor.x - point.x, anchor.y - point.y) < snap
        )

    const api = {
      puck: () => context.element("puck") ?? null,
      setValue(
        point: BlendPoint,
        details: { reason: BlendPadValueChangeReason; event?: Event } = {
          reason: "imperative",
        }
      ) {
        let next = { x: clamp(point.x), y: clamp(point.y) }
        const near = nearest(next)
        if (near && details.reason !== "drag") {
          next = { x: near.x, y: near.y }
        }
        const current = store.get().value
        if (next.x === current.x && next.y === current.y) {
          return false
        }
        return change("value", next, {
          ...details,
          weights: blendWeights(next, store.get().anchors),
        })
      },
      select(
        value: string,
        details: { reason: BlendPadValueChangeReason; event?: Event } = {
          reason: "imperative",
        }
      ) {
        const anchor = store.get().anchors.find((a) => a.value === value)
        stopGlide()
        return anchor
          ? api.setValue({ x: anchor.x, y: anchor.y }, details)
          : false
      },
      glide(
        from: BlendPoint,
        velocity: BlendPoint,
        size: { width: number; height: number }
      ) {
        const travel = {
          x: projectDistance(velocity.x, 0.994) / size.width,
          y: projectDistance(velocity.y, 0.994) / size.height,
        }
        let target = {
          x: clamp(from.x + travel.x),
          y: clamp(from.y + travel.y),
        }
        const near = store
          .get()
          .anchors.reduce<BlendAnchor | undefined>((best, anchor) => {
            const d = Math.hypot(anchor.x - target.x, anchor.y - target.y)
            return d < 0.15 &&
              (!best || d < Math.hypot(best.x - target.x, best.y - target.y))
              ? anchor
              : best
          }, undefined)
        if (near) {
          target = { x: near.x, y: near.y }
        }
        const sx = solveSpring(
          0.45,
          0.85,
          (from.x - target.x) * size.width,
          velocity.x
        )
        const sy = solveSpring(
          0.45,
          0.85,
          (from.y - target.y) * size.height,
          velocity.y
        )
        const start = performance.now()
        store.set({ gliding: true })
        const tick = () => {
          const t = performance.now() - start
          const x = target.x + sx.position(t) / size.width
          const y = target.y + sy.position(t) / size.height
          const done =
            t > 1200 ||
            (Math.abs(sx.position(t)) < 0.5 && Math.abs(sy.position(t)) < 0.5)
          api.setValue(done ? target : { x, y }, { reason: "drag" })
          if (done) {
            store.set({ gliding: false })
          } else {
            frame = requestAnimationFrame(tick)
          }
        }
        frame = requestAnimationFrame(tick)
      },
      padPointerdown(event: PointerEvent, pad: HTMLElement) {
        if (event.button !== 0) {
          return
        }
        stopGlide()
        const puck = api.puck()
        const box = pad.getBoundingClientRect()
        const at = (x: number, y: number) => ({
          x: (x - box.left) / box.width,
          y: (y - box.top) / box.height,
        })
        const onPuck = !!puck && puck.contains(event.target as Node)
        if (!onPuck) {
          api.setValue(at(event.clientX, event.clientY), {
            reason: "track-press",
            event,
          })
        }
        puck?.focus({ preventScroll: true })
        const vx = createVelocityTracker()
        const vy = createVelocityTracker()
        stopDrag = bindDrag(pad, event, {
          threshold: onPuck ? dragThreshold : 0,
          onStart: () => store.set({ dragging: true }),
          onMove: ({ x, y, event: move }) => {
            vx.add(move.timeStamp, x)
            vy.add(move.timeStamp, y)
            api.setValue(at(x, y), { reason: "drag", event: move })
          },
          onEnd: (end, canceled) => {
            store.set({ dragging: false })
            if (canceled) {
              return
            }
            const velocity = {
              x: vx.velocity(end.timeStamp),
              y: vy.velocity(end.timeStamp),
            }
            if (Math.hypot(velocity.x, velocity.y) > 0.3) {
              api.glide(store.get().value, velocity, box)
            } else {
              const near = nearest(store.get().value)
              if (near) {
                api.setValue(
                  { x: near.x, y: near.y },
                  { reason: "drag", event: end }
                )
              }
            }
          },
        })
      },
      puckKeydown(event: KeyboardEvent, el: HTMLElement) {
        const { value, anchors } = store.get()
        const step = event.shiftKey ? 0.1 : 0.02
        const flip = isRTL(el) ? -1 : 1
        const by: Record<string, [number, number]> = {
          ArrowLeft: [-step * flip, 0],
          ArrowRight: [step * flip, 0],
          ArrowUp: [0, -step],
          ArrowDown: [0, step],
        }
        const index = Number(event.key) - 1
        if (by[event.key]) {
          event.preventDefault()
          stopGlide()
          api.setValue(
            { x: value.x + by[event.key][0], y: value.y + by[event.key][1] },
            { reason: "step-key", event }
          )
        } else if (event.key === "Home") {
          event.preventDefault()
          stopGlide()
          const x = anchors.reduce((sum, a) => sum + a.x, 0) / anchors.length
          const y = anchors.reduce((sum, a) => sum + a.y, 0) / anchors.length
          api.setValue({ x, y }, { reason: "step-key", event })
        } else if (Number.isInteger(index) && anchors[index]) {
          event.preventDefault()
          api.select(anchors[index].value, { reason: "item-press", event })
        }
      },
    }
    return api
  },
  slots: (slot) => ({
    root: slot<{}, BlendPadRootState>({
      state: (state) => ({ dragging: state.dragging, gliding: state.gliding }),
      attrs: (state) => ({
        "data-dragging": state.dragging ? "" : undefined,
        "data-gliding": state.gliding ? "" : undefined,
        style: css({
          position: "relative",
          "touch-action": "none",
          "user-select": "none",
        }),
      }),
      on: {
        pointerdown: (event, { el, api }) =>
          el && api.padPointerdown(event, el),
      },
    }),
    puck: slot<{}, BlendPadPuckState>({
      state: (state) => ({
        weights: blendWeights(state.value, state.anchors),
        x: state.value.x,
        y: state.value.y,
      }),
      attrs: (state) => ({
        role: "slider",
        tabindex: "0",
        "aria-roledescription": "blend pad",
        "aria-valuetext": describeBlend(
          blendWeights(state.value, state.anchors),
          state.anchors
        ),
        "aria-keyshortcuts": state.anchors
          .map((_, index) => index + 1)
          .join(" "),
        style: css({
          position: "absolute",
          left: `${state.value.x * 100}%`,
          top: `${state.value.y * 100}%`,
          translate: "-50% -50%",
          "--blend-x": state.value.x,
          "--blend-y": state.value.y,
        }),
      }),
      on: { keydown: (event, { el, api }) => el && api.puckKeydown(event, el) },
    }),
    anchor: slot<{ value: string }, BlendPadAnchorState>({
      props: { value: "string" },
      state: (state, { key }) => {
        const share = blendWeights(state.value, state.anchors)[key] ?? 0
        return { share, whole: share > 0.999 }
      },
      attrs: (state, { key }) => {
        const anchor = state.anchors.find((a) => a.value === key)
        const share = blendWeights(state.value, state.anchors)[key] ?? 0
        return {
          type: "button",
          tabindex: "-1",
          "aria-pressed": String(share > 0.999),
          style: anchor
            ? css({
                position: "absolute",
                left: `${anchor.x * 100}%`,
                top: `${anchor.y * 100}%`,
                translate: "-50% -50%",
                "--blend-share": share.toFixed(3),
              })
            : undefined,
        }
      },
      on: { pointerdown: (event) => event.stopPropagation() },
      press: ({ api, key }, event) =>
        api.select(key, { reason: "item-press", event }),
    }),
  }),
})

const parts = createParts(blendPad, {
  root: "div",
  puck: "div",
  anchor: "button",
})

const BlendPad = parts.Root

const BlendPadPuck = parts.Puck

const BlendPadAnchor = parts.Anchor

const anchors = [
  { value: "minimal", label: "Minimal", x: 0.12, y: 0.15 },
  { value: "bold", label: "Bold", x: 0.88, y: 0.2 },
  { value: "playful", label: "Playful", x: 0.5, y: 0.88 },
]
const radius = { minimal: 4, bold: 8, playful: 24 }
const weight = { minimal: 400, bold: 800, playful: 600 }
const hue = { minimal: 250, bold: 20, playful: 320 }
const chroma = { minimal: 0.02, bold: 0.2, playful: 0.17 }

function Example() {
  const [value, setValue] = React.useState<BlendPoint>({ x: 0.5, y: 0.45 })
  const weights = blendWeights(value, anchors)
  const style = {
    "--blend-radius": `${blendNumber(weights, radius)}px`,
    "--blend-weight": Math.round(blendNumber(weights, weight)),
    "--blend-color": `oklch(0.62 ${blendNumber(weights, chroma).toFixed(3)} ${blendNumber(weights, hue).toFixed(0)})`,
  } as React.CSSProperties
  return (
    <div data-slot="blend-pad-layout">
      <BlendPad anchors={anchors} value={value} onValueChange={setValue}>
        {anchors.map((anchor) => (
          <BlendPadAnchor key={anchor.value} value={anchor.value}>
            {anchor.label}
          </BlendPadAnchor>
        ))}
        <BlendPadPuck aria-label="Style mix" />
      </BlendPad>
      <div data-slot="stack">
        <button type="button" data-slot="blend-pad-preview" style={style}>
          Get started
        </button>
        <p data-slot="hint">{describeBlend(weights, anchors)}</p>
      </div>
    </div>
  )
}

export {
  type BlendAnchor,
  BlendPad,
  blendPad,
  BlendPadAnchor,
  type BlendPadAnchorState,
  type BlendPadOptions,
  BlendPadPuck,
  type BlendPadPuckState,
  type BlendPadRootState,
  type BlendPadValueChangeReason,
  type BlendPoint,
  blendNumber,
  blendWeights,
  type BlendWeights,
  describeBlend,
  Example,
}
