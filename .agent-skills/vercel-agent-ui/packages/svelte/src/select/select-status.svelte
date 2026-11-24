<!--
@component
A polite live region for loading and result counts. Its content is yours, from its children's state.
@stable
-->
<script lang="ts">
  import { select, type SelectStatusState } from "@ui-sdk/core/select"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let props: PartProps<"div", SelectStatusState> = $props()

  const status = usePart(select, "status")
</script>

<Part tag="div" part={status} {props} />
