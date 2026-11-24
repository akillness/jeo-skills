<!--
@component
The row of tabs, a tablist with one tab stop and arrow keys between its tabs.
@stable
-->
<script lang="ts">
  import { tabs, type TabsListState } from "@ui-sdk/core/tabs"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let props: PartProps<"div", TabsListState> = $props()

  const list = usePart(tabs, "list")
</script>

<Part tag="div" part={list} {props} />
