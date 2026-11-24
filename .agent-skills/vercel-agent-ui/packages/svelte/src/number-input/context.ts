import type { numberInput } from "@ui-sdk/core/number-input"
import { getContext } from "svelte"
import type { useFieldControl } from "../field/context"
import type { PrimitiveHandle } from "../use-primitive.svelte"

type NumberInputContext = PrimitiveHandle<typeof numberInput> & {
  field: ReturnType<typeof useFieldControl>
}

const NumberInputKey = Symbol("number-input")

function useNumberInput(part: string) {
  const context = getContext<NumberInputContext | undefined>(NumberInputKey)
  if (!context) {
    throw new Error(`${part} must be used inside <NumberInput>.`)
  }
  return context
}

export { type NumberInputContext, NumberInputKey, useNumberInput }
