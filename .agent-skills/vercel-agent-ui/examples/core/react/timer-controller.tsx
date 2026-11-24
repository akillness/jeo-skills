import * as React from "react"
import {
  createChange,
  createController,
  definePrimitive,
  type ChangeDetails,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"

function createCountdownController() {
  return createController<{
    start: (seconds: number) => void
    stop: () => void
    left: () => number
  }>()
}

type CountdownOptions = {
  controller?: ReturnType<typeof createCountdownController>
  onLeftChange?: (
    left: number,
    details: ChangeDetails<"imperative" | "timeout">
  ) => void
}

type CountdownState = { left: number }

const countdown = definePrimitive({
  name: "countdown",
  options: { controller: "value", onLeftChange: "callback" },
  state: (_options: CountdownOptions): CountdownState => ({ left: 0 }),
  api: (context) => {
    const change = createChange(context)
    let timer: ReturnType<typeof setInterval> | undefined
    context.onDestroy(() => clearInterval(timer))
    return {
      start(seconds: number) {
        clearInterval(timer)
        change("left", seconds, { reason: "imperative" })
        timer = setInterval(() => {
          const left = context.store.get().left - 1
          change("left", left, { reason: "timeout" })
          if (left <= 0) {
            clearInterval(timer)
          }
        }, 1000)
      },
      stop() {
        clearInterval(timer)
        change("left", 0, { reason: "imperative" })
      },
      left: () => context.store.get().left,
    }
  },
  slots: (slot) => ({
    root: slot<{}, CountdownState>({
      state: (state) => ({ left: state.left }),
      attrs: () => ({ role: "timer" }),
    }),
  }),
})

const parts = createParts(countdown, { root: "div" })

const Countdown = parts.Root

function Example() {
  const [controller] = React.useState(createCountdownController)
  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button" onClick={() => controller.start(30)}>
          Start 30 Seconds
        </button>
        <button type="button" onClick={() => controller.stop()}>
          Stop
        </button>
      </div>
      <Countdown controller={controller} aria-label="Tea">
        {({ left }) => `0:${String(left).padStart(2, "0")}`}
      </Countdown>
    </div>
  )
}

export {
  countdown,
  Countdown,
  type CountdownOptions,
  type CountdownState,
  createCountdownController,
  Example,
}
