<script lang="ts">
  import { untrack } from "svelte"
  import { usePart } from "../../src/instance"
  import type { PrimitiveHandle } from "../../src/use-primitive.svelte"

  // One part's attributes spread on a bare element, without the attachment,
  // so the test compares the attributes alone.
  let {
    handle,
    name,
    props,
    tag,
  }: {
    handle: PrimitiveHandle<any>
    name: string
    props: Record<string, unknown>
    tag: string
  } = $props()

  const part = usePart<any, string>(
    untrack(() => handle),
    untrack(() => name),
    () => props
  )
  // Object.entries leaves the attachment's symbol key out.
  const attrs = $derived(Object.fromEntries(Object.entries(part.slot())))
</script>

<svelte:element this={tag} {...attrs}></svelte:element>
