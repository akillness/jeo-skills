import * as React from "react"
import {
  bindLayer,
  createRovingFocus,
  css,
  definePrimitive,
  dispatch,
  position,
  selects,
  type ChangeDetails,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"

type SelectionToolbarState = {
  open: boolean
  text: string
  focused: string | null
}

type SelectionToolbarOptions = {
  onAction?: (
    value: string,
    details: ChangeDetails<"item-press"> & { text: string }
  ) => void
}

type SelectionToolbarRootState = {
  open: boolean
  text: string
}

const selectionToolbar = /* @__PURE__ */ definePrimitive({
  name: "selection-toolbar",
  options: { onAction: "callback" },
  state: (_options: SelectionToolbarOptions): SelectionToolbarState => ({
    open: false,
    text: "",
    focused: null,
  }),
  api: (context) => {
    const { store } = context
    const roving = createRovingFocus<SelectionToolbarState, { value: string }>(
      context,
      {
        slot: "action",
        key: "focused",
        orientation: () => "horizontal",
        loop: () => true,
      }
    )
    let range: Range | null = null
    const anchor = {
      getBoundingClientRect: () =>
        range?.getBoundingClientRect() ?? new DOMRect(),
    }

    const api = {
      roving,
      anchor,
      update() {
        const passage = context.element("passage")
        const selection = document.getSelection()
        const inside =
          !!passage &&
          !!selection &&
          selection.rangeCount > 0 &&
          !selection.isCollapsed &&
          passage.contains(selection.anchorNode) &&
          passage.contains(selection.focusNode)
        const toolbar = context.element("toolbar")
        if (toolbar?.contains(document.activeElement)) {
          return
        }
        range = inside ? selection!.getRangeAt(0).cloneRange() : null
        const text = inside ? selection!.toString().trim() : ""
        store.set({ open: !!text, text })
      },
      close() {
        const back = context
          .element("toolbar")
          ?.contains(document.activeElement)
        range = null
        store.set({ open: false, text: "" })
        if (back) {
          context.element("passage")?.focus()
        }
      },
      run(value: string, event: Event) {
        dispatch(context, "onAction", value, {
          reason: "item-press",
          event,
          text: store.get().text,
        })
        api.close()
        document.getSelection()?.removeAllRanges()
      },
      passageKeydown(event: KeyboardEvent) {
        if (event.altKey && event.key === "F10" && store.get().open) {
          event.preventDefault()
          roving.focus()
        }
      },
    }
    const listener = () => api.update()
    document.addEventListener("selectionchange", listener)
    context.onDestroy(() =>
      document.removeEventListener("selectionchange", listener)
    )
    return api
  },
  slots: (slot) => ({
    root: slot<{}, SelectionToolbarRootState>({
      state: (state) => ({ open: state.open, text: state.text }),
    }),
    passage: slot({
      attrs: () => ({
        contenteditable: "true",
        "aria-readonly": "true",
        role: "textbox",
        "aria-multiline": "true",
        spellcheck: "false",
      }),
      on: {
        beforeinput: (event) => event.preventDefault(),
        keydown: (event, { api }) => api.passageKeydown(event),
      },
    }),
    toolbar: slot({
      present: (state) => state.open,
      attrs: () => ({
        role: "toolbar",
        "aria-label": "Selected text",
        style: css({ inset: "auto", margin: "0" }),
      }),
      bind: (el, { api }) => {
        const stopLayer = bindLayer(el, {
          topLayer: true,
          onDismiss: () => api.close(),
        })
        const stopPosition = position(api.anchor, el, {
          side: "top",
          align: "center",
          sideOffset: 8,
        })
        return () => {
          stopPosition()
          stopLayer()
        }
      },
    }),
    action: slot<{ value: string }>({
      props: { value: "string" },
      selects: selects({ focused: ({ key }) => [key, null] }),
      attrs: (state, part) => ({
        type: "button",
        tabindex: part.api.roving.tabIndex(state, part),
      }),
      on: {
        keydown: (event, { el, api }) =>
          event.key !== "Escape" && el && api.roving.keydown(event, el),
        pointerdown: (event) => event.preventDefault(),
        click: (event, { api, key }) => api.run(key, event),
      },
      bind: (el, part) => part.api.roving.bind(el, part),
    }),
  }),
})

const parts = createParts(selectionToolbar, {
  root: "div",
  passage: "div",
  toolbar: "div",
  action: "button",
})

const SelectionToolbar = parts.Root

const SelectionToolbarPassage = parts.Passage

const SelectionToolbarPopup = parts.Toolbar

const SelectionToolbarAction = parts.Action

const actions = [
  { value: "quote", label: "Quote" },
  { value: "highlight", label: "Highlight" },
  { value: "copy", label: "Copy" },
]

function Example() {
  const [quotes, setQuotes] = React.useState<string[]>([])
  const [notice, setNotice] = React.useState("")
  return (
    <SelectionToolbar
      onAction={(value, { text }) => {
        if (value === "copy") {
          void navigator.clipboard?.writeText(text).catch(() => {})
          setNotice(`Copied “${text}”.`)
        } else {
          setQuotes((list) => [...list, text])
          setNotice(value === "quote" ? "Quoted." : "Highlighted.")
        }
      }}
    >
      <SelectionToolbarPassage aria-label="Passage">
        Most interfaces are rebuilt from the same handful of parts. A table that
        scrolls ten thousand rows, a log that follows its end, a board whose
        cards move between columns, a menu that opens where you click. Each one
        hides the same hard problems: where focus goes, what a screen reader
        hears, what happens at the edge of the screen. Select any of this text
        to see a toolbar appear above it.
      </SelectionToolbarPassage>
      <SelectionToolbarPopup>
        {actions.map((action) => (
          <SelectionToolbarAction key={action.value} value={action.value}>
            {action.label}
          </SelectionToolbarAction>
        ))}
      </SelectionToolbarPopup>
      <p data-slot="hint" aria-live="polite">
        {notice ||
          "Select text with the pointer, or with Shift and the arrows. Alt+F10 moves into the toolbar."}
      </p>
      {quotes.length > 0 && (
        <ul data-slot="selection-toolbar-quotes">
          {quotes.map((quote, i) => (
            <li key={i}>{quote}</li>
          ))}
        </ul>
      )}
    </SelectionToolbar>
  )
}

export {
  Example,
  SelectionToolbar,
  SelectionToolbarAction,
  SelectionToolbarPassage,
  SelectionToolbarPopup,
  selectionToolbar,
  type SelectionToolbarOptions,
  type SelectionToolbarRootState,
}
