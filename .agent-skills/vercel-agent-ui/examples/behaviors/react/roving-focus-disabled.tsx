import * as React from "react"
import { createRovingFocus, definePrimitive, selects } from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"

type ToolbarState = { focused: string | null }

type ToolProps = { value: string; disabled?: boolean }

const toolbar = definePrimitive({
  name: "vertical-toolbar",
  state: (): ToolbarState => ({ focused: null }),
  api: (context) => ({
    roving: createRovingFocus<ToolbarState, ToolProps>(context, {
      slot: "item",
      key: "focused",
      orientation: () => "vertical",
      loop: () => true,
      disabled: (item) => !!item.props.disabled,
    }),
  }),
  slots: (slot) => ({
    root: slot({
      attrs: () => ({ role: "toolbar", "aria-orientation": "vertical" }),
    }),
    item: slot<ToolProps>({
      props: { value: "string", disabled: "boolean" },
      selects: selects({ focused: ({ key }) => [key, null] }),
      attrs: (state, part) => ({
        type: "button",
        tabindex: part.api.roving.tabIndex(state, part),
        "aria-disabled": part.props.disabled ? "true" : undefined,
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
    <Toolbar aria-label="Edit">
      {["Undo", "Redo", "Cut", "Copy", "Paste"].map((label) => (
        <ToolbarItem
          key={label}
          value={label}
          disabled={label === "Undo" || label === "Redo"}
        >
          {label}
        </ToolbarItem>
      ))}
    </Toolbar>
  )
}

export {
  Example,
  toolbar,
  Toolbar,
  ToolbarItem,
  type ToolbarState,
  type ToolProps,
}
