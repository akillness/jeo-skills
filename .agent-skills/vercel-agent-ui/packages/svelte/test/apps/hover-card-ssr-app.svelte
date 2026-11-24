<script lang="ts">
  import {
    HoverCard,
    HoverCardContent,
    HoverCardTrigger,
  } from "../../src/hover-card"

  let { open = false }: { open?: boolean } = $props()
</script>

<HoverCard defaultOpen={open}>
  <HoverCardTrigger href="/ada">@ada</HoverCardTrigger>
  <HoverCardContent>Ada Lovelace</HoverCardContent>
</HoverCard>
