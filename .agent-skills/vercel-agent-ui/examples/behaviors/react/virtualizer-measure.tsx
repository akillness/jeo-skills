import * as React from "react"
import {
  createVirtualizer,
  css,
  definePrimitive,
  type VirtualItem,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"

type Note = { id: string; text: string }

type NotesState = {
  notes: Note[]
  newest: boolean
  large: boolean
  items: VirtualItem[]
  size: number
}

const sentences = [
  "Moved the launch review to Thursday.",
  "Hollis wants the pricing page copy by Friday.",
  "Inès shared the onboarding survey; week-two retention is up.",
  "Kofi is pairing on the billing migration.",
  "Wren flagged two broken links in the help center.",
  "Tomasz will draft the release notes.",
  "Ship the dark mode fixes before the freeze.",
]
const notes: Note[] = Array.from({ length: 500 }, (_, index) => ({
  id: `note-${index + 1}`,
  text: `${index + 1}. ${Array.from({ length: 1 + ((index * 5) % 4) }, (_, k) => sentences[(index + k) % sentences.length]).join(" ")}`,
}))

const notebook = definePrimitive({
  name: "notebook",
  state: (): NotesState => ({
    notes,
    newest: false,
    large: false,
    items: [],
    size: 0,
  }),
  api: (context) => {
    const { store } = context
    let order = notes
    const virtual = createVirtualizer({
      count: () => order.length,
      estimate: () => 52,
      key: (index) => order[index].id,
      overscan: 2,
    })
    const sync = () =>
      store.set({ items: virtual.items(), size: virtual.size() })
    context.onDestroy(virtual.subscribe(sync))
    return {
      virtual,
      note: (index: number) => order[index],
      flip() {
        const newest = !store.get().newest
        order = newest ? [...notes].reverse() : notes
        store.set({ newest })
        virtual.refresh()
      },
      enlarge() {
        store.set({ large: !store.get().large })
        virtual.reset()
      },
    }
  },
  slots: (slot) => ({
    root: slot<{}, { items: VirtualItem[]; newest: boolean; large: boolean }>({
      state: (state) => ({
        items: state.items,
        newest: state.newest,
        large: state.large,
      }),
    }),
    scroller: slot({
      attrs: () => ({ tabindex: "0", style: css({ overflow: "auto" }) }),
      bind: (el, { api }) => api.virtual.connect(el),
    }),
    body: slot({
      attrs: (state) => ({
        role: "list",
        "data-size": String(state.size),
        style: css({ position: "relative", height: `${state.size}px` }),
      }),
    }),
    row: slot<
      { value: string; index: number; start: number },
      { text: string }
    >({
      props: { value: "string", index: "number", start: "number" },
      state: (_state, { api, props }) => ({
        text: api.note(props.index)?.text ?? "",
      }),
      attrs: (state, { props }) => ({
        role: "listitem",
        "aria-setsize": String(state.notes.length),
        "aria-posinset": String(props.index + 1),
        style: css({
          position: "absolute",
          top: "0",
          left: "0",
          right: "0",
          transform: `translateY(${props.start}px)`,
        }),
      }),
      bind: (el, { api, props }) => api.virtual.measure(props.index, el),
    }),
    action: slot<{ value: string }>({
      props: { value: "string" },
      attrs: () => ({ type: "button" }),
      press: ({ api, key }) => (key === "flip" ? api.flip() : api.enlarge()),
    }),
  }),
})

const parts = createParts(notebook, {
  root: "div",
  scroller: "div",
  body: "div",
  row: "div",
  action: "button",
})

const Notebook = parts.Root

const NotebookScroller = parts.Scroller

const NotebookBody = parts.Body

const NotebookRow = parts.Row

const NotebookAction = parts.Action

function Example() {
  return (
    <Notebook>
      {({ items, newest, large }) => (
        <div data-slot="stack">
          <div data-slot="controls">
            <NotebookAction data-size="sm" value="flip">
              {newest ? "Oldest First" : "Newest First"}
            </NotebookAction>
            <NotebookAction data-size="sm" value="enlarge">
              {large ? "Smaller Text" : "Larger Text"}
            </NotebookAction>
          </div>
          <NotebookScroller>
            <NotebookBody
              aria-label="Notes"
              data-large={large ? "" : undefined}
            >
              {items.map((item) => (
                <NotebookRow
                  key={item.index}
                  value={item.key}
                  index={item.index}
                  start={item.start}
                >
                  {({ text }) => text}
                </NotebookRow>
              ))}
            </NotebookBody>
          </NotebookScroller>
        </div>
      )}
    </Notebook>
  )
}

export {
  Example,
  notebook,
  Notebook,
  NotebookAction,
  NotebookBody,
  NotebookRow,
  NotebookScroller,
  type Note,
  type NotesState,
}
