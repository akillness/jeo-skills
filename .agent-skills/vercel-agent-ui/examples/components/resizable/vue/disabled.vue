<script setup lang="ts">
import { CheckIcon } from "@lucide/vue"
import {
  Checkbox,
  CheckboxIndicator,
  type CheckedState,
} from "@ui-sdk/vue/checkbox"
import {
  Resizable,
  ResizableHandle,
  ResizablePanel,
} from "@ui-sdk/vue/resizable"
import { ref } from "vue"

const locked = ref<CheckedState>(false)
</script>

<template>
  <div data-slot="stack">
    <div data-slot="controls">
      <label data-slot="label">
        <Checkbox v-model:checked="locked">
          <CheckboxIndicator>
            <CheckIcon aria-hidden="true" />
          </CheckboxIndicator>
        </Checkbox>
        Lock layout
      </label>
    </div>
    <Resizable :disabled="locked === true">
      <ResizablePanel :min-size="15">
        <h3>Pinned</h3>
        <span data-slot="hint">2 notes</span>
      </ResizablePanel>
      <ResizableHandle disabled aria-label="Resize pinned" />
      <ResizablePanel :min-size="15">
        <h3>Inbox</h3>
        <span data-slot="hint">3 unread</span>
      </ResizablePanel>
      <ResizableHandle aria-label="Resize inbox" />
      <ResizablePanel :min-size="15">
        <h3>Message</h3>
        <span data-slot="hint">From Kofi Mensah</span>
      </ResizablePanel>
    </Resizable>
  </div>
</template>
