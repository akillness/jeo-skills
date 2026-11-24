<script setup lang="ts">
// Plain v-model on each component's main value, with the types a Vue developer writes.
import { ref } from "vue"
import { Accordion } from "../../src/accordion"
import { Checkbox } from "../../src/checkbox"
import { Combobox } from "../../src/combobox"
import { Listbox } from "../../src/listbox"
import { RadioGroup } from "../../src/radio"
import { Slider } from "../../src/slider"
import { Switch } from "../../src/switch"
import { Tabs } from "../../src/tabs"
import { ToggleGroup } from "../../src/toggle"

const name = ref<string | null>(null)
const names = ref<string[]>([])
const on = ref(false)
// A checkbox can be indeterminate, and tabs can have none selected, so their models say so.
const checked = ref<boolean | "indeterminate">(false)
const level = ref(50)
const range = ref([20, 80])
const tab = ref<string | null>("account")
</script>

<template>
  <Combobox v-model="name" :items="['apple', 'pear']" />
  <Combobox v-model="names" multiple :items="['apple', 'pear']" />
  <Listbox v-model="name" :items="['apple', 'pear']" aria-label="Fruit" />
  <Listbox v-model="names" multiple aria-label="Fruits" />
  <RadioGroup v-model="name" />
  <Checkbox v-model="checked" />
  <Switch v-model="on" />
  <Slider v-model="level" />
  <Slider v-model="range" />
  <Tabs v-model="tab" />
  <Accordion v-model="names" />
  <ToggleGroup v-model="names" />
</template>
