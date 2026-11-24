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
    value: "access",
    label: "Can I access my account history?",
    content:
      "Yes. Every order and payment from the last five years is in your account.",
  },
  {
    value: "premium",
    label: "Premium feature information",
    content:
      "Premium includes priority support and early access to new features.",
    disabled: true,
  },
  {
    value: "email",
    label: "How do I update my email address?",
    content:
      "Open Settings, then Account, and change it there. We'll send a confirmation link.",
  },
]
</script>

<template>
  <Accordion>
    <AccordionItem
      v-for="item in items"
      :key="item.value"
      :value="item.value"
      :disabled="item.disabled"
    >
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
