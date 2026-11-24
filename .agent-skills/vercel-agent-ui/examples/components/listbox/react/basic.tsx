"use client"

import { Field, FieldDescription, FieldLabel } from "@ui-sdk/react/field"
import {
  Listbox,
  ListboxItem,
  ListboxItemIndicator,
} from "@ui-sdk/react/listbox"
import { CheckIcon } from "lucide-react"

const topics = [
  { value: "comments", label: "Comments" },
  { value: "mentions", label: "Mentions" },
  { value: "reactions", label: "Reactions" },
  { value: "sign-ins", label: "New sign-ins" },
  { value: "billing", label: "Billing" },
]

function Example() {
  return (
    <Field>
      <FieldLabel>Email me about</FieldLabel>
      <Listbox multiple activation="automatic" defaultValue={["mentions"]}>
        {topics.map((topic) => (
          <ListboxItem key={topic.value} value={topic.value}>
            {topic.label}
            <ListboxItemIndicator>
              <CheckIcon aria-hidden="true" />
            </ListboxItemIndicator>
          </ListboxItem>
        ))}
      </Listbox>
      <FieldDescription>
        Hold Shift to select a range, or Ctrl or ⌘ to add one.
      </FieldDescription>
    </Field>
  )
}

export { Example }
