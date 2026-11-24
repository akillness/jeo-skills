<!--
@component
A part from `createParts`, bound by `config` to its primitive, slot and tag:
the slot's props, read through its schema, and the rest on the element. The
root also makes the instance from the primitive's options and shares it with
the parts inside, and renders only its children when it has no tag. `props`
are the user's, as the parent passed them.
-->
<script lang="ts">
  import type { Primitive } from "@ui-sdk/core"
  import { untrack } from "svelte"
  import Part from "../part.svelte"
  import { provideInstance, usePart } from "../instance"
  import { usePrimitive } from "../use-primitive.svelte"
  import {
    omitProps,
    rootOptions,
    slotPropsOf,
    type PartConfig,
  } from "./schema.svelte"

  let { config, props }: { config: PartConfig; props: Record<string, any> } =
    $props()

  const id = $props.id()
  // The config never changes, and the props object is the parent's, whose
  // getters each read tracks.
  const bound = untrack(() => config)
  const { primitive, slot, tag } = bound
  const own = untrack(() => props)
  const options = slot === "root" ? bound.schema.options : {}
  if (slot === "root") {
    provideInstance(
      primitive,
      usePrimitive(primitive, rootOptions(options, own, id))
    )
  }
  const slotProps = slotPropsOf(bound, own, id)
  // Whether there's a tag never changes.
  const part = tag
    ? usePart<Primitive, string>(primitive, slot, slotProps.props)
    : undefined
  const rest = $derived(omitProps(own, options, slotProps.schema))
</script>

{#if !part}
  {@render own.children?.()}
{:else if part.present}
  <Part tag={tag!} {part} props={rest} />
{/if}
