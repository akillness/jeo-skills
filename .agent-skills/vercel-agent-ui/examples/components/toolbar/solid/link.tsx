import {
  Toolbar,
  ToolbarButton,
  ToolbarLink,
  ToolbarSeparator,
} from "@ui-sdk/solid/toolbar"
import { useLog } from "../../../shared/solid/log"

function Example() {
  const log = useLog()
  const follow = (event: MouseEvent & { currentTarget: HTMLAnchorElement }) => {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return
    }
    event.preventDefault()
    log(`Opened ${event.currentTarget.textContent}`)
  }
  return (
    <Toolbar aria-label="Pull request">
      <ToolbarButton aria-label="Approve" onClick={() => log("Approved")}>
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
      </ToolbarButton>
      <ToolbarButton aria-label="Comment" onClick={() => log("Comment")}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z" />
        </svg>
      </ToolbarButton>
      <ToolbarSeparator />
      <ToolbarLink href="#files" onClick={follow}>
        Files Changed
      </ToolbarLink>
      <ToolbarLink href="#checks" onClick={follow}>
        Checks
      </ToolbarLink>
    </Toolbar>
  )
}

export { Example }
