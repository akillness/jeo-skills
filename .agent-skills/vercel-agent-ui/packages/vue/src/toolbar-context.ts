import type { toolbar } from "@ui-sdk/core/toolbar"
import { computed, inject, type InjectionKey } from "vue"
import type { PrimitiveHandle } from "./use-primitive"

// The toolbar's injection key, apart from the toolbar, so a toggle or a toggle
// group can join one without bundling it.
const ToolbarKey: InjectionKey<PrimitiveHandle<typeof toolbar>> =
  Symbol("toolbar")

// Whether the toolbar group an item, toggle or toggle group sits in is disabled.
const ToolbarGroupKey: InjectionKey<() => boolean> = Symbol("toolbar-group")

// The arrow keys and tab stop of the toolbar a toggle or a toggle group sits
// in, if any. Computed, so options that read it follow the group's disabled.
function useToolbarScope() {
  const toolbar = inject(ToolbarKey, null)
  const groupDisabled = inject(ToolbarGroupKey, () => false)
  return computed(() => {
    if (!toolbar) {
      return undefined
    }
    const disabled = groupDisabled()
    return () => toolbar.api.internal.scopeIn(disabled)
  })
}

export { ToolbarGroupKey, ToolbarKey, useToolbarScope }
