// Compiled by `pnpm typecheck`, never run. Each `@ts-expect-error` fails the
// build if its line stops being an error.
import { log } from "../src/foundation/kernel/change"
import {
  changeSource,
  createChange,
  createCommit,
} from "../src/foundation/kernel/input-source"
import type {
  ChangeDetails,
  CommitDetails,
} from "../src/foundation/kernel/details"
import { definePrimitive } from "../src/foundation/kernel/primitive"

type Options = {
  onOpenChange?: (
    open: boolean,
    details: ChangeDetails<"trigger-press" | "timeout">
  ) => void
  onValueCommit?: (value: number, details: CommitDetails<"drag">) => void
}

const probe = definePrimitive({
  name: "probe",
  options: { onOpenChange: "callback", onValueCommit: "callback" },
  state: (_options: Options) => ({ open: false, value: 0 }),
  commits: ["value"],
  api: (context) => {
    const withEvents = createChange(context)
    const custom = createChange(context, changeSource)
    const event = new Event("click")
    withEvents("open", true, { reason: "timeout" })
    withEvents("open", true, { reason: "trigger-press", event })
    custom("open", true, { reason: "trigger-press", event })
    // @ts-expect-error `onOpenChange` lists no such reason.
    withEvents("open", true, { reason: "escape-key" })
    // @ts-expect-error The open state takes a boolean.
    withEvents("open", "yes", { reason: "timeout" })
    log(context, "open", true, { reason: "timeout" })
    // @ts-expect-error A log takes the source an event explains, not the event.
    log(context, "open", true, { reason: "trigger-press", event })
    const commit = createCommit(context)
    commit("value", 1, { reason: "drag", event, thumb: 0 })
    // @ts-expect-error `onValueCommit` lists no such reason.
    commit("value", 1, { reason: "timeout" })
    // @ts-expect-error The value takes a number.
    commit("value", "1", { reason: "drag" })
    // @ts-expect-error No `onOpenCommit`, so `open` doesn't commit.
    commit("open", true, { reason: "drag" })
    // @ts-expect-error Changes are opt in, so the context has none.
    void context.change
    return {}
  },
  slots: () => ({}),
})

export { probe }
