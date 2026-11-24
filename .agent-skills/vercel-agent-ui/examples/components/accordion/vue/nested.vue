<script setup lang="ts">
import { ChevronDownIcon } from "@lucide/vue"
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "@ui-sdk/vue/accordion"

const sections: {
  value: string
  label: string
  content?: string
  topics?: { value: string; label: string; content: string }[]
}[] = [
  {
    value: "profile",
    label: "Profile",
    content: "Your name, photo and the email address people see.",
  },
  {
    value: "notifications",
    label: "Notifications",
    topics: [
      {
        value: "email",
        label: "Email",
        content: "A weekly digest, and mentions as they happen.",
      },
      {
        value: "push",
        label: "Push",
        content: "Direct messages and replies to your comments.",
      },
    ],
  },
  {
    value: "billing",
    label: "Billing",
    topics: [
      {
        value: "payment",
        label: "Payment methods",
        content: "A Visa card ending in 4242, used for every renewal.",
      },
      {
        value: "invoices",
        label: "Invoices",
        content: "Download a PDF of any invoice from the last two years.",
      },
    ],
  },
]
</script>

<template>
  <Accordion :default-value="['notifications']">
    <AccordionItem
      v-for="section in sections"
      :key="section.value"
      :value="section.value"
    >
      <AccordionHeader>
        <AccordionTrigger>
          {{ section.label }}
          <ChevronDownIcon aria-hidden="true" />
        </AccordionTrigger>
      </AccordionHeader>
      <AccordionPanel>
        <Accordion v-if="section.topics" multiple>
          <AccordionItem
            v-for="topic in section.topics"
            :key="topic.value"
            :value="topic.value"
          >
            <AccordionHeader>
              <template #render="{ props }">
                <h4 v-bind="props">
                  <AccordionTrigger>
                    {{ topic.label }}
                    <ChevronDownIcon aria-hidden="true" />
                  </AccordionTrigger>
                </h4>
              </template>
            </AccordionHeader>
            <AccordionPanel>
              {{ topic.content }}
            </AccordionPanel>
          </AccordionItem>
        </Accordion>
        <div v-else>{{ section.content }}</div>
      </AccordionPanel>
    </AccordionItem>
  </Accordion>
</template>
