<script lang="ts">
  import {
    HoverCard,
    HoverCardContent,
    HoverCardTrigger,
  } from "@ui-sdk/svelte/hover-card"
</script>

<HoverCard>
  <HoverCardTrigger href="https://example.com/people/hollis"
    >@hollis</HoverCardTrigger
  >
  <HoverCardContent>
    <div data-slot="row">
      <span data-slot="initials" aria-hidden="true">HG</span>
      <div data-slot="stack">
        <p>Hollis Grant</p>
        <p>
          Design engineer on the payments team. Writes about forms and motion.
        </p>
        <p data-slot="hint">Joined March 2021</p>
      </div>
    </div>
  </HoverCardContent>
</HoverCard>
