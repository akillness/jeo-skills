"use client"

import { Field, FieldLabel } from "@ui-sdk/react/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectGroupLabel,
  SelectItem,
  SelectItemIndicator,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
  type ListData,
} from "@ui-sdk/react/select"
import { CheckIcon, ChevronDownIcon } from "lucide-react"

const plans = [
  { value: "free", label: "Free" },
  { value: "pro", label: "Pro" },
  { value: "team", label: "Team" },
]

const sales = [
  { value: "enterprise", label: "Enterprise" },
  { value: "education", label: "Education", disabled: true },
]

const items: ListData = [
  ...plans,
  { type: "separator" },
  { type: "group", label: "Contact sales", items: sales },
]

function Example() {
  return (
    <Field>
      <FieldLabel>Plan</FieldLabel>
      <Select items={items} defaultValue="pro">
        <SelectTrigger>
          <SelectValue />
          <ChevronDownIcon />
        </SelectTrigger>
        <SelectContent>
          {plans.map((plan) => (
            <SelectItem key={plan.value} value={plan.value}>
              {plan.label}
              <SelectItemIndicator>
                <CheckIcon />
              </SelectItemIndicator>
            </SelectItem>
          ))}
          <SelectSeparator />
          <SelectGroup>
            <SelectGroupLabel>Contact sales</SelectGroupLabel>
            {sales.map((plan) => (
              <SelectItem
                key={plan.value}
                value={plan.value}
                disabled={plan.disabled}
              >
                {plan.label}
                <SelectItemIndicator>
                  <CheckIcon />
                </SelectItemIndicator>
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  )
}

export { Example }
