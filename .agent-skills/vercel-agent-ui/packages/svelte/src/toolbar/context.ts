import { getContext } from "svelte"
import { ToolbarKey, type ToolbarContext } from "../toolbar-context"

function useToolbar() {
  const context = getContext<ToolbarContext | undefined>(ToolbarKey)
  if (!context) {
    throw new Error("Toolbar parts must be used inside <Toolbar>.")
  }
  return context
}

export { useToolbar }
