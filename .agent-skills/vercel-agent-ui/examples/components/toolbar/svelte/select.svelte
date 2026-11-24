<script lang="ts">
  import {
    CheckIcon,
    ChevronsUpDownIcon,
    ZoomInIcon,
    ZoomOutIcon,
  } from "@lucide/svelte"
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectItemIndicator,
    SelectTrigger,
    SelectValue,
  } from "@ui-sdk/svelte/select"
  import { Toolbar, ToolbarButton } from "@ui-sdk/svelte/toolbar"
  import { useLog } from "../../../shared/svelte/log"

  const zooms = ["50%", "75%", "100%", "150%", "200%"]

  const log = useLog()
  let zoom = $state("100%")
  const index = $derived(zooms.indexOf(zoom))

  function change(value: string) {
    zoom = value
    log(`Zoom ${value}`)
  }
</script>

<Toolbar aria-label="View">
  <ToolbarButton
    aria-label="Zoom out"
    disabled={index === 0}
    onclick={() => change(zooms[index - 1])}
  >
    <ZoomOutIcon aria-hidden="true" />
  </ToolbarButton>
  <Select value={zoom} onValueChange={(value) => value && change(value)}>
    <ToolbarButton aria-label="Zoom">
      {#snippet render({ props })}
        <SelectTrigger {...props}>
          <SelectValue />
          <ChevronsUpDownIcon aria-hidden="true" />
        </SelectTrigger>
      {/snippet}
    </ToolbarButton>
    <SelectContent>
      {#each zooms as zoom (zoom)}
        <SelectItem value={zoom}>
          {zoom}
          <SelectItemIndicator>
            <CheckIcon aria-hidden="true" />
          </SelectItemIndicator>
        </SelectItem>
      {/each}
    </SelectContent>
  </Select>
  <ToolbarButton
    aria-label="Zoom in"
    disabled={index === zooms.length - 1}
    onclick={() => change(zooms[index + 1])}
  >
    <ZoomInIcon aria-hidden="true" />
  </ToolbarButton>
</Toolbar>
