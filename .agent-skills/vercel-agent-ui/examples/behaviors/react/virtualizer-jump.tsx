import * as React from "react"
import {
  createVirtualizer,
  css,
  definePrimitive,
  type VirtualItem,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"

type ContactsState = {
  count: number
  focused: number | null
  items: VirtualItem[]
  size: number
}

const rowHeight = 32
const headerHeight = 32

const contacts = definePrimitive({
  name: "contacts",
  state: (): ContactsState => ({
    count: 100,
    focused: null,
    items: [],
    size: 0,
  }),
  api: (context) => {
    const { store } = context
    const virtual = createVirtualizer({
      count: () => store.get().count,
      estimate: () => rowHeight,
      scrollMargin: headerHeight,
      keep: () => {
        const { focused } = store.get()
        return focused === null ? [] : [focused]
      },
      onEnd: () => {
        const { count } = store.get()
        if (count < 300) {
          store.set({ count: count + 100 })
          virtual.refresh()
        }
      },
      endThreshold: 5,
    })
    context.onDestroy(
      virtual.subscribe(() =>
        store.set({ items: virtual.items(), size: virtual.size() })
      )
    )
    return {
      virtual,
      focus: (index: number) => store.set({ focused: index }),
      act(action: string) {
        const { count } = store.get()
        if (action === "first") {
          virtual.scrollToIndex(0, { align: "start" })
        } else if (action === "middle") {
          virtual.scrollToIndex(49, { align: "center" })
        } else if (action === "last") {
          virtual.scrollToIndex(count - 1, { align: "end" })
        } else if (action === "eighty") {
          virtual.scrollToIndex(79)
        }
      },
    }
  },
  slots: (slot) => ({
    root: slot<{}, { items: VirtualItem[]; count: number }>({
      state: (state) => ({ items: state.items, count: state.count }),
    }),
    scroller: slot({
      attrs: () => ({ style: css({ overflow: "auto" }) }),
      bind: (el, { api }) => api.virtual.connect(el),
    }),
    body: slot({
      attrs: (state) => ({
        role: "list",
        style: css({ position: "relative", height: `${state.size}px` }),
      }),
    }),
    row: slot<{ value: string; index: number; start: number }>({
      props: { value: "string", index: "number", start: "number" },
      attrs: (state, { props }) => ({
        role: "listitem",
        tabindex: "-1",
        "aria-setsize": String(state.count),
        "aria-posinset": String(props.index + 1),
        style: css({
          position: "absolute",
          top: "0",
          left: "0",
          right: "0",
          height: `${rowHeight}px`,
          transform: `translateY(${props.start}px)`,
        }),
      }),
      on: { focus: (_event, { api, props }) => api.focus(props.index) },
    }),
    action: slot<{ value: string }>({
      props: { value: "string" },
      attrs: () => ({ type: "button" }),
      press: ({ api, key }) => api.act(key),
    }),
  }),
})

const parts = createParts(contacts, {
  root: "div",
  scroller: "div",
  body: "div",
  row: "div",
  action: "button",
})

const Contacts = parts.Root

const ContactsScroller = parts.Scroller

const ContactsBody = parts.Body

const ContactsRow = parts.Row

const ContactsAction = parts.Action

const names = ["Hollis", "Inès", "Kofi", "Wren", "Tomasz"]

function Example() {
  return (
    <Contacts>
      {({ items, count }) => (
        <div data-slot="stack">
          <div data-slot="controls">
            {[
              ["first", "First"],
              ["middle", "Center 50"],
              ["eighty", "Show 80"],
              ["last", "Last"],
            ].map(([value, text]) => (
              <ContactsAction data-size="sm" key={value} value={value}>
                {text}
              </ContactsAction>
            ))}
          </div>
          <ContactsScroller>
            <div data-slot="virtualizer-header">{count} contacts</div>
            <ContactsBody aria-label="Contacts">
              {items.map((item) => (
                <ContactsRow
                  key={item.key}
                  value={item.key}
                  index={item.index}
                  start={item.start}
                >
                  {names[item.index % names.length]} {item.index + 1}
                </ContactsRow>
              ))}
            </ContactsBody>
          </ContactsScroller>
        </div>
      )}
    </Contacts>
  )
}

export {
  Contacts,
  contacts,
  ContactsAction,
  ContactsBody,
  ContactsRow,
  ContactsScroller,
  type ContactsState,
  Example,
}
