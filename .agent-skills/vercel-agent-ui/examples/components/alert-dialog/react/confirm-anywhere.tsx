import { confirm } from "@ui-sdk/react/alert-dialog"
import { OverlayHost } from "@ui-sdk/react/overlays"
import { useLog } from "../../../shared/react/log"

function Example() {
  const log = useLog()

  async function archive() {
    const yes = await confirm({
      title: "Archive this project?",
      description: "It moves to Archived, and you can restore it anytime.",
      confirmLabel: "Archive",
    })
    log(yes ? "Archived the project" : "Kept the project")
  }

  return (
    <>
      <button type="button" onClick={archive}>
        Archive Project
      </button>
      <OverlayHost />
    </>
  )
}

export { Example }
