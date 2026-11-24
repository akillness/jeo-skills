import * as React from "react"
import {
  createChange,
  createRovingFocus,
  createSelection,
  definePrimitive,
  selects,
  type ChangeDetails,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"
import { useLog } from "../../shared/react/log"

type FilesState = { value: string[]; focused: string | null }

type FilesOptions = {
  replaceRanges?: boolean
  onValueChange?: (
    value: string[],
    details: ChangeDetails<"item-press" | "list-navigation">
  ) => void
}

const files = definePrimitive({
  name: "files",
  options: { replaceRanges: "boolean", onValueChange: "callback" },
  state: (_options: FilesOptions): FilesState => ({ value: [], focused: null }),
  api: (context) => {
    const { store } = context
    const change = createChange(context)
    const additive = () => !context.options().replaceRanges
    const roving = createRovingFocus<FilesState, { value: string }>(context, {
      slot: "file",
      key: "focused",
    })
    const selection = createSelection(context, {
      key: "value",
      set: (value, details) => change("value", value, details),
      order: () => roving.items().map((item) => item.key),
      multiple: () => true,
    })
    return {
      roving,
      keydown(event: KeyboardEvent, el: HTMLElement, key: string) {
        if ((event.metaKey || event.ctrlKey) && event.key === "a") {
          event.preventDefault()
          selection.toggleAll({ reason: "list-navigation", event })
        } else if (event.key === " ") {
          event.preventDefault()
          selection.toggle(key, { reason: "item-press", event })
        } else {
          const moved = roving.keydown(event, el)
          if (moved?.shift) {
            selection.extend(moved.key, {
              from: moved.from,
              additive: additive(),
              reason: "list-navigation",
              event,
            })
          }
        }
      },
      press(event: PointerEvent, key: string) {
        const why = { reason: "item-press" as const, event }
        if (event.shiftKey) {
          selection.extend(key, {
            ...why,
            from: store.get().focused,
            additive: additive(),
          })
        } else if (event.metaKey || event.ctrlKey) {
          selection.toggle(key, why)
        } else {
          selection.choose(key, why)
        }
      },
    }
  },
  slots: (slot) => ({
    root: slot({
      attrs: () => ({ role: "listbox", "aria-multiselectable": "true" }),
    }),
    file: slot<{ value: string }, { selected: boolean }>({
      props: { value: "string" },
      selects: selects({ focused: ({ key }) => [key, null] }),
      state: (state, { key }) => ({ selected: state.value.includes(key) }),
      attrs: (state, part) => ({
        role: "option",
        "aria-selected": String(state.value.includes(part.key)),
        tabindex: part.api.roving.tabIndex(state, part),
        "data-selected": state.value.includes(part.key) ? "" : undefined,
      }),
      on: {
        keydown: (event, { el, api, key }) => api.keydown(event, el!, key),
        pointerdown: (event, { api, key }) => api.press(event, key),
      },
      bind: (el, part) => part.api.roving.bind(el, part),
    }),
  }),
})

const parts = createParts(files, { root: "div", file: "div" })

const Files = parts.Root

const FilesItem = parts.File

const names = [
  "notes.md",
  "budget.xlsx",
  "photo.jpg",
  "slides.key",
  "draft.docx",
  "logo.svg",
]

function Example() {
  const log = useLog()
  const [replace, setReplace] = React.useState(false)
  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <label data-slot="label">
          <input
            type="checkbox"
            checked={replace}
            onChange={(event) => setReplace(event.target.checked)}
          />
          Ranges replace the selection
        </label>
      </div>
      <Files
        aria-label="Files"
        replaceRanges={replace}
        onValueChange={(value: string[]) =>
          log(`${value.length} selected: ${value.join(", ") || "none"}`)
        }
      >
        {names.map((name) => (
          <FilesItem key={name} value={name}>
            {name}
          </FilesItem>
        ))}
      </Files>
    </div>
  )
}

export { Example, files, Files, FilesItem, type FilesOptions, type FilesState }
