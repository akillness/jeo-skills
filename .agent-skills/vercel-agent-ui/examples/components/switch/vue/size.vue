<script setup lang="ts">
import { Switch, SwitchThumb } from "@ui-sdk/vue/switch"
</script>

<template>
  <div data-slot="stack">
    <label data-slot="label">
      Small
      <Switch data-size="sm">
        <SwitchThumb />
      </Switch>
    </label>
    <label data-slot="label">
      Default
      <Switch>
        <SwitchThumb />
      </Switch>
    </label>
  </div>
</template>
