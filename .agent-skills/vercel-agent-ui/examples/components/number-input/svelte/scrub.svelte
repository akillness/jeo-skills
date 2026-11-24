<script lang="ts">
  import { MoveHorizontalIcon } from "@lucide/svelte"
  import {
    NumberInput,
    NumberInputControl,
    NumberInputGroup,
    NumberInputScrubArea,
    NumberInputScrubAreaCursor,
  } from "@ui-sdk/svelte/number-input"
  import { useLog } from "../../../shared/svelte/log"

  const fields = [
    { label: "X position", handle: "X", defaultValue: 120 },
    { label: "Y position", handle: "Y", defaultValue: 48 },
    { label: "Width", handle: "W", defaultValue: 320, min: 0 },
    { label: "Height", handle: "H", defaultValue: 240, min: 0 },
  ]

  const log = useLog()
  const title = $props.id()
</script>

<div data-slot="card" role="group" aria-labelledby={title}>
  <h3 id={title}>Frame</h3>
  <div data-slot="grid">
    {#each fields as { label, handle, ...options } (label)}
      <NumberInput
        {...options}
        onValueCommit={(value) => log(`${label} ${value ?? "empty"}`)}
      >
        <NumberInputGroup>
          <NumberInputScrubArea pixelsPerStep={1}>
            <span aria-hidden="true">{handle}</span>
            <NumberInputScrubAreaCursor>
              <MoveHorizontalIcon aria-hidden="true" />
            </NumberInputScrubAreaCursor>
          </NumberInputScrubArea>
          <NumberInputControl aria-label={label} />
        </NumberInputGroup>
      </NumberInput>
    {/each}
  </div>
</div>
