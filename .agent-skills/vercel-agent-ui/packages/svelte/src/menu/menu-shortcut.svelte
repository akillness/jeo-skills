<!--
@component
Shows the keys of an item's shortcut, like `⌘S`, inside the item. Hidden from screen readers.
@stable
-->
<script lang="ts">
  import { menu } from "@ui-sdk/core/menu"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let props: PartProps<"span"> = $props()

  const shortcut = usePart(menu, "shortcut")
</script>

<Part tag="span" part={shortcut} {props} />
