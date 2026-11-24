import { Toggle, ToggleIcon } from "@ui-sdk/react/toggle"
import { StarIcon } from "lucide-react"

function Example() {
  return (
    <div data-slot="card">
      <div data-slot="stack">
        <h3>Q3 Roadmap</h3>
        <p data-slot="hint">Edited by Hollis Grant</p>
      </div>
      <Toggle aria-label="Star">
        <ToggleIcon data-variant="fill">
          <StarIcon />
        </ToggleIcon>
      </Toggle>
    </div>
  )
}

export { Example }
