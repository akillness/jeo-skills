<!--
@component
A polite live region for loading and result counts. Its content is yours, from its children's state.
@stable
-->
<script lang="ts">
  import { command, type CommandStatusState } from "@ui-sdk/core/command"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let props: PartProps<"div", CommandStatusState> = $props()

  const status = usePart(command, "status")
</script>

<Part tag="div" part={status} {props} />
