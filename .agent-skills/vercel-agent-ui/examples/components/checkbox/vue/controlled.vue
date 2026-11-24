<script setup lang="ts">
import { CheckIcon } from "@lucide/vue"
import type { ChangeDetails } from "@ui-sdk/core"
import {
  createCheckboxController,
  type CheckedState,
} from "@ui-sdk/core/checkbox"
import { Checkbox, CheckboxIndicator } from "@ui-sdk/vue/checkbox"
import { ref } from "vue"
import { useLog } from "../../../shared/vue/log"

const log = useLog()
const updates = createCheckboxController()
const checked = ref<CheckedState>(false)

function onCheckedChange(next: CheckedState, details: ChangeDetails) {
  log(
    `${next === "indeterminate" ? "Mixed" : next ? "Checked" : "Unchecked"} (${details.reason})`
  )
}
</script>

<template>
  <div data-slot="stack">
    <div data-slot="controls">
      <button type="button" @click="updates.toggle()">Toggle</button>
    </div>
    <label data-slot="label">
      <Checkbox
        v-model:checked="checked"
        :controller="updates"
        @checked-change="onCheckedChange"
      >
        <CheckboxIndicator>
          <CheckIcon aria-hidden="true" />
        </CheckboxIndicator>
      </Checkbox>
      Email me about product updates
    </label>
  </div>
</template>
