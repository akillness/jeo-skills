<script lang="ts">
  import { StarIcon } from "@lucide/svelte"
  import { Toggle, ToggleIcon } from "@ui-sdk/svelte/toggle"
</script>

<div data-slot="card">
  <div data-slot="stack">
    <h3>Q3 Roadmap</h3>
    <p data-slot="hint">Edited by Hollis Grant</p>
  </div>
  <Toggle aria-label="Star">
    <ToggleIcon data-variant="fill">
      <StarIcon />
    </ToggleIcon>
  </Toggle>
</div>
