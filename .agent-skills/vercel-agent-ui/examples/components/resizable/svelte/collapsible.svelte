<script lang="ts">
  import { FolderIcon, SearchIcon, SettingsIcon } from "@lucide/svelte"
  import {
    Resizable,
    ResizableHandle,
    ResizablePanel,
  } from "@ui-sdk/svelte/resizable"
</script>

<Resizable>
  <ResizablePanel
    defaultSize={30}
    minSize={25}
    collapsible
    collapsedSize="48px"
  >
    <ul>
      <li data-slot="row">
        <FolderIcon aria-hidden="true" />
        <span>Files</span>
      </li>
      <li data-slot="row">
        <SearchIcon aria-hidden="true" />
        <span>Search</span>
      </li>
      <li data-slot="row">
        <SettingsIcon aria-hidden="true" />
        <span>Settings</span>
      </li>
    </ul>
  </ResizablePanel>
  <ResizableHandle aria-label="Resize sidebar">
    <div></div>
  </ResizableHandle>
  <ResizablePanel minSize={40}>
    <h3>README.md</h3>
    <span data-slot="hint">Edited by Inès Moreau</span>
  </ResizablePanel>
</Resizable>
