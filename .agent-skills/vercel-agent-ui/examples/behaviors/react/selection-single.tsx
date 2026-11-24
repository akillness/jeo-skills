import * as React from "react"
import {
  createChange,
  createRovingFocus,
  createSelection,
  definePrimitive,
  selects,
  type ChangeDetails,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"
import { useLog } from "../../shared/react/log"

type PlansState = { value: string[]; focused: string | null }

type PlansOptions = {
  onValueChange?: (
    value: string[],
    details: ChangeDetails<"item-press">
  ) => void
  onContinue?: (plan: string) => void
}

const plans = definePrimitive({
  name: "plans",
  options: { onValueChange: "callback", onContinue: "callback" },
  state: (_options: PlansOptions): PlansState => ({ value: [], focused: null }),
  api: (context) => {
    const change = createChange(context)
    const roving = createRovingFocus<PlansState, { value: string }>(context, {
      slot: "plan",
      key: "focused",
      orientation: () => "vertical",
    })
    const selection = createSelection(context, {
      key: "value",
      set: (value, details) => change("value", value, details),
      order: () => roving.items().map((item) => item.key),
    })
    return {
      roving,
      selection,
      keydown(event: KeyboardEvent, el: HTMLElement, key: string) {
        if (event.key === " ") {
          event.preventDefault()
          selection.toggle(key, { reason: "item-press", event })
        } else if (event.key === "Enter" && selection.isSelected(key)) {
          context.options().onContinue?.(key)
        } else {
          roving.keydown(event, el)
        }
      },
    }
  },
  slots: (slot) => ({
    root: slot({ attrs: () => ({ role: "listbox" }) }),
    plan: slot<{ value: string }>({
      props: { value: "string" },
      selects: selects({ focused: ({ key }) => [key, null] }),
      attrs: (state, part) => ({
        role: "option",
        "aria-selected": String(state.value.includes(part.key)),
        tabindex: part.api.roving.tabIndex(state, part),
      }),
      on: {
        keydown: (event, { el, api, key }) => api.keydown(event, el!, key),
        pointerdown: (event, { api, key }) =>
          api.selection.choose(key, { reason: "item-press", event }),
      },
      bind: (el, part) => part.api.roving.bind(el, part),
    }),
  }),
})

const parts = createParts(plans, { root: "div", plan: "div" })

const Plans = parts.Root

const PlansPlan = parts.Plan

const options = [
  { name: "Free", price: "$0" },
  { name: "Pro", price: "$12 / month" },
  { name: "Team", price: "$30 / month" },
]

function Example() {
  const log = useLog()
  return (
    <Plans
      aria-label="Plan"
      onValueChange={(value: string[]) =>
        log(value.length ? `Chose ${value[0]}` : "Cleared the plan")
      }
      onContinue={(plan: string) => log(`Continuing with ${plan}`)}
    >
      {options.map(({ name, price }) => (
        <PlansPlan key={name} value={name}>
          {name}
          <span data-slot="hint">{price}</span>
        </PlansPlan>
      ))}
    </Plans>
  )
}

export { Example, plans, Plans, PlansPlan, type PlansOptions, type PlansState }
