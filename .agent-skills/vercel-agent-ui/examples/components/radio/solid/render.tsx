import { Field, FieldLabel } from "@ui-sdk/solid/field"
import { Radio, RadioGroup } from "@ui-sdk/solid/radio"
import { createUniqueId, For } from "solid-js"

const options = [
  {
    value: "all",
    label: "Everything",
    description: "Every message and update.",
  },
  {
    value: "mentions",
    label: "Mentions",
    description: "Only when someone mentions you.",
  },
  { value: "none", label: "Nothing", description: "Turn notifications off." },
]

function Example() {
  const id = createUniqueId()
  return (
    <Field>
      <FieldLabel>Notify me about</FieldLabel>
      <RadioGroup defaultValue="mentions">
        <For each={options}>
          {(option) => (
            <Radio
              value={option.value}
              aria-labelledby={`${id}-${option.value}-label`}
              aria-describedby={`${id}-${option.value}-description`}
              render={(props, state) => (
                <button {...props}>
                  <span data-slot="stack">
                    <span id={`${id}-${option.value}-label`}>
                      {option.label}
                    </span>
                    <span
                      data-slot="hint"
                      id={`${id}-${option.value}-description`}
                    >
                      {option.description}
                    </span>
                  </span>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                    data-checked={state.checked ? "" : undefined}
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </button>
              )}
            />
          )}
        </For>
      </RadioGroup>
    </Field>
  )
}

export { Example }
