import * as React from "react"
import {
  createColorScheme,
  createLocalStorage,
  createRovingFocus,
  definePrimitive,
  type ColorSchemeState,
  type ColorSchemeValue,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react"

type SchemePickerState = {
  colorScheme: ColorSchemeState
  focused: string | null
}

const colorScheme = createColorScheme({
  storage: createLocalStorage("ui-sdk-color-scheme"),
})

const schemePicker = definePrimitive({
  name: "scheme-picker",
  state: (): SchemePickerState => ({
    colorScheme: colorScheme.initialState,
    focused: null,
  }),
  api: (context) => {
    const roving = createRovingFocus<SchemePickerState, { value: string }>(
      context,
      {
        slot: "option",
        key: "focused",
        orientation: () => "horizontal",
        preferred: (option) =>
          option.key === context.store.get().colorScheme.value,
        claims: (state, option) => option.key === state.colorScheme.value,
      }
    )
    return {
      roving,
      keydown(event: KeyboardEvent, el: HTMLElement) {
        const moved = roving.keydown(event, el)
        if (moved) {
          colorScheme.set(moved.key as ColorSchemeValue, {
            reason: "list-navigation",
            event,
          })
        }
      },
    }
  },
  slots: (slot) => ({
    root: slot<{}, { colorScheme: ColorSchemeState }>({
      state: (state) => ({ colorScheme: state.colorScheme }),
      attrs: (state) => ({ "data-color-scheme": state.colorScheme.value }),
      bind: (_el, part) => colorScheme.follow(part.store, "colorScheme"),
    }),
    list: slot({
      attrs: () => ({ role: "radiogroup" }),
    }),
    option: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, part) => ({
        type: "button",
        role: "radio",
        "aria-checked": String(state.colorScheme.value === part.key),
        "data-checked": state.colorScheme.value === part.key ? "" : undefined,
        tabindex: part.api.roving.tabIndex(state, part),
      }),
      press: ({ key }, event) =>
        colorScheme.set(key as ColorSchemeValue, {
          reason: "item-press",
          event,
        }),
      on: {
        keydown: (event, { el, api }) => {
          if (el) {
            api.keydown(event, el)
          }
        },
      },
      bind: (el, part) => part.api.roving.bind(el, part),
    }),
  }),
})

const parts = createParts(schemePicker, {
  root: "div",
  list: "div",
  option: "button",
})

const SchemePicker = parts.Root

const SchemePickerList = parts.List

const SchemePickerOption = parts.Option

const choices: { value: ColorSchemeValue; label: string }[] = [
  { value: "system", label: "Default (System)" },
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
]

function Example() {
  return (
    <SchemePicker>
      {({ colorScheme: { value, resolved } }) => (
        <>
          <div data-slot="row">
            <span data-slot="media">
              {value === "system" ? (
                <MonitorIcon aria-hidden="true" />
              ) : resolved === "dark" ? (
                <MoonIcon aria-hidden="true" />
              ) : (
                <SunIcon aria-hidden="true" />
              )}
            </span>
            <div data-slot="stack">
              <span data-slot="label">
                {resolved === "dark"
                  ? "Dark"
                  : resolved === "light"
                    ? "Light"
                    : "System"}
              </span>
              <span data-slot="hint">
                {value === "system" ? "Following your system" : "Chosen here"}
              </span>
            </div>
          </div>
          <SchemePickerList aria-label="Color scheme">
            {choices.map((choice) => (
              <SchemePickerOption key={choice.value} value={choice.value}>
                {choice.label}
              </SchemePickerOption>
            ))}
          </SchemePickerList>
        </>
      )}
    </SchemePicker>
  )
}

export {
  Example,
  SchemePicker,
  schemePicker,
  SchemePickerList,
  SchemePickerOption,
  type SchemePickerState,
}
