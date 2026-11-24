import { Checkbox, CheckboxIndicator } from "@ui-sdk/solid/checkbox"
import { For } from "solid-js"

const tasks = [
  { label: "Write the release notes", done: false },
  { label: "Update the changelog", done: true },
  { label: "Tag the release", done: false },
]

function Example() {
  return (
    <div data-slot="stack">
      <For each={tasks}>
        {(task) => (
          <label data-slot="label">
            <Checkbox defaultChecked={task.done}>
              <CheckboxIndicator>
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
              </CheckboxIndicator>
            </Checkbox>
            {task.label}
          </label>
        )}
      </For>
    </div>
  )
}

export { Example }
