<!--
@component
A tab. Selecting it shows the panel with the same `value`.
@stable
-->
<script lang="ts">
  import { tabs, type TabsTabProps, type TabsTabState } from "@ui-sdk/core/tabs"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let {
    value,
    disabled,
    ...rest
  }: PartProps<"button", TabsTabState> & TabsTabProps = $props()

  const tab = usePart(tabs, "tab", () => ({ value, disabled }))
</script>

<Part tag="button" part={tab} props={rest} />
