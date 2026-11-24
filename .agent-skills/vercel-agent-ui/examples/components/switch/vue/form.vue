<script setup lang="ts">
import { FieldLegend, FieldSet } from "@ui-sdk/vue/field"
import { Switch, SwitchThumb } from "@ui-sdk/vue/switch"
import { useLog } from "../../../shared/vue/log"

const log = useLog()

function onSubmit(event: Event) {
  const entries = [...new FormData(event.currentTarget as HTMLFormElement)].map(
    ([name, value]) => `${name}=${value}`
  )
  log(entries.length ? `Submitted ${entries.join("&")}` : "Submitted nothing")
}
</script>

<template>
  <form data-slot="stack" @submit.prevent="onSubmit">
    <FieldSet>
      <FieldLegend>Email notifications</FieldLegend>
      <label data-slot="label">
        Product updates
        <Switch name="updates">
          <SwitchThumb />
        </Switch>
      </label>
      <label data-slot="label">
        Security alerts
        <Switch name="security" default-checked>
          <SwitchThumb />
        </Switch>
      </label>
      <label data-slot="label">
        Weekly digest
        <Switch name="digest" value="weekly" default-checked>
          <SwitchThumb />
        </Switch>
      </label>
    </FieldSet>
    <div data-slot="row">
      <button type="submit" data-variant="solid">Save</button>
      <button type="reset">Reset</button>
    </div>
  </form>
</template>
