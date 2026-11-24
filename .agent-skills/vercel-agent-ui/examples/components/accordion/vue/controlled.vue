<script setup lang="ts">
import { ChevronDownIcon } from "@lucide/vue"
import type { ChangeDetails } from "@ui-sdk/core"
import { createAccordionController } from "@ui-sdk/core/accordion"
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "@ui-sdk/vue/accordion"
import { ref } from "vue"

const items = [
  {
    value: "account",
    label: "Account",
    content: "Your name, email address and profile photo.",
  },
  {
    value: "security",
    label: "Security",
    content: "Your password, passkeys and two-factor authentication.",
  },
  {
    value: "sessions",
    label: "Sessions",
    content: "Devices signed in to your account in the last 30 days.",
  },
]

const accordion = createAccordionController()

const value = ref(["account"])

function confirmClose(item: string, open: boolean, details: ChangeDetails) {
  if (
    !open &&
    item === "security" &&
    !window.confirm("Close the security settings?")
  ) {
    details.cancel()
  }
}
</script>

<template>
  <div>
    <div data-slot="controls">
      <button type="button" @click="accordion.open('security')">
        Review security
      </button>
    </div>
    <Accordion v-model:value="value" multiple :controller="accordion">
      <AccordionItem
        v-for="item in items"
        :key="item.value"
        :value="item.value"
        @open-change="
          (open: boolean, details: ChangeDetails) =>
            confirmClose(item.value, open, details)
        "
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
  </div>
</template>
