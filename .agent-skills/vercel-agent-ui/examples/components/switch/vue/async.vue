<script setup lang="ts">
import { LoaderCircleIcon } from "@lucide/vue"
import {
  createSwitchController,
  type SwitchCheckedChangeReason,
} from "@ui-sdk/core/switch"
import { Switch, SwitchThumb } from "@ui-sdk/vue/switch"
import { ref } from "vue"
import { useLog } from "../../../shared/vue/log"

const save = (_checked: boolean) =>
  new Promise((resolve) => setTimeout(resolve, 800))

const log = useLog()
const backups = createSwitchController()
const saving = ref(false)

function onCheckedChange(
  next: boolean,
  details: { reason: SwitchCheckedChangeReason; cancel: () => void }
) {
  if (details.reason === "imperative") {
    return
  }
  details.cancel()
  if (saving.value) {
    return
  }
  saving.value = true
  log("Saving…")
  save(next).then(() => {
    backups.setChecked(next, { reason: "imperative" })
    saving.value = false
    log(`Saved: ${next ? "on" : "off"}`)
  })
}
</script>

<template>
  <label data-slot="label">
    Automatic backups
    <Switch
      :controller="backups"
      :aria-busy="saving"
      @checked-change="onCheckedChange"
    >
      <SwitchThumb>
        <LoaderCircleIcon
          v-if="saving"
          data-slot="spinner"
          aria-hidden="true"
        />
      </SwitchThumb>
    </Switch>
  </label>
</template>
