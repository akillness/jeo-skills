<script lang="ts">
  import { confirm } from "@ui-sdk/svelte/alert-dialog"
  import { OverlayHost } from "@ui-sdk/svelte/overlays"
  import { useLog } from "../../../shared/svelte/log"

  const log = useLog()

  async function archive() {
    const yes = await confirm({
      title: "Archive this project?",
      description: "It moves to Archived, and you can restore it anytime.",
      confirmLabel: "Archive",
    })
    log(yes ? "Archived the project" : "Kept the project")
  }
</script>

<button type="button" onclick={archive}>Archive Project</button>
<OverlayHost />
