import type { switchPrimitive } from "@ui-sdk/core/switch"
import type { PrimitiveHandle } from "../use-primitive.svelte"

type SwitchContext = PrimitiveHandle<typeof switchPrimitive>

const SwitchKey = Symbol("switch")

export { type SwitchContext, SwitchKey }
