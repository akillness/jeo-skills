import {
  checkbox,
  checkboxGroup,
  type CheckboxApi,
  type CheckboxGroupApi,
  type CheckedState,
} from "@ui-sdk/core/checkbox"
import { switchPrimitive, type SwitchApi } from "@ui-sdk/core/switch"
import { createParts, instanceOf } from "./define-element"

// `default-checked` is where a form reset returns to, and takes
// "indeterminate" on a checkbox. `checked` sets where it starts too, and
// changing it later commits without events, like a native checkbox's.
const toggleApi: ("getChecked" | "setChecked" | "toggle" | "focus")[] = [
  "getChecked",
  "setChecked",
  "toggle",
  "focus",
]

// <ui-checkbox> is the checkbox itself, and takes part in forms like a native
// one, with no hidden input. Markup:
//
// <label>
//   <ui-checkbox name="terms" required>
//     <ui-checkbox-indicator>✓</ui-checkbox-indicator>
//   </ui-checkbox>
//   Accept the terms
// </label>
function defineCheckboxElements() {
  createParts(checkbox, {
    root: {
      tag: "ui-checkbox",
      formAssociated: true,
      // Its group is the one around it, never an attribute or a property.
      kinds: { group: null },
      options: (el) => ({
        // Read when needed, since the group may upgrade after the checkbox.
        group: () =>
          instanceOf<CheckboxGroupApi>(
            el.parentElement?.closest("ui-checkbox-group")
          )?.api,
      }),
      state: {
        checked: {
          get: (api: CheckboxApi) => api.getChecked(),
          set: (api: CheckboxApi, checked: CheckedState) =>
            api.setChecked(checked),
        },
      },
      api: toggleApi,
    },
    indicator: "ui-checkbox-indicator",
  })
}

// <ui-checkbox-group> takes part in forms like native checkboxes that share a
// name: it submits every checked value under its `name`. Markup:
//
// <ui-checkbox-group name="toppings" default-value="cheese" aria-label="Toppings">
//   <label><ui-checkbox parent></ui-checkbox> All toppings</label>
//   <label><ui-checkbox value="cheese"></ui-checkbox> Cheese</label>
//   <label><ui-checkbox value="olives"></ui-checkbox> Olives</label>
// </ui-checkbox-group>
//
// `default-value` and `all-values` take comma-separated values. Define the
// checkbox elements too.
function defineCheckboxGroupElements() {
  createParts(checkboxGroup, {
    root: {
      tag: "ui-checkbox-group",
      self: "group",
      display: "block",
      formAssociated: true,
      state: {
        value: {
          get: (api: CheckboxGroupApi) => api.getValue(),
          set: (api: CheckboxGroupApi, value: string[]) =>
            api.setValue(value ?? []),
        },
      },
      api: ["getValue", "setValue", "focus"],
    },
  })
}

// <ui-switch name="wifi" default-checked><ui-switch-thumb></ui-switch-thumb></ui-switch>
function defineSwitchElements() {
  createParts(switchPrimitive, {
    root: {
      tag: "ui-switch",
      formAssociated: true,
      state: {
        checked: {
          get: (api: SwitchApi) => api.getChecked(),
          set: (api: SwitchApi, checked: boolean) => api.setChecked(!!checked),
        },
      },
      api: toggleApi,
    },
    thumb: { tag: "ui-switch-thumb", display: "block" },
  })
}

export {
  defineCheckboxElements,
  defineCheckboxGroupElements,
  defineSwitchElements,
}
