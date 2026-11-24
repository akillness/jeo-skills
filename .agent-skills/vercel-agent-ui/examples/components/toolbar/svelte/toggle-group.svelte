<script lang="ts">
  import {
    AlignCenterIcon,
    AlignLeftIcon,
    AlignRightIcon,
    ListIcon,
    ListOrderedIcon,
  } from "@lucide/svelte"
  import { Toggle, ToggleGroup, ToggleIcon } from "@ui-sdk/svelte/toggle"
  import { Toolbar, ToolbarSeparator } from "@ui-sdk/svelte/toolbar"
  import { useLog } from "../../../shared/svelte/log"

  const alignments = [
    { value: "left", label: "Align left", icon: AlignLeftIcon },
    { value: "center", label: "Align center", icon: AlignCenterIcon },
    { value: "right", label: "Align right", icon: AlignRightIcon },
  ]

  const lists = [
    { value: "bulleted", label: "Bulleted list", icon: ListIcon },
    { value: "numbered", label: "Numbered list", icon: ListOrderedIcon },
  ]

  const log = useLog()
</script>

<Toolbar aria-label="Paragraph">
  <ToggleGroup
    defaultValue={["left"]}
    deselectable={false}
    aria-label="Alignment"
    onValueChange={([value]) => log(`Align ${value}`)}
  >
    {#each alignments as { value, label, icon: Icon } (value)}
      <Toggle {value} aria-label={label}>
        <ToggleIcon>
          <Icon />
        </ToggleIcon>
      </Toggle>
    {/each}
  </ToggleGroup>
  <ToolbarSeparator />
  <ToggleGroup
    aria-label="List"
    onValueChange={([value]) =>
      log(lists.find((list) => list.value === value)?.label ?? "No list")}
  >
    {#each lists as { value, label, icon: Icon } (value)}
      <Toggle {value} aria-label={label}>
        <ToggleIcon>
          <Icon />
        </ToggleIcon>
      </Toggle>
    {/each}
  </ToggleGroup>
</Toolbar>
