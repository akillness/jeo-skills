<script setup lang="ts">
import { Switch, SwitchThumb } from "@ui-sdk/vue/switch"
</script>

<template>
  <label data-slot="label">
    Airplane mode
    <Switch>
      <SwitchThumb />
    </Switch>
  </label>
</template>
