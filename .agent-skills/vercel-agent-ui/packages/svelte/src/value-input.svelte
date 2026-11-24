<script lang="ts">
  import { untrack } from "svelte"
  import { useHandlePart, type PrimitiveHandle } from "./use-primitive.svelte"

  // One hidden input per selected value of a list with `multiple`, keyed by
  // the value. `owner` is read once.
  let { owner, value }: { owner: PrimitiveHandle<any>; value: string } =
    $props()

  const input = useHandlePart<any, string>(
    untrack(() => owner),
    "value-input",
    () => ({ id: value, value })
  )
</script>

<input {...input.slot()} />
