<script setup lang="ts">
import { MoonIcon, SunIcon } from "@lucide/vue"
import { Switch, SwitchThumb } from "@ui-sdk/vue/switch"
</script>

<template>
  <label data-slot="label">
    Dark mode
    <Switch>
      <SwitchThumb>
        <template #render="{ props, state }">
          <span v-bind="props">
            <MoonIcon v-if="state.checked" aria-hidden="true" />
            <SunIcon v-else aria-hidden="true" />
          </span>
        </template>
      </SwitchThumb>
    </Switch>
  </label>
</template>
