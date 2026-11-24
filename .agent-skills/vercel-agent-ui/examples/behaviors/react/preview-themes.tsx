import * as React from "react"
import {
  createChange,
  createPreview,
  createRovingFocus,
  definePrimitive,
  selects,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"

type ThemesState = {
  value: string
  preview: string | null
  focused: string | null
}

const names: Record<string, string> = {
  light: "Light",
  dark: "Dark",
  sepia: "Sepia",
  contrast: "Contrast",
}

const themes = definePrimitive({
  name: "themes",
  state: (): ThemesState => ({ value: "light", preview: null, focused: null }),
  api: (context) => {
    const { store } = context
    const change = createChange(context)
    return {
      roving: createRovingFocus<ThemesState, { value: string }>(context, {
        slot: "theme",
        key: "focused",
      }),
      preview: createPreview<ThemesState>(context, {
        key: "preview",
        slot: "theme",
        value: () => store.get().value,
        choose: (key, details) => change("value", key, details),
        disabled: (key) => key === "contrast",
        label: (key) => `the ${names[key]} theme`,
        message: (label) =>
          `Trying ${label}. Enter keeps it, Escape puts it back.`,
      }),
    }
  },
  slots: (slot) => ({
    root: slot<{}, { shown: string }>({
      state: (state) => ({ shown: state.preview ?? state.value }),
    }),
    list: slot({
      attrs: () => ({ role: "radiogroup" }),
      on: {
        focusout: (event, { el, api }) => {
          if (!el?.contains(event.relatedTarget as Node)) {
            api.preview.clear({ reason: "focus-out", event })
          }
        },
      },
    }),
    theme: slot<{ value: string }>({
      props: { value: "string" },
      selects: selects({ focused: ({ key }) => [key, null] }),
      attrs: (state, part) => ({
        type: "button",
        role: "radio",
        "aria-checked": String(state.value === part.key),
        "aria-disabled": part.key === "contrast" ? "true" : undefined,
        tabindex: part.api.roving.tabIndex(state, part),
        "data-previewing": state.preview === part.key ? "" : undefined,
      }),
      on: {
        pointerenter: (event, { api, key }) =>
          api.preview.show(key, { reason: "item-hover", event }),
        pointerleave: (event, { api }) =>
          api.preview.clear({ reason: "item-hover", event }),
        click: (event, { api, key }) => api.preview.choose(key, { event }),
        keydown: (event, { el, api, key }) => {
          if (api.preview.keydown(event, key)) {
            return
          }
          const moved = api.roving.keydown(event, el!)
          if (moved) {
            api.preview.show(moved.key, { reason: "list-navigation", event })
          }
        },
      },
      bind: (el, part) => part.api.roving.bind(el, part),
    }),
  }),
})

const parts = createParts(themes, { root: "div", list: "div", theme: "button" })

const Themes = parts.Root

const ThemesList = parts.List

const ThemesOption = parts.Theme

const looks: Record<string, { paper: string; text: string }> = {
  light: { paper: "#ffffff", text: "#171717" },
  dark: { paper: "#171717", text: "#f5f5f5" },
  sepia: { paper: "#f4ecd8", text: "#5b4636" },
  contrast: { paper: "#000000", text: "#fde047" },
}

function Example() {
  return (
    <Themes>
      {({ shown }) => (
        <>
          <p
            data-slot="preview-sample"
            style={
              {
                "--preview-paper": looks[shown].paper,
                "--preview-text": looks[shown].text,
              } as React.CSSProperties
            }
          >
            The quick brown fox jumps over the lazy dog.
          </p>
          <ThemesList aria-label="Theme">
            {Object.keys(names).map((theme) => (
              <ThemesOption key={theme} value={theme}>
                {names[theme]}
                {theme === "contrast" && <span data-slot="hint">Soon</span>}
              </ThemesOption>
            ))}
          </ThemesList>
        </>
      )}
    </Themes>
  )
}

export { Example }
