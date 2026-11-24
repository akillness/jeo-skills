import * as React from "react"
import { createRovingFocus, definePrimitive, selects } from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"

type RingState = { focused: string | null }

const actions = ["Reply", "Forward", "Archive", "Snooze", "Delete", "Label"]

function place(action: string) {
  const angle =
    (actions.indexOf(action) / actions.length) * 2 * Math.PI - Math.PI / 2
  return { x: Math.cos(angle), y: Math.sin(angle) }
}

const ring = definePrimitive({
  name: "ring",
  state: () => ({ focused: null as string | null }),
  api: (context) => ({
    roving: createRovingFocus<RingState, { value: string }>(context, {
      slot: "action",
      key: "focused",
      orientation: () => "horizontal",
      loop: () => true,
    }),
  }),
  slots: (slot) => ({
    root: slot({ attrs: () => ({ role: "toolbar" }) }),
    action: slot<{ value: string }>({
      props: { value: "string" },
      selects: selects({ focused: ({ key }) => [key, null] }),
      attrs: (state, part) => ({
        type: "button",
        tabindex: part.api.roving.tabIndex(state, part),
      }),
      on: { keydown: (event, { el, api }) => api.roving.keydown(event, el!) },
      bind: (el, part) => part.api.roving.bind(el, part),
    }),
  }),
})

const parts = createParts(ring, { root: "div", action: "button" })

const Ring = parts.Root

const RingAction = parts.Action

function Example() {
  return (
    <Ring aria-label="Message">
      {actions.map((action) => {
        const { x, y } = place(action)
        return (
          <RingAction
            data-size="sm"
            key={action}
            value={action}
            style={
              {
                "--x": `${50 + x * 36}%`,
                "--y": `${50 + y * 36}%`,
              } as React.CSSProperties
            }
          >
            {action}
          </RingAction>
        )
      })}
    </Ring>
  )
}

export { Example, ring, Ring, RingAction, type RingState }
