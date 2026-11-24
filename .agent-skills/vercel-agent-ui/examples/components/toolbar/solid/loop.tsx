import { Toolbar, ToolbarButton } from "@ui-sdk/solid/toolbar"
import { For } from "solid-js"
import { useLog } from "../../../shared/solid/log"

function Example() {
  const log = useLog()
  return (
    <Toolbar loop={false} aria-label="Pages">
      <For each={["First", "Previous", "Next", "Last"]}>
        {(label) => (
          <ToolbarButton onClick={() => log(`${label} page`)}>
            {label}
          </ToolbarButton>
        )}
      </For>
    </Toolbar>
  )
}

export { Example }
