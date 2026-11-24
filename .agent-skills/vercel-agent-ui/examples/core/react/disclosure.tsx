import * as React from "react"
import { createChange, definePrimitive, type ChangeDetails } from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"

type DisclosureOptions = {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (
    open: boolean,
    details: ChangeDetails<"trigger-press">
  ) => void
}

type DisclosureState = { open: boolean }

const disclosure = definePrimitive({
  name: "disclosure",
  options: {
    open: "boolean",
    defaultOpen: "boolean",
    onOpenChange: "callback",
  },
  state: (options: DisclosureOptions): DisclosureState => ({
    open: options.open ?? options.defaultOpen ?? false,
  }),
  sync: (options) => (options.open === undefined ? {} : { open: options.open }),
  api: (context) => {
    const change = createChange(context)
    return {
      toggle: (event?: Event) =>
        change("open", !context.store.get().open, {
          reason: "trigger-press",
          event,
        }),
    }
  },
  slots: (slot) => ({
    root: slot({}),
    trigger: slot({
      attrs: (state, { id }) => ({
        type: "button",
        "aria-expanded": String(state.open),
        "aria-controls": `${id}-panel`,
      }),
      press: ({ api }, event) => api.toggle(event),
    }),
    panel: slot({
      present: (state) => state.open,
      attrs: (_state, { id }) => ({ id: `${id}-panel` }),
    }),
  }),
})

const parts = createParts(disclosure, {
  root: "div",
  trigger: "button",
  panel: "div",
})

const Disclosure = parts.Root

const DisclosureTrigger = parts.Trigger

const DisclosurePanel = parts.Panel

function Example() {
  const [open, setOpen] = React.useState(false)
  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <label data-slot="label">
          <input
            type="checkbox"
            checked={open}
            onChange={(event) => setOpen(event.target.checked)}
          />
          Open from outside
        </label>
      </div>
      <Disclosure open={open} onOpenChange={setOpen}>
        <DisclosureTrigger>Shipping details</DisclosureTrigger>
        <DisclosurePanel>Ships in two days, free over $50.</DisclosurePanel>
      </Disclosure>
    </div>
  )
}

export {
  disclosure,
  Disclosure,
  DisclosurePanel,
  DisclosureTrigger,
  Example,
  type DisclosureOptions,
  type DisclosureState,
}
