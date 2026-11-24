import { Checkbox } from "@ui-sdk/solid/checkbox"
import { For } from "solid-js"

const topics = [
  { value: "design", label: "Design", checked: true },
  { value: "engineering", label: "Engineering", checked: false },
  { value: "marketing", label: "Marketing", checked: false },
  { value: "sales", label: "Sales", checked: false },
]

function Example() {
  return (
    <fieldset>
      <legend>Topics you follow</legend>
      <div data-slot="row">
        <For each={topics}>
          {(topic) => (
            <Checkbox
              name="topics"
              value={topic.value}
              defaultChecked={topic.checked}
              render={(props, state) => (
                <button {...props}>
                  {state.checked ? (
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
                  ) : (
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M5 12h14" />
                      <path d="M12 5v14" />
                    </svg>
                  )}
                  {topic.label}
                </button>
              )}
            />
          )}
        </For>
      </div>
    </fieldset>
  )
}

export { Example }
