import * as React from "react"
import { definePrimitive } from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"

const autosize = definePrimitive({
  name: "autosize",
  state: () => ({}),
  api: () => ({}),
  slots: (slot) => ({
    root: slot({
      attrs: () => ({ rows: "1" }),
      bind: (el) => {
        const fit = () => {
          el.style.height = "auto"
          el.style.height = `${el.scrollHeight}px`
        }
        fit()
        el.addEventListener("input", fit)
        return () => el.removeEventListener("input", fit)
      },
    }),
  }),
})

const parts = createParts(autosize, { root: "textarea" })

const Autosize = parts.Root

function Example() {
  return (
    <Autosize
      aria-label="Message"
      placeholder="Write a message. Press Enter for a new line."
    />
  )
}

export { autosize, Autosize, Example }
