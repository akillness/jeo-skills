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

const countries = [
  { value: "au", label: "Australia" },
  { value: "br", label: "Brazil" },
  { value: "ca", label: "Canada" },
  { value: "fr", label: "France" },
  { value: "de", label: "Germany" },
  { value: "jp", label: "Japan" },
  { value: "es", label: "Spain" },
  { value: "se", label: "Sweden" },
]

const topics = ["Design", "Engineering", "Marketing", "Research", "Sales"]

const frequencies = ["Daily", "Weekly", "Monthly"]

function Example() {
  const log = useLog()

  return (
    <div data-slot="stack">
      <form
        id="select-newsletter"
        data-slot="stack"
        onSubmit={(event) => {
          event.preventDefault()
          const entries = [...new FormData(event.currentTarget)].map(
            ([name, value]) => `${name}=${value}`
          )
          log(`Submitted ${entries.join("&")}`)
        }}
      >
        <Field>
          <FieldLabel>Country</FieldLabel>
          <Select
            name="country"
            autoComplete="country"
            required
            placeholder="Select a country"
          >
            <SelectTrigger>
              <SelectValue />
              <ChevronDownIcon />
            </SelectTrigger>
            <SelectContent>
              {countries.map((country) => (
                <SelectItem key={country.value} value={country.value}>
                  {country.label}
                  <SelectItemIndicator>
                    <CheckIcon />
                  </SelectItemIndicator>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel>Topics</FieldLabel>
          <Select name="topics" multiple defaultValue={["Design"]}>
            <SelectTrigger>
              <SelectValue />
              <ChevronDownIcon />
            </SelectTrigger>
            <SelectContent>
              {topics.map((topic) => (
                <SelectItem key={topic} value={topic}>
                  {topic}
                  <SelectItemIndicator>
                    <CheckIcon />
                  </SelectItemIndicator>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </form>
      <Field>
        <FieldLabel>Frequency</FieldLabel>
        <Select name="frequency" form="select-newsletter" defaultValue="Weekly">
          <SelectTrigger>
            <SelectValue />
            <ChevronDownIcon />
          </SelectTrigger>
          <SelectContent>
            {frequencies.map((frequency) => (
              <SelectItem key={frequency} value={frequency}>
                {frequency}
                <SelectItemIndicator>
                  <CheckIcon />
                </SelectItemIndicator>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <div data-slot="row">
        <button type="submit" form="select-newsletter" data-variant="solid">
          Save
        </button>
        <button type="reset" form="select-newsletter">
          Reset
        </button>
      </div>
    </div>
  )
}

export { Example }
