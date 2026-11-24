<script setup lang="ts">
// What a Vue developer writes with Select, checked with strict templates:
// v-model and its events carry the value's own type.
import { ref } from "vue"
import { Select, SelectItem, SelectValue } from "../../src/select"

type Fruit = { id: string; name: string }
const apple: Fruit = { id: "apple", name: "Apple" }
const fruits = [
  { value: apple, label: "Apple" },
  { value: { id: "pear", name: "Pear" }, label: "Pear" },
]
const name = ref<string | null>(null)
const fruit = ref<Fruit | null>(null)
const ids = ref<string[]>([])
const picked = (next: Fruit | null) => next?.id
const count = ref(0)
const several = ref(false)
const maybe = ref<boolean | undefined>(undefined)
</script>

<template>
  <Select v-model="name" :items="['apple', 'pear']" />
  <Select v-model="fruit" :items="fruits" @value-change="picked" />
  <Select v-model:value="fruit" :items="fruits" />
  <Select v-model="ids" multiple :items="['apple', 'pear']" />
  <!-- @vue-expect-error A number isn't one of the string items. -->
  <Select v-model="count" :items="['apple', 'pear']" />
  <!-- @vue-expect-error A multiple select's value is a list. -->
  <Select v-model="name" multiple :items="['apple', 'pear']" />
  <!-- @vue-expect-error A multiple select's value is a list. -->
  <Select multiple :value="name" />
  <!-- @vue-expect-error Only a multiple select's value is a list. -->
  <Select :value="ids" />
  <Select :multiple="several" :value="name" />
  <Select :multiple="several" :value="ids" />
  <Select :multiple="maybe" :value="name" />
  <Select :multiple="maybe" :value="ids" />
  <Select>
    <SelectValue v-slot="{ state }">{{ state.placeholder }}</SelectValue>
    <SelectItem :value="apple">Apple</SelectItem>
  </Select>
</template>
