"use client"

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@ui-sdk/react/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/react/select"
import { CheckIcon, ChevronDownIcon } from "lucide-react"
import { useLog } from "../../../shared/react/log"

const methods = [
  { value: "standard", label: "Standard" },
  { value: "express", label: "Express" },
  { value: "overnight", label: "Overnight" },
]

function Example() {
  const log = useLog()

  return (
    <form
      data-slot="stack"
      onSubmit={(event) => {
        event.preventDefault()
        log(
          `Submitted shipping=${new FormData(event.currentTarget).get("shipping")}`
        )
      }}
    >
      <Field name="shipping">
        <FieldLabel>Shipping method</FieldLabel>
        <Select required placeholder="Select a shipping method">
          <SelectTrigger>
            <SelectValue />
            <ChevronDownIcon />
          </SelectTrigger>
          <SelectContent>
            {methods.map((method) => (
              <SelectItem key={method.value} value={method.value}>
                {method.label}
                <SelectItemIndicator>
                  <CheckIcon />
                </SelectItemIndicator>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldDescription>
          Express arrives in two business days.
        </FieldDescription>
        <FieldError match="valueMissing">Choose a shipping method.</FieldError>
      </Field>
      <button type="submit" data-variant="solid">
        Continue
      </button>
    </form>
  )
}

export { Example }
