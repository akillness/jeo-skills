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
    value: "overview",
    label: "Overview",
    content: "A summary of the project, its goals and its owners.",
  },
  {
    value: "timeline",
    label: "Timeline",
    content: "Kickoff in March, beta in June and launch in September.",
  },
  {
    value: "budget",
    label: "Budget",
    content: "Approved for two engineers and one designer for six months.",
  },
]
</script>

<template>
  <Accordion :collapsible="false" :default-value="['overview']">
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
