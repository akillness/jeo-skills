<script lang="ts">
  import {
    createTooltipController,
    Tooltip,
    TooltipContent,
    TooltipShortcut,
    TooltipTrigger,
  } from "../../src/tooltip"

  // A tooltip with a shortcut, one whose trigger sits outside it, or one that labels an icon button.
  let { variant = "shortcut" }: { variant?: "shortcut" | "remote" | "label" } =
    $props()

  const save = createTooltipController()
</script>

{#if variant === "remote"}
  <TooltipTrigger controller={save}>Save<TooltipShortcut /></TooltipTrigger>
  <Tooltip controller={save} shortcut="mod+s"
    ><TooltipContent>Save your changes</TooltipContent></Tooltip
  >
{:else if variant === "label"}
  <Tooltip type="label">
    <TooltipTrigger><svg aria-hidden="true"></svg></TooltipTrigger>
    <TooltipContent>Bold</TooltipContent>
  </Tooltip>
{:else}
  <Tooltip shortcut="mod+s">
    <TooltipTrigger>Save</TooltipTrigger>
    <TooltipContent>Save your changes<TooltipShortcut /></TooltipContent>
  </Tooltip>
{/if}
