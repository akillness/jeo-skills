import * as React from "react"
import {
  FlameIcon,
  FrownIcon,
  HeartIcon,
  LaughIcon,
  PartyPopperIcon,
  ThumbsUpIcon,
} from "lucide-react"
import { bindDrag, css, definePrimitive } from "@ui-sdk/core"
import { sectorOf } from "@ui-sdk/core/gesture"
import { createParts } from "@ui-sdk/react/primitive"

const icons = {
  Like: ThumbsUpIcon,
  Celebrate: PartyPopperIcon,
  Laugh: LaughIcon,
  Fire: FlameIcon,
  Sad: FrownIcon,
  Love: HeartIcon,
}

const reactions = Object.keys(icons) as (keyof typeof icons)[]

const start = 1 / 12

function sectorPoint(index: number, count: number, radius: number, start = 0) {
  const angle = (index / Math.max(count, 1) + start) * 2 * Math.PI
  return {
    x: Math.round(Math.sin(angle) * radius),
    y: Math.round(-Math.cos(angle) * radius),
  }
}

type ReactState = {
  pointing: number
  picked: string | null
}

const react = definePrimitive({
  name: "react",
  state: (): ReactState => ({ pointing: -1, picked: null }),
  api: (context) => {
    const { store } = context
    let stop: (() => void) | undefined
    context.onDestroy(() => stop?.())
    return {
      pick: (index: number) =>
        store.set({ picked: reactions[index], pointing: -1 }),
      pointerdown(event: PointerEvent, el: HTMLElement) {
        if (event.button !== 0) {
          return
        }
        event.preventDefault()
        stop = bindDrag(el, event, {
          cancelOnEscape: true,
          onMove: ({ x, y }) =>
            store.set({
              pointing: sectorOf(
                x - event.clientX,
                y - event.clientY,
                reactions.length,
                {
                  deadZone: 24,
                  start,
                }
              ),
            }),
          onEnd: (_end, canceled) => {
            stop = undefined
            const { pointing } = store.get()
            if (!canceled && pointing !== -1) {
              store.set({ picked: reactions[pointing] })
            }
            store.set({ pointing: -1 })
          },
        })
      },
    }
  },
  slots: (slot) => ({
    root: slot<{}, { picked: string | null }>({
      state: (state) => ({ picked: state.picked }),
      attrs: () => ({ style: css({ position: "relative" }) }),
    }),
    handle: slot({
      attrs: () => ({
        "aria-hidden": "true",
        style: css({ "touch-action": "none" }),
      }),
      on: { pointerdown: (event, { el, api }) => api.pointerdown(event, el!) },
    }),
    reaction: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, { props }) => {
        const index = reactions.indexOf(props.value as keyof typeof icons)
        const { x, y } = sectorPoint(index, reactions.length, 72, start)
        return {
          type: "button",
          "aria-label": props.value,
          "aria-pressed": String(state.picked === props.value),
          "data-pointing": state.pointing === index ? "" : undefined,
          style: css({
            position: "absolute",
            left: "50%",
            top: "50%",
            translate: `${x}px ${y}px`,
          }),
        }
      },
      press: ({ api, props }) =>
        api.pick(reactions.indexOf(props.value as keyof typeof icons)),
    }),
  }),
})

const parts = createParts(react, {
  root: "div",
  handle: "div",
  reaction: "button",
})

const ReactionRing = parts.Root

const ReactionHandle = parts.Handle

const Reaction = parts.Reaction

function Example() {
  return (
    <ReactionRing>
      {({ picked }) => {
        const Picked = picked ? icons[picked as keyof typeof icons] : null
        return (
          <>
            <ReactionHandle>
              {Picked ? <Picked aria-hidden="true" /> : null}
            </ReactionHandle>
            {reactions.map((reaction) => {
              const Icon = icons[reaction]
              return (
                <Reaction key={reaction} value={reaction}>
                  <Icon aria-hidden="true" />
                </Reaction>
              )
            })}
          </>
        )
      }}
    </ReactionRing>
  )
}

export {
  Example,
  react,
  Reaction,
  ReactionHandle,
  ReactionRing,
  type ReactState,
}
