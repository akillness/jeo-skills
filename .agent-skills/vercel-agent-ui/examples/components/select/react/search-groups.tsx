"use client"

import { Field, FieldLabel } from "@ui-sdk/react/field"
import {
  Select,
  SelectContent,
  SelectEmpty,
  SelectGroup,
  SelectGroupLabel,
  SelectInput,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectList,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/react/select"
import { CheckIcon, ChevronDownIcon } from "lucide-react"

const regions = [
  {
    label: "Americas",
    items: [
      { value: "br", label: "Brazil" },
      { value: "ca", label: "Canada" },
      { value: "mx", label: "Mexico" },
    ],
  },
  {
    label: "Europe",
    items: [
      { value: "fr", label: "France" },
      { value: "de", label: "Germany" },
      { value: "es", label: "Spain" },
    ],
  },
  {
    label: "Asia Pacific",
    items: [
      { value: "au", label: "Australia" },
      { value: "jp", label: "Japan" },
      { value: "sg", label: "Singapore" },
    ],
  },
]

function Example() {
  return (
    <Field>
      <FieldLabel>Country</FieldLabel>
      <Select placeholder="Select a country">
        <SelectTrigger>
          <SelectValue />
          <ChevronDownIcon />
        </SelectTrigger>
        <SelectContent>
          <SelectInput
            aria-label="Search countries"
            placeholder="Search countries…"
          />
          <SelectEmpty>No countries found.</SelectEmpty>
          <SelectList>
            {regions.map((group) => (
              <SelectGroup key={group.label}>
                <SelectGroupLabel>{group.label}</SelectGroupLabel>
                {group.items.map((item) => (
                  <SelectItem
                    key={item.value}
                    value={item.value}
                    label={item.label}
                  >
                    <SelectItemText>
                      {(state) =>
                        state.segments.map((segment, index) =>
                          segment.match ? (
                            <b key={index}>{segment.text}</b>
                          ) : (
                            segment.text
                          )
                        )
                      }
                    </SelectItemText>
                    <SelectItemIndicator>
                      <CheckIcon />
                    </SelectItemIndicator>
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectList>
        </SelectContent>
      </Select>
    </Field>
  )
}

export { Example }
