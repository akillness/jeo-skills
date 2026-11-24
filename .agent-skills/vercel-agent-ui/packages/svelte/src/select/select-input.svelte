<!--
@component
A search field inside `SelectContent` that filters the list while focus
stays in it. Put the items in a `SelectList`. Name it with `aria-label`.
@stable
-->
<script lang="ts">
  import { select, type SelectInputState } from "@ui-sdk/core/select"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let props: PartProps<"input", SelectInputState> = $props()

  const input = usePart(select, "input")
</script>

<Part tag="input" part={input} props={{ ...props, children: undefined }} />
