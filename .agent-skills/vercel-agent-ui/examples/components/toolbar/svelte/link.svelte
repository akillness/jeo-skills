<script lang="ts">
  import { CheckIcon, MessageSquareIcon } from "@lucide/svelte"
  import {
    Toolbar,
    ToolbarButton,
    ToolbarLink,
    ToolbarSeparator,
  } from "@ui-sdk/svelte/toolbar"
  import { useLog } from "../../../shared/svelte/log"

  const log = useLog()

  function follow(event: MouseEvent & { currentTarget: HTMLAnchorElement }) {
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
</script>

<Toolbar aria-label="Pull request">
  <ToolbarButton aria-label="Approve" onclick={() => log("Approved")}>
    <CheckIcon aria-hidden="true" />
  </ToolbarButton>
  <ToolbarButton aria-label="Comment" onclick={() => log("Comment")}>
    <MessageSquareIcon aria-hidden="true" />
  </ToolbarButton>
  <ToolbarSeparator />
  <ToolbarLink href="#files" onclick={follow}>Files Changed</ToolbarLink>
  <ToolbarLink href="#checks" onclick={follow}>Checks</ToolbarLink>
</Toolbar>
