<!--
@component
Commands shown while this page is on top. Without `value`, it's the first page. Renders no element.
@stable
-->
<script lang="ts">
  import {
    command as commandPrimitive,
    type CommandPageProps,
  } from "@ui-sdk/core/command"
  import { setContext, type Snippet } from "svelte"
  import { useHandle } from "../instance"
  import { useHandlePart } from "../use-primitive.svelte"
  import { PageKey, type PageContext } from "./context"

  let { value, children }: CommandPageProps & { children?: Snippet } = $props()

  const command = useHandle(commandPrimitive)
  setContext<PageContext>(PageKey, () => value ?? null)
  const page = useHandlePart(command, "page", () => ({ value }))
</script>

{#if page.present}{@render children?.()}{/if}
