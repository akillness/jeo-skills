import { otpInput, type OTPInputApi } from "@ui-sdk/core/otp-input"
import { showDefaultText } from "./default-text"
import { createParts } from "./define-element"
import { forwardAttributes } from "./forward-attributes"
import { partState } from "@ui-sdk/core/renderer"

const owner = "ui-otp-input"

// A slot's index is its place among its input's slots, unless it sets `index`.
function slotIndex(el: HTMLElement) {
  const explicit = el.getAttribute("index")
  if (explicit !== null) {
    return { index: Number(explicit), id: explicit }
  }
  const root = el.closest(owner)
  const slots = root
    ? Array.from(root.querySelectorAll("ui-otp-input-slot"))
    : [el]
  const index = Math.max(0, slots.indexOf(el))
  return { index, id: String(index) }
}

// Names go to the input, which is what takes focus.
const inputAttributes = [
  "aria-label",
  "aria-labelledby",
  "aria-describedby",
  "aria-invalid",
  "autofocus",
]

// Roots that have their input, which keeps taking their attributes across reconnects.
const withInput = new WeakSet<HTMLElement>()

// <ui-otp-input> holds the slots and adds the one real input over them, which
// takes focus and submits the code under `name`. Markup:
//
// <ui-otp-input max-length="6" name="code" aria-label="Verification code">
//   <ui-otp-input-group>
//     <ui-otp-input-slot></ui-otp-input-slot>
//     <ui-otp-input-slot></ui-otp-input-slot>
//     <ui-otp-input-slot></ui-otp-input-slot>
//   </ui-otp-input-group>
//   <ui-otp-input-separator></ui-otp-input-separator>
//   <ui-otp-input-group>…</ui-otp-input-group>
// </ui-otp-input>
//
// Empty slots show their character. Write the input yourself, inside a
// <ui-otp-input-control>, to give it an id for a <label for>.
function defineOTPInputElements() {
  createParts(otpInput, {
    root: {
      tag: owner,
      display: "block",
      state: {
        value: {
          get: (api: OTPInputApi) => api.getValue(),
          set: (api: OTPInputApi, value: string | null) =>
            api.setValue(value ?? ""),
        },
      },
      api: ["getValue", "setValue", "clear", "focus"],
      render(el, instance) {
        if (!withInput.has(el)) {
          withInput.add(el)
          const written = el.querySelector<HTMLInputElement>(
            ":scope > ui-otp-input-control input"
          )
          const input = written ?? document.createElement("input")
          forwardAttributes(el, input, inputAttributes)
          if (!written) {
            const wrapper = document.createElement("ui-otp-input-control")
            wrapper.append(input)
            el.append(wrapper)
          }
        }
        return showDefaultText(el, instance, "ui-otp-input-slot", (slot) => {
          const { char } = partState(
            instance.part("slot", slotIndex(slot))
          ) as { char: string | null }
          return char ?? ""
        })
      },
    },
    control: {
      tag: "ui-otp-input-control",
      display: "contents",
      target: (el) => el.querySelector("input"),
    },
    group: { tag: "ui-otp-input-group", display: "block" },
    slot: { tag: "ui-otp-input-slot", display: "block", context: slotIndex },
    separator: { tag: "ui-otp-input-separator", display: "block" },
  })
}

export { defineOTPInputElements }
