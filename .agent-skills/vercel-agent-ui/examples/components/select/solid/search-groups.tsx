import { Field, FieldLabel } from "@ui-sdk/solid/field"
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
} from "@ui-sdk/solid/select"
import { For } from "solid-js"

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
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </SelectTrigger>
        <SelectContent>
          <SelectInput
            aria-label="Search countries"
            placeholder="Search countries…"
          />
          <SelectEmpty>No countries found.</SelectEmpty>
          <SelectList>
            <For each={regions}>
              {(group) => (
                <SelectGroup>
                  <SelectGroupLabel>{group.label}</SelectGroupLabel>
                  <For each={group.items}>
                    {(item) => (
                      <SelectItem value={item.value} label={item.label}>
                        <SelectItemText>
                          {(state) => (
                            <For each={state.segments}>
                              {(segment) =>
                                segment.match ? (
                                  <b>{segment.text}</b>
                                ) : (
                                  segment.text
                                )
                              }
                            </For>
                          )}
                        </SelectItemText>
                        <SelectItemIndicator>
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
                        </SelectItemIndicator>
                      </SelectItem>
                    )}
                  </For>
                </SelectGroup>
              )}
            </For>
          </SelectList>
        </SelectContent>
      </Select>
    </Field>
  )
}

export { Example }
