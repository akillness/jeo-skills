<script module lang="ts">
  import type { Component } from "svelte"

  type Part = Component<Record<string, unknown>>

  // The package exports its components, and only them, as functions named in
  // capitals. Each takes whatever props the markup gives its part.
  function isPart(name: string, value: unknown): value is Part {
    return typeof value === "function" && /^[A-Z]/.test(name)
  }

  export { isPart, type Part }
</script>

<script lang="ts">
  import type { Built } from "../../../core/test/after-mount"
  import Self from "./after-mount-tree.svelte"

  let { nodes, components }: { nodes: Built[]; components: Map<string, Part> } =
    $props()
</script>

{#each nodes as node}
  {#if typeof node === "string"}
    {node}
  {:else if node.part}
    {@const Part = components.get(node.part)!}
    {#if node.children.length}
      <Part {...node.props}><Self nodes={node.children} {components} /></Part>
    {:else}
      <Part {...node.props} />
    {/if}
  {:else if node.tag}
    {#if node.children.length}
      <svelte:element this={node.tag} {...node.props}
        ><Self nodes={node.children} {components} /></svelte:element
      >
    {:else}
      <svelte:element this={node.tag} {...node.props} />
    {/if}
  {:else}
    <Self nodes={node.children} {components} />
  {/if}
{/each}
