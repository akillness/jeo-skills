"use client"

import { Field, FieldLabel } from "@ui-sdk/react/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/react/select"
import { CheckIcon, ChevronDownIcon } from "lucide-react"

const members = [
  { value: "hollis", name: "Hollis Grant", email: "hollis@example.com" },
  { value: "ines", name: "Inès Moreau", email: "ines@example.com" },
  { value: "kofi", name: "Kofi Mensah", email: "kofi@example.com" },
  { value: "wren", name: "Wren Takahashi", email: "wren@example.com" },
]

function Example() {
  return (
    <Field>
      <FieldLabel>Reviewer</FieldLabel>
      <Select defaultValue="hollis">
        <SelectTrigger
          render={(props) => (
            <button {...props}>
              {props.children}
              <ChevronDownIcon />
            </button>
          )}
        >
          <SelectValue>
            {(state) => (
              <>
                <span data-slot="badge">{state.label.slice(0, 1)}</span>
                {state.label}
              </>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {members.map((member) => (
            <SelectItem
              key={member.value}
              value={member.value}
              label={member.name}
              disabled={member.value === "wren"}
            >
              {(state) => (
                <>
                  <span data-slot="badge">{member.name.slice(0, 1)}</span>
                  <span data-slot="stack">
                    {member.name}
                    <span data-slot="hint">
                      {state.disabled ? "Out of office" : member.email}
                    </span>
                  </span>
                  <SelectItemIndicator
                    render={(props, indicator) => (
                      <span {...props}>
                        {indicator.selected && <CheckIcon />}
                      </span>
                    )}
                  />
                </>
              )}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}

export { Example }
