<!--
@component
Marks the selected tab. Its box comes from the `--active-tab-*` variables, measured from the tab list.
@stable
-->
<script lang="ts">
  import { tabs, type TabsIndicatorState } from "@ui-sdk/core/tabs"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let props: PartProps<"span", TabsIndicatorState> = $props()

  const indicator = usePart(tabs, "indicator")
</script>

<Part tag="span" part={indicator} {props} />
