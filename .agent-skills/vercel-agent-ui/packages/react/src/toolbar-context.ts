import type { toolbar } from "@ui-sdk/core/toolbar"
import * as React from "react"
import { reading, type PrimitiveHandle } from "./use-primitive"

// The toolbar's context, apart from the toolbar, so a toggle or a toggle group
// can join one without bundling it.
const ToolbarContext = React.createContext<PrimitiveHandle<
  typeof toolbar
> | null>(null)

// Whether the toolbar group an item, toggle or toggle group sits in is disabled.
const ToolbarGroupContext = React.createContext(false)

// The arrow keys and tab stop of the toolbar a toggle or a toggle group sits in, if any.
function useToolbarScope() {
  const toolbar = React.useContext(ToolbarContext)
  const groupDisabled = React.useContext(ToolbarGroupContext)
  return toolbar
    ? reading(toolbar, () => toolbar.api.internal.scopeIn(groupDisabled))
    : undefined
}

export { ToolbarContext, ToolbarGroupContext, useToolbarScope }
