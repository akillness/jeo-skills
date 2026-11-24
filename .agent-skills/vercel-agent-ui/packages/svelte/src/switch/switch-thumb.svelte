<!--
@component
The thumb that slides along the switch as it turns on or off.
@stable
-->
<script lang="ts">
  import type { SwitchThumbState } from "@ui-sdk/core/switch"
  import { getContext } from "svelte"
  import Part from "../part.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { SwitchKey, type SwitchContext } from "./context"

  let props: PartProps<"span", SwitchThumbState> = $props()

  const control = getContext<SwitchContext | undefined>(SwitchKey)
  if (!control) {
    throw new Error("SwitchThumb must be used inside <Switch>.")
  }
  const thumb = useHandlePart(control, "thumb")
</script>

<Part tag="span" part={thumb} {props} />
