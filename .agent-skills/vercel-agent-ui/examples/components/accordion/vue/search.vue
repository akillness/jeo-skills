<script setup lang="ts">
import { ChevronDownIcon } from "@lucide/vue"
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "@ui-sdk/vue/accordion"
import { computed, ref } from "vue"

const faq = [
  {
    value: "returns",
    question: "What is your return policy?",
    answer:
      "Return any unused item within 30 days. Once it reaches us, your refund is on its way.",
  },
  {
    value: "refunds",
    question: "How long do refunds take?",
    answer:
      "Refunds reach your card within 5 to 7 business days after we receive the item.",
  },
  {
    value: "shipping",
    question: "Do you ship internationally?",
    answer:
      "We ship to 40 countries. Duties are included in the price at checkout.",
  },
  {
    value: "tracking",
    question: "How do I track my order?",
    answer:
      "Every shipping email has a tracking link. You'll also find it under Orders.",
  },
  {
    value: "exchange",
    question: "Can I exchange an item for another size?",
    answer:
      "Yes. Start a return, choose Exchange and pick the new size. Shipping is free.",
  },
  {
    value: "gift",
    question: "Can I send an order as a gift?",
    answer:
      "Add a gift note at checkout and we'll leave the prices off the packing slip.",
  },
]

function matches(question: (typeof faq)[number], query: string) {
  const search = query.trim().toLowerCase()
  return (
    !search ||
    question.question.toLowerCase().includes(search) ||
    question.answer.toLowerCase().includes(search)
  )
}

function highlight(text: string, query: string) {
  const search = query.trim().toLowerCase()
  if (!search) {
    return [{ text, match: false }]
  }
  const parts: { text: string; match: boolean }[] = []
  let start = 0
  for (let index = text.toLowerCase().indexOf(search); index !== -1;) {
    if (index > start) {
      parts.push({ text: text.slice(start, index), match: false })
    }
    parts.push({ text: text.slice(index, index + search.length), match: true })
    start = index + search.length
    index = text.toLowerCase().indexOf(search, start)
  }
  if (start < text.length) {
    parts.push({ text: text.slice(start), match: false })
  }
  return parts
}

const query = ref("")
const value = ref<string[]>([])
const results = computed(() =>
  faq.filter((question) => matches(question, query.value))
)

function search(next: string) {
  query.value = next
  value.value = next.trim()
    ? results.value.map((question) => question.value)
    : []
}
</script>

<template>
  <div>
    <div data-slot="controls">
      <input
        type="search"
        aria-label="Search questions"
        placeholder="Search questions…"
        :value="query"
        @input="search(($event.target as HTMLInputElement).value)"
      />
    </div>
    <Accordion v-model:value="value" multiple>
      <AccordionItem
        v-for="question in results"
        :key="question.value"
        :value="question.value"
      >
        <AccordionHeader>
          <AccordionTrigger>
            <span>
              <template
                v-for="(part, index) in highlight(question.question, query)"
                :key="index"
              >
                <mark v-if="part.match">{{ part.text }}</mark>
                <template v-else>{{ part.text }}</template>
              </template>
            </span>
            <ChevronDownIcon aria-hidden="true" />
          </AccordionTrigger>
        </AccordionHeader>
        <AccordionPanel>
          <template
            v-for="(part, index) in highlight(question.answer, query)"
            :key="index"
          >
            <mark v-if="part.match">{{ part.text }}</mark>
            <template v-else>{{ part.text }}</template>
          </template>
        </AccordionPanel>
      </AccordionItem>
    </Accordion>
    <p data-slot="hint" role="status">
      <template v-if="results.length === 0"
        >No questions match “{{ query }}”.</template
      >
    </p>
  </div>
</template>
