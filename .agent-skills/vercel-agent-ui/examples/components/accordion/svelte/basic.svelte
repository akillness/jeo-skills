<script lang="ts">
  import { ChevronDownIcon } from "@lucide/svelte"
  import {
    Accordion,
    AccordionHeader,
    AccordionItem,
    AccordionPanel,
    AccordionTrigger,
  } from "@ui-sdk/svelte/accordion"

  const items = [
    {
      value: "shipping",
      label: "What are your shipping options?",
      content: [
        "We offer standard (5 to 7 days), express (2 to 3 days) and overnight shipping.",
        "Every order ships with tracking, and orders over $50 ship free.",
      ],
    },
    {
      value: "returns",
      label: "What is your return policy?",
      content: [
        "Return any unused item in its original packaging within 30 days. Refunds arrive within 5 to 7 business days.",
      ],
    },
    {
      value: "support",
      label: "How can I reach support?",
      content: [
        "Write to us by email or chat, or call us. We answer within 24 hours on business days.",
      ],
    },
  ]
</script>

<Accordion defaultValue={["shipping"]}>
  {#each items as item (item.value)}
    <AccordionItem value={item.value}>
      <AccordionHeader>
        <AccordionTrigger>
          {item.label}
          <ChevronDownIcon aria-hidden="true" />
        </AccordionTrigger>
      </AccordionHeader>
      <AccordionPanel>
        {#each item.content as paragraph (paragraph)}
          <p>{paragraph}</p>
        {/each}
      </AccordionPanel>
    </AccordionItem>
  {/each}
</Accordion>
