<script setup lang="ts">
import { Switch, SwitchThumb } from "@ui-sdk/vue/switch"
</script>

<template>
  <div data-slot="stack">
    <label data-slot="label">
      Product updates
      <Switch>
        <SwitchThumb />
      </Switch>
    </label>
    <label data-slot="label">
      Security alerts
      <Switch default-checked disabled>
        <SwitchThumb />
      </Switch>
    </label>
  </div>
</template>
