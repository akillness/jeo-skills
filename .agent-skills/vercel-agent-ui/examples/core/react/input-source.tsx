import * as React from "react"
import { definePrimitive, isFocusFromKeyboard, sourceOf } from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"
import { useLog } from "../../shared/react/log"

type SaveBarOptions = {
  onSave?: (source: string) => void
}

type SaveBarState = { hint: boolean }

const saveBar = definePrimitive({
  name: "save-bar",
  options: { onSave: "callback" },
  state: (_options: SaveBarOptions): SaveBarState => ({ hint: false }),
  api: (context) => ({
    save: (event?: Event) => context.options().onSave?.(sourceOf(event)),
    focus: () => context.store.set({ hint: isFocusFromKeyboard() }),
    blur: () => context.store.set({ hint: false }),
  }),
  slots: (slot) => ({
    save: slot({
      attrs: () => ({ type: "button" }),
      press: ({ api }, event) => api.save(event),
      on: {
        focus: (_event, { api }) => api.focus(),
        blur: (_event, { api }) => api.blur(),
      },
    }),
    hint: slot({ present: (state) => state.hint }),
  }),
})

const parts = createParts(saveBar, { save: "button", hint: "span" })

const SaveBar = parts.Root

const SaveBarButton = parts.Save

const SaveBarHint = parts.Hint

function Example() {
  const log = useLog()
  return (
    <SaveBar onSave={(source) => log(`Saved with ${source}`)}>
      <div data-slot="row">
        <SaveBarButton data-variant="solid">Save</SaveBarButton>
        <SaveBarHint>Enter or Space saves</SaveBarHint>
      </div>
    </SaveBar>
  )
}

export {
  Example,
  saveBar,
  SaveBar,
  SaveBarButton,
  SaveBarHint,
  type SaveBarOptions,
  type SaveBarState,
}
