<script lang="ts">
  import {
    Resizable,
    ResizableHandle,
    ResizablePanel,
  } from "@ui-sdk/svelte/resizable"
</script>

<Resizable>
  <ResizablePanel defaultSize={35} minSize={20} collapsible>
    {#snippet children(state)}
      <h3>Files</h3>
      <span data-slot="hint"
        >{state.collapsed ? "Collapsed" : `${Math.round(state.size)}%`}</span
      >
    {/snippet}
  </ResizablePanel>
  <ResizableHandle aria-label="Resize files">
    {#snippet render({ props })}
      <div {...props}></div>
    {/snippet}
  </ResizableHandle>
  <ResizablePanel minSize={30}>
    {#snippet children(state)}
      <h3>Editor</h3>
      <span data-slot="hint">{`${Math.round(state.size)}%`}</span>
    {/snippet}
  </ResizablePanel>
</Resizable>
