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
    value: "notifications",
    label: "Notification settings",
    content: "Choose what we email you about, and how often.",
  },
  {
    value: "privacy",
    label: "Privacy and security",
    content: "Turn on two-factor authentication and review signed-in devices.",
  },
  {
    value: "billing",
    label: "Billing and subscription",
    content: "Update your payment method and download past invoices.",
  },
]
</script>

<template>
  <Accordion multiple :default-value="['notifications']">
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
