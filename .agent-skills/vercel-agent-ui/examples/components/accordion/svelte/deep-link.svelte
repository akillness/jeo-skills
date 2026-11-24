<script lang="ts">
  import { ChevronDownIcon } from "@lucide/svelte"
  import {
    Accordion,
    AccordionHeader,
    AccordionItem,
    AccordionPanel,
    AccordionTrigger,
  } from "@ui-sdk/svelte/accordion"
</script>

<div>
  <nav data-slot="controls" aria-label="Jump to">
    <a href="#refund-timeline">Jump to the refund timeline</a>
    <a href="#return-label">Print a return label</a>
  </nav>
  <Accordion hiddenUntilFound>
    <AccordionItem value="returns">
      <AccordionHeader>
        <AccordionTrigger>
          Returns
          <ChevronDownIcon aria-hidden="true" />
        </AccordionTrigger>
      </AccordionHeader>
      <AccordionPanel>
        <div data-slot="stack">
          <p>
            Return any unused item in its original packaging within 30 days.
          </p>
          <p id="return-label">
            To print a return label, open the order and choose Return. The label
            is free.
          </p>
        </div>
      </AccordionPanel>
    </AccordionItem>
    <AccordionItem value="refunds">
      <AccordionHeader>
        <AccordionTrigger>
          Refunds
          <ChevronDownIcon aria-hidden="true" />
        </AccordionTrigger>
      </AccordionHeader>
      <AccordionPanel>
        <div data-slot="stack">
          <p>Refunds go back to the card you paid with.</p>
          <p id="refund-timeline">
            Timeline: we inspect the item within 2 days of receiving it, and
            your bank shows the refund 5 to 7 business days later.
          </p>
        </div>
      </AccordionPanel>
    </AccordionItem>
    <AccordionItem value="exchanges">
      <AccordionHeader>
        <AccordionTrigger>
          Exchanges
          <ChevronDownIcon aria-hidden="true" />
        </AccordionTrigger>
      </AccordionHeader>
      <AccordionPanel>
        <div data-slot="stack">
          <p>
            Start a return, choose Exchange and pick the new size. Shipping both
            ways is free.
          </p>
        </div>
      </AccordionPanel>
    </AccordionItem>
  </Accordion>
</div>
