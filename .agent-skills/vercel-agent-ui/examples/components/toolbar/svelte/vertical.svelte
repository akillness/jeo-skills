<script lang="ts">
  import {
    MousePointer2Icon,
    PencilIcon,
    SquareIcon,
    Trash2Icon,
    TypeIcon,
  } from "@lucide/svelte"
  import { Toggle, ToggleGroup, ToggleIcon } from "@ui-sdk/svelte/toggle"
  import {
    Toolbar,
    ToolbarButton,
    ToolbarSeparator,
  } from "@ui-sdk/svelte/toolbar"
  import { useLog } from "../../../shared/svelte/log"

  const tools = [
    { value: "select", label: "Select", icon: MousePointer2Icon },
    { value: "draw", label: "Draw", icon: PencilIcon },
    { value: "shape", label: "Shape", icon: SquareIcon },
    { value: "text", label: "Text", icon: TypeIcon },
  ]

  const log = useLog()
</script>

<Toolbar orientation="vertical" aria-label="Canvas">
  <ToggleGroup
    defaultValue={["select"]}
    deselectable={false}
    orientation="vertical"
    aria-label="Tool"
    onValueChange={([value]) =>
      log(`${tools.find((tool) => tool.value === value)?.label} tool`)}
  >
    {#each tools as { value, label, icon: Icon } (value)}
      <Toggle {value} aria-label={label}>
        <ToggleIcon>
          <Icon />
        </ToggleIcon>
      </Toggle>
    {/each}
  </ToggleGroup>
  <ToolbarSeparator />
  <ToolbarButton aria-label="Delete" onclick={() => log("Deleted selection")}>
    <Trash2Icon aria-hidden="true" />
  </ToolbarButton>
</Toolbar>
