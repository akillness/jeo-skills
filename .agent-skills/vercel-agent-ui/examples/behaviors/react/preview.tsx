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
import { useLog } from "../../shared/react/log"

type FontsState = {
  value: string
  preview: string | null
  focused: string | null
}

type FontsOptions = {
  defaultValue: string
  onValueChange?: (
    value: string,
    details: ChangeDetails<"item-press" | "list-navigation">
  ) => void
  onPreviewChange?: (
    preview: string | null,
    details: ChangeDetails<PreviewReason>
  ) => void
}

const fonts = definePrimitive({
  name: "fonts",
  options: {
    defaultValue: "string",
    onValueChange: "callback",
    onPreviewChange: "callback",
  },
  state: (options: FontsOptions): FontsState => ({
    value: options.defaultValue,
    preview: null,
    focused: null,
  }),
  api: (context) => {
    const { store } = context
    const change = createChange(context)
    const roving = createRovingFocus<FontsState, { value: string }>(context, {
      slot: "font",
      key: "focused",
      orientation: () => "horizontal",
    })
    const preview = createPreview<FontsState>(context, {
      key: "preview",
      slot: "font",
      value: () => store.get().value,
      set: (value, details) => change("preview", value, details),
      choose: (key, details) => change("value", key, details),
    })
    return { roving, preview }
  },
  slots: (slot) => ({
    root: slot<{}, { shown: string }>({
      state: (state) => ({ shown: state.preview ?? state.value }),
      attrs: () => ({ role: "radiogroup" }),
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
    font: slot<{ value: string }>({
      props: { value: "string" },
      selects: selects({ focused: ({ key }) => [key, null] }),
      attrs: (state, part) => ({
        type: "button",
        role: "radio",
        "aria-checked": String(state.value === part.key),
        tabindex: part.api.roving.tabIndex(state, part),
        "data-checked": state.value === part.key ? "" : undefined,
        "data-previewing": state.preview === part.key ? "" : undefined,
        style: "touch-action:none;user-select:none",
      }),
      on: {
        pointerdown: (event, { el, api, key }) =>
          api.preview.pointerdown(event, key, el!.parentElement!),
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

const parts = createParts(fonts, { root: "div", font: "button" })

const Fonts = parts.Root

const FontsOption = parts.Font

const families: Record<string, string> = {
  Sans: "ui-sans-serif, system-ui",
  Serif: "ui-serif, Georgia, serif",
  Mono: "var(--mono)",
}

function Example() {
  const log = useLog()
  const [shown, setShown] = React.useState("Sans")
  const [preview, setPreview] = React.useState<string | null>(null)
  return (
    <div data-slot="stack">
      <p
        data-slot="preview-sample"
        style={
          {
            "--preview-font": families[preview ?? shown],
          } as React.CSSProperties
        }
      >
        The quick brown fox
      </p>
      <Fonts
        aria-label="Font"
        defaultValue="Sans"
        onValueChange={(value) => {
          setShown(value)
          log(`Chose ${value}`)
        }}
        onPreviewChange={setPreview}
      >
        {Object.keys(families).map((font) => (
          <FontsOption key={font} value={font}>
            {font}
          </FontsOption>
        ))}
      </Fonts>
    </div>
  )
}

export { Example }
