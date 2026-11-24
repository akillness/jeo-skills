<script lang="ts">
  import { Button } from "../../src/button"

  let { log }: { log: (entry: string) => void } = $props()
</script>

<Button onclick={(event, { source }) => log(`${event.type}:${source}`)}
  >Save</Button
>
