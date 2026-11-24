import * as React from "react"
import { createRovingFocus, definePrimitive, selects } from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"

type KeypadState = { focused: string | null }

const columns = 3

const keypad = definePrimitive({
  name: "keypad",
  state: (): KeypadState => ({ focused: null }),
  api: (context) => ({
    roving: createRovingFocus<KeypadState, { value: string }>(context, {
      slot: "digit",
      key: "focused",
      move: (event, { from, items, rtl }) => {
        if (event.ctrlKey || event.metaKey) {
          return
        }
        const index = items.findIndex((item) => item.key === from.key)
        const by = {
          ArrowDown: columns,
          ArrowUp: -columns,
          ArrowRight: rtl ? -1 : 1,
          ArrowLeft: rtl ? 1 : -1,
        }[event.key]
        return by === undefined ? undefined : items[index + by]?.key
      },
    }),
  }),
  slots: (slot) => ({
    root: slot({ attrs: () => ({ role: "group" }) }),
    digit: slot<{ value: string }>({
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

const parts = createParts(keypad, { root: "div", digit: "button" })

const Keypad = parts.Root

const KeypadDigit = parts.Digit

function Example() {
  return (
    <Keypad aria-label="Keypad">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
        <KeypadDigit key={digit} value={digit}>
          {digit}
        </KeypadDigit>
      ))}
    </Keypad>
  )
}

export { Example, keypad, Keypad, KeypadDigit, type KeypadState }
