<script lang="ts">
  import { usePrimitive } from "@ui-sdk/svelte/primitive"
  import { rating } from "../rating-stages/state"

  const id = $props.id()
  let value = $state(0)
  const handle = usePrimitive(rating, () => ({
    id,
    onValueChange: (next: number) => (value = next),
  }))
</script>

<div data-slot="stack">
  <div data-slot="controls">
    <button
      type="button"
      data-size="sm"
      onclick={(event) => handle.api.rate(3, event)}
    >
      Set to 3
    </button>
    <button
      type="button"
      data-size="sm"
      onclick={(event) => handle.api.rate(0, event)}
    >
      Reset
    </button>
  </div>
  <div data-slot="rating-readout">
    <output data-slot="rating-value" data-value aria-label="Rating">
      {value}
    </output>
    <span data-slot="hint">Rating</span>
  </div>
</div>
