import { Checkbox, CheckboxIndicator } from "@ui-sdk/react/checkbox"
import { CheckIcon } from "lucide-react"

const tasks = [
  { label: "Write the release notes", done: false },
  { label: "Update the changelog", done: true },
  { label: "Tag the release", done: false },
]

function Example() {
  return (
    <div data-slot="stack">
      {tasks.map((task) => (
        <label data-slot="label" key={task.label}>
          <Checkbox defaultChecked={task.done}>
            <CheckboxIndicator>
              <CheckIcon aria-hidden="true" />
            </CheckboxIndicator>
          </Checkbox>
          {task.label}
        </label>
      ))}
    </div>
  )
}

export { Example }
