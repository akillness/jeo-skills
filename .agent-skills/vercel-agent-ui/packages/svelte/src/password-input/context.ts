import type { passwordInput } from "@ui-sdk/core/password-input"
import { getContext } from "svelte"
import type { useFieldControl } from "../field/context"
import type { PrimitiveHandle } from "../use-primitive.svelte"

type PasswordInputContext = PrimitiveHandle<typeof passwordInput> & {
  field: ReturnType<typeof useFieldControl>
  value: () => string | undefined
  defaultValue: () => string | undefined
}

const PasswordInputKey = Symbol("password-input")

function usePasswordInput(part: string) {
  const context = getContext<PasswordInputContext | undefined>(PasswordInputKey)
  if (!context) {
    throw new Error(`${part} must be used inside <PasswordInput>.`)
  }
  return context
}

export { type PasswordInputContext, PasswordInputKey, usePasswordInput }
