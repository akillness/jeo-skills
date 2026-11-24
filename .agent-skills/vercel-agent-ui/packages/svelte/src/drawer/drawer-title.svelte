<!--
@component
The drawer's title, which names it. A level 2 heading by default.
@stable
-->
<script lang="ts">
  import Part from "../part.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { useDrawer } from "./context"

  let props: PartProps<"h2"> = $props()

  const title = useHandlePart(useDrawer().handle, "title")
</script>

<Part tag="h2" part={title} {props} />
