<script setup lang="ts">
import {
  createSwitchController,
  type SwitchCheckedChangeReason,
} from "@ui-sdk/core/switch"
import { Switch, SwitchThumb } from "@ui-sdk/vue/switch"
import { ref } from "vue"
import { useLog } from "../../../shared/vue/log"

const log = useLog()
const wifi = createSwitchController()
const checked = ref(true)

function onCheckedChange(
  next: boolean,
  details: { reason: SwitchCheckedChangeReason }
) {
  log(`${next ? "On" : "Off"} (${details.reason})`)
}
</script>

<template>
  <div data-slot="stack">
    <div data-slot="controls">
      <button type="button" @click="wifi.toggle()">Toggle</button>
    </div>
    <label data-slot="label">
      Wi-Fi
      <Switch
        v-model:checked="checked"
        :controller="wifi"
        @checked-change="onCheckedChange"
      >
        <SwitchThumb />
      </Switch>
    </label>
  </div>
</template>
