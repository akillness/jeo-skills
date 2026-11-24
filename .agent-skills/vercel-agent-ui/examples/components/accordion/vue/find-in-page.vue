<script setup lang="ts">
import { ChevronDownIcon } from "@lucide/vue"
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "@ui-sdk/vue/accordion"

const items = [
  {
    value: "fruit",
    label: "Which fruit do you stock?",
    content: "Apples, pears, mangoes and, in summer, pineapple.",
  },
  {
    value: "organic",
    label: "Is it organic?",
    content: "Everything we stock is certified organic.",
  },
  {
    value: "delivery",
    label: "When do you deliver?",
    content: "Every weekday morning before 10.",
  },
]
</script>

<template>
  <Accordion hidden-until-found>
    <AccordionItem v-for="item in items" :key="item.value" :value="item.value">
      <AccordionHeader>
        <AccordionTrigger>
          {{ item.label }}
          <ChevronDownIcon aria-hidden="true" />
        </AccordionTrigger>
      </AccordionHeader>
      <AccordionPanel>
        {{ item.content }}
      </AccordionPanel>
    </AccordionItem>
  </Accordion>
</template>
