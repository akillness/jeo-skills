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
import { useLog } from "../../../shared/react/log"

const languages = [
  { value: "en", label: "English" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "ja", label: "Japanese" },
  { value: "pt", label: "Portuguese" },
  { value: "es", label: "Spanish" },
]

function Example() {
  const log = useLog()

  return (
    <Field>
      <FieldLabel>Languages</FieldLabel>
      <Select
        multiple
        defaultValue={["en", "ja"]}
        placeholder="Select languages"
        onValueChange={(value) => log(`value: ${JSON.stringify(value)}`)}
      >
        <SelectTrigger>
          <SelectValue>
            {(state) =>
              state.placeholder
                ? "Select languages"
                : state.labels.length > 2
                  ? `${state.labels[0]} and ${state.labels.length - 1} more`
                  : state.label
            }
          </SelectValue>
          <ChevronDownIcon />
        </SelectTrigger>
        <SelectContent>
          {languages.map((language) => (
            <SelectItem key={language.value} value={language.value}>
              {language.label}
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
