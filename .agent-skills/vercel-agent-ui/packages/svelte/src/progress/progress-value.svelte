<!--
@component
The formatted value, like "40%". Content replaces it.
@stable
-->
<script lang="ts">
  import { progress, type ProgressValueState } from "@ui-sdk/core/progress"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let { children, ...rest }: PartProps<"span", ProgressValueState> = $props()

  const value = usePart(progress, "value")
</script>

{#snippet text(state: ProgressValueState)}{state.text}{/snippet}

<Part tag="span" part={value} props={{ ...rest, children: children ?? text }} />
