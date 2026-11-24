import type { inputGroup } from "@ui-sdk/core/input"
import { getContext } from "svelte"
import type { PrimitiveHandle } from "../use-primitive.svelte"

type InputGroupContext = PrimitiveHandle<typeof inputGroup>

const InputGroupKey = Symbol("input-group")

function useInputGroup(part: string) {
  const context = getContext<InputGroupContext | undefined>(InputGroupKey)
  if (!context) {
    throw new Error(`${part} must be used inside <InputGroup>.`)
  }
  return context
}

export { type InputGroupContext, InputGroupKey, useInputGroup }
