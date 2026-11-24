<script setup lang="ts">
import { Switch, SwitchThumb } from "@ui-sdk/vue/switch"
</script>

<template>
  <div dir="rtl">
    <label data-slot="label">
      وضع الطيران
      <Switch>
        <SwitchThumb />
      </Switch>
    </label>
  </div>
</template>
