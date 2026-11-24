<!--
@component
The grabber. Pressing it moves to the next snap point; arrow keys, Home and End step.
@stable
-->
<script lang="ts">
  import type { DrawerHandleState } from "@ui-sdk/core/drawer"
  import Part from "../part.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { useDrawer } from "./context"

  let props: PartProps<"button", DrawerHandleState> = $props()

  const handle = useHandlePart(useDrawer().handle, "handle")
</script>

<Part tag="button" part={handle} {props} />
