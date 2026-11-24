import * as React from "react"
import {
  createChange,
  createPreview,
  createRovingFocus,
  definePrimitive,
  selects,
  type ChangeDetails,
  type PreviewReason,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"

type PeekState = {
  value: string | null
  preview: string | null
  focused: string | null
}

type PeekValueChangeReason = "item-press" | "imperative"

type PeekOptions = {
  value?: string | null
  defaultValue?: string | null
  onValueChange?: (
    value: string | null,
    details: ChangeDetails<PeekValueChangeReason>
  ) => void
  onPreviewChange?: (
    preview: string | null,
    details: ChangeDetails<PreviewReason>
  ) => void
}

type PeekRootState = { value: string | null; preview: string | null }
type PeekOptionState = { checked: boolean; previewing: boolean }

const peek = /* @__PURE__ */ definePrimitive({
  name: "peek",
  options: {
    value: "string",
    defaultValue: "string",
    onValueChange: "callback",
    onPreviewChange: "callback",
  },
  state: (options: PeekOptions): PeekState => ({
    value: options.value ?? options.defaultValue ?? null,
    preview: null,
    focused: null,
  }),
  sync: (options) =>
    options.value === undefined ? {} : { value: options.value },
  controlled: ["value", "preview"],
  api: (context) => {
    const { store } = context
    const change = createChange(context)
    const roving = createRovingFocus<PeekState, { value: string }>(context, {
      slot: "option",
      key: "focused",
      orientation: () => "horizontal",
      loop: () => true,
      preferred: (item) => store.get().value === item.key,
    })
    const preview = createPreview<PeekState>(context, {
      key: "preview",
      slot: "option",
      value: () => store.get().value,
      set: (value, details) => change("preview", value, details),
      choose: (key, details) => change("value", key, details),
    })
    const api = {
      roving,
      preview,
      setValue(value: string | null) {
        return change("value", value, { reason: "imperative" })
      },
      optionKeydown(event: KeyboardEvent, el: HTMLElement, key: string) {
        if (preview.keydown(event, key)) {
          return
        }
        const moved = roving.keydown(event, el)
        if (moved) {
          preview.show(moved.key, { reason: "list-navigation", event })
        }
      },
    }
    return api
  },
  slots: (slot) => ({
    root: slot<{}, PeekRootState>({
      state: (state) => ({ value: state.value, preview: state.preview }),
      attrs: () => ({
        role: "radiogroup",
        "aria-roledescription": "preview group",
      }),
      on: {
        focusout: (event, { el, api }) => {
          if (
            api.preview.dragging() ||
            el?.contains(event.relatedTarget as Node)
          ) {
            return
          }
          api.preview.clear({ reason: "focus-out", event })
        },
      },
    }),
    option: slot<{ value: string }, PeekOptionState>({
      props: { value: "string" },
      selects: selects({ focused: ({ key }) => [key, null] }),
      state: (state, { key }) => ({
        checked: state.value === key,
        previewing: state.preview === key,
      }),
      attrs: (state, part) => ({
        role: "radio",
        "aria-checked": String(state.value === part.key),
        tabindex: part.api.roving.tabIndex(state, part),
        "data-checked": state.value === part.key ? "" : undefined,
        "data-previewing": state.preview === part.key ? "" : undefined,
        style: "touch-action:none;user-select:none",
      }),
      on: {
        pointerdown: (event, { el, api, key }) =>
          el?.parentElement &&
          api.preview.pointerdown(event, key, el.parentElement),
        keydown: (event, { el, api, key }) =>
          el && api.optionKeydown(event, el, key),
      },
      bind: (el, part) => part.api.roving.bind(el, part),
    }),
  }),
})

const parts = createParts(peek, { root: "div", option: "button" })

const Peek = parts.Root

const PeekOption = parts.Option

const themes = {
  paper: {
    label: "Paper",
    card: "#ffffff",
    text: "#171717",
    accent: "#171717",
  },
  night: {
    label: "Night",
    card: "#171717",
    text: "#f5f5f5",
    accent: "#38bdf8",
  },
  sepia: {
    label: "Sepia",
    card: "#fffbeb",
    text: "#451a03",
    accent: "#b45309",
  },
  forest: {
    label: "Forest",
    card: "#022c22",
    text: "#ecfdf5",
    accent: "#34d399",
  },
}
type Theme = keyof typeof themes

function Example() {
  const [value, setValue] = React.useState<string | null>("paper")
  const [preview, setPreview] = React.useState<string | null>(null)
  const shown = themes[(preview ?? value ?? "paper") as Theme]
  return (
    <div data-slot="stack">
      <div
        data-slot="peek-card"
        style={
          {
            "--card": shown.card,
            "--card-text": shown.text,
            "--accent": shown.accent,
          } as React.CSSProperties
        }
      >
        <span data-slot="peek-accent" />
        <span>Reading view</span>
        <span>
          {preview
            ? `Previewing ${themes[preview as Theme].label}. Let go to keep it.`
            : "Press a theme and slide across the others."}
        </span>
      </div>
      <Peek
        value={value}
        onValueChange={setValue}
        onPreviewChange={setPreview}
        aria-label="Theme"
      >
        {Object.entries(themes).map(([key, theme]) => (
          <PeekOption key={key} value={key}>
            {theme.label}
          </PeekOption>
        ))}
      </Peek>
    </div>
  )
}

export {
  Example,
  peek,
  Peek,
  PeekOption,
  type PeekOptions,
  type PeekOptionState,
  type PeekRootState,
  type PeekValueChangeReason,
}
