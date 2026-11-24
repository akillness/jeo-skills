<!--
@component
Shown while no command matches. Its message is announced when it appears. Place it outside the list.
@stable
-->
<script lang="ts">
  import { command, type CommandEmptyState } from "@ui-sdk/core/command"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let { children, ...rest }: PartProps<"div", CommandEmptyState> = $props()

  const empty = usePart(command, "empty")
</script>

{#snippet whenEmpty(state: CommandEmptyState)}
  {#if state.empty}{@render children?.(state)}{/if}
{/snippet}

<Part tag="div" part={empty} props={{ ...rest, children: whenEmpty }} />
