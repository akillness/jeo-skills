<script lang="ts">
  import { ChevronDownIcon } from "@lucide/svelte"
  import {
    Accordion,
    AccordionHeader,
    AccordionItem,
    AccordionPanel,
    AccordionTrigger,
  } from "@ui-sdk/svelte/accordion"

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
      parts.push({
        text: text.slice(index, index + search.length),
        match: true,
      })
      start = index + search.length
      index = text.toLowerCase().indexOf(search, start)
    }
    if (start < text.length) {
      parts.push({ text: text.slice(start), match: false })
    }
    return parts
  }

  let query = $state("")
  let value = $state<string[]>([])
  const results = $derived(faq.filter((question) => matches(question, query)))

  function search(next: string) {
    query = next
    value = next.trim() ? results.map((question) => question.value) : []
  }
</script>

<div>
  <div data-slot="controls">
    <input
      type="search"
      aria-label="Search questions"
      placeholder="Search questions…"
      value={query}
      oninput={(event) => search(event.currentTarget.value)}
    />
  </div>
  <Accordion bind:value multiple>
    {#each results as question (question.value)}
      <AccordionItem value={question.value}>
        <AccordionHeader>
          <AccordionTrigger>
            <span>
              {#each highlight(question.question, query) as part, index (index)}
                {#if part.match}<mark>{part.text}</mark>{:else}{part.text}{/if}
              {/each}
            </span>
            <ChevronDownIcon aria-hidden="true" />
          </AccordionTrigger>
        </AccordionHeader>
        <AccordionPanel>
          {#each highlight(question.answer, query) as part, index (index)}
            {#if part.match}<mark>{part.text}</mark>{:else}{part.text}{/if}
          {/each}
        </AccordionPanel>
      </AccordionItem>
    {/each}
  </Accordion>
  <p data-slot="hint" role="status">
    {#if results.length === 0}No questions match “{query}”.{/if}
  </p>
</div>
