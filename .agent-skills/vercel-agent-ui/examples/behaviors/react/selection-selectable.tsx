import * as React from "react"
import {
  createChange,
  createRovingFocus,
  createSelection,
  definePrimitive,
  selects,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"

type MembersState = { value: string[]; focused: string | null }

type MembersOptions = {
  owners: string[]
}

const members = definePrimitive({
  name: "members",
  options: { owners: "list" },
  state: (options: MembersOptions): MembersState => ({
    value: [...options.owners],
    focused: null,
  }),
  api: (context) => {
    const change = createChange(context)
    const roving = createRovingFocus<MembersState, { value: string }>(context, {
      slot: "member",
      key: "focused",
    })
    const selection = createSelection(context, {
      key: "value",
      set: (value, details) => change("value", value, details),
      order: () => roving.items().map((item) => item.key),
      multiple: () => true,
      selectable: (key) => !context.options().owners.includes(key),
    })
    return {
      roving,
      selection,
      keydown(event: KeyboardEvent, el: HTMLElement, key: string) {
        if ((event.metaKey || event.ctrlKey) && event.key === "a") {
          event.preventDefault()
          selection.toggleAll({ reason: "list-navigation", event })
        } else if (event.key === " ") {
          event.preventDefault()
          selection.toggle(key, { reason: "item-press", event })
        } else {
          roving.keydown(event, el)
        }
      },
    }
  },
  slots: (slot) => ({
    root: slot({
      attrs: () => ({ role: "listbox", "aria-multiselectable": "true" }),
    }),
    member: slot<{ value: string }>({
      props: { value: "string" },
      selects: selects({ focused: ({ key }) => [key, null] }),
      attrs: (state, part) => ({
        role: "option",
        "aria-selected": String(state.value.includes(part.key)),
        tabindex: part.api.roving.tabIndex(state, part),
      }),
      on: {
        keydown: (event, { el, api, key }) => api.keydown(event, el!, key),
        pointerdown: (event, { api, key }) =>
          api.selection.toggle(key, { reason: "item-press", event }),
      },
      bind: (el, part) => part.api.roving.bind(el, part),
    }),
  }),
})

const parts = createParts(members, { root: "div", member: "div" })

const Members = parts.Root

const MembersMember = parts.Member

const names = [
  "Hollis Grant",
  "Inès Moreau",
  "Kofi Mensah",
  "Wren Takahashi",
  "Tomasz Wójcik",
]
const owners = ["Hollis Grant"]

function Example() {
  return (
    <Members owners={owners} aria-label="Members">
      {names.map((name) => (
        <MembersMember
          key={name}
          value={name}
          aria-disabled={owners.includes(name) || undefined}
        >
          {name}
          {owners.includes(name) && <span data-slot="hint">Owner</span>}
        </MembersMember>
      ))}
    </Members>
  )
}

export {
  Example,
  members,
  Members,
  MembersMember,
  type MembersOptions,
  type MembersState,
}
