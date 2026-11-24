import type { toolbar } from "@ui-sdk/core/toolbar"
import { createContext, createMemo, useContext } from "solid-js"
import type { PrimitiveHandle } from "./use-primitive"

// The toolbar's context, apart from the toolbar, so a toggle or a toggle group
// can join one without bundling it.
const ToolbarContext = createContext<PrimitiveHandle<typeof toolbar> | null>(
  null
)

// Whether the toolbar group an item, toggle or toggle group sits in is disabled.
const ToolbarGroupContext = createContext<() => boolean>(() => false)

// The arrow keys and tab stop of the toolbar a toggle or a toggle group sits
// in, if any. A memo of the scope getter: it's a new function when the group
// around it is disabled or enabled, so options that read it change and the
// toggle syncs, the way a re-render does it in React.
function useToolbarScope() {
  const toolbar = useContext(ToolbarContext)
  const groupDisabled = useContext(ToolbarGroupContext)
  if (!toolbar) {
    return undefined
  }
  return createMemo(() => {
    const disabled = groupDisabled()
    return () => toolbar.api.internal.scopeIn(disabled)
  })
}

export { ToolbarContext, ToolbarGroupContext, useToolbarScope }
