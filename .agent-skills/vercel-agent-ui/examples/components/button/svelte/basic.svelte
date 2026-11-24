<script lang="ts">
  import { Button } from "@ui-sdk/svelte/button"
  import { useLog } from "../../../shared/svelte/log"

  const log = useLog()
</script>

<Button onclick={() => log("Pressed")}>Button</Button>
