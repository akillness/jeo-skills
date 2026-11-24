import * as React from "react"
import {
  bindDrag,
  createChange,
  definePrimitive,
  dragThreshold,
  type ChangeDetails,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"
import { Checkbox, CheckboxIndicator } from "@ui-sdk/react/checkbox"
import { CheckIcon } from "lucide-react"

type ScrubState = { value: number }

type ScrubOptions = {
  locked?: boolean
  onValueChange?: (
    value: number,
    details: ChangeDetails<"drag" | "keyboard">
  ) => void
}

const clamp = (value: number) => Math.round(Math.min(100, Math.max(0, value)))

const scrub = definePrimitive({
  name: "scrub",
  options: { locked: "boolean", onValueChange: "callback" },
  state: (_options: ScrubOptions): ScrubState => ({ value: 50 }),
  api: (context) => {
    const { store } = context
    const change = createChange(context)
    let stop: (() => void) | undefined
    context.onDestroy(() => stop?.())
    return {
      pointerdown(event: PointerEvent, el: HTMLElement) {
        stop?.()
        stop = bindDrag(el, event, {
          threshold: dragThreshold,
          lock: true,
          onStart: () => !context.options().locked,
          onMove: ({ movementX, event }) =>
            change("value", clamp(store.get().value + movementX / 2), {
              reason: "drag",
              event,
            }),
          onEnd: () => (stop = undefined),
        })
      },
      keydown(event: KeyboardEvent) {
        const by = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[
          event.key
        ]
        if (!by) {
          return
        }
        event.preventDefault()
        change("value", clamp(store.get().value + by), {
          reason: "keyboard",
          event,
        })
      },
    }
  },
  slots: (slot) => ({
    root: slot<{}, ScrubState>({
      state: (state) => ({ value: state.value }),
      attrs: (state) => ({
        role: "slider",
        tabindex: "0",
        "aria-valuemin": "0",
        "aria-valuemax": "100",
        "aria-valuenow": String(state.value),
        style: "touch-action:none;user-select:none;cursor:ew-resize",
      }),
      on: {
        pointerdown: (event, { el, api }) => api.pointerdown(event, el!),
        keydown: (event, { api }) => api.keydown(event),
      },
    }),
  }),
})

const parts = createParts(scrub, { root: "div" })

const Scrub = parts.Root

function Example() {
  const [locked, setLocked] = React.useState(false)
  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <label data-slot="label">
          <Checkbox
            checked={locked}
            onCheckedChange={(next) => setLocked(next === true)}
          >
            <CheckboxIndicator>
              <CheckIcon aria-hidden="true" />
            </CheckboxIndicator>
          </Checkbox>
          Locked
        </label>
      </div>
      <Scrub aria-label="Opacity" locked={locked}>
        {({ value }) => (
          <>
            <span data-slot="hint">Opacity</span>
            <span>{value}%</span>
          </>
        )}
      </Scrub>
    </div>
  )
}

export { Example }
