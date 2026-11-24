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

<Accordion>
  {#each items as item (item.value)}
    <AccordionItem value={item.value} disabled={item.disabled}>
      <AccordionHeader>
        <AccordionTrigger>
          {item.label}
          <ChevronDownIcon aria-hidden="true" />
        </AccordionTrigger>
      </AccordionHeader>
      <AccordionPanel>
        {item.content}
      </AccordionPanel>
    </AccordionItem>
  {/each}
</Accordion>
