<!--
@component
Shown while there's no loaded image, after its `delay`.
@stable
-->
<script lang="ts">
  import {
    avatar,
    type AvatarFallbackProps,
    type AvatarState,
  } from "@ui-sdk/core/avatar"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let { delay, ...rest }: PartProps<"span", AvatarState> & AvatarFallbackProps =
    $props()

  const fallback = usePart(avatar, "fallback", () => ({ delay }))
</script>

{#if fallback.present}
  <Part tag="span" part={fallback} props={rest} />
{/if}
