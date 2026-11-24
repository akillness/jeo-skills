import { Field, FieldLabel } from "@ui-sdk/solid/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/solid/select"
import { For } from "solid-js"
import { useLog } from "../../../shared/solid/log"

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
          <For each={languages}>
            {(language) => (
              <SelectItem value={language.value}>
                {language.label}
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
  )
}

export { Example }
