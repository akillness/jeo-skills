import type { toolbar } from "@ui-sdk/core/toolbar"
import { getContext } from "svelte"
import type { PrimitiveHandle } from "./use-primitive.svelte"

type ToolbarContext = PrimitiveHandle<typeof toolbar>

// The toolbar's context key, apart from the toolbar, so a toggle or a toggle
// group can join one without bundling it.
const ToolbarKey = Symbol("toolbar")

// Whether the toolbar group an item, toggle or toggle group sits in is disabled.
const ToolbarGroupKey = Symbol("toolbar-group")

/**
 * The arrow keys and tab stop of the toolbar a toggle or a toggle group sits
 * in, if any. A getter, so options that read it follow the group's disabled.
 */
function useToolbarScope() {
  const toolbar = getContext<ToolbarContext | undefined>(ToolbarKey)
  const groupDisabled =
    getContext<(() => boolean) | undefined>(ToolbarGroupKey) ?? (() => false)
  return () => {
    if (!toolbar) {
      return undefined
    }
    const disabled = groupDisabled()
    return () => toolbar.api.internal.scopeIn(disabled)
  }
}

export { type ToolbarContext, ToolbarGroupKey, ToolbarKey, useToolbarScope }
