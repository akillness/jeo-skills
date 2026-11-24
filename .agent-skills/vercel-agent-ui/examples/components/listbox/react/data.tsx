"use client"

import {
  Listbox,
  ListboxItem,
  ListboxItemIndicator,
  type ListData,
} from "@ui-sdk/react/listbox"
import { CheckIcon } from "lucide-react"
import { useLog } from "../../../shared/react/log"

const plans = [
  { value: { id: "hobby", price: 0 }, label: "Hobby" },
  { value: { id: "pro", price: 20 }, label: "Pro" },
  { value: { id: "team", price: 50 }, label: "Team" },
  {
    value: { id: "enterprise", price: 200 },
    label: "Enterprise",
    disabled: true,
  },
] satisfies ListData<{ id: string; price: number }>

function Example() {
  const log = useLog()

  return (
    <Listbox
      items={plans}
      defaultValue={plans[1].value}
      onValueChange={(plan) =>
        log(plan ? `${plan.id}, $${plan.price} a month` : "No plan")
      }
      itemToValue={(plan) => plan.id}
      isItemEqualToValue={(plan, selected) => plan.id === selected.id}
      aria-label="Plan"
    >
      {plans.map((plan) => (
        <ListboxItem
          key={plan.value.id}
          value={plan.value}
          disabled={plan.disabled}
        >
          {plan.label}
          <ListboxItemIndicator>
            <CheckIcon aria-hidden="true" />
          </ListboxItemIndicator>
        </ListboxItem>
      ))}
    </Listbox>
  )
}

export { Example }
