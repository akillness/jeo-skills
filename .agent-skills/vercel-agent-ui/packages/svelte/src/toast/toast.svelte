<!--
@component
One toast. Swipe it toward the region's side, or press Escape on it, to dismiss it.
@stable
-->
<script lang="ts">
  import type { ToastState } from "@ui-sdk/core/toast"
  import Part from "../part.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { useToast } from "./context"

  /** One toast. Swipe it toward the region's side, or press Escape on it, to dismiss it. */
  let props: PartProps<"li", ToastState> = $props()

  const { region, toast } = useToast("Toast")
  const root = useHandlePart(region, "root", () => ({ id: toast().id }))
</script>

{#if root.present}
  <Part tag="li" part={root} {props} />
{/if}
