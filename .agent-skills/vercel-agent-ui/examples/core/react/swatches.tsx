import * as React from "react"
import { definePrimitive } from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"

type SwatchesState = { color: string }

const swatches = definePrimitive({
  name: "swatches",
  state: (): SwatchesState => ({ color: "slate" }),
  api: (context) => ({
    choose: (color: string) => context.store.set({ color }),
  }),
  slots: (slot) => ({
    root: slot({ attrs: () => ({ role: "group" }) }),
    swatch: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, part) => ({
        type: "button",
        "aria-label": part.props.value,
        "aria-pressed": String(state.color === part.key),
      }),
      press: ({ api, key }) => api.choose(key),
    }),
  }),
})

const parts = createParts(swatches, { root: "div", swatch: "button" })

const Swatches = parts.Root

const Swatch = parts.Swatch

const colors = {
  slate: "#64748b",
  rose: "#f43f5e",
  amber: "#f59e0b",
  teal: "#14b8a6",
}

function Example() {
  return (
    <Swatches aria-label="Color">
      {Object.entries(colors).map(([color, background]) => (
        <Swatch
          key={color}
          value={color}
          style={{ "--swatch-color": background } as React.CSSProperties}
        />
      ))}
    </Swatches>
  )
}

export { Example, Swatch, swatches, Swatches, type SwatchesState }
