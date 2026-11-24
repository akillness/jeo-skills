<!--
@component
The text field the menu suggests into: a `<textarea>`, or an `<input>` from `render`.
@stable
-->
<script lang="ts">
  import {
    triggerMenu,
    type TriggerMenuInputState,
  } from "@ui-sdk/core/trigger-menu"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let props: PartProps<"textarea", TriggerMenuInputState> = $props()

  const input = usePart(triggerMenu, "input")
</script>

<Part tag="textarea" part={input} props={{ ...props, children: undefined }} />
