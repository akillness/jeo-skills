"use client"

import { Field, FieldLabel } from "@ui-sdk/react/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectSelectAll,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/react/select"
import { CheckIcon, ChevronDownIcon, MinusIcon } from "lucide-react"

const regions = [
  { value: "us-east", label: "US East" },
  { value: "us-west", label: "US West" },
  { value: "europe", label: "Europe" },
  { value: "asia-pacific", label: "Asia Pacific" },
  { value: "south-america", label: "South America" },
]

function Example() {
  return (
    <Field>
      <FieldLabel>Regions</FieldLabel>
      <Select
        multiple
        defaultValue={["us-east", "europe", "asia-pacific"]}
        placeholder="Select regions"
      >
        <SelectTrigger>
          <SelectValue
            maxLabels={2}
            getMoreLabel={(count) => `${count} more`}
          />
          <ChevronDownIcon />
        </SelectTrigger>
        <SelectContent>
          <SelectSelectAll>
            {(state) => (
              <>
                Select all
                {state.checked && <CheckIcon />}
                {state.indeterminate && <MinusIcon />}
              </>
            )}
          </SelectSelectAll>
          <SelectSeparator />
          {regions.map((region) => (
            <SelectItem key={region.value} value={region.value}>
              {region.label}
              <SelectItemIndicator>
                <CheckIcon />
              </SelectItemIndicator>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}

export { Example }
