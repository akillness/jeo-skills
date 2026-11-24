<script lang="ts">
  import type {
    DrawerOutletProps,
    DrawerOutletState,
  } from "@ui-sdk/core/drawer"
  import { untrack } from "svelte"
  import Part from "../part.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import type { DrawerContext } from "./context"

  // The bound part of an outlet, once its drawer is known. `owner` is read once.
  let {
    owner,
    keyframes,
    ...rest
  }: PartProps<"div", DrawerOutletState> &
    DrawerOutletProps & { owner: DrawerContext } = $props()

  const id = $props.id()
  const outlet = useHandlePart(
    untrack(() => owner.handle),
    "outlet",
    () => ({ id, keyframes })
  )
</script>

<Part tag="div" part={outlet} props={rest} />
