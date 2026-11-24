import * as React from "react"
import { definePrimitive, openAttrs } from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"

type ReadMoreState = { open: boolean }

const readMore = definePrimitive({
  name: "read-more",
  state: (): ReadMoreState => ({ open: false }),
  api: (context) => ({
    toggle: () => context.store.set({ open: !context.store.get().open }),
  }),
  slots: (slot) => ({
    root: slot({ attrs: (state) => openAttrs(state.open) }),
    trigger: slot<{}, { open: boolean }>({
      state: (state) => ({ open: state.open }),
      attrs: (state, part) => ({
        type: "button",
        "aria-expanded": String(state.open),
        "aria-controls": `${part.id}-panel`,
        ...openAttrs(state.open),
      }),
      press: ({ api }) => api.toggle(),
    }),
    panel: slot({
      present: (state) => state.open,
      attrs: (_state, part) => ({ id: `${part.id}-panel` }),
    }),
  }),
})

const parts = createParts(readMore, {
  root: "div",
  trigger: "button",
  panel: "div",
})

const ReadMore = parts.Root

const ReadMoreTrigger = parts.Trigger

const ReadMorePanel = parts.Panel

function Example() {
  return (
    <ReadMore>
      <p>Core is the part of ui-sdk that makes an interface work.</p>
      <ReadMoreTrigger>
        {({ open }) => (open ? "Show less" : "Read more")}
      </ReadMoreTrigger>
      <div data-slot="read-more-body">
        <ReadMorePanel>
          It handles what happens on every key, press and drag, so your code
          stays focused on how the interface looks.
        </ReadMorePanel>
      </div>
    </ReadMore>
  )
}

export {
  Example,
  readMore,
  ReadMore,
  ReadMorePanel,
  type ReadMoreState,
  ReadMoreTrigger,
}
