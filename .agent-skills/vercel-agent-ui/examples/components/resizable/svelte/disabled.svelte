<script lang="ts">
  import { CheckIcon } from "@lucide/svelte"
  import {
    Checkbox,
    CheckboxIndicator,
    type CheckedState,
  } from "@ui-sdk/svelte/checkbox"
  import {
    Resizable,
    ResizableHandle,
    ResizablePanel,
  } from "@ui-sdk/svelte/resizable"

  let locked = $state<CheckedState>(false)
</script>

<div data-slot="stack">
  <div data-slot="controls">
    <label data-slot="label">
      <Checkbox bind:checked={locked}>
        <CheckboxIndicator>
          <CheckIcon aria-hidden="true" />
        </CheckboxIndicator>
      </Checkbox>
      Lock layout
    </label>
  </div>
  <Resizable disabled={locked === true}>
    <ResizablePanel minSize={15}>
      <h3>Pinned</h3>
      <span data-slot="hint">2 notes</span>
    </ResizablePanel>
    <ResizableHandle disabled aria-label="Resize pinned" />
    <ResizablePanel minSize={15}>
      <h3>Inbox</h3>
      <span data-slot="hint">3 unread</span>
    </ResizablePanel>
    <ResizableHandle aria-label="Resize inbox" />
    <ResizablePanel minSize={15}>
      <h3>Message</h3>
      <span data-slot="hint">From Kofi Mensah</span>
    </ResizablePanel>
  </Resizable>
</div>
