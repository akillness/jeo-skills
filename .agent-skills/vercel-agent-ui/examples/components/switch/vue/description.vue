<script setup lang="ts">
import { Field, FieldDescription, FieldLabel } from "@ui-sdk/vue/field"
import { Switch, SwitchThumb } from "@ui-sdk/vue/switch"
</script>

<template>
  <Field>
    <div data-slot="stack">
      <FieldLabel>Weekly digest</FieldLabel>
      <FieldDescription>A summary of your week, every Monday.</FieldDescription>
    </div>
    <Switch>
      <SwitchThumb />
    </Switch>
  </Field>
</template>
