import { Checkbox } from "@ui-sdk/react/checkbox"
import { CheckIcon, PlusIcon } from "lucide-react"

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
        {topics.map((topic) => (
          <Checkbox
            key={topic.value}
            name="topics"
            value={topic.value}
            defaultChecked={topic.checked}
            render={(props, state) => (
              <button {...props}>
                {state.checked ? <CheckIcon /> : <PlusIcon />}
                {topic.label}
              </button>
            )}
          />
        ))}
      </div>
    </fieldset>
  )
}

export { Example }
