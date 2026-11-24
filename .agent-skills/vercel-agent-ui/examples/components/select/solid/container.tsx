import { Field, FieldLabel } from "@ui-sdk/solid/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/solid/select"
import { createSignal, For } from "solid-js"

const fonts = [
  { value: "inter", label: "Inter" },
  { value: "geist", label: "Geist" },
  { value: "source-serif", label: "Source Serif" },
  { value: "geist-mono", label: "Geist Mono" },
]

function Example() {
  const [container, setContainer] = createSignal<HTMLDivElement | null>(null)

  return (
    <div data-slot="stack">
      <Field>
        <FieldLabel>Font</FieldLabel>
        <Select container={container()} defaultValue="inter">
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
              {(font) => (
                <SelectItem value={font.value}>
                  {font.label}
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
          </SelectContent>
        </Select>
      </Field>
      <div ref={setContainer} data-slot="card" />
    </div>
  )
}

export { Example }
