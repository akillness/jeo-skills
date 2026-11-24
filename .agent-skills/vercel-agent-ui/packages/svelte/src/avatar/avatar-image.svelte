<!--
@component
A real <img>, hidden until it loads. Every image attribute passes through,
like `crossorigin`, `referrerpolicy`, `srcset` and `sizes`.
@stable
-->
<script lang="ts">
  import { avatar, type AvatarState } from "@ui-sdk/core/avatar"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let { src, srcset, ...rest }: PartProps<"img", AvatarState> = $props()

  const image = usePart(avatar, "image")
</script>

<!-- Attributes apply in order, and WebKit starts fetching as soon as `src` is set, so the sources go last, after `referrerpolicy` and `crossorigin`. -->
<Part tag="img" part={image} props={{ ...rest, srcset, src }} />
