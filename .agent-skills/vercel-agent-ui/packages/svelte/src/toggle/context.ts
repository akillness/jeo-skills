import {
  toggle as togglePrimitive,
  type toggle,
  type toggleGroup,
} from "@ui-sdk/core/toggle"
import { getContext } from "svelte"
import type { PrimitiveHandle } from "../use-primitive.svelte"

type ToggleContext = PrimitiveHandle<typeof toggle>
type ToggleGroupContext = PrimitiveHandle<typeof toggleGroup>

const ToggleGroupKey = Symbol("toggle-group")

/** The group a toggle belongs to, if any. */
function useToggleGroup() {
  return getContext<ToggleGroupContext | undefined>(ToggleGroupKey) ?? null
}

function useToggle() {
  const toggle = getContext<ToggleContext | undefined>(togglePrimitive)
  if (!toggle) {
    throw new Error("<ToggleIcon> must be used inside <Toggle>.")
  }
  return toggle
}

export {
  type ToggleContext,
  type ToggleGroupContext,
  ToggleGroupKey,
  useToggle,
  useToggleGroup,
}
