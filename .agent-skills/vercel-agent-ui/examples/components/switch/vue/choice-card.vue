<script setup lang="ts">
import { Field, FieldDescription, FieldLabel } from "@ui-sdk/vue/field"
import { Switch, SwitchThumb } from "@ui-sdk/vue/switch"

const settings = [
  {
    label: "Public profile",
    description: "Anyone can see your name and photo.",
    defaultChecked: false,
  },
  {
    label: "Show activity status",
    description: "Teammates can see when you're online.",
    defaultChecked: true,
  },
]
</script>

<template>
  <div data-slot="stack">
    <Field v-for="setting in settings" :key="setting.label" data-variant="card">
      <div data-slot="stack">
        <FieldLabel>{{ setting.label }}</FieldLabel>
        <FieldDescription>{{ setting.description }}</FieldDescription>
      </div>
      <Switch :default-checked="setting.defaultChecked">
        <SwitchThumb />
      </Switch>
    </Field>
  </div>
</template>
