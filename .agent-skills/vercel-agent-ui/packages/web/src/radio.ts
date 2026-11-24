import { radioGroup, type RadioGroupApi } from "@ui-sdk/core/radio"
import { createParts } from "./define-element"

const owner = "ui-radio-group"

// <ui-radio-group> takes part in forms like native radios that share a name,
// with no hidden inputs. Each item is a radio, and labels work like they do
// for native ones. Markup:
//
// <ui-radio-group name="plan" default-value="pro" aria-label="Plan">
//   <label><ui-radio value="free"></ui-radio> Free</label>
//   <label>
//     <ui-radio value="pro"><ui-radio-indicator></ui-radio-indicator></ui-radio>
//     Pro
//   </label>
// </ui-radio-group>
function defineRadioGroupElements() {
  createParts(radioGroup, {
    root: {
      tag: owner,
      defaults: { loop: true },
      self: "group",
      display: "block",
      formAssociated: true,
      state: {
        value: {
          get: (api: RadioGroupApi) => api.getValue(),
          set: (api: RadioGroupApi, value: string | null) =>
            api.setValue(value),
        },
      },
      api: ["getValue", "setValue", "focus"],
    },
    // Form-associated, so a <label> around or pointing at an item checks it.
    radio: {
      tag: "ui-radio",
      // Each radio fills the root slot, since the element that owns the group fills `group`.
      slot: "root",
      formAssociated: true,
    },
    indicator: "ui-radio-indicator",
  })
}

export { defineRadioGroupElements }
