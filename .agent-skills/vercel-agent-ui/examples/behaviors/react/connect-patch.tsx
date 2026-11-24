import * as React from "react"
import {
  connectMessage,
  createChange,
  createConnect,
  css,
  definePrimitive,
  live,
  type ConnectDraft,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"

type Cable = { from: string; to: string }

type BayState = { cables: Cable[]; drawing: ConnectDraft | null }

const sources = ["mic", "guitar", "synth"]
const channels = ["ch1", "ch2", "ch3"]
const names: Record<string, string> = {
  mic: "Mic",
  guitar: "Guitar",
  synth: "Synth",
  ch1: "Channel 1",
  ch2: "Channel 2",
  ch3: "Channel 3",
}

function jack(port: string) {
  const source = sources.includes(port)
  const row = (source ? sources : channels).indexOf(port)
  return { x: source ? 104 : 184, y: 20 + row * 48 }
}

function curve(from: { x: number; y: number }, to: { x: number; y: number }) {
  const reach = Math.max(30, Math.hypot(to.x - from.x, to.y - from.y) / 2)
  return `M${from.x},${from.y} C${from.x + reach},${from.y} ${to.x - reach},${to.y} ${to.x},${to.y}`
}

const bay = definePrimitive({
  name: "bay",
  state: (): BayState => ({ cables: [], drawing: null }),
  live: ["drawing"],
  api: (context) => {
    const { store } = context
    const change = createChange(context)
    const connect = createConnect<BayState>(context, {
      slot: "jack",
      draft: "drawing",
      canConnect: (from, to) => sources.includes(from) && channels.includes(to),
      point: (clientX, clientY) => {
        const box = context.element("root")!.getBoundingClientRect()
        return { x: clientX - box.left, y: clientY - box.top }
      },
      radius: () => 48,
      label: (port) => names[port],
      message: (message, label) =>
        message.type === "connect"
          ? `${label(message.from)} into ${label(message.to)}.`
          : connectMessage(message, label),
      connect: (from, to, details) => {
        const { cables } = store.get()
        const patched = cables.some(
          (cable) => cable.from === from && cable.to === to
        )
        const next = patched
          ? cables.filter((cable) => cable.from !== from || cable.to !== to)
          : [...cables, { from, to }]
        return change("cables", next, details)
      },
    })
    return {
      connect,
      sourceKeydown(event: KeyboardEvent, source: string) {
        if (connect.keydown(event)) {
          return
        }
        if (event.key !== "Enter") {
          return
        }
        event.preventDefault()
        connect.start(source)
      },
      act(action: string) {
        if (action === "cancel") {
          return connect.active() && connect.cancel()
        }
        const [from, to] = action.split("-")
        if (connect.start(from)) {
          connect.target(to)
          connect.commit({ reason: "connect-key" })
        }
      },
    }
  },
  slots: (slot) => ({
    root: slot<{}, { cables: Cable[] }>({
      state: (state) => ({ cables: state.cables }),
      attrs: () => ({ style: css({ position: "relative" }) }),
    }),
    source: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, { key }) => ({
        type: "button",
        "aria-description": state.cables.some((cable) => cable.from === key)
          ? `Into ${state.cables
              .filter((cable) => cable.from === key)
              .map((cable) => names[cable.to])
              .join(", ")}.`
          : undefined,
      }),
      on: { keydown: (event, { api, key }) => api.sourceKeydown(event, key) },
    }),
    jack: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (_state, { key }) => {
        const { x, y } = jack(key)
        return {
          "aria-hidden": "true",
          style: css({
            position: "absolute",
            left: `${x}px`,
            top: `${y}px`,
            "touch-action": "none",
          }),
        }
      },
      live: live<BayState, any, { value: string }>((state, { api, key }) => ({
        "data-connect": api.connect.role(state, key),
      })),
      on: {
        pointerdown: (event, { el, api, key }) =>
          api.connect.pointerdown(event, key, el!),
      },
    }),
    cable: slot<{ value: string; from: string; to: string }>({
      props: { value: "string", from: "string", to: "string" },
      attrs: (_state, { props }) => ({
        d: curve(jack(props.from), jack(props.to)),
      }),
    }),
    draft: slot({
      live: live<BayState, any, {}>((state) => {
        const draft = state.drawing
        if (!draft) {
          return { d: "" }
        }
        return { d: curve(jack(draft.from), draft.to ? jack(draft.to) : draft) }
      }),
    }),
    action: slot<{ value: string }>({
      props: { value: "string" },
      attrs: () => ({ type: "button" }),
      press: ({ api, key }) => api.act(key),
    }),
  }),
})

const parts = createParts(bay, {
  root: "div",
  source: "button",
  jack: "span",
  cable: "path",
  draft: "path",
  action: "button",
})

const Bay = parts.Root

const BaySource = parts.Source

const BayJack = parts.Jack

const BayCable = parts.Cable

const BayDraft = parts.Draft

const BayAction = parts.Action

function Example() {
  return (
    <Bay>
      {({ cables }) => (
        <>
          <div data-slot="connect-canvas">
            <svg data-slot="connect-edges">
              {cables.map((cable) => (
                <BayCable
                  key={`${cable.from}-${cable.to}`}
                  value={`${cable.from}-${cable.to}`}
                  from={cable.from}
                  to={cable.to}
                />
              ))}
              <BayDraft />
            </svg>
            {sources.map((source, index) => (
              <BaySource
                key={source}
                value={source}
                style={{ "--row": index } as React.CSSProperties}
              >
                {names[source]}
              </BaySource>
            ))}
            {channels.map((channel, index) => (
              <span
                key={channel}
                data-slot="connect-channel"
                style={{ "--row": index } as React.CSSProperties}
              >
                {names[channel]}
              </span>
            ))}
            {[...sources, ...channels].map((port) => (
              <BayJack key={port} value={port} />
            ))}
          </div>
          <div data-slot="row">
            <BayAction data-size="sm" value="synth-ch3">
              Synth into 3
            </BayAction>
            <BayAction data-size="sm" value="cancel">
              Cancel
            </BayAction>
          </div>
        </>
      )}
    </Bay>
  )
}

export {
  Bay,
  bay,
  BayAction,
  BayCable,
  BayDraft,
  BayJack,
  BaySource,
  type BayState,
  type Cable,
  Example,
}
