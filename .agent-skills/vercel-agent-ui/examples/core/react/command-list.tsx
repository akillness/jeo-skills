import * as React from "react"
import {
  createTypeahead,
  definePrimitive,
  elements,
  idPart,
  isTypeaheadKey,
  labelOf,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"
import { Trash2Icon } from "lucide-react"

type EditListState = { command: string }

const editList = definePrimitive({
  name: "edit-list",
  state: (): EditListState => ({ command: "copy" }),
  api: (context) => {
    const typeahead = createTypeahead()
    return {
      keydown(event: KeyboardEvent) {
        if (!isTypeaheadKey(event)) {
          return
        }
        const commands = elements(context, "command")
        const current = commands.findIndex(
          (command) => command.key === context.store.get().command
        )
        const next = typeahead(
          event.key,
          commands.map((command) => labelOf(command.el)),
          current
        )
        if (next === -1) {
          return
        }
        event.preventDefault()
        context.store.set({ command: commands[next].key })
      },
    }
  },
  slots: (slot) => ({
    root: slot<{}>({
      attrs: (state, part) => ({
        role: "listbox",
        tabindex: "0",
        "aria-activedescendant": `${part.id}-${idPart(state.command)}`,
      }),
      on: { keydown: (event, { api }) => api.keydown(event) },
    }),
    command: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, part) => ({
        role: "option",
        id: `${part.id}-${idPart(part.key)}`,
        "aria-selected": String(state.command === part.key),
      }),
    }),
  }),
})

const parts = createParts(editList, { root: "div", command: "div" })

const EditList = parts.Root

const EditListCommand = parts.Command

function Example() {
  return (
    <EditList aria-label="Edit">
      <EditListCommand value="copy">
        Copy{" "}
        <kbd aria-hidden="true" data-slot="kbd">
          ⌘C
        </kbd>
      </EditListCommand>
      <EditListCommand value="cut">
        Cut{" "}
        <kbd aria-hidden="true" data-slot="kbd">
          ⌘X
        </kbd>
      </EditListCommand>
      <EditListCommand value="paste">
        Paste{" "}
        <kbd aria-hidden="true" data-slot="kbd">
          ⌘V
        </kbd>
      </EditListCommand>
      <EditListCommand value="delete" aria-label="Delete">
        <Trash2Icon aria-hidden="true" />
      </EditListCommand>
    </EditList>
  )
}

export { EditList, EditListCommand, editList, type EditListState, Example }
