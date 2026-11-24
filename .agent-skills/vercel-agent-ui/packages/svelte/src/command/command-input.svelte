<!--
@component
The search field. It keeps focus while arrow keys move the highlight. Name it with `aria-label`.
@stable
-->
<script lang="ts">
  import { command, type CommandInputState } from "@ui-sdk/core/command"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let props: PartProps<"input", CommandInputState> = $props()

  const input = usePart(command, "input")
</script>

<Part tag="input" part={input} props={{ ...props, children: undefined }} />
