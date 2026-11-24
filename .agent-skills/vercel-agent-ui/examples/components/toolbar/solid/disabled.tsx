import { Toolbar, ToolbarButton } from "@ui-sdk/solid/toolbar"
import { useLog } from "../../../shared/solid/log"

function Example() {
  const log = useLog()
  return (
    <Toolbar aria-label="Message">
      <ToolbarButton onClick={() => log("Reply")}>Reply</ToolbarButton>
      <ToolbarButton disabled onClick={() => log("Archive")}>
        Archive
      </ToolbarButton>
      <ToolbarButton
        disabled
        focusableWhenDisabled={false}
        onClick={() => log("Delete")}
      >
        Delete
      </ToolbarButton>
    </Toolbar>
  )
}

export { Example }
