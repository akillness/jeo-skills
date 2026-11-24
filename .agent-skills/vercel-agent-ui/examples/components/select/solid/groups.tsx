import { Field, FieldLabel } from "@ui-sdk/solid/field"
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
} from "@ui-sdk/solid/select"
import { For, Show } from "solid-js"

const fonts = [
  {
    label: "Sans serif",
    items: [
      { value: "inter", label: "Inter" },
      { value: "geist", label: "Geist" },
    ],
  },
  {
    label: "Serif",
    items: [
      { value: "source-serif", label: "Source Serif" },
      { value: "lora", label: "Lora" },
    ],
  },
  {
    label: "Monospace",
    items: [
      { value: "geist-mono", label: "Geist Mono" },
      { value: "jetbrains-mono", label: "JetBrains Mono" },
    ],
  },
]

function Example() {
  return (
    <Field>
      <FieldLabel>Font</FieldLabel>
      <Select placeholder="Select a font">
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
          <For each={fonts}>
            {(group, index) => (
              <>
                <Show when={index() > 0}>
                  <SelectSeparator />
                </Show>
                <SelectGroup>
                  <SelectGroupLabel>{group.label}</SelectGroupLabel>
                  <For each={group.items}>
                    {(item) => (
                      <SelectItem value={item.value}>
                        {item.label}
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
              </>
            )}
          </For>
        </SelectContent>
      </Select>
    </Field>
  )
}

export { Example }
