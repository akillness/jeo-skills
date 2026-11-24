<script lang="ts">
  import { untrack } from "svelte"
  import Part from "./part.svelte"
  import {
    useHandlePart,
    type PartBinding,
    type PartProps,
    type PrimitiveHandle,
  } from "./use-primitive.svelte"

  // The selected item's icon, copied from its item's icon part. Rendered while
  // one item is selected and it has an icon. Its content is the copy the core
  // writes, so it takes no children. `owner` is read once.
  let { owner, ...rest }: PartProps<"span"> & { owner: PrimitiveHandle<any> } =
    $props()

  const part = useHandlePart<any, string>(
    untrack(() => owner),
    "value-icon"
  )
</script>

{#if part.present}
  <Part
    tag="span"
    part={part as PartBinding<{}>}
    props={{ ...rest, children: undefined }}
  />
{/if}
