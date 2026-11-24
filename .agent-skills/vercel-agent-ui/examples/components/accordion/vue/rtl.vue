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
    value: "shipping",
    label: "ما هي خيارات الشحن؟",
    content: "نقدم الشحن العادي والسريع والشحن في اليوم التالي.",
  },
  {
    value: "returns",
    label: "ما هي سياسة الإرجاع؟",
    content: "يمكنك إرجاع أي منتج غير مستخدم خلال ٣٠ يومًا.",
  },
  {
    value: "support",
    label: "كيف أتواصل مع الدعم؟",
    content: "راسلنا عبر البريد أو الدردشة، ونرد خلال ٢٤ ساعة.",
  },
]
</script>

<template>
  <div dir="rtl">
    <Accordion :default-value="['shipping']">
      <AccordionItem
        v-for="item in items"
        :key="item.value"
        :value="item.value"
      >
        <AccordionHeader>
          <AccordionTrigger>
            {{ item.label }}
            <ChevronDownIcon />
          </AccordionTrigger>
        </AccordionHeader>
        <AccordionPanel>
          {{ item.content }}
        </AccordionPanel>
      </AccordionItem>
    </Accordion>
  </div>
</template>
