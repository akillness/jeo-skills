<script setup lang="ts">
import { Label } from "@ui-sdk/vue/label"
import { Switch, SwitchThumb } from "@ui-sdk/vue/switch"
</script>

<template>
  <div data-slot="row">
    <Switch id="updates">
      <SwitchThumb />
    </Switch>
    <Label for="updates">Email me product updates</Label>
  </div>
</template>
