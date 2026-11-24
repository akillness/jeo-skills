<!--
@component
Describes the drawer while it's rendered. A paragraph by default.
@stable
-->
<script lang="ts">
  import Part from "../part.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { useDrawer } from "./context"

  let props: PartProps<"p"> = $props()

  const description = useHandlePart(useDrawer().handle, "description")
</script>

<Part tag="p" part={description} {props} />
