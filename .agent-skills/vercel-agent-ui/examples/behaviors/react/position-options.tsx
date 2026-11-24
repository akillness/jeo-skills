import * as React from "react"
import {
  css,
  definePrimitive,
  position,
  type Align,
  type Side,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"

type CalloutOptions = {
  side?: Side
  align?: Align
  sideOffset?: number
  alignOffset?: number
  collisionPadding?: number
  arrowPadding?: number
}

type CalloutState = { open: boolean }

const callout = definePrimitive({
  name: "callout",
  options: {
    side: "string",
    align: "string",
    sideOffset: "number",
    alignOffset: "number",
    collisionPadding: "number",
    arrowPadding: "number",
  },
  state: (_options: CalloutOptions): CalloutState => ({ open: true }),
  api: (context) => ({
    toggle: () => context.store.set({ open: !context.store.get().open }),
    target: () => context.element("target"),
    placement: () => ({
      ...context.options(),
      arrow: () => context.element("arrow"),
    }),
  }),
  slots: (slot) => ({
    root: slot({}),
    target: slot({
      attrs: (state) => ({
        type: "button",
        "aria-expanded": String(state.open),
      }),
      press: ({ api }) => api.toggle(),
    }),
    bubble: slot({
      present: (state) => state.open,
      attrs: () => ({ role: "tooltip" }),
      bind: (el, { api }) => position(api.target, el, api.placement),
    }),
    arrow: slot({
      attrs: () => ({
        "aria-hidden": "true",
        style: css({ position: "absolute" }),
      }),
    }),
  }),
})

const parts = createParts(callout, {
  root: "div",
  target: "button",
  bubble: "div",
  arrow: "span",
})

const Callout = parts.Root

const CalloutTarget = parts.Target

const CalloutBubble = parts.Bubble

const CalloutArrow = parts.Arrow

const sides: Side[] = ["top", "right", "bottom", "left", "start", "end"]
const aligns: Align[] = ["start", "center", "end"]

function Example() {
  const [side, setSide] = React.useState<Side>("top")
  const [align, setAlign] = React.useState<Align>("center")
  const [offsets, setOffsets] = React.useState({
    sideOffset: 8,
    alignOffset: 0,
    collisionPadding: 8,
  })
  return (
    <Callout {...{ side, align, ...offsets, arrowPadding: 8 }}>
      <div data-slot="position-stage">
        <CalloutTarget>Shortcuts</CalloutTarget>
      </div>
      <CalloutBubble>
        <CalloutArrow />
      </CalloutBubble>
      <div data-slot="grid">
        <label data-slot="label">
          Side
          <select
            value={side}
            onChange={(event) => setSide(event.target.value as Side)}
          >
            {sides.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label data-slot="label">
          Align
          <select
            value={align}
            onChange={(event) => setAlign(event.target.value as Align)}
          >
            {aligns.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        {(["sideOffset", "alignOffset", "collisionPadding"] as const).map(
          (key) => (
            <label key={key} data-slot="label">
              {key}
              <input
                type="range"
                min={key === "alignOffset" ? -40 : 0}
                max={40}
                value={offsets[key]}
                onChange={(event) =>
                  setOffsets({ ...offsets, [key]: Number(event.target.value) })
                }
              />
            </label>
          )
        )}
      </div>
    </Callout>
  )
}

export {
  Example,
  callout,
  Callout,
  CalloutArrow,
  CalloutBubble,
  type CalloutOptions,
  type CalloutState,
  CalloutTarget,
}
