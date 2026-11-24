<script lang="ts">
  import {
    TextAlignCenterIcon,
    TextAlignEndIcon,
    TextAlignStartIcon,
  } from "@lucide/svelte"
  import { Toggle, ToggleGroup, ToggleIcon } from "@ui-sdk/svelte/toggle"

  const alignments = [
    {
      value: "start",
      label: "Align start",
      icon: TextAlignStartIcon,
      mirror: true,
    },
    {
      value: "center",
      label: "Align center",
      icon: TextAlignCenterIcon,
      mirror: false,
    },
    { value: "end", label: "Align end", icon: TextAlignEndIcon, mirror: true },
  ]
</script>

<ToggleGroup
  defaultValue={["start"]}
  deselectable={false}
  aria-label="Text alignment"
>
  {#each alignments as item (item.value)}
    <Toggle value={item.value} aria-label={item.label}>
      <ToggleIcon mirror={item.mirror}>
        <item.icon />
      </ToggleIcon>
    </Toggle>
  {/each}
</ToggleGroup>
