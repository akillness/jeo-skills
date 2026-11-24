import * as React from "react"
import { bindPanel, definePrimitive, hiddenAttrs } from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"
import { useLog } from "../../shared/react/log"

type NotesState = {
  expanded: string[]
  exiting: string[]
  opening: "mount" | "instant" | "animate"
}

type NotesOptions = { onSettled?: (value: string, open: boolean) => void }

const without = (list: string[], value: string) =>
  list.filter((other) => other !== value)

const notes = definePrimitive({
  name: "notes",
  options: { onSettled: "callback" },
  state: (_options: NotesOptions): NotesState => ({
    expanded: ["3.0"],
    exiting: [],
    opening: "mount",
  }),
  api: (context) => {
    const { store } = context
    return {
      settle: (value: string, open: boolean) =>
        context.options().onSettled?.(value, open),
      toggle(value: string) {
        const { expanded, exiting } = store.get()
        if (expanded.includes(value)) {
          store.set({
            opening: "animate",
            expanded: without(expanded, value),
            exiting: [...exiting, value],
          })
        } else {
          store.set({
            opening: "animate",
            expanded: [...expanded, value],
            exiting: without(exiting, value),
          })
        }
      },
      show(values: string[]) {
        const { expanded } = store.get()
        store.set({
          opening: "instant",
          expanded: [
            ...expanded,
            ...values.filter((v) => !expanded.includes(v)),
          ],
        })
      },
    }
  },
  slots: (slot) => ({
    root: slot({}),
    trigger: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, { id, key }) => ({
        type: "button",
        "aria-expanded": String(state.expanded.includes(key)),
        "aria-controls": `${id}-${key}`,
      }),
      press: ({ api, key }) => api.toggle(key),
    }),
    panel: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, { id, key }) => ({
        id: `${id}-${key}`,
        role: "region",
        ...hiddenAttrs(
          state.expanded.includes(key) || state.exiting.includes(key),
          true
        ),
      }),
      bind: (el, { api, key, store }) =>
        bindPanel(el, {
          size: (el, height) => el.style.setProperty("--panel-height", height),
          isOpen: () => store.get().expanded.includes(key),
          isExiting: () => store.get().exiting.includes(key),
          isFindable: () => true,
          opening: () => store.get().opening,
          reveal: () => api.show([key]),
          trigger: () => el.previousElementSibling as HTMLElement | undefined,
          subscribe: store.subscribe,
          settled: (open) => api.settle(key, open),
          exited: () =>
            store.set({ exiting: without(store.get().exiting, key) }),
        }),
    }),
    expand: slot<{ value: string }>({
      props: { value: "string" },
      attrs: () => ({ type: "button" }),
      press: ({ api, key }) => api.show(key.split(" ")),
    }),
  }),
})

const parts = createParts(notes, {
  root: "div",
  trigger: "button",
  panel: "div",
  expand: "button",
})

const Notes = parts.Root

const NotesTrigger = parts.Trigger

const NotesPanel = parts.Panel

const NotesExpand = parts.Expand

const releases = [
  {
    value: "3.0",
    notes:
      "Dark mode follows your system, and the sidebar remembers its width.",
  },
  {
    value: "2.4",
    notes: "Drafts save while you're offline and sync once you're back.",
  },
  { value: "2.3", notes: "Export a board as a PDF, with one page per column." },
]

function Example() {
  const log = useLog()
  return (
    <Notes
      onSettled={(value, open) =>
        log(`Version ${value} ${open ? "opened" : "closed"}`)
      }
    >
      <div data-slot="controls">
        <NotesExpand
          value={releases.map((release) => release.value).join(" ")}
          data-size="sm"
        >
          Open All
        </NotesExpand>
      </div>
      <div data-slot="panel-list">
        {releases.map((release) => (
          <div key={release.value}>
            <NotesTrigger value={release.value}>
              Version {release.value}
            </NotesTrigger>
            <NotesPanel value={release.value}>
              <p>{release.notes}</p>
            </NotesPanel>
          </div>
        ))}
      </div>
    </Notes>
  )
}

export {
  Example,
  notes,
  Notes,
  NotesExpand,
  type NotesOptions,
  NotesPanel,
  NotesTrigger,
  type NotesState,
}
