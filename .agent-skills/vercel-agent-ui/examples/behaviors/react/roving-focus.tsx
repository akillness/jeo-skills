import * as React from "react"
import { createRovingFocus, definePrimitive, selects } from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"

type ToolbarState = { focused: string | null }

const toolbar = definePrimitive({
  name: "toolbar",
  state: (): ToolbarState => ({ focused: null }),
  api: (context) => ({
    roving: createRovingFocus<ToolbarState, { value: string }>(context, {
      slot: "item",
      key: "focused",
      orientation: () => "horizontal",
    }),
  }),
  slots: (slot) => ({
    root: slot({ attrs: () => ({ role: "toolbar" }) }),
    item: slot<{ value: string }>({
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

const parts = createParts(toolbar, { root: "div", item: "button" })

const Toolbar = parts.Root

const ToolbarItem = parts.Item

function Example() {
  return (
    <Toolbar aria-label="Formatting">
      {["Bold", "Italic", "Underline", "Strike"].map((label) => (
        <ToolbarItem key={label} value={label}>
          {label}
        </ToolbarItem>
      ))}
    </Toolbar>
  )
}

export { Example, toolbar, Toolbar, ToolbarItem, type ToolbarState }
