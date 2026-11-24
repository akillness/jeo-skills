// Checked by svelte-check, not run: a content's `Payload` types its state's
// payload, and without one the payload is unknown.
import type { ComponentProps, Snippet } from "svelte"
import { TooltipContent } from "../../src/tooltip"

type Day = { count: number }
type StateOf<Props> = Props extends { children?: Snippet<[infer State]> }
  ? State
  : never
type DayPayload = StateOf<ComponentProps<typeof TooltipContent<Day>>>["payload"]
type DefaultPayload = StateOf<ComponentProps<typeof TooltipContent>>["payload"]
type IsUnknown<T> = unknown extends T ? true : false

const day: DayPayload = { count: 3 }
// @ts-expect-error A day has no `name`.
const notDay: DayPayload = { name: "Mon" }
const dayIsKnown: IsUnknown<DayPayload> = false
const defaultIsUnknown: IsUnknown<DefaultPayload> = true

export { day, dayIsKnown, defaultIsUnknown, notDay }
